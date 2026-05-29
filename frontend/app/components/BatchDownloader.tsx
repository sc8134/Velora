"use client";
import { useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const VIDEO_QUALITIES = [
  { label: "Best",  quality: "best" },
  { label: "1080p", quality: "1080" },
  { label: "720p",  quality: "720"  },
  { label: "480p",  quality: "480"  },
  { label: "360p",  quality: "360"  },
];

const AUDIO_QUALITIES = [
  { label: "Best MP3",    quality: "best", ext: "mp3" },
  { label: "192kbps MP3", quality: "192",  ext: "mp3" },
  { label: "128kbps MP3", quality: "128",  ext: "mp3" },
  { label: "Best M4A",    quality: "best", ext: "m4a" },
  { label: "FLAC",        quality: "best", ext: "flac" },
];

interface BatchItem {
  url: string;
  status: "pending" | "done" | "error";
  error?: string;
}

type InputMode = "urls" | "playlist";

export default function BatchDownloader() {
  const [inputMode, setInputMode] = useState<InputMode>("urls");
  const [input, setInput] = useState("");
  const [playlistUrl, setPlaylistUrl] = useState("");
  const [items, setItems] = useState<BatchItem[]>([]);
  const [dlType, setDlType] = useState<"video" | "audio">("video");
  const [quality, setQuality] = useState("best");
  const [ext, setExt] = useState("mp4");
  const [embedMeta, setEmbedMeta] = useState(true);
  const [embedSubs, setEmbedSubs] = useState(false);
  const [subLang, setSubLang] = useState("en");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parseUrls = () =>
    input.split("\n").map(u => u.trim()).filter(u => u.length > 0);

  const handleBatch = async () => {
    setError(null);

    const body: Record<string, unknown> = {
      type: dlType,
      quality,
      ext,
      embed_metadata: embedMeta,
      embed_subs: embedSubs,
      sub_langs: subLang,
    };

    if (inputMode === "playlist") {
      if (!playlistUrl.trim()) { setError("Enter a playlist URL"); return; }
      body.playlist_url = playlistUrl.trim();
    } else {
      const urls = parseUrls();
      if (urls.length === 0) { setError("Enter at least one URL"); return; }
      if (urls.length > 50) { setError("Max 50 URLs per batch"); return; }
      body.urls = urls;
      setItems(urls.map(url => ({ url, status: "pending" })));
    }

    setLoading(true);
    try {
      const res = await fetch(`${API}/api/batch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json();
        setError(err.error || "Batch download failed");
        return;
      }

      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = "velora_batch.zip";
      a.click();
      URL.revokeObjectURL(blobUrl);

      setItems(prev => prev.map(i => ({ ...i, status: "done" })));
    } catch {
      setError("Could not connect to backend.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-[#0f0d1a]/80 backdrop-blur-sm p-6">
      <h2 className="text-white font-bold text-lg mb-1">Batch Downloader</h2>
      <p className="text-white/40 text-xs mb-4">
        Download from YouTube, TikTok, Instagram, Vimeo, SoundCloud and 1000+ sites — as a ZIP
      </p>

      {/* Input mode toggle */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setInputMode("urls")}
          className={`flex-1 py-2 rounded-xl text-xs font-semibold transition border ${
            inputMode === "urls"
              ? "bg-violet-600 border-violet-500 text-white"
              : "bg-white/5 border-white/10 text-white/40 hover:bg-white/10"
          }`}
        >
          URL List
        </button>
        <button
          onClick={() => setInputMode("playlist")}
          className={`flex-1 py-2 rounded-xl text-xs font-semibold transition border ${
            inputMode === "playlist"
              ? "bg-violet-600 border-violet-500 text-white"
              : "bg-white/5 border-white/10 text-white/40 hover:bg-white/10"
          }`}
        >
          📋 Playlist / Channel
        </button>
      </div>

      {/* URL input */}
      {inputMode === "urls" ? (
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder={"https://youtube.com/watch?v=...\nhttps://tiktok.com/@user/video/...\nhttps://vimeo.com/..."}
          rows={5}
          className="w-full bg-white/5 border border-white/10 text-white placeholder-white/20 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-violet-500 resize-none mb-4"
        />
      ) : (
        <input
          type="text"
          value={playlistUrl}
          onChange={e => setPlaylistUrl(e.target.value)}
          placeholder="https://youtube.com/playlist?list=... or any playlist/channel URL"
          className="w-full bg-white/5 border border-white/10 text-white placeholder-white/20 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-violet-500 mb-4"
        />
      )}

      {/* Type toggle */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => { setDlType("video"); setExt("mp4"); }}
          className={`flex-1 py-2 rounded-xl text-sm font-semibold transition ${
            dlType === "video" ? "bg-violet-600 text-white" : "bg-white/5 text-white/40 hover:bg-white/10"
          }`}
        >
          🎬 Video
        </button>
        <button
          onClick={() => { setDlType("audio"); setExt("mp3"); }}
          className={`flex-1 py-2 rounded-xl text-sm font-semibold transition ${
            dlType === "audio" ? "bg-emerald-600 text-white" : "bg-white/5 text-white/40 hover:bg-white/10"
          }`}
        >
          🎵 Audio
        </button>
      </div>

      {/* Quality selector */}
      <div className="mb-4">
        <p className="text-white/40 text-xs mb-2 uppercase tracking-widest">Quality</p>
        <div className="grid grid-cols-3 gap-2">
          {(dlType === "video" ? VIDEO_QUALITIES : AUDIO_QUALITIES).map(q => (
            <button
              key={q.quality + (dlType === "audio" ? (q as { ext?: string }).ext ?? "" : "")}
              onClick={() => {
                setQuality(q.quality);
                if (dlType === "audio") setExt((q as { ext?: string }).ext ?? "mp3");
              }}
              className={`py-2 rounded-xl text-xs font-semibold transition ${
                quality === q.quality
                  ? dlType === "video" ? "bg-violet-600 text-white" : "bg-emerald-600 text-white"
                  : "bg-white/5 text-white/40 hover:bg-white/10"
              }`}
            >
              {q.label}
            </button>
          ))}
        </div>
      </div>

      {/* Extra options */}
      <div className="flex flex-wrap gap-4 mb-4">
        <label className="flex items-center gap-1.5 text-xs text-white/50 cursor-pointer select-none">
          <input type="checkbox" checked={embedMeta} onChange={e => setEmbedMeta(e.target.checked)}
            className="accent-violet-500" />
          Embed Metadata
        </label>
        <label className="flex items-center gap-1.5 text-xs text-white/50 cursor-pointer select-none">
          <input type="checkbox" checked={embedSubs} onChange={e => setEmbedSubs(e.target.checked)}
            className="accent-violet-500" />
          Subtitles
        </label>
        {embedSubs && (
          <input
            type="text"
            value={subLang}
            onChange={e => setSubLang(e.target.value)}
            placeholder="en"
            className="w-14 bg-white/5 border border-white/10 text-white text-xs rounded-lg px-2 py-1 focus:outline-none focus:border-violet-500"
          />
        )}
      </div>

      {/* URL list preview */}
      {items.length > 0 && (
        <div className="mb-4 space-y-1 max-h-32 overflow-y-auto">
          {items.map((item, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              <span className={
                item.status === "done"  ? "text-emerald-400" :
                item.status === "error" ? "text-red-400" : "text-white/30"
              }>
                {item.status === "done" ? "✓" : item.status === "error" ? "✗" : "○"}
              </span>
              <span className="text-white/50 truncate">{item.url}</span>
            </div>
          ))}
        </div>
      )}

      {error && <p className="text-red-400 text-xs mb-3">{error}</p>}

      <button
        onClick={handleBatch}
        disabled={loading || (inputMode === "urls" ? !input.trim() : !playlistUrl.trim())}
        className="w-full py-3 rounded-xl font-bold text-sm transition bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white disabled:opacity-40"
      >
        {loading ? "⏳ Downloading… (this may take a while)" : "Download All as ZIP"}
      </button>
    </div>
  );
}

