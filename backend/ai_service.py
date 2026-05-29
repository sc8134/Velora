"""
Phase 3 AI services:
  - transcribe(audio_path)        → SRT text via Whisper
  - summarize(text)               → extractive summary (no external API needed)
  - search_hub(query, sources)    → multi-platform search results
  - recommend(video_info)         → related download suggestions
  - voice_to_text(audio_path)     → transcribed search query via Whisper
"""
import os
import re
import tempfile
import subprocess
from typing import List, Dict, Any

# ---------------------------------------------------------------------------
# Whisper — lazy-loaded so startup isn't slow if unused
# ---------------------------------------------------------------------------
_whisper_model = None

def _get_whisper(model_size: str = "base"):
    global _whisper_model
    if _whisper_model is None:
        import whisper
        _whisper_model = whisper.load_model(model_size)
    return _whisper_model


def transcribe(audio_path: str, language: str = None, fmt: str = "srt") -> Dict[str, Any]:
    """
    Transcribe an audio/video file using Whisper.
    Returns { text, segments, srt, vtt }
    fmt: "srt" | "vtt" | "txt"
    """
    model = _get_whisper()
    opts = {"task": "transcribe"}
    if language:
        opts["language"] = language

    result = model.transcribe(audio_path, **opts)
    segments = result.get("segments", [])

    srt  = _segments_to_srt(segments)
    vtt  = _segments_to_vtt(segments)
    text = result.get("text", "").strip()

    return {
        "text":     text,
        "segments": segments,
        "srt":      srt,
        "vtt":      vtt,
        "language": result.get("language"),
    }


def voice_to_text(audio_path: str) -> str:
    """Transcribe a short voice clip and return the plain text (for search)."""
    model = _get_whisper("tiny")  # tiny is fastest for short clips
    result = model.transcribe(audio_path, task="transcribe")
    return result.get("text", "").strip()


# ---------------------------------------------------------------------------
# SRT / VTT formatters
# ---------------------------------------------------------------------------

