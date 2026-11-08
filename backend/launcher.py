"""Entry point for the packaged desktop build (see BUILD.md).

Not used in the normal dev/Docker flow (those run `uvicorn app.main:app`
directly) — this exists only so PyInstaller has a single script to start
from: it launches the same FastAPI app on localhost and opens it in the
default browser, so a double-clicked executable behaves like a desktop
app with no terminal for the person running it to deal with.
"""

from __future__ import annotations

import threading
import time
import webbrowser

import uvicorn

from app.main import app

HOST = "127.0.0.1"
PORT = 8321


def _open_browser_when_ready() -> None:
    time.sleep(1.5)
    webbrowser.open(f"http://{HOST}:{PORT}")


def main() -> None:
    threading.Thread(target=_open_browser_when_ready, daemon=True).start()
    uvicorn.run(app, host=HOST, port=PORT, log_level="info")


if __name__ == "__main__":
    main()
