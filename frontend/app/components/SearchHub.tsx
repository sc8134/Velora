"use client";
import { useState, useRef } from "react";
import ShazamTool from "./ShazamTool";
import PlatformIcon from "./PlatformIcon";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface SearchResult {
  platform: string;
  title: string;
  url: string;
  uploader: string;
  duration: number | null;
  thumbnail: string;
  view_count?: number;
  score?: number;
}

type Results = Record<string, SearchResult[]>;

// All supported platforms + their display info
const PLATFORMS: Record<string, { label: string; color: string; icon: string }> = {
  youtube:    { label: "YouTube",     color: "text-red-400",    icon: "▶" },
  soundcloud: { label: "SoundCloud",  color: "text-orange-400", icon: "☁" },
  bilibili:   { label: "Bilibili",    color: "text-blue-400",   icon: "📺" },
  odysee:     { label: "Odysee",      color: "text-purple-400", icon: "🌊" },
  dailymotion:{ label: "Dailymotion", color: "text-sky-400",    icon: "🎬" },
  vimeo:      { label: "Vimeo",       color: "text-cyan-400",   icon: "🎥" },
  nicovideo:  { label: "NicoVideo",   color: "text-pink-400",   icon: "🎌" },
  twitch:     { label: "Twitch",      color: "text-violet-400", icon: "🟣" },
  rumble:     { label: "Rumble",      color: "text-green-400",  icon: "🟢" },
  reddit:     { label: "Reddit",      color: "text-orange-300", icon: "🔴" },
  direct:     { label: "Direct URL",  color: "text-emerald-400",icon: "🔗" },
};

const DEFAULT_ON = ["youtube", "soundcloud", "bilibili", "odysee", "dailymotion", "vimeo", "reddit"];

