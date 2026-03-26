# Tests configuration for pytest
import os
import sys
from pathlib import Path

# Add project root to python path so imports work correctly
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

# Set dummy environment variables to prevent true API calls during testing
os.environ["OPENAI_API_KEY"] = "sk-mock-key-for-testing"
os.environ["OPENAI_BASE_URL"] = "http://localhost:8080/v1"
