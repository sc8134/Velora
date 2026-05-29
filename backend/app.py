import os
import asyncio
import tempfile
import threading
import time
import urllib.parse
import yt_dlp
from starlette.applications import Starlette
from starlette.responses import JSONResponse, FileResponse, Response, StreamingResponse
from starlette.routing import Route
from starlette.middleware import Middleware
from starlette.middleware.cors import CORSMiddleware

from jobs import create_job, get_job, update_job, append_history, mark_retry, all_jobs
from auth import register, login, require_auth, google_auth_url, google_exchange_code, FRONTEND_URL
from audit import log_event, recent_events, analytics_summary
from ai_service import transcribe, summarize, search_hub, recommend, voice_to_text

# Auto-detect ffmpeg location
FFMPEG_PATH = os.getenv("FFMPEG_PATH") or None

# Write YouTube cookies from env var to a temp file if provided
_COOKIES_FILE = None
_YT_COOKIES_ENV = os.environ.get("YOUTUBE_COOKIES", "").strip()
if _YT_COOKIES_ENV:
    import tempfile as _tf
    _cf = _tf.NamedTemporaryFile(mode="w", suffix=".txt", delete=False)
    _cf.write(_YT_COOKIES_ENV)
    _cf.close()
    _COOKIES_FILE = _cf.name

BASE_OPTS = {
    "quiet": True,
    "extractor_args": {
        "youtube": {
            "player_client": ["tv_embedded", "web_creator", "android_vr"],
        }
    },
    "http_headers": {
        "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36",
    },
}

if FFMPEG_PATH:
    BASE_OPTS["ffmpeg_location"] = FFMPEG_PATH

if _COOKIES_FILE:
    BASE_OPTS["cookiefile"] = _COOKIES_FILE

# Rate-limit backoff: wait this many seconds before retrying on throttle
RATE_LIMIT_BACKOFF = [5, 15, 45]

