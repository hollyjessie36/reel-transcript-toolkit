# Additional video sources

The Worker keeps the existing Instagram relay. Homepage capabilities come from `GET /media-capabilities`. TikTok and YouTube stay disabled until the corresponding provider has been configured and verified in the deployment environment.

Run `resolver.py` with Python, yt-dlp and FFmpeg on a dedicated host. It listens on loopback port 8788 by default. Set `VIDEO_RESOLVER_TOKEN` to a strong random shared secret and put an HTTPS reverse proxy in front of `POST /resolve`. Limit external access to this endpoint and set request and rate limits on the proxy. Run the resolver as an unprivileged service. Keep yt-dlp and FFmpeg patched. Use `FFMPEG` to specify an executable path when necessary.

Configure the Worker with `VIDEO_RESOLVER_URL` (HTTPS URL ending in `/resolve`), the corresponding secret `VIDEO_RESOLVER_TOKEN`, and `VIDEO_RESOLVER_PLATFORMS` (comma-separated platform names). The provider receives the canonical public link and returns MP3 audio. The browser runs speech recognition and handles copy, TXT and SRT output. No browser cookies are used. If a platform requires authentication or fails to supply audio, the user can upload a saved file.

Before enabling a platform, verify its source retrieval from the actual resolver host with representative public videos and test browser transcription and export. YouTube returned an authentication challenge in the development environment. Do not enable it on the strength of URL parsing alone.

YouTube caption import uses TranscriptAPI when TRANSCRIPTAPI_KEY is set as a Worker secret.
