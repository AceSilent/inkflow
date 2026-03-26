"""
AutoNovel-Studio v4.0 — SSE (Server-Sent Events) Manager
"""
import asyncio
import json
from typing import AsyncGenerator, Dict, Set
from fastapi.responses import StreamingResponse


class SSEManager:
    """Manages Server-Sent Events connections and broadcasting."""

    def __init__(self):
        self._queues: Set[asyncio.Queue] = set()

    def create_connection(self) -> asyncio.Queue:
        queue = asyncio.Queue()
        self._queues.add(queue)
        return queue

    def remove_connection(self, queue: asyncio.Queue):
        self._queues.discard(queue)

    async def broadcast(self, event: str, data: dict):
        """Broadcast an event to all connected clients."""
        message = self._format_sse(event, data)
        dead_queues = []
        for queue in self._queues:
            try:
                await asyncio.wait_for(queue.put(message), timeout=5.0)
            except (asyncio.TimeoutError, Exception):
                dead_queues.append(queue)
        for q in dead_queues:
            self._queues.discard(q)

    async def send(self, queue: asyncio.Queue, event: str, data: dict):
        """Send an event to a specific client."""
        message = self._format_sse(event, data)
        await queue.put(message)

    def _format_sse(self, event: str, data: dict) -> str:
        return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"

    async def stream_generator(self, queue: asyncio.Queue) -> AsyncGenerator[str, None]:
        """Generate SSE stream for a client."""
        try:
            while True:
                message = await asyncio.wait_for(queue.get(), timeout=30.0)
                yield message
        except asyncio.TimeoutError:
            # Send keepalive
            yield ": keepalive\n\n"
        except asyncio.CancelledError:
            pass
        finally:
            self.remove_connection(queue)

    def create_stream_response(self) -> StreamingResponse:
        """Create a StreamingResponse for SSE."""
        queue = self.create_connection()
        return StreamingResponse(
            self.stream_generator(queue),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            }
        )


# Global SSE manager instance
sse_manager = SSEManager()