PROFILES = {
    "default":  {"label": "Default",      "type": "video", "quality": "best", "ext": "mp4",  "trim_start": None, "trim_end": None, "embed_subs": False, "embed_thumbnail": False, "embed_metadata": True},
    "music":    {"label": "Music Mode",   "type": "audio", "quality": "best", "ext": "mp3",  "trim_start": None, "trim_end": None, "embed_subs": False, "embed_thumbnail": True,  "embed_metadata": True},
    "lecture":  {"label": "Lecture Mode", "type": "video", "quality": "720",  "ext": "mp4",  "trim_start": None, "trim_end": None, "embed_subs": True,  "embed_thumbnail": False, "embed_metadata": True},
    "mobile":   {"label": "Mobile Mode",  "type": "video", "quality": "480",  "ext": "mp4",  "trim_start": None, "trim_end": None, "embed_subs": False, "embed_thumbnail": False, "embed_metadata": True},
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _is_rate_limit_error(err: str) -> bool:
    markers = ["429", "rate limit", "too many requests", "throttl", "slow down"]
    low = err.lower()
    return any(m in low for m in markers)


def _build_ydl_opts(tmp_dir, dl_type, quality, ext, trim_start, trim_end,
                    embed_thumbnail, embed_metadata, embed_subs, sub_langs,
                    progress_hook=None) -> dict:
    opts = {**BASE_OPTS, "outtmpl": os.path.join(tmp_dir, "%(title)s.%(ext)s")}
    if progress_hook:
        opts["progress_hooks"] = [progress_hook]

    postprocessors = []

    if dl_type == "audio":
        abr = quality if quality != "best" else "192"
        opts["format"] = "140/139/bestaudio/best"
        postprocessors.append({"key": "FFmpegExtractAudio", "preferredcodec": ext, "preferredquality": abr})
    else:
        if quality == "best":
            opts["format"] = "bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best"
        else:
            opts["format"] = (
                f"bestvideo[height<={quality}][ext=mp4]+bestaudio[ext=m4a]/"
                f"bestvideo[height<={quality}]+bestaudio/best[height<={quality}]/best"
            )
        opts["merge_output_format"] = ext if ext in ("mp4", "mkv", "webm") else "mp4"

    if trim_start or trim_end:
        section = {}
        if trim_start: section["start_time"] = trim_start
        if trim_end:   section["end_time"]   = trim_end
        opts["download_ranges"] = yt_dlp.utils.download_range_func(None, [section])
        opts["force_keyframes_at_cuts"] = True

    if embed_metadata:
        postprocessors.append({"key": "FFmpegMetadata", "add_metadata": True})
    if embed_thumbnail:
        postprocessors.append({"key": "EmbedThumbnail"})
        opts["writethumbnail"] = True
    if embed_subs:
        opts["writesubtitles"] = True
        opts["writeautomaticsub"] = True
        opts["subtitleslangs"] = [sub_langs or "en"]
        postprocessors.append({"key": "FFmpegEmbedSubtitle", "already_have_subtitle": False})

    if postprocessors:
        opts["postprocessors"] = postprocessors
    return opts


def _media_type_for(filename: str) -> str:
    ext = filename.rsplit(".", 1)[-1].lower()
    return {"mp3": "audio/mpeg", "m4a": "audio/mp4", "flac": "audio/flac",
            "mp4": "video/mp4", "mkv": "video/x-matroska", "webm": "video/webm"
            }.get(ext, "application/octet-stream")


def _extract_params(body: dict) -> dict:
    profile_id = body.get("profile", "default")
    p = PROFILES.get(profile_id, PROFILES["default"])
    return {
        "dl_type":     body.get("type",            p["type"]),
        "quality":     body.get("quality",         p["quality"]),
        "ext":         body.get("ext",             p["ext"]),
        "trim_start":  body.get("trim_start",      p["trim_start"]),
        "trim_end":    body.get("trim_end",        p["trim_end"]),
        "embed_thumb": body.get("embed_thumbnail", p["embed_thumbnail"]),
        "embed_meta":  body.get("embed_metadata",  p["embed_metadata"]),
        "embed_subs":  body.get("embed_subs",      p["embed_subs"]),
        "sub_langs":   body.get("sub_langs",       "en"),
    }


# ---------------------------------------------------------------------------
# Background job runner — with resume, retry, rate-limit backoff
# ---------------------------------------------------------------------------

def _run_job(job_id: str, url: str, params: dict):
    """
    Runs in a background thread.
    - Resumes partial downloads via yt-dlp's continue_dl.
    - Retries up to MAX_RETRIES times on transient errors.
    - Backs off on rate-limit errors before retrying.
    """
    job = get_job(job_id)
    if not job:
        return

    attempt = job["retries"]  # 0 on first run, >0 on retry

    tmp_dir = tempfile.mkdtemp()

    def hook(d):
        if d["status"] == "downloading":
            total = d.get("total_bytes") or d.get("total_bytes_estimate") or 0
            downloaded = d.get("downloaded_bytes", 0)
            pct = int(downloaded / total * 90) if total else 0
            update_job(job_id, status="running", progress=pct,
                       message=d.get("_speed_str", "Downloading…"))
        elif d["status"] == "finished":
            update_job(job_id, progress=92, message="Post-processing…")

    try:
        update_job(job_id, status="running", progress=5,
                   message=f"Starting (attempt {attempt + 1})…")
        append_history(job_id, "running", f"Attempt {attempt + 1} started")

        ydl_opts = _build_ydl_opts(
            tmp_dir,
            params["dl_type"], params["quality"], params["ext"],
            params["trim_start"], params["trim_end"],
            params["embed_thumb"], params["embed_meta"],
            params["embed_subs"], params["sub_langs"],
            progress_hook=hook,
        )
        # Resume partial downloads
        ydl_opts["continuedl"] = True

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.extract_info(url, download=True)

        files = [f for f in os.listdir(tmp_dir) if not f.endswith(".part")]
        if not files:
            raise RuntimeError("No file produced after download")

        target = next((f for f in files if f.endswith(f".{params['ext']}")), files[0])
        filepath = os.path.join(tmp_dir, target)
        update_job(job_id, status="done", progress=100,
                   message="Ready", filename=target, filepath=filepath)
        append_history(job_id, "done", f"Completed: {target}")
        log_event("job_done", details={"job_id": job_id, "filename": target})

    except Exception as exc:
        err_str = str(exc)
        log_event("job_error", details={"job_id": job_id, "error": err_str, "attempt": attempt + 1})

        if _is_rate_limit_error(err_str):
            backoff = RATE_LIMIT_BACKOFF[min(attempt, len(RATE_LIMIT_BACKOFF) - 1)]
            update_job(job_id, message=f"Rate limited — waiting {backoff}s before retry…")
            append_history(job_id, "rate_limited", f"Backing off {backoff}s")
            time.sleep(backoff)

        can_retry = mark_retry(job_id, err_str)
        if can_retry:
            updated = get_job(job_id)
            _run_job(job_id, url, params)  # recursive retry
        else:
            update_job(job_id, status="error", error=err_str)
            append_history(job_id, "error", f"Failed after {attempt + 1} attempt(s): {err_str}")


# ---------------------------------------------------------------------------
# Auth routes
# ---------------------------------------------------------------------------

async def auth_register(request):
    try:
        body = await request.json()
        result = register(body.get("username", ""), body.get("password", ""))
        if result["ok"]:
            log_event("register", user=body.get("username", ""))
            return JSONResponse({"ok": True}, status_code=201)
        return JSONResponse({"error": result["error"]}, status_code=400)
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


async def auth_login(request):
    try:
        body = await request.json()
        result = login(body.get("username", ""), body.get("password", ""))
        if result["ok"]:
            log_event("login", user=body.get("username", ""))
            return JSONResponse({"token": result["token"], "username": result["username"], "role": result["role"]})
        log_event("login_fail", user=body.get("username", ""), details={"error": result["error"]})
        return JSONResponse({"error": result["error"]}, status_code=401)
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


async def auth_me(request):
    user, err = require_auth(request)
    if err:
        return err
    return JSONResponse({"username": user["sub"], "role": user["role"]})


# Google OAuth routes

async def auth_google_redirect(request):
    """GET /api/auth/google — redirect user to Google consent screen."""
    from starlette.responses import RedirectResponse
    url = google_auth_url()
    return RedirectResponse(url)


async def auth_google_callback(request):
    """
    GET /api/auth/google/callback — Google redirects here with ?code=...
    Exchanges the code, issues a Velora JWT, then redirects to the
    frontend with the token in the URL hash so JS can pick it up.
    """
    from starlette.responses import RedirectResponse
    import traceback

    code = request.query_params.get("code")
    if not code:
        return RedirectResponse(f"{FRONTEND_URL}/#auth_error=missing_code")

    try:
        # Run the synchronous requests calls in a thread so we don't block the event loop
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(None, lambda: google_exchange_code(code))
    except Exception as exc:
        tb = traceback.format_exc()
        log_event("google_oauth_error", details={"error": str(exc), "traceback": tb})
        error = urllib.parse.quote(f"server_error: {str(exc)[:120]}")
        return RedirectResponse(f"{FRONTEND_URL}/#auth_error={error}")

    if not result["ok"]:
        error = urllib.parse.quote(result.get("error", "oauth_failed"))
        log_event("google_oauth_fail", details={"error": result.get("error")})
        return RedirectResponse(f"{FRONTEND_URL}/#auth_error={error}")

    token    = urllib.parse.quote(result["token"])
    username = urllib.parse.quote(result["username"])
    role     = urllib.parse.quote(result["role"])
    picture  = urllib.parse.quote(result.get("picture", ""))
    log_event("google_login", user=result["username"])
    return RedirectResponse(
        f"{FRONTEND_URL}/#auth_token={token}&username={username}&role={role}&picture={picture}"
    )


# ---------------------------------------------------------------------------
# Analytics & audit routes (admin only)
# ---------------------------------------------------------------------------

async def get_analytics(request):
    user, err = require_auth(request)
    if err:
        return err
    if user.get("role") != "admin":
        return JSONResponse({"error": "Admin only"}, status_code=403)
    return JSONResponse(analytics_summary())


async def get_audit_log(request):
    user, err = require_auth(request)
    if err:
        return err
    if user.get("role") != "admin":
        return JSONResponse({"error": "Admin only"}, status_code=403)
    limit = int(request.query_params.get("limit", 100))
    return JSONResponse({"events": recent_events(limit)})


# ---------------------------------------------------------------------------
# Health / monitoring
# ---------------------------------------------------------------------------

async def health(request):
    jobs = all_jobs()
    running  = sum(1 for j in jobs if j["status"] == "running")
    pending  = sum(1 for j in jobs if j["status"] == "pending")
    done     = sum(1 for j in jobs if j["status"] == "done")
    errors   = sum(1 for j in jobs if j["status"] == "error")
    retrying = sum(1 for j in jobs if j["status"] == "retrying")
    return JSONResponse({
        "status": "ok",
        "jobs": {"running": running, "pending": pending, "done": done,
                 "error": errors, "retrying": retrying, "total": len(jobs)},
        "uptime": time.time(),
    })


# ---------------------------------------------------------------------------
# Existing routes (formats, download, jobs, batch, profiles, subtitles)
# ---------------------------------------------------------------------------

async def favicon(request):
    return Response(status_code=204)


async def root(request):
    return JSONResponse({"status": "Velora API running"})


async def get_formats(request):
    try:
        body = await request.json()
        url = body.get("url")
        if not url:
            return JSONResponse({"error": "No URL provided"}, status_code=400)

        user = None
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            from auth import verify_token
            user = verify_token(auth_header[7:])

        log_event("fetch_info", user=user["sub"] if user else "anonymous", details={"url": url})

        ydl_opts = {**BASE_OPTS, "skip_download": True, "extract_flat": "in_playlist"}
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)

        is_playlist = info.get("_type") in ("playlist", "multi_video") or "entries" in info

        video_options = [
            {"type": "video", "label": "Best Quality (MP4)", "quality": "best", "ext": "mp4"},
            {"type": "video", "label": "4K (MP4)",           "quality": "2160", "ext": "mp4"},
            {"type": "video", "label": "1080p (MP4)",        "quality": "1080", "ext": "mp4"},
            {"type": "video", "label": "720p (MP4)",         "quality": "720",  "ext": "mp4"},
            {"type": "video", "label": "480p (MP4)",         "quality": "480",  "ext": "mp4"},
            {"type": "video", "label": "360p (MP4)",         "quality": "360",  "ext": "mp4"},
            {"type": "video", "label": "Best Quality (MKV)", "quality": "best", "ext": "mkv"},
        ]
        audio_options = [
            {"type": "audio", "label": "Best Audio (MP3)",     "quality": "best", "ext": "mp3"},
            {"type": "audio", "label": "High (192kbps MP3)",   "quality": "192",  "ext": "mp3"},
            {"type": "audio", "label": "Medium (128kbps MP3)", "quality": "128",  "ext": "mp3"},
            {"type": "audio", "label": "Best Audio (M4A)",     "quality": "best", "ext": "m4a"},
            {"type": "audio", "label": "Best Audio (FLAC)",    "quality": "best", "ext": "flac"},
        ]

        result = {
            "title": info.get("title"),
            "thumbnail": info.get("thumbnail"),
            "duration": info.get("duration"),
            "uploader": info.get("uploader") or info.get("channel"),
            "url": info.get("webpage_url") or url,
            "video_options": video_options,
            "audio_options": audio_options,
            "is_playlist": is_playlist,
            "profiles": [{"id": k, "label": v["label"]} for k, v in PROFILES.items()],
        }
        if is_playlist:
            entries = info.get("entries", [])
            result["playlist_count"] = len(entries)
            result["playlist_entries"] = [
                {"title": e.get("title") or e.get("id"), "url": e.get("url") or e.get("webpage_url")}
                for e in entries[:50]
            ]
        return JSONResponse(result)
    except Exception as e:
        log_event("fetch_error", details={"error": str(e)})
        return JSONResponse({"error": str(e)}, status_code=500)