function formatDuration(s: number | null) {
  if (!s) return "";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`;
  return `${m}:${String(sec).padStart(2,"0")}`;
}

function isUrl(s: string) {
  return s.startsWith("http://") || s.startsWith("https://");
}

interface Props {
  onSelectUrl?: (url: string) => void;
}

export default function SearchHub({ onSelectUrl }: Props) {
  const [query, setQuery] = useState("");
  const [enabled, setEnabled] = useState<Record<string, boolean>>(
    Object.fromEntries(Object.keys(PLATFORMS).filter(k => k !== "direct").map(k => [k, DEFAULT_ON.includes(k)]))
  );
  const [results, setResults] = useState<Results | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [showShazam, setShowShazam] = useState(false);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const activeSources = isUrl(query) ? ["direct"] : Object.entries(enabled).filter(([,v]) => v).map(([k]) => k);

  const handleSearch = async (q = query) => {
    if (!q.trim()) return;
    setError(null);
    setLoading(true);
    setResults(null);
    try {
      const res = await fetch(`${API}/api/ai/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: q,
          sources: isUrl(q) ? ["direct"] : activeSources,
          limit: 8,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      setResults(data.results);
    } catch {
      setError("Could not connect to backend.");
    } finally {
      setLoading(false);
    }
  };

  const startVoice = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = e => chunksRef.current.push(e.data);
      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const form = new FormData();
        form.append("audio", blob, "voice.webm");
        try {
          const res = await fetch(`${API}/api/ai/voice-search`, { method: "POST", body: form });
          const data = await res.json();
          if (data.query) { setQuery(data.query); handleSearch(data.query); }
        } catch { setError("Voice search failed."); }
      };
      mr.start();
      mediaRef.current = mr;
      setRecording(true);
    } catch { setError("Microphone access denied."); }
  };

  const stopVoice = () => { mediaRef.current?.stop(); setRecording(false); };

  // When Shazam identifies a song, search for it across all platforms
  const handleShazamMatch = (url: string) => {
    // url here is a yt-dlp search string like "ytsearch1:Artist Title"
    // Extract the human-readable part after the prefix for the search box
    const searchQuery = url.replace(/^ytsearch\d*:/, "").trim();
    setShowShazam(false);
    setQuery(searchQuery);
    handleSearch(searchQuery);
  };

  const allResults = Object.entries(results ?? {}).flatMap(([platform, items]) =>
    (items as SearchResult[]).map(r => ({ ...r, platform: r.platform || platform }))
  );

  const toggleAll = (on: boolean) =>
    setEnabled(Object.fromEntries(Object.keys(enabled).map(k => [k, on])));

  return (
    <div className="rounded-2xl border border-white/10 bg-[#0f0d1a]/80 backdrop-blur-sm p-6">
      <h2 className="text-white font-bold text-lg mb-1">Universal Search Hub</h2>
      <p className="text-white/40 text-xs mb-4">
        Search 10+ platforms at once — or paste any URL to probe it directly
      </p>

      {/* Search bar */}
      <div className="flex gap-2 mb-3">
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleSearch()}
          placeholder="Search query or paste any URL…"
          className="flex-1 bg-white/5 border border-white/10 text-white placeholder-white/30 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-violet-500"
        />
        <button onClick={() => handleSearch()} disabled={loading || !query.trim()}
          className="bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white font-semibold px-5 py-3 rounded-xl text-sm transition">
          {loading ? "…" : isUrl(query) ? "Probe" : "Search"}
        </button>
        {/* Voice search */}
        <button onClick={recording ? stopVoice : startVoice}
          title={recording ? "Stop recording" : "Voice search"}
          className={`px-4 py-3 rounded-xl text-sm font-semibold transition border ${
            recording ? "bg-red-600 border-red-500 text-white animate-pulse"
                      : "bg-white/5 border-white/10 text-white/50 hover:bg-white/10"
          }`}>
          🎤
        </button>
        {/* Shazam / song identify */}
        <button
          onClick={() => setShowShazam(v => !v)}
          title="Identify a song"
          className={`px-4 py-3 rounded-xl text-sm font-semibold transition border ${
            showShazam
              ? "bg-violet-600 border-violet-500 text-white"
              : "bg-white/5 border-white/10 text-white/50 hover:bg-white/10"
          }`}>
          🎵
        </button>
      </div>

      {/* Shazam panel — slides in below the search bar */}
      {showShazam && (
        <div className="mb-4 rounded-xl border border-violet-500/20 bg-violet-500/5 p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-violet-300 text-xs font-semibold uppercase tracking-widest">
              🎵 Song Identifier — results will auto-search all platforms
            </p>
            <button onClick={() => setShowShazam(false)} className="text-white/30 hover:text-white text-xs">✕</button>
          </div>
          <ShazamTool onSelectUrl={handleShazamMatch} />
        </div>
      )}

      {/* URL probe hint */}
      {isUrl(query) && (
        <p className="text-emerald-400 text-xs mb-3">
          🔗 Direct URL detected — will probe for downloadable media on any supported site
        </p>
      )}

      {/* Platform toggles (hidden when probing a URL) */}
      {!isUrl(query) && (
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-white/30 text-xs uppercase tracking-widest">Platforms</p>
            <div className="flex gap-3">
              <button onClick={() => toggleAll(true)} className="text-xs text-violet-400 hover:text-violet-300">All</button>
              <button onClick={() => toggleAll(false)} className="text-xs text-white/30 hover:text-white">None</button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {Object.entries(PLATFORMS).filter(([k]) => k !== "direct").map(([key, p]) => (
              <button key={key}
                onClick={() => setEnabled(prev => ({ ...prev, [key]: !prev[key] }))}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition border ${
                  enabled[key]
                    ? `bg-white/10 border-white/20 ${p.color}`
                    : "bg-white/5 border-white/5 text-white/20"
                }`}>
                <PlatformIcon platform={key} size={14} />
                {p.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {error && <p className="text-red-400 text-xs mb-3">{error}</p>}

      {/* Results grouped by platform */}
      {results && allResults.length === 0 && (
        <p className="text-white/20 text-sm text-center py-6">No results found.</p>
      )}

      {results && allResults.length > 0 && (
        <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
          {allResults.map((r, i) => {
            const p = PLATFORMS[r.platform] ?? { label: r.platform, color: "text-white/50", icon: "🌐" };
            return (
              <div key={i}
                className="flex gap-3 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition p-3 cursor-pointer group"
                onClick={() => onSelectUrl?.(r.url)}
              >
                {r.thumbnail ? (
                  <img src={r.thumbnail} alt="" className="w-20 h-12 object-cover rounded-lg shrink-0 bg-white/5" />
                ) : (
                  <div className="w-20 h-12 rounded-lg bg-white/5 shrink-0 flex items-center justify-center">
                    <PlatformIcon platform={r.platform} size={28} />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium line-clamp-1 group-hover:text-violet-300 transition">
                    {r.title}
                  </p>
                  <p className="text-white/40 text-xs mt-0.5 truncate">{r.uploader}</p>
                  <div className="flex gap-3 mt-1 flex-wrap items-center">
                    <span className={`flex items-center gap-1 text-xs font-semibold ${p.color}`}>
                      <PlatformIcon platform={r.platform} size={12} />
                      {p.label}
                    </span>
                    {r.duration && <span className="text-white/20 text-xs">{formatDuration(r.duration)}</span>}
                    {r.view_count && <span className="text-white/20 text-xs">{(r.view_count/1000).toFixed(0)}K views</span>}
                  </div>
                </div>
                <div className="shrink-0 self-center opacity-0 group-hover:opacity-100 transition">
                  <span className="text-violet-400 text-xs font-semibold">↓ Use</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

