"""
This script is for running the standards assessment
"""

import os
from pathlib import Path

from dotenv import load_dotenv
from pydantic_ai import Agent
from pydantic_ai.models.openai import OpenAIChatModel
from pydantic_ai.providers.openai import OpenAIProvider
from pydantic_settings import BaseSettings


class _ExecutionSettings(BaseSettings):
    LOCAL_LLM_MODEL: str = "unsloth/Qwen3.6"
    LOCAL_LLM_URL: str = "http://localhost:8080/v1"
    LOCAL_LLM_API_KEY: str = "skip"

    @property
    def local_openai_compatible_model(self) -> OpenAIChatModel:
        return OpenAIChatModel(
            self.LOCAL_LLM_API_KEY,
            provider=OpenAIProvider(
                base_url=self.LOCAL_LLM_URL,
                api_key=self.LOCAL_LLM_API_KEY,
            ),
        )

    @property
    def output_folder(self) -> Path:
        out = Path(__file__).parent.parent / "results"
        if not os.path.exists(out):
            os.makedirs(out, exist_ok=True)
        return out

    @property
    def prompts_folder(self) -> Path:
        out = Path(__file__).parent.parent / "prompts"
        if not os.path.exists(out):
            os.makedirs(out, exist_ok=True)
        return out


load_dotenv()
SETTINGS = _ExecutionSettings()

# System prompt for evaluations
with open(SETTINGS.prompts_folder / "eval_system_prompt.md", "r") as f:
    system_prompt_evals = f.read()

candidate_standards = [
    "IEC 61850",
    "CIM",
    "OpenADR 3",
    "ISO 15118",
    "IEEE 1547",
    "SunSpec",
    "IEEE 2030.5",
]

output_folder = SETTINGS.output_folder

for m_name, m in [
    (
        f"local_{SETTINGS.LOCAL_LLM_MODEL.replace('/', '_')}",
        SETTINGS.local_openai_compatible_model,
    ),
]:
    local_agent = Agent(
        model=m,
        system_prompt=system_prompt_evals,
    )
    for i in candidate_standards:
        print(f"Evaluating {i}")
        cleaned_standard = i.replace(" ", "_").replace(".", "_")
        for j in range(5):
            f_out = (
                output_folder / f"{cleaned_standard}--{m_name}--iteration_{j + 1}.json"
            )
            if os.path.exists(f_out):
                print(f"> Skipped {f_out}")
            else:
                out = local_agent.run_sync(user_prompt=f"STANDARD_NAME: {i}")
                with open(f_out, "w") as f:
                    f.write(
                        # Sanitize the formatting before writing
                        out.output.replace("```json", "").replace("```", "")
                    )
                print(f"> Exported {f_out}")
        print(" ")

print("DONE")