async def download_file(request):
    try:
        body = await request.json()
        url = body.get("url")
        if not url:
            return JSONResponse({"error": "No URL provided"}, status_code=400)

        params = _extract_params(body)
        log_event("download_start", details={"url": url, "type": params["dl_type"], "ext": params["ext"]})

        tmp_dir = tempfile.mkdtemp()
        ydl_opts = _build_ydl_opts(
            tmp_dir, params["dl_type"], params["quality"], params["ext"],
            params["trim_start"], params["trim_end"],
            params["embed_thumb"], params["embed_meta"],
            params["embed_subs"], params["sub_langs"],
        )
        ydl_opts["continuedl"] = True  # resume support

        last_error = None
        for attempt in range(3):
            try:
                with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                    ydl.extract_info(url, download=True)
                break
            except Exception as exc:
                last_error = exc
                if _is_rate_limit_error(str(exc)):
                    backoff = RATE_LIMIT_BACKOFF[min(attempt, len(RATE_LIMIT_BACKOFF) - 1)]
                    log_event("rate_limited", details={"url": url, "backoff": backoff})
                    time.sleep(backoff)
                else:
                    raise
        else:
            raise last_error

        files = [f for f in os.listdir(tmp_dir) if not f.endswith(".part")]
        if not files:
            return JSONResponse({"error": "Download failed — no file produced"}, status_code=500)

        target = next((f for f in files if f.endswith(f".{params['ext']}")), files[0])
        filepath = os.path.join(tmp_dir, target)
        log_event("download_done", details={"filename": target})
        return FileResponse(path=filepath, media_type=_media_type_for(target), filename=target)

    except Exception as e:
        log_event("download_error", details={"error": str(e)})
        return JSONResponse({"error": str(e)}, status_code=500)


