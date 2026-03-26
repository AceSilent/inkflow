"""
Abstract LLM Client with retry logic.
All LLM interactions must go through this interface.
"""
import asyncio
from abc import ABC, abstractmethod
from typing import Type, TypeVar, Optional, Dict, Any
import json
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type,
    before_sleep_log
)
import logging
from pydantic import BaseModel, ValidationError

logger = logging.getLogger(__name__)

T = TypeVar('T', bound=BaseModel)


class LLMError(Exception):
    """Base exception for LLM-related errors."""
    pass


class JSONParseError(LLMError):
    """Raised when LLM output cannot be parsed as JSON."""
    pass


class RateLimitError(LLMError):
    """Raised when API rate limit is hit."""
    pass


class BaseLLMClient(ABC):
    """
    Abstract base class for LLM clients.
    All LLM implementations must inherit from this class.
    """

    def __init__(
        self,
        model_name: str,
        max_retries: int = 3,
        timeout: int = 120,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        **kwargs
    ):
        """
        Initialize LLM client.

        Args:
            model_name: Name/identifier of the model to use
            max_retries: Maximum number of retry attempts
            timeout: Request timeout in seconds
            api_key: API key for authentication
            base_url: Base URL for API (for compatible endpoints)
            **kwargs: Additional model-specific parameters
        """
        self.model_name = model_name
        self.max_retries = max_retries
        self.timeout = timeout
        self.api_key = api_key
        self.base_url = base_url
        self.extra_params = kwargs

    @abstractmethod
    async def _generate_text(
        self,
        system_prompt: str,
        user_prompt: str,
        **kwargs
    ) -> str:
        """
        Internal method to generate text from LLM.
        Must be implemented by subclasses.

        Args:
            system_prompt: System prompt for the LLM
            user_prompt: User prompt for the LLM
            **kwargs: Additional parameters (temperature, max_tokens, etc.)

        Returns:
            Generated text as string
        """
        pass

    @abstractmethod
    async def _generate_json(
        self,
        system_prompt: str,
        user_prompt: str,
        **kwargs
    ) -> Dict[str, Any]:
        """
        Internal method to generate JSON from LLM.
        Must be implemented by subclasses.

        Args:
            system_prompt: System prompt for the LLM
            user_prompt: User prompt for the LLM
            **kwargs: Additional parameters

        Returns:
            Parsed JSON as dictionary
        """
        pass

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        retry=retry_if_exception_type((JSONParseError, ValidationError, asyncio.TimeoutError)),
        before_sleep=before_sleep_log(logger, logging.WARNING)
    )
    async def generate_text(
        self,
        system_prompt: str,
        user_prompt: str,
        **kwargs
    ) -> str:
        """
        Generate text from LLM with automatic retry.

        Args:
            system_prompt: System prompt for the LLM
            user_prompt: User prompt for the LLM
            **kwargs: Additional parameters (temperature, max_tokens, etc.)

        Returns:
            Generated text as string
        """
        try:
            result = await asyncio.wait_for(
                self._generate_text(system_prompt, user_prompt, **kwargs),
                timeout=self.timeout
            )
            return result
        except asyncio.TimeoutError:
            logger.error(f"LLM request timed out after {self.timeout}s")
            raise
        except Exception as e:
            logger.error(f"LLM text generation failed: {e}")
            raise LLMError(f"Text generation failed: {e}")

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        retry=retry_if_exception_type((JSONParseError, ValidationError, asyncio.TimeoutError)),
        before_sleep=before_sleep_log(logger, logging.WARNING)
    )
    async def generate_json(
        self,
        system_prompt: str,
        user_prompt: str,
        response_model: Type[T],
        **kwargs
    ) -> T:
        """
        Generate structured JSON output from LLM with automatic retry.
        Uses Pydantic for validation.

        Args:
            system_prompt: System prompt for the LLM
            user_prompt: User prompt for the LLM
            response_model: Pydantic model class for validation
            **kwargs: Additional parameters

        Returns:
            Validated Pydantic model instance
        """
        try:
            enhanced_prompt = user_prompt
            # Append JSON schema instruction to user prompt if response_model is provided
            if response_model is not None:
                json_instruction = self._get_json_instruction(response_model)
                enhanced_prompt = f"{user_prompt}\n\n{json_instruction}"

            result = await asyncio.wait_for(
                self._generate_json(system_prompt, enhanced_prompt, **kwargs),
                timeout=self.timeout
            )

            # Validate against Pydantic model
            if response_model is not None:
                validated = response_model(**result)
                return validated
            return result

        except ValidationError as e:
            logger.error(f"Pydantic validation failed: {e}")
            raise
        except asyncio.TimeoutError:
            logger.error(f"LLM request timed out after {self.timeout}s")
            raise
        except Exception as e:
            logger.error(f"LLM JSON generation failed: {e}")
            raise LLMError(f"JSON generation failed: {e}")

    def _get_json_instruction(self, response_model: Type[BaseModel]) -> str:
        """
        Generate JSON schema instruction for the LLM.

        Args:
            response_model: Pydantic model class

        Returns:
            Instruction string with JSON schema
        """
        schema = response_model.model_json_schema()

        # Build field descriptions from schema
        properties = schema.get("properties", {})
        required_fields = schema.get("required", [])

        instruction_parts = [
            "## JSON Output Format",
            "You must respond with a valid JSON object. Your response should contain ONLY the JSON, no additional text.",
            "",
            "### Required Fields:"
        ]

        for field_name in required_fields:
            if field_name in properties:
                field_info = properties[field_name]
                field_type = field_info.get("type", "string")
                field_desc = field_info.get("description", "")
                instruction_parts.append(f"- **{field_name}** ({field_type}): {field_desc}")

        # Optional fields
        optional_fields = [f for f in properties.keys() if f not in required_fields]
        if optional_fields:
            instruction_parts.append("\n### Optional Fields:")
            for field_name in optional_fields:
                field_info = properties[field_name]
                field_type = field_info.get("type", "string")
                field_desc = field_info.get("description", "")
                instruction_parts.append(f"- **{field_name}** ({field_type}): {field_desc}")

        instruction_parts.extend([
            "",
            "### Example Format:",
            "```json",
            "{"
        ])

        # Add example format for first few fields
        for i, field_name in enumerate(required_fields[:3]):
            field_info = properties[field_name]
            field_type = field_info.get("type", "string")
            example_value = self._get_example_value(field_type, field_name)
            comma = "," if i < len(required_fields) - 1 else ""
            instruction_parts.append(f'  "{field_name}": {example_value}{comma}')

        instruction_parts.extend([
            "}",
            "```",
            "",
            "**IMPORTANT**: Respond with actual data values, NOT field descriptions or types!"
        ])

        return "\n".join(instruction_parts)

    def _get_example_value(self, field_type: str, field_name: str) -> str:
        """Get an example value for a field type."""
        if field_type == "string":
            if "score" in field_name.lower():
                return '"8"'
            elif "role" in field_name.lower():
                return '"example_role"'
            else:
                return '"example_value"'
        elif field_type == "integer":
            return "1"
        elif field_type == "number":
            return "1.0"
        elif field_type == "boolean":
            return "true"
        elif field_type == "array":
            return "[]"
        else:
            return '""'

    async def generate_with_fallback(
        self,
        system_prompt: str,
        user_prompt: str,
        response_model: Optional[Type[T]] = None,
        **kwargs
    ) -> str | T:
        """
        Generate text or JSON with automatic fallback handling.

        Args:
            system_prompt: System prompt for the LLM
            user_prompt: User prompt for the LLM
            response_model: Optional Pydantic model for JSON output
            **kwargs: Additional parameters

        Returns:
            String text or validated Pydantic model instance
        """
        if response_model:
            return await self.generate_json(
                system_prompt,
                user_prompt,
                response_model,
                **kwargs
            )
        else:
            return await self.generate_text(
                system_prompt,
                user_prompt,
                **kwargs
            )

    def get_model_info(self) -> Dict[str, Any]:
        """
        Get information about the current model configuration.

        Returns:
            Dictionary with model information
        """
        return {
            "model_name": self.model_name,
            "max_retries": self.max_retries,
            "timeout": self.timeout,
            "base_url": self.base_url,
            "extra_params": self.extra_params
        }
