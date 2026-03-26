import json
import logging
import requests
from typing import Optional

logger = logging.getLogger(__name__)

class WebhookNotifier:
    """
    Sends non-blocking alerts to a webhook (e.g. Feishu, Telegram).
    Used to inform humans that the loop is blocked or a review is ready.
    """
    def __init__(self, webhook_url: Optional[str] = None):
        self.webhook_url = webhook_url

    def send_alert(self, title: str, content: str) -> bool:
        """
        Send an alert. Catch any network exceptions to ensure it never crashes the main loop.
        """
        if not self.webhook_url:
            return False
            
        try:
            payload = {
                "title": title,
                "content": content
            }
            # Add timeout to avoid hanging the thread
            resp = requests.post(self.webhook_url, json=payload, timeout=5.0)
            resp.raise_for_status()
            return True
        except Exception as e:
            logger.error(f"Failed to send webhook alert: {e}")
            return False