async def enqueue_download(request):
    try:
        body = await request.json()
        url = body.get("url")
        if not url:
            return JSONResponse({"error": "No URL provided"}, status_code=400)

        params = _extract_params(body)
        job_id = create_job(url=url, params=params)
        log_event("job_enqueue", details={"job_id": job_id, "url": url})

        t = threading.Thread(target=_run_job, args=(job_id, url, params), daemon=True)
        t.start()
        return JSONResponse({"job_id": job_id})
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


async def retry_job(request):
    """POST /api/jobs/{job_id}/retry — manually retry a failed job."""
    job_id = request.path_params["job_id"]
    job = get_job(job_id)
    if not job:
        return JSONResponse({"error": "Job not found"}, status_code=404)
    if job["status"] not in ("error",):
        return JSONResponse({"error": "Only failed jobs can be retried"}, status_code=400)

    # Reset for a fresh retry
    update_job(job_id, status="pending", progress=0, message="Queued for retry", error=None)
    append_history(job_id, "retry_requested", "Manual retry triggered")
    log_event("job_retry", details={"job_id": job_id})

    t = threading.Thread(target=_run_job, args=(job_id, job["url"], job["params"]), daemon=True)
    t.start()
    return JSONResponse({"ok": True, "job_id": job_id})


async def job_status(request):
    job_id = request.path_params["job_id"]
    job = get_job(job_id)
    if not job:
        return JSONResponse({"error": "Job not found"}, status_code=404)
    return JSONResponse({k: v for k, v in job.items() if k != "filepath"})


