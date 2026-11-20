"""Authenticated media resolver for a dedicated HTTPS host."""
import hmac
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import BoundedSemaphore

TOKEN = os.environ["VIDEO_RESOLVER_TOKEN"]
SLOTS = BoundedSemaphore(2)
MAX_BYTES = 48 * 1024 * 1024


def valid_source(platform, url):
    if not isinstance(url, str) or len(url) > 1024:
        return False
    if platform == "youtube":
        return re.fullmatch(r"https://www\.youtube\.com/watch\?v=[\w-]{11}", url, re.ASCII)
    if platform == "tiktok":
        return re.fullmatch(
            r"https://(?:www\.tiktok\.com/@[\w.-]+/video/\d{10,25}|v[mt]\.tiktok\.com/[\w-]{4,32})/?",
            url, re.ASCII
        )
    return False


class Resolver(BaseHTTPRequestHandler):
    def do_POST(self):
        expected = ("Bearer " + TOKEN).encode()
        if self.path != "/resolve" or not hmac.compare_digest(
            self.headers.get("Authorization", "").encode(), expected
        ):
            self.send_error(403)
            return
        try:
            size = int(self.headers.get("Content-Length", "0"))
            if not 0 < size <= 2048:
                raise ValueError()
            source = json.loads(self.rfile.read(size))
            platform, url = source["platform"], source["url"]
            if not valid_source(platform, url):
                raise ValueError()
        except (ValueError, KeyError, TypeError):
            self.send_error(400)
            return
        if not SLOTS.acquire(blocking=False):
            self.send_error(429)
            return
        try:
            with tempfile.TemporaryDirectory() as tmp:
                self.serve_media(Path(tmp), platform, url)
        finally:
            SLOTS.release()

    def serve_media(self, directory, platform, url):
        try:
            result = subprocess.run([
                sys.executable, "-m", "yt_dlp", "--ignore-config", "--no-playlist",
                "--no-progress", "--retries", "0", "--socket-timeout", "10",
                "--max-filesize", "48M", "-f", "bestaudio/best" if platform == "youtube" else "best",
                "-o", str(directory / "source.%(ext)s"), "--", url,
            ], cwd=directory, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=54)
            inputs = [p for p in directory.glob("source.*") if p.suffix not in {".part", ".ytdl"}]
            if result.returncode or len(inputs) != 1 or inputs[0].stat().st_size > MAX_BYTES:
                self.send_error(422)
                return
            audio = directory / "audio.mp3"
            result = subprocess.run([
                os.environ.get("FFMPEG", "ffmpeg"), "-nostdin", "-v", "error", "-i", str(inputs[0]),
                "-map", "0:a:0", "-ac", "1", "-ar", "16000", "-b:a", "48k", "-fs",
                str(MAX_BYTES), str(audio),
            ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=24)
            if result.returncode or not audio.is_file() or not 0 < audio.stat().st_size < MAX_BYTES:
                self.send_error(422)
                return
            self.send_response(200)
            self.send_header("Content-Type", "audio/mpeg")
            self.send_header("Content-Length", str(audio.stat().st_size))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            with audio.open("rb") as output:
                shutil.copyfileobj(output, self.wfile)
        except subprocess.TimeoutExpired:
            self.send_error(422)
        except (BrokenPipeError, ConnectionResetError):
            pass
        except OSError:
            self.send_error(502)


if __name__ == "__main__":
    ThreadingHTTPServer(("127.0.0.1", int(os.environ.get("PORT", "8788"))), Resolver).serve_forever()
