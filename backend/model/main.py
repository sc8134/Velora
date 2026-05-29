from fastapi import FastAPI, Query
import yt_dlp

app = FastAPI()

@app.get("/api/list-formats")
def list_formats(url: str = Query(...)):
    """Return all available formats for a given video URL."""
    try:
        with yt_dlp.YoutubeDL({}) as ydl:
            info = ydl.extract_info(url, download=False)
        return [
            {
                "id": f["format_id"],
                "label": f.get("format_note") or f.get("resolution") or f.get("abr") or f["ext"],
                "ext": f["ext"],
                "fps": f.get("fps"),
                "filesize": f.get("filesize"),
                "resolution": f.get("resolution"),
                "abr": f.get("abr"),
            }
            for f in info["formats"]
        ]
    except Exception as e:
        return {"error": str(e)}
