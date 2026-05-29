"use client";
import { useState, useEffect } from "react";
import { VideoInfo } from "../types";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export type { VideoInfo };

interface Props {
  onResult: (data: VideoInfo) => void;
  prefillUrl?: string;
}

export default function DownloadForm({ onResult, prefillUrl }: Props) {
  const [url, setUrl] = useState(prefillUrl ?? "");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // When a search result is selected, prefill and auto-fetch
  useEffect(() => {
    if (prefillUrl && prefillUrl !== url) {
      setUrl(prefillUrl);
      handleFetch(prefillUrl);
    }
  }, [prefillUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleFetch = async (fetchUrl = url) => {
    if (!fetchUrl) return;
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/formats`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: fetchUrl }),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        onResult(data);
      }
    } catch {
      setError("Could not connect to backend. Is it running?");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex gap-2" suppressHydrationWarning>
      <input
        type="text"
        placeholder="Paste any URL — YouTube, TikTok, Instagram, Vimeo, SoundCloud, Twitter/X and 1000+ more…"
        value={url}
        onChange={e => setUrl(e.target.value)}
        onKeyDown={e => e.key === "Enter" && handleFetch()}
        className="flex-1 bg-white/5 border border-white/10 text-white placeholder-white/20 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30 transition"
      />
      <button
        onClick={() => handleFetch()}
        disabled={loading || !url}
        className="bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white font-semibold px-6 py-3 rounded-xl text-sm transition shrink-0"
      >
        {loading ? "Fetching…" : "Fetch"}
      </button>
      {error && (
        <p className="absolute -bottom-6 left-0 text-red-400 text-xs">{error}</p>
      )}
    </div>
  );
}

