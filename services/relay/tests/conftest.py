import os
from pathlib import Path
import sys

# Module-level ASGI construction must not open the running relay's database.
os.environ["HEAVY_RAIN_SQLITE_PATH"] = ":memory:"
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
