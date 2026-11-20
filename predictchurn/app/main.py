"""
main.py
=======
FastAPI application router. Mounts / imports api.app for consistent entry points.
"""

from __future__ import annotations

import sys
from pathlib import Path

# Add root folder so api.py and churn_model.py are discoverable
ROOT = Path(__file__).parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from api import app

__all__ = ["app"]