async def job_list(request):
    jobs = [{k: v for k, v in j.items() if k != "filepath"} for j in all_jobs()]
    return JSONResponse({"jobs": jobs})


async def job_download(request):
    job_id = request.path_params["job_id"]
    job = get_job(job_id)
    if not job:
        return JSONResponse({"error": "Job not found"}, status_code=404)
    if job["status"] != "done":
        return JSONResponse({"error": "Job not ready"}, status_code=400)
    filepath = job.get("filepath")
    filename = job.get("filename", "download")
    if not filepath or not os.path.exists(filepath):
        return JSONResponse({"error": "File not found"}, status_code=404)
    log_event("job_download", details={"job_id": job_id, "filename": filename})
    return FileResponse(path=filepath, media_type=_media_type_for(filename), filename=filename)


async def job_progress_sse(request):
    job_id = request.path_params["job_id"]

    async def event_stream():
        import json
        while True:
            job = get_job(job_id)
            if not job:
                yield f"data: {json.dumps({'error': 'not found'})}\n\n"
                break
            yield f"data: {json.dumps({k: v for k, v in job.items() if k != 'filepath'})}\n\n"
            if job["status"] in ("done", "error"):
                break
            await asyncio.sleep(0.5)

    return StreamingResponse(event_stream(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


async def batch_download(request):
    try:
        import zipfile
        body = await request.json()
        urls = body.get("urls", [])
        playlist_url = body.get("playlist_url")
        dl_type  = body.get("type", "video")
        quality  = body.get("quality", "best")
        ext      = body.get("ext", "mp4")
        embed_meta = body.get("embed_metadata", True)
        embed_subs = body.get("embed_subs", False)
        sub_langs  = body.get("sub_langs", "en")

        if playlist_url:
            flat_opts = {**BASE_OPTS, "skip_download": True, "extract_flat": True}
            with yt_dlp.YoutubeDL(flat_opts) as ydl:
                info = ydl.extract_info(playlist_url, download=False)
            entries = info.get("entries", [])
            urls = [e.get("url") or e.get("webpage_url") for e in entries if e]
            urls = [u for u in urls if u]

        if not urls:
            return JSONResponse({"error": "No URLs provided"}, status_code=400)
        if len(urls) > 50:
            return JSONResponse({"error": "Max 50 URLs per batch"}, status_code=400)

        log_event("batch_start", details={"count": len(urls), "type": dl_type})
        tmp_dir = tempfile.mkdtemp()
        ydl_opts = _build_ydl_opts(tmp_dir, dl_type, quality, ext,
                                   None, None, False, embed_meta, embed_subs, sub_langs)
        ydl_opts["continuedl"] = True

        errors = []
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            for url in urls:
                for attempt in range(3):
                    try:
                        ydl.download([url])
                        break
                    except Exception as exc:
                        if _is_rate_limit_error(str(exc)) and attempt < 2:
                            time.sleep(RATE_LIMIT_BACKOFF[attempt])
                        else:
                            errors.append({"url": url, "error": str(exc)})
                            break

        files = [f for f in os.listdir(tmp_dir) if not f.endswith(".part")]
        if not files:
            return JSONResponse({"error": "All downloads failed", "details": errors}, status_code=500)

        zip_path = os.path.join(tmp_dir, "velora_batch.zip")
        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
            for f in files:
                if f != "velora_batch.zip":
                    zf.write(os.path.join(tmp_dir, f), f)

        log_event("batch_done", details={"files": len(files), "errors": len(errors)})
        return FileResponse(path=zip_path, media_type="application/zip", filename="velora_batch.zip")
    except Exception as e:
        log_event("batch_error", details={"error": str(e)})
        return JSONResponse({"error": str(e)}, status_code=500)


async def get_profiles(request):
    return JSONResponse({"profiles": [{"id": k, **v} for k, v in PROFILES.items()]})


async def get_subtitles(request):
    try:
        body = await request.json()
        url = body.get("url")
        if not url:
            return JSONResponse({"error": "No URL provided"}, status_code=400)
        ydl_opts = {**BASE_OPTS, "skip_download": True}
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
        subs = info.get("subtitles", {})
        auto_subs = info.get("automatic_captions", {})
        return JSONResponse({
            "manual": list(subs.keys()),
            "auto": list(auto_subs.keys()),
            "all": sorted(set(list(subs.keys()) + list(auto_subs.keys()))),
        })
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


# ---------------------------------------------------------------------------
# Phase 3 — AI routes
# ---------------------------------------------------------------------------

async def ai_transcribe(request):
    """
    POST /api/ai/transcribe
    Body: { url, language?, format? }
    Downloads audio, runs Whisper, returns { text, srt, vtt, language }
    """
    try:
        body = await request.json()
        url = body.get("url")
        if not url:
            return JSONResponse({"error": "No URL provided"}, status_code=400)

        language = body.get("language")
        fmt      = body.get("format", "srt")

        # Download audio to a temp file
        tmp_dir = tempfile.mkdtemp()
        ydl_opts = {
            **BASE_OPTS,
            "format": "140/139/bestaudio/best",
            "outtmpl": os.path.join(tmp_dir, "audio.%(ext)s"),
            "postprocessors": [{
                "key": "FFmpegExtractAudio",
                "preferredcodec": "mp3",
                "preferredquality": "128",
            }],
        }
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.extract_info(url, download=True)

        audio_files = [f for f in os.listdir(tmp_dir) if f.endswith(".mp3")]
        if not audio_files:
            return JSONResponse({"error": "Could not extract audio"}, status_code=500)

        audio_path = os.path.join(tmp_dir, audio_files[0])
        log_event("ai_transcribe", details={"url": url})

        # Run in thread so we don't block the event loop
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None, lambda: transcribe(audio_path, language=language, fmt=fmt)
        )
        return JSONResponse(result)

    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


async def ai_summarize(request):
    """
    POST /api/ai/summarize
    Body: { text?, url?, max_sentences? }
    If url provided, transcribes first then summarizes.
    """
    try:
        body = await request.json()
        text         = body.get("text", "")
        url          = body.get("url")
        max_sentences = int(body.get("max_sentences", 5))

        if not text and url:
            # Transcribe first
            tmp_dir = tempfile.mkdtemp()
            ydl_opts = {
                **BASE_OPTS,
                "format": "140/139/bestaudio/best",
                "outtmpl": os.path.join(tmp_dir, "audio.%(ext)s"),
                "postprocessors": [{"key": "FFmpegExtractAudio", "preferredcodec": "mp3", "preferredquality": "128"}],
            }
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                ydl.extract_info(url, download=True)
            audio_files = [f for f in os.listdir(tmp_dir) if f.endswith(".mp3")]
            if not audio_files:
                return JSONResponse({"error": "Could not extract audio"}, status_code=500)
            audio_path = os.path.join(tmp_dir, audio_files[0])
            loop = asyncio.get_event_loop()
            tr = await loop.run_in_executor(None, lambda: transcribe(audio_path))
            text = tr["text"]

        if not text:
            return JSONResponse({"error": "No text to summarize"}, status_code=400)

        loop = asyncio.get_event_loop()
        summary = await loop.run_in_executor(None, lambda: summarize(text, max_sentences))
        log_event("ai_summarize", details={"chars": len(text)})
        return JSONResponse({"summary": summary, "original_length": len(text), "summary_length": len(summary)})

    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


async def ai_search(request):
    """
    POST /api/ai/search
    Body: { query, sources?: ["youtube","soundcloud","reddit"], limit? }
    """
    try:
        body    = await request.json()
        query   = body.get("query", "").strip()
        sources = body.get("sources", ["youtube", "soundcloud", "reddit"])
        limit   = int(body.get("limit", 8))

        if not query:
            return JSONResponse({"error": "No query provided"}, status_code=400)

        log_event("ai_search", details={"query": query, "sources": sources})
        loop = asyncio.get_event_loop()
        results = await loop.run_in_executor(
            None, lambda: search_hub(query, sources, limit)
        )
        return JSONResponse({"query": query, "results": results})

    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


async def ai_recommend(request):
    """
    POST /api/ai/recommend
    Body: { url, limit? }
    Fetches video metadata then returns related suggestions.
    """
    try:
        body  = await request.json()
        url   = body.get("url")
        limit = int(body.get("limit", 6))

        if not url:
            return JSONResponse({"error": "No URL provided"}, status_code=400)

        ydl_opts = {**BASE_OPTS, "skip_download": True}
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)

        video_info = {
            "title":      info.get("title", ""),
            "uploader":   info.get("uploader") or info.get("channel", ""),
            "tags":       info.get("tags", []),
            "categories": info.get("categories", []),
            "url":        info.get("webpage_url") or url,
        }

        log_event("ai_recommend", details={"url": url})
        loop = asyncio.get_event_loop()
        recs = await loop.run_in_executor(None, lambda: recommend(video_info, limit))
        return JSONResponse({"recommendations": recs})

    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


