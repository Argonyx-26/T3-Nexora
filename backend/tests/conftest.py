"""Point the app at a throwaway database before any app module reads its settings."""

import os
import tempfile
from pathlib import Path

_tmp = Path(tempfile.mkdtemp(prefix="ayu-test-")) / "test.db"
os.environ["DATABASE_URL"] = f"sqlite:///{_tmp}"
os.environ["SIM_AUTOSTART"] = "false"
os.environ["GEMINI_API_KEY"] = ""
os.environ["AYU_EVAL_SEEDS"] = "1"
