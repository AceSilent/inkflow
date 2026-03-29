"""
OpenAI-compatible LLM client implementation.
Supports OpenAI API and compatible endpoints (DeepSeek, Kimi, etc.).
"""
import asyncio
import json
from typing import Dict, Any, Optional
import logging
from openai import AsyncOpenAI
from .llm_client import BaseLLMClient, LLMError, JSONParseError, RateLimitError

logger = logging.getLogger(__name__)


class OpenAILLMClient(BaseLLMClient):
    """
    OpenAI-compatible LLM client using the official OpenAI SDK.
    Supports OpenAI, DeepSeek, Kimi, and other compatible providers.
    """

    def __init__(
        self,
        model_name: str = "gpt-4o-mini",
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        max_retries: int = 3,
        timeout: int = 120,
        temperature: float = 0.7,
        max_tokens: Optional[int] = None,
        **kwargs
    ):
        """
        Initialize OpenAI-compatible client.

        Args:
            model_name: Model identifier (e.g., gpt-4o, deepseek-chat, etc.)
            api_key: API key (uses env var OPENAI_API_KEY if not provided)
            base_url: Base URL for API (for compatible endpoints)
            max_retries: Maximum retry attempts
            timeout: Request timeout in seconds
            temperature: Sampling temperature
            max_tokens: Maximum tokens to generate
            **kwargs: Additional parameters
        """
        super().__init__(
            model_name=model_name,
            max_retries=max_retries,
            timeout=timeout,
            api_key=api_key,
            base_url=base_url,
            temperature=temperature,
            max_tokens=max_tokens,
            **kwargs
        )

        # Initialize async client with generous timeout for thinking mode
        client_kwargs = {'timeout': 600.0}  # 10min — thinking mode can take long
        if api_key:
            client_kwargs['api_key'] = api_key
        if base_url:
            client_kwargs['base_url'] = base_url

        self.client = AsyncOpenAI(**client_kwargs)
        self.default_temperature = temperature
        self.default_max_tokens = max_tokens

    async def _generate_text(
        self,
        system_prompt: str,
        user_prompt: str,
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
        **kwargs
    ) -> str:
        """
        Generate text from OpenAI-compatible API.

        Args:
            system_prompt: System prompt
            user_prompt: User prompt
            temperature: Override default temperature
            max_tokens: Override default max_tokens
            **kwargs: Additional parameters

        Returns:
            Generated text
        """
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ]

        params = {
            "model": self.model_name,
            "messages": messages,
            "temperature": temperature or self.default_temperature,
        }

        if max_tokens or self.default_max_tokens:
            params["max_tokens"] = max_tokens or self.default_max_tokens

        # Merge additional parameters
        params.update(kwargs)

        try:
            response = await self.client.chat.completions.create(**params)
            return response.choices[0].message.content

        except Exception as e:
            error_msg = str(e)
            if "rate_limit" in error_msg.lower():
                raise RateLimitError(f"API rate limit exceeded: {e}")
            raise LLMError(f"OpenAI API call failed: {e}")

    async def generate_text_stream(
        self,
        system_prompt: str,
        user_prompt: str,
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
        enable_thinking: bool = True,
        **kwargs
    ):
        """
        Stream text from OpenAI-compatible API with native thinking mode.
        
        Yields tuples of (chunk_type, token_text) where chunk_type is:
        - 'thinking': reasoning_content tokens (model's internal thought process)
        - 'content': main reply content tokens
        
        Args:
            enable_thinking: If True, sends extra_body={"enable_thinking": True}
        """
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ]

        params = {
            "model": self.model_name,
            "messages": messages,
            "temperature": temperature or self.default_temperature,
            "stream": True,
        }

        if max_tokens or self.default_max_tokens:
            params["max_tokens"] = max_tokens or self.default_max_tokens

        if enable_thinking:
            params["extra_body"] = {"enable_thinking": True}

        params.update(kwargs)

        try:
            stream = await self.client.chat.completions.create(**params)
            async for chunk in stream:
                if not chunk.choices:
                    continue
                delta = chunk.choices[0].delta
                
                # Native thinking mode: reasoning_content field
                reasoning = getattr(delta, 'reasoning_content', None)
                if reasoning:
                    yield ('thinking', reasoning)
                
                # Main content
                if delta.content:
                    yield ('content', delta.content)

        except Exception as e:
            error_msg = str(e)
            if "rate_limit" in error_msg.lower():
                raise RateLimitError(f"API rate limit exceeded: {e}")
            raise LLMError(f"OpenAI API streaming call failed: {e}")

    async def generate_with_tools_stream(
        self,
        messages: list,
        tools: list = None,
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
        enable_thinking: bool = False,
        **kwargs
    ):
        """
        Streaming agent turn with tools + thinking mode.
        Accepts full message history (system + user + assistant + tool messages).

        Yields dicts with keys:
          {"type": "thinking", "token": str}
          {"type": "content", "token": str}
          {"type": "tool_call_delta", "index": int, "id": str, "name": str, "arguments": str}
          {"type": "finish", "finish_reason": str, "tool_calls": list}

        The caller accumulates tool_call_delta events into complete tool_call
        objects, On "finish" with tool_calls, dispatch them, append
        messages, and loop back for another iteration.
        """
        params = {
            "model": self.model_name,
            "messages": messages,
            "temperature": temperature or self.default_temperature,
            "stream": True,
        }

        if max_tokens or self.default_max_tokens:
            params["max_tokens"] = max_tokens or self.default_max_tokens

        if tools:
            params["tools"] = tools
            params["tool_choice"] = "auto"

        if enable_thinking:
            params["extra_body"] = {"enable_thinking": True}

        params.update(kwargs)

        # Try streaming with thinking; fallback if provider doesn't support it
        try:
            stream = await self.client.chat.completions.create(**params)
        except Exception as e:
            if enable_thinking:
                logger.info(f"enable_thinking not supported or streaming+tools failed ({e}), retrying without")
                params.pop("extra_body", None)
                stream = await self.client.chat.completions.create(**params)
            else:
                raise

        tool_calls_accum: Dict[int, dict] = {}  # keyed by index

        try:
            async for chunk in stream:
                if not chunk.choices:
                    continue
                delta = chunk.choices[0].delta
                choice = chunk.choices[0]

                # Thinking tokens (reasoning_content from DashScope/DeepSeek)
                reasoning = getattr(delta, 'reasoning_content', None)
                if reasoning:
                    yield {"type": "thinking", "token": reasoning}

                # Content tokens
                if delta.content:
                    yield {"type": "content", "token": delta.content}

                # Tool call deltas — accumulate by index
                if delta.tool_calls:
                    for tc_delta in delta.tool_calls:
                        idx = tc_delta.index
                        if idx not in tool_calls_accum:
                            tool_calls_accum[idx] = {"id": "", "name": "", "arguments": ""}
                        if tc_delta.id:
                            tool_calls_accum[idx]["id"] += tc_delta.id
                        if hasattr(tc_delta, 'function') and tc_delta.function:
                            if tc_delta.function.name:
                                tool_calls_accum[idx]["name"] += tc_delta.function.name
                            if tc_delta.function.arguments:
                                tool_calls_accum[idx]["arguments"] += tc_delta.function.arguments

                # Finish reason
                if choice.finish_reason:
                    final_tool_calls = []
                    for idx in sorted(tool_calls_accum.keys()):
                        tc = tool_calls_accum[idx]
                        final_tool_calls.append({
                            "id": tc["id"],
                            "type": "function",
                            "function": {
                                "name": tc["name"],
                                "arguments": tc["arguments"],
                            }
                        })
                    yield {
                        "type": "finish",
                        "finish_reason": choice.finish_reason,
                        "tool_calls": final_tool_calls,
                    }
                    return  # stream is done
        except Exception as e:
            error_msg = str(e)
            if "rate_limit" in error_msg.lower():
                raise RateLimitError(f"API rate limit exceeded: {e}")
            raise LLMError(f"OpenAI API streaming call failed: {e}")

    async def generate_text_with_thinking(
        self,
        system_prompt: str,
        user_prompt: str,
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
        enable_thinking: bool = True,
        **kwargs
    ) -> Dict[str, str]:
        """
        Non-streaming call with native thinking mode. Returns both thinking and content.
        
        Returns:
            {"thinking": "...", "content": "..."}
        """
        thinking_parts = []
        content_parts = []
        
        async for chunk_type, token in self.generate_text_stream(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            temperature=temperature,
            max_tokens=max_tokens,
            enable_thinking=enable_thinking,
            **kwargs
        ):
            if chunk_type == 'thinking':
                thinking_parts.append(token)
            else:
                content_parts.append(token)
        
        return {
            "thinking": "".join(thinking_parts),
            "content": "".join(content_parts),
        }

    async def _generate_json(
        self,
        system_prompt: str,
        user_prompt: str,
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
        **kwargs
    ) -> Dict[str, Any]:
        """
        Generate JSON from OpenAI-compatible API.

        Args:
            system_prompt: System prompt
            user_prompt: User prompt
            temperature: Override default temperature
            max_tokens: Override default max_tokens
            **kwargs: Additional parameters

        Returns:
            Parsed JSON as dictionary
        """
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ]

        params = {
            "model": self.model_name,
            "messages": messages,
            "temperature": temperature or self.default_temperature,
        }

        if max_tokens or self.default_max_tokens:
            params["max_tokens"] = max_tokens or self.default_max_tokens

        # Pass response_format if provided, else rely on fallback parsing
        response_format = kwargs.pop("response_format", None)
        if response_format:
            params["response_format"] = response_format

        # Merge additional parameters
        params.update(kwargs)

        try:
            logger.debug(f"Calling LLM with model: {self.model_name}")
            response = await self.client.chat.completions.create(**params)
            content = response.choices[0].message.content

            logger.debug(f"LLM returned {len(content)} characters")

            # Clean the content - handle common issues
            content = content.strip()

            # Normalize common encoding issues
            content = content.replace('Cliché_Phrase', 'Cliche_Phrase')
            content = content.replace('Cliché', 'Cliche')

            # Short-circuit: If response_format was used, it should be valid JSON
            if response_format and response_format.get("type") == "json_object":
                try:
                    result = json.loads(content)
                    logger.debug(f"Successfully parsed native JSON with keys: {list(result.keys())}")
                    return result
                except json.JSONDecodeError:
                    logger.debug("Native JSON parsing failed despite response_format, falling back to strategies")

            # Try multiple parsing strategies
            result = self._parse_json_with_strategies(content)
            logger.debug(f"Successfully parsed JSON via strategies with keys: {list(result.keys())}")
            return result

        except Exception as e:
            error_msg = str(e)
            if "rate_limit" in error_msg.lower():
                raise RateLimitError(f"API rate limit exceeded: {e}")
            raise LLMError(f"OpenAI API call failed: {e}")

    def _parse_json_with_strategies(self, content: str) -> Dict[str, Any]:
        """
        Try multiple strategies to parse JSON from content.

        Args:
            content: Raw content from LLM

        Returns:
            Parsed JSON dictionary

        Raises:
            JSONParseError: If all strategies fail
        """
        import re

        # Strategy 1: Direct parse
        try:
            return json.loads(content)
        except json.JSONDecodeError:
            logger.debug("Strategy 1 (direct parse) failed, trying alternatives")

        # Strategy 2: Extract from markdown code blocks
        json_match = re.search(r'```(?:json)?\s*\n?(.*?)\n?```', content, re.DOTALL)
        if json_match:
            try:
                extracted = json_match.group(1).strip()
                return json.loads(extracted)
            except json.JSONDecodeError:
                logger.debug("Strategy 2 (markdown extraction) failed")

        # Strategy 3: Find first complete JSON object
        # Match from first { to last }
        brace_count = 0
        start_idx = -1
        for i, char in enumerate(content):
            if char == '{':
                if brace_count == 0:
                    start_idx = i
                brace_count += 1
            elif char == '}':
                brace_count -= 1
                if brace_count == 0 and start_idx >= 0:
                    try:
                        json_str = content[start_idx:i+1]
                        return json.loads(json_str)
                    except json.JSONDecodeError:
                        logger.debug("Strategy 3 (brace matching) failed")
                        break

        # Strategy 4: Try to find any JSON-like pattern and clean it
        # Remove common prefixes like "Here's the JSON:" etc.
        lines = content.split('\n')
        json_lines = []
        in_json = False
        for line in lines:
            line = line.strip()
            if line.startswith('{'):
                in_json = True
            if in_json:
                json_lines.append(line)
            if line.endswith('}') and in_json:
                break

        if json_lines:
            try:
                json_str = '\n'.join(json_lines)
                return json.loads(json_str)
            except json.JSONDecodeError:
                logger.debug("Strategy 4 (line extraction) failed")

        # All strategies failed
        raise JSONParseError(
            f"Could not extract JSON from LLM response. "
            f"Tried 4 strategies. Last 200 chars: {content[-200:]}"
        )

    async def close(self):
        """Close the client connection."""
        await self.client.close()


