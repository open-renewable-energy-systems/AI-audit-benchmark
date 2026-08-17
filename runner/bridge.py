#!/usr/bin/env python3
"""
SAGE local bridge — exposes the claude-code and codex CLIs as
OpenAI-compatible chat endpoints on localhost, so the SAGE web app
(local or the GitHub Pages deployment) can use them as model slots.

    python3 runner/bridge.py            # serves http://localhost:8765

Slot config in the app:
    endpoint: http://localhost:8765/claude/chat/completions   (no key)
    endpoint: http://localhost:8765/codex/chat/completions    (no key)

Method caveat: CLI-wrapped models run inside the vendor's agent loop with
its own system prompt, so runs through this bridge are labeled for demos;
use raw API slots (OpenRouter etc.) for official audit numbers.

Security: only browser pages from ALLOWED_ORIGINS may call the bridge
(CORS), and it binds to 127.0.0.1 only.
"""

import argparse
import json
import subprocess
import time
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

OLLAMA_CLOUD_CATALOG = "https://ollama.com/api/tags"
_cloud_cache = {"at": 0.0, "data": None}


def ollama_cloud_models():
    """Proxy the ollama.com cloud catalog (the browser can't: no CORS there)."""
    if _cloud_cache["data"] is None or time.time() - _cloud_cache["at"] > 3600:
        with urllib.request.urlopen(OLLAMA_CLOUD_CATALOG, timeout=10) as res:
            models = json.load(res)["models"]
        # newest first, so clients can default to the latest model
        models.sort(key=lambda m: m.get("modified_at", ""), reverse=True)
        _cloud_cache.update(at=time.time(),
                            data=[{"id": f"{m['name']}:cloud", "object": "model"} for m in models])
    return {"object": "list", "data": _cloud_cache["data"]}

ALLOWED_ORIGINS = {
    "http://localhost:8642",
    "http://127.0.0.1:8642",
    "https://open-renewable-energy-systems.github.io",
}
CLI_TIMEOUT_S = 600

# backend -> (command builder, model ids to advertise)
BACKENDS = {
    "claude": {
        "cmd": lambda prompt, model: ["claude", "-p", "--model", model, prompt],
        "models": ["sonnet", "opus", "haiku"],
    },
    "codex": {
        # ChatGPT-account Codex only accepts its own current models; "default"
        # omits --model and uses whatever the CLI is configured for.
        "cmd": lambda prompt, model: ["codex", "exec"]
        + ([] if model == "default" else ["--model", model]) + [prompt],
        "models": ["default", "gpt-5.6-sol"],
    },
}


def flatten_messages(messages):
    """Collapse chat messages into one prompt string for a CLI call."""
    parts = []
    for m in messages:
        prefix = "SYSTEM INSTRUCTIONS:\n" if m["role"] == "system" else ""
        parts.append(prefix + m["content"])
    return "\n\n".join(parts)


def run_backend(backend, body):
    cmd = BACKENDS[backend]["cmd"](
        flatten_messages(body["messages"]), body.get("model") or BACKENDS[backend]["models"][0]
    )
    proc = subprocess.run(cmd, capture_output=True, text=True,
                          timeout=CLI_TIMEOUT_S, stdin=subprocess.DEVNULL)
    if proc.returncode != 0:
        raise RuntimeError(f"{backend} CLI exited {proc.returncode}: {proc.stderr[:300]}")
    return {
        "id": f"bridge-{backend}-{int(time.time())}",
        "object": "chat.completion",
        "model": f"{backend}-cli:{body.get('model', 'default')}",
        "choices": [{"index": 0, "finish_reason": "stop",
                     "message": {"role": "assistant", "content": proc.stdout.strip()}}],
    }


class Handler(BaseHTTPRequestHandler):
    def _send(self, status, payload):
        data = json.dumps(payload).encode()
        self.send_response(status)
        origin = self.headers.get("Origin", "")
        if origin in ALLOWED_ORIGINS:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _backend(self):
        name = self.path.strip("/").split("/")[0]
        return name if name in BACKENDS else None

    def do_OPTIONS(self):
        self._send(200, {})

    def do_GET(self):
        if self.path == "/ollama-cloud/models":
            try:
                self._send(200, ollama_cloud_models())
            except Exception as e:
                self._send(502, {"error": f"cloud catalog unavailable: {e}"})
            return
        backend = self._backend()
        if backend and self.path.endswith("/models"):
            self._send(200, {"object": "list",
                             "data": [{"id": m, "object": "model"} for m in BACKENDS[backend]["models"]]})
        else:
            self._send(404, {"error": "unknown path; use /claude/... or /codex/..."})

    def do_POST(self):
        backend = self._backend()
        if not backend or not self.path.endswith("/chat/completions"):
            self._send(404, {"error": "unknown path; use /{claude,codex}/chat/completions"})
            return
        try:
            body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
            self._send(200, run_backend(backend, body))
        except Exception as e:  # surfaced to the caller — bridge must never fail silently
            self._send(500, {"error": f"{type(e).__name__}: {e}"})

    def log_message(self, fmt, *args):
        print(f"[bridge] {fmt % args}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--allow-origin", action="append", default=[],
                        help="additional browser origin allowed to call the bridge")
    args = parser.parse_args()
    ALLOWED_ORIGINS.update(args.allow_origin)
    print(f"SAGE bridge on http://127.0.0.1:{args.port} — backends: {', '.join(BACKENDS)}")
    ThreadingHTTPServer(("127.0.0.1", args.port), Handler).serve_forever()


if __name__ == "__main__":
    main()