def _fmt_time_srt(seconds: float) -> str:
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    ms = int((seconds - int(seconds)) * 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def _fmt_time_vtt(seconds: float) -> str:
    return _fmt_time_srt(seconds).replace(",", ".")


def _segments_to_srt(segments: list) -> str:
    lines = []
    for i, seg in enumerate(segments, 1):
        start = _fmt_time_srt(seg["start"])
        end   = _fmt_time_srt(seg["end"])
        text  = seg["text"].strip()
        lines.append(f"{i}\n{start} --> {end}\n{text}\n")
    return "\n".join(lines)


def _segments_to_vtt(segments: list) -> str:
    lines = ["WEBVTT\n"]
    for seg in segments:
        start = _fmt_time_vtt(seg["start"])
        end   = _fmt_time_vtt(seg["end"])
        text  = seg["text"].strip()
        lines.append(f"{start} --> {end}\n{text}\n")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Extractive summarizer (no external API — works offline)
# ---------------------------------------------------------------------------

def summarize(text: str, max_sentences: int = 5) -> str:
    """
    Simple extractive summarizer using TF-IDF-style sentence scoring.
    Picks the top N most informative sentences.
    """
    if not text or not text.strip():
        return ""

    # Split into sentences
    sentences = re.split(r'(?<=[.!?])\s+', text.strip())
    if len(sentences) <= max_sentences:
        return text.strip()

    # Word frequency
    words = re.findall(r'\b[a-z]{3,}\b', text.lower())
    stopwords = {
        "the","and","for","that","this","with","are","was","were","have",
        "has","had","but","not","from","they","their","there","been","will",
        "would","could","should","also","more","than","then","when","what",
        "which","who","how","its","our","your","his","her","him","she","you",
        "can","may","just","into","over","after","before","about","some",
        "all","any","each","both","few","most","other","such","only","own",
    }
    freq: Dict[str, int] = {}
    for w in words:
        if w not in stopwords:
            freq[w] = freq.get(w, 0) + 1

    # Score sentences
    def score(sent: str) -> float:
        ws = re.findall(r'\b[a-z]{3,}\b', sent.lower())
        return sum(freq.get(w, 0) for w in ws) / max(len(ws), 1)

    scored = sorted(enumerate(sentences), key=lambda x: score(x[1]), reverse=True)
    top_indices = sorted([i for i, _ in scored[:max_sentences]])
    return " ".join(sentences[i] for i in top_indices)


# ---------------------------------------------------------------------------
# Smart search hub — all yt-dlp search extractors + direct URL probe
# ---------------------------------------------------------------------------

# Every yt-dlp search prefix that works without authentication
SEARCH_EXTRACTORS = {
    "youtube":    "ytsearch",
    "soundcloud": "scsearch",
    "bilibili":   "bilisearch",
    "odysee":     "odysseysearch",
    "peertube":   "peertubeytsearch",
    "dailymotion":"dmsearch",
    "vimeo":      "vimeosearch",
    "nicovideo":  "nicosearch",
    "twitch":     "twitchstreamsearch",
    "rumble":     "rumblesearch",
    "bitchute":   "bitchutesearch",
}

# Default sources shown in the UI
DEFAULT_SOURCES = ["youtube", "soundcloud", "bilibili", "odysee", "dailymotion", "vimeo", "reddit"]


def search_hub(query: str, sources: List[str] = None, limit: int = 8) -> Dict[str, List[Dict]]:
    """
    Search multiple platforms simultaneously using yt-dlp search extractors.
    sources: list of platform names (see SEARCH_EXTRACTORS keys) + "reddit"
    Pass sources=["all"] to search every supported platform.
    Also accepts a direct URL as query — probes it for downloadable media.
    Returns { platform: [...], ... }
    """
    if sources is None:
        sources = DEFAULT_SOURCES

    # Expand "all" shorthand
    if "all" in sources:
        sources = list(SEARCH_EXTRACTORS.keys()) + ["reddit"]

    # If query looks like a URL, probe it directly instead of searching
    if query.startswith("http://") or query.startswith("https://"):
        return {"direct": _probe_url(query)}

    results: Dict[str, List[Dict]] = {}

    for source in sources:
        if source == "reddit":
            results["reddit"] = _search_reddit(query, limit)
        elif source in SEARCH_EXTRACTORS:
            prefix = SEARCH_EXTRACTORS[source]
            results[source] = _search_yt_dlp(f"{prefix}{limit}:{query}", source)

    return results


def _probe_url(url: str) -> List[Dict]:
    """
    Probe an arbitrary URL with yt-dlp to check if it contains downloadable media.
    Works for any of the 1000+ sites yt-dlp supports.
    """
    import yt_dlp
    opts = {
        "quiet": True,
        "skip_download": True,
        "extract_flat": "in_playlist",
        "extractor_args": {"youtube": {"player_client": ["android_vr"]}},
    }
    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(url, download=False)

        if not info:
            return []

        # Playlist / channel
        if "entries" in info:
            return [
                {
                    "platform":   info.get("extractor", "web"),
                    "title":      e.get("title") or e.get("id", ""),
                    "url":        e.get("url") or e.get("webpage_url", url),
                    "uploader":   e.get("uploader") or info.get("uploader", ""),
                    "duration":   e.get("duration"),
                    "thumbnail":  e.get("thumbnail", ""),
                    "view_count": e.get("view_count"),
                }
                for e in (info.get("entries") or []) if e
            ]

        # Single video/audio
        return [{
            "platform":   info.get("extractor", "web"),
            "title":      info.get("title", url),
            "url":        info.get("webpage_url", url),
            "uploader":   info.get("uploader") or info.get("channel", ""),
            "duration":   info.get("duration"),
            "thumbnail":  info.get("thumbnail", ""),
            "view_count": info.get("view_count"),
        }]
    except Exception:
        return []


def _search_yt_dlp(search_query: str, platform: str) -> List[Dict]:
    """Use yt-dlp's search extractors to find results."""
    import yt_dlp
    opts = {
        "quiet": True,
        "skip_download": True,
        "extract_flat": True,
        "extractor_args": {"youtube": {"player_client": ["android_vr"]}},
    }
    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(search_query, download=False)
        entries = info.get("entries", []) if info else []
        return [
            {
                "platform":  platform,
                "title":     e.get("title", ""),
                "url":       e.get("url") or e.get("webpage_url", ""),
                "uploader":  e.get("uploader") or e.get("channel", ""),
                "duration":  e.get("duration"),
                "thumbnail": e.get("thumbnail", ""),
                "view_count": e.get("view_count"),
            }
            for e in entries if e
        ]
    except Exception:
        return []


def _search_reddit(query: str, limit: int) -> List[Dict]:
    """Search Reddit for video/audio links using PRAW (read-only, no auth needed)."""
    try:
        import praw
        reddit = praw.Reddit(
            client_id=os.environ.get("REDDIT_CLIENT_ID", "velora_search"),
            client_secret=os.environ.get("REDDIT_CLIENT_SECRET", ""),
            user_agent="Velora/1.0 search hub",
        )
        results = []
        for sub in reddit.subreddits.search(query, limit=limit):
            pass  # just warm up

        for post in reddit.subreddit("all").search(query, limit=limit, sort="relevance"):
            url = post.url
            # Only include posts that link to media
            if any(d in url for d in ["youtube.com", "youtu.be", "soundcloud.com",
                                       "vimeo.com", "twitch.tv", "tiktok.com"]):
                results.append({
                    "platform":  "reddit",
                    "title":     post.title,
                    "url":       url,
                    "uploader":  f"r/{post.subreddit.display_name}",
                    "score":     post.score,
                    "thumbnail": post.thumbnail if post.thumbnail.startswith("http") else "",
                    "duration":  None,
                })
        return results
    except Exception:
        return []


# ---------------------------------------------------------------------------
# Recommendation engine
# ---------------------------------------------------------------------------

def recommend(video_info: Dict[str, Any], limit: int = 6) -> List[Dict]:
    """
    Generate related download suggestions based on the video's metadata.
    Uses yt-dlp search with tags, uploader, and title keywords.
    """
    title    = video_info.get("title", "")
    uploader = video_info.get("uploader", "")
    tags     = video_info.get("tags", []) or []
    category = video_info.get("categories", []) or []

    # Build search queries from most specific to least
    queries = []
    if tags:
        queries.append(" ".join(tags[:3]))
    if uploader:
        queries.append(uploader)
    # Extract meaningful keywords from title (skip short/common words)
    title_words = [w for w in re.findall(r'\b[A-Za-z]{4,}\b', title) if w.lower() not in {
        "with","from","this","that","have","will","your","what","when","where","official","video","music"
    }]
    if title_words:
        queries.append(" ".join(title_words[:4]))

    seen_urls = {video_info.get("url", "")}
    results = []

    for q in queries:
        if len(results) >= limit:
            break
        hits = _search_yt_dlp(f"ytsearch{limit}:{q}", "youtube")
        for h in hits:
            if h["url"] not in seen_urls and len(results) < limit:
                seen_urls.add(h["url"])
                results.append(h)

    return results[:limit]