class InstructorLLMClient(BaseLLMClient):
    """
    LLM client using instructor library for structured output.
    Provides better structured output guarantees for complex schemas.
    """

    def __init__(
        self,
        model_name: str = "gpt-4o",
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        max_retries: int = 3,
        timeout: int = 120,
        temperature: float = 0.7,
        max_retries_instructor: int = 3,
        **kwargs
    ):
        """
        Initialize Instructor client.

        Args:
            model_name: Model identifier
            api_key: API key
            base_url: Base URL for API
            max_retries: Maximum retry attempts
            timeout: Request timeout
            temperature: Sampling temperature
            max_retries_instructor: Instructor-specific retry count
            **kwargs: Additional parameters
        """
        super().__init__(
            model_name=model_name,
            max_retries=max_retries,
            timeout=timeout,
            api_key=api_key,
            base_url=base_url,
            **kwargs
        )

        try:
            import instructor
            from openai import AsyncOpenAI

            client_kwargs = {}
            if api_key:
                client_kwargs['api_key'] = api_key
            if base_url:
                client_kwargs['base_url'] = base_url

            self.client = instructor.from_openai(
                AsyncOpenAI(**client_kwargs),
                mode=instructor.Mode.JSON
            )
            self.max_retries_instructor = max_retries_instructor
            self.default_temperature = temperature

        except ImportError:
            raise ImportError(
                "instructor package is required for InstructorLLMClient. "
                "Install it with: pip install instructor"
            )

    async def _generate_text(
        self,
        system_prompt: str,
        user_prompt: str,
        temperature: Optional[float] = None,
        **kwargs
    ) -> str:
        """Generate text (fallback to standard client)."""
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ]

        response = await self.client.chat.completions.create(
            model=self.model_name,
            messages=messages,
            temperature=temperature or self.default_temperature,
            **kwargs
        )

        return response.choices[0].message.content

    async def _generate_json(
        self,
        system_prompt: str,
        user_prompt: str,
        response_model: Optional[type] = None,
        temperature: Optional[float] = None,
        **kwargs
    ) -> Dict[str, Any]:
        """
        Generate structured output using instructor.

        Args:
            system_prompt: System prompt
            user_prompt: User prompt
            response_model: Pydantic model for structured output
            temperature: Override temperature
            **kwargs: Additional parameters

        Returns:
            Validated data as dictionary
        """
        if response_model is None:
            raise ValueError("response_model must be provided for InstructorLLMClient")

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ]

        try:
            response = await self.client.chat.completions.create(
                model=self.model_name,
                messages=messages,
                response_model=response_model,
                temperature=temperature or self.default_temperature,
                max_retries=self.max_retries_instructor,
                **kwargs
            )

            # Convert Pydantic model to dict
            if hasattr(response, 'model_dump'):
                return response.model_dump()
            elif hasattr(response, 'dict'):
                return response.dict()
            else:
                return response

        except Exception as e:
            raise LLMError(f"Instructor structured output failed: {e}")

    async def close(self):
        """Close the client connection."""
        await self.client.close()