async def ai_shazam(request):
    """
    POST /api/ai/shazam  (multipart/form-data, field: audio)
    Accepts a short recorded audio blob from the browser mic,
    sends it to ACRCloud for song identification (much wider catalog
    including Nepali, Bollywood, and other regional music), and returns:
      { match, title, artist, album, release_date, artwork, spotify_url,
        apple_url, yt_search_url, genres, score }
    ACRCloud signing uses only stdlib (hmac, hashlib, base64) — no extra deps.
    """
    import hmac
    import hashlib
    import base64
    import time as _time
    import urllib.parse

    try:
        form = await request.form()
        audio_file = form.get("audio")
        if not audio_file:
            return JSONResponse({"error": "No audio file provided"}, status_code=400)

        host       = os.environ.get("ACRCLOUD_HOST", "")
        access_key = os.environ.get("ACRCLOUD_ACCESS_KEY", "")
        secret     = os.environ.get("ACRCLOUD_ACCESS_SECRET", "")

        if not all([host, access_key, secret]):
            return JSONResponse(
                {"error": "ACRCloud credentials not configured. Add ACRCLOUD_HOST, "
                          "ACRCLOUD_ACCESS_KEY and ACRCLOUD_ACCESS_SECRET to .env"},
                status_code=503,
            )

        content = await audio_file.read()
        tmp_dir = tempfile.mkdtemp()
        audio_path = os.path.join(tmp_dir, "shazam_clip.webm")
        with open(audio_path, "wb") as f:
            f.write(content)

        log_event("ai_shazam", details={"size_bytes": len(content), "provider": "acrcloud"})

        # ── Build ACRCloud HMAC-SHA1 signature ──────────────────────────────
        http_method  = "POST"
        http_uri     = "/v1/identify"
        data_type    = "audio"
        signature_version = "1"
        timestamp    = str(int(_time.time()))

        string_to_sign = "\n".join([
            http_method, http_uri, access_key,
            data_type, signature_version, timestamp,
        ])
        signature = base64.b64encode(
            hmac.new(
                secret.encode("utf-8"),
                string_to_sign.encode("utf-8"),
                digestmod=hashlib.sha1,
            ).digest()
        ).decode("utf-8")

        # ── POST to ACRCloud (run in thread — requests is sync) ─────────────
        import requests as _requests

        def _identify():
            url = f"https://{host}/v1/identify"
            with open(audio_path, "rb") as af:
                files  = {"sample": af}
                fields = {
                    "access_key":        access_key,
                    "sample_bytes":      str(len(content)),
                    "timestamp":         timestamp,
                    "signature":         signature,
                    "data_type":         data_type,
                    "signature_version": signature_version,
                }
                return _requests.post(url, data=fields, files=files, timeout=30)

        loop = asyncio.get_event_loop()
        resp = await loop.run_in_executor(None, _identify)
        data = resp.json()

        # ── Parse response ───────────────────────────────────────────────────
        status = data.get("status", {})
        if status.get("code") != 0:
            msg = status.get("msg", "No match found")
            return JSONResponse({"match": False, "message": msg})

        metadata = data.get("metadata", {})
        music_list = metadata.get("music", [])
        if not music_list:
            return JSONResponse({"match": False, "message": "No match found"})

        # Best match is first
        m = music_list[0]

        title   = m.get("title", "")
        artists = m.get("artists", [])
        artist  = ", ".join(a.get("name", "") for a in artists) if artists else ""
        album   = (m.get("album") or {}).get("name", "")
        release = m.get("release_date", "")
        label   = m.get("label", "")
        score   = m.get("score", 0)
        genres  = [g.get("name", "") for g in (m.get("genres") or [])]

        # Artwork — ACRCloud returns artwork in external_metadata
        ext = m.get("external_metadata", {})
        artwork = None
        spotify_url = None
        apple_url   = None

        spotify_meta = ext.get("spotify", {})
        if isinstance(spotify_meta, dict):
            track_id = (spotify_meta.get("track") or {}).get("id")
            if track_id:
                spotify_url = f"https://open.spotify.com/track/{track_id}"
            # Artwork from album art
            album_images = (spotify_meta.get("album") or {}).get("images") or []
            if album_images:
                artwork = album_images[0].get("url")

        deezer_meta = ext.get("deezer", {})
        if isinstance(deezer_meta, dict) and not artwork:
            artwork = (deezer_meta.get("track") or {}).get("album", {}).get("cover_xl")

        apple_meta = ext.get("apple_music", {})
        if isinstance(apple_meta, dict):
            apple_url = apple_meta.get("previews", [{}])[0].get("url") if apple_meta.get("previews") else None

        # YouTube search URL
        yt_query = urllib.parse.quote(f"{artist} {title}")
        yt_search_url = f"https://www.youtube.com/results?search_query={yt_query}"

        return JSONResponse({
            "match":        True,
            "title":        title,
            "artist":       artist,
            "album":        album,
            "release_date": release,
            "label":        label,
            "score":        score,
            "genres":       genres,
            "artwork":      artwork,
            "spotify_url":  spotify_url,
            "apple_url":    apple_url,
            "yt_search_url": yt_search_url,
        })

    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


