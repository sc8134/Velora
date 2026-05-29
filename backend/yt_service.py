import yt_dlp

def extract_video(url: str, format: str = "best"):
    ydl_opts = {"format": format}
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=False)
    return {
        "title": info.get("title"),
        "duration": info.get("duration"),
        "thumbnail": info.get("thumbnail"),
        "formats": info.get("formats")
    }

