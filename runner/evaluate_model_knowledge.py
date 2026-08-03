"""
This script is for running the standards assessment.

Scope:
- Operating only from model knowledge/memory
- Evaluating t
"""

import os
from pathlib import Path

from dotenv import load_dotenv
from pydantic import BaseModel, Field
from pydantic_ai import Agent, ModelSettings
from pydantic_ai.models.anthropic import AnthropicModel
from pydantic_ai.models.mistral import MistralModel
from pydantic_ai.models.openai import OpenAIChatModel
from pydantic_ai.providers.anthropic import AnthropicProvider
from pydantic_ai.providers.mistral import MistralProvider
from pydantic_ai.providers.openai import OpenAIProvider
from pydantic_settings import BaseSettings


class _ExecutionSettings(BaseSettings):
    RUNS_PER_MODEL: int = 5

    # Settings for local model
    LOCAL_LLM_MODEL: str | None
    LOCAL_LLM_URL: str | None
    LOCAL_LLM_API_KEY: str | None

    # OpenAI
    OPENAI_MODEL: str | None
    OPENAI_API_KEY: str | None

    # Claude
    ANTHROPIC_MODEL: str | None
    ANTHROPIC_API_KEY: str | None

    # Mistral
    MISTRAL_MODEL: str | None
    MISTRAL_API_KEY: str | None

    @property
    def _model_settings(self) -> ModelSettings:
        return ModelSettings(temperature=0)

    # Models
    @property
    def local_openai_compatible_model(self) -> OpenAIChatModel | None:
        if self.LOCAL_LLM_MODEL in (None, ""):
            print(" - (No local LLM model configured)")
            return None
        if self.LOCAL_LLM_URL in (None, ""):
            print(" - (No local LLM host configured)")
            return None
        if self.LOCAL_LLM_API_KEY in (None, ""):
            self.LOCAL_LLM_API_KEY = "(skip)"
        return OpenAIChatModel(
            self.LOCAL_LLM_API_KEY,
            provider=OpenAIProvider(
                base_url=self.LOCAL_LLM_URL,
                api_key=self.LOCAL_LLM_API_KEY,
            ),
            settings=self._model_settings,
        )

    @property
    def openai_model(self) -> OpenAIChatModel | None:
        if self.OPENAI_MODEL in (None, ""):
            print(" - (No OpenAI model configured)")
            return None
        if self.OPENAI_API_KEY in (None, ""):
            print(" - (No OpenAI API key configured)")
            return None
        return OpenAIChatModel(
            self.OPENAI_MODEL,
            provider=OpenAIProvider(
                api_key=self.OPENAI_API_KEY,
            ),
            settings=self._model_settings,
        )

    @property
    def anthropic_model(self) -> AnthropicModel | None:
        if self.ANTHROPIC_MODEL in (None, ""):
            print(" - (No Anthropic model configured)")
            return None
        if self.ANTHROPIC_API_KEY in (None, ""):
            print(" - (No Anthropic API key configured)")
            return None
        return AnthropicModel(
            self.ANTHROPIC_MODEL,
            provider=AnthropicProvider(
                api_key=self.ANTHROPIC_API_KEY,
            ),
            settings=self._model_settings,
        )

    @property
    def mistral_model(self) -> MistralModel | None:
        if self.MISTRAL_MODEL in (None, ""):
            print(" - (No Anthropic model configured)")
            return None
        if self.MISTRAL_API_KEY in (None, ""):
            print(" - (No Anthropic API key configured)")
            return None
        return MistralModel(
            self.MISTRAL_MODEL,
            provider=MistralProvider(
                api_key=self.MISTRAL_API_KEY,
            ),
            settings=self._model_settings,
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


class _DimensionScoring(BaseModel):
    score: int = Field(ge=0, le=3)
    evidence: str
    rationale: str
    confidence: float = Field(ge=0, le=1)


class _ResponseModel(BaseModel):
    capability_declaration: _DimensionScoring
    bounded_authority: _DimensionScoring
    decision_auditability: _DimensionScoring
    data_governance: _DimensionScoring


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
    (SETTINGS.OPENAI_MODEL, SETTINGS.openai_model),
    (SETTINGS.ANTHROPIC_MODEL, SETTINGS.anthropic_model),
    (SETTINGS.MISTRAL_MODEL, SETTINGS.mistral_model),
]:
    if m is None:
        print(f"Skipping model {f} (not configured in .env)")
        continue

    local_agent = Agent(
        model=m,
        system_prompt=system_prompt_evals,
        output_type=_ResponseModel,
    )
    for i in candidate_standards:
        print(f"Evaluating {i}")
        cleaned_standard = i.replace(" ", "_").replace(".", "_")

        for j in range(SETTINGS.RUNS_PER_MODEL):
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
                        out.output.model_dump_json(indent=2)
                    )
                print(f"> Exported {f_out}")
        print(" ")

print("DONE")