async def ai_voice_search(request):
    """
    POST /api/ai/voice-search  (multipart/form-data, field: audio)
    Accepts a recorded audio blob, transcribes it, returns the text query.
    """
    try:
        form = await request.form()
        audio_file = form.get("audio")
        if not audio_file:
            return JSONResponse({"error": "No audio file provided"}, status_code=400)

        tmp_dir = tempfile.mkdtemp()
        audio_path = os.path.join(tmp_dir, "voice.webm")
        content = await audio_file.read()
        with open(audio_path, "wb") as f:
            f.write(content)

        log_event("ai_voice_search")
        loop = asyncio.get_event_loop()
        text = await loop.run_in_executor(None, lambda: voice_to_text(audio_path))
        return JSONResponse({"query": text})

    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

middleware = [
    Middleware(
        CORSMiddleware,
        allow_origins=[
            "http://localhost:3000",
            "http://localhost:3001",
            os.environ.get("FRONTEND_URL", ""),
        ],
        allow_origin_regex=r"https://.*\.(vercel\.app|sagarrc\.com\.np|onrender\.com)",
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["*", "Authorization"],
        allow_credentials=True,
    )
]

app = Starlette(
    routes=[
        Route("/",                               root),
        Route("/favicon.ico",                    favicon),
        Route("/health",                         health,            methods=["GET"]),

        # Auth
        Route("/api/auth/register",              auth_register,          methods=["POST", "OPTIONS"]),
        Route("/api/auth/login",                 auth_login,             methods=["POST", "OPTIONS"]),
        Route("/api/auth/me",                    auth_me,                methods=["GET",  "OPTIONS"]),
        Route("/api/auth/google",                auth_google_redirect,   methods=["GET"]),
        Route("/api/auth/google/callback",       auth_google_callback,   methods=["GET"]),

        # Analytics (admin)
        Route("/api/analytics",                  get_analytics,     methods=["GET",  "OPTIONS"]),
        Route("/api/audit",                      get_audit_log,     methods=["GET",  "OPTIONS"]),

        # Core download
        Route("/api/formats",                    get_formats,       methods=["POST", "OPTIONS"]),
        Route("/api/download/file",              download_file,     methods=["POST", "OPTIONS"]),
        Route("/api/batch",                      batch_download,    methods=["POST", "OPTIONS"]),
        Route("/api/subtitles",                  get_subtitles,     methods=["POST", "OPTIONS"]),
        Route("/api/profiles",                   get_profiles,      methods=["GET",  "OPTIONS"]),

        # Job queue
        Route("/api/jobs",                       job_list,          methods=["GET",  "OPTIONS"]),
        Route("/api/jobs/enqueue",               enqueue_download,  methods=["POST", "OPTIONS"]),
        Route("/api/jobs/{job_id}",              job_status,        methods=["GET",  "OPTIONS"]),
        Route("/api/jobs/{job_id}/retry",        retry_job,         methods=["POST", "OPTIONS"]),
        Route("/api/jobs/{job_id}/download",     job_download,      methods=["GET",  "OPTIONS"]),
        Route("/api/jobs/{job_id}/progress",     job_progress_sse,  methods=["GET",  "OPTIONS"]),

        # Phase 3 — AI
        Route("/api/ai/transcribe",              ai_transcribe,     methods=["POST", "OPTIONS"]),
        Route("/api/ai/summarize",               ai_summarize,      methods=["POST", "OPTIONS"]),
        Route("/api/ai/search",                  ai_search,         methods=["POST", "OPTIONS"]),
        Route("/api/ai/recommend",               ai_recommend,      methods=["POST", "OPTIONS"]),
        Route("/api/ai/voice-search",            ai_voice_search,   methods=["POST", "OPTIONS"]),
        Route("/api/ai/shazam",                  ai_shazam,         methods=["POST", "OPTIONS"]),
    ],
    middleware=middleware,
)
