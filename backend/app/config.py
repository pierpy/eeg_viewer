import os
import tempfile
from pathlib import Path

# Directory where uploaded EDF files are stored on disk.
# Kept outside the repo/tempdir-per-process so restarts don't collide.
UPLOAD_DIR = Path(os.environ.get("EEG_VIEWER_UPLOAD_DIR", Path(tempfile.gettempdir()) / "eeg_viewer_uploads"))
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

# Safety cap on how many samples we ever ship to the client in one response.
MAX_POINTS_PER_CHANNEL = int(os.environ.get("EEG_VIEWER_MAX_POINTS", "10000"))

# Safety cap on uploaded file size (bytes). Default 500MB.
MAX_UPLOAD_BYTES = int(os.environ.get("EEG_VIEWER_MAX_UPLOAD_BYTES", str(500 * 1024 * 1024)))
