"use client";
import { useState, useRef, useCallback } from "react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface ShazamResult {
  match: boolean;
  title?: string;
  artist?: string;
  album?: string;
  release_date?: string;
  label?: string;
  score?: number;
  genres?: string[];
  spotify_url?: string;
  apple_url?: string;
  artwork?: string;
  yt_search_url?: string;
  message?: string;
}

type RecordState = "idle" | "recording" | "processing" | "done" | "error";

interface Props {
  onSelectUrl?: (url: string) => void;
}

const MAX_RECORD_MS = 10_000; // 10 seconds max

export default function ShazamTool({ onSelectUrl }: Props) {
  const [state, setState] = useState<RecordState>("idle");
  const [result, setResult] = useState<ShazamResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoStopRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (autoStopRef.current) clearTimeout(autoStopRef.current);
  };

  const identify = useCallback(async (blob: Blob) => {
    setState("processing");
    setError(null);
    try {
      const form = new FormData();
      form.append("audio", blob, "clip.webm");
      const res = await fetch(`${API}/api/ai/shazam`, {
        method: "POST",
        body: form,
      });
      const data: ShazamResult = await res.json();
      if (!res.ok) {
        setError((data as { error?: string }).error ?? "Request failed");
        setState("error");
        return;
      }
      setResult(data);
      setState("done");
    } catch {
      setError("Could not connect to backend.");
      setState("error");
    }
  }, []);

  const startRecording = async () => {
    setError(null);
    setResult(null);
    setElapsed(0);
    chunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream, { mimeType: "audio/webm" });
      mediaRecorderRef.current = mr;

      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        identify(blob);
      };

      mr.start(200); // collect chunks every 200ms
      setState("recording");

      // Elapsed counter
      timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);

      // Auto-stop after MAX_RECORD_MS
      autoStopRef.current = setTimeout(() => stopRecording(), MAX_RECORD_MS);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Microphone access denied: ${msg}`);
      setState("error");
    }
  };

  const stopRecording = () => {
    clearTimers();
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
  };

  const reset = () => {
    clearTimers();
    setState("idle");
    setResult(null);
    setError(null);
    setElapsed(0);
  };

  // ── Mic button visuals ──────────────────────────────────────────────────
  const isRecording = state === "recording";
  const isProcessing = state === "processing";

  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-2xl">🎵</span>
        <h2 className="text-white font-bold text-sm">Song Identifier</h2>
      </div>
      <p className="text-white/40 text-xs mb-5">
        Hold the mic near the music for up to 10 seconds — we&apos;ll identify the song.
      </p>

      {/* ── Big mic button ── */}
      <div className="flex flex-col items-center gap-4 py-4">
        <div className="relative">
          {/* Pulse rings when recording */}
          {isRecording && (
            <>
              <span className="absolute inset-0 rounded-full bg-violet-500/20 animate-ping" />
              <span className="absolute inset-[-8px] rounded-full bg-violet-500/10 animate-ping [animation-delay:0.3s]" />
            </>
          )}

          <button
            onClick={isRecording ? stopRecording : state === "idle" || state === "done" || state === "error" ? startRecording : undefined}
            disabled={isProcessing}
            className={`
              relative w-24 h-24 rounded-full flex items-center justify-center
              text-4xl font-bold transition-all duration-200 shadow-lg
              ${isRecording
                ? "bg-red-600 hover:bg-red-500 scale-110 shadow-red-500/30"
                : isProcessing
                ? "bg-violet-800/60 cursor-not-allowed"
                : "bg-violet-600 hover:bg-violet-500 hover:scale-105 shadow-violet-500/30"
              }
            `}
          >
            {isProcessing ? (
              <span className="text-2xl animate-spin">⏳</span>
            ) : isRecording ? (
              <span className="w-8 h-8 bg-white rounded-sm" /> // stop square
            ) : (
              "🎤"
            )}
          </button>
        </div>

        {/* Status text */}
        <div className="text-center">
          {state === "idle" && (
            <p className="text-white/50 text-sm">Tap to start listening</p>
          )}
          {isRecording && (
            <div className="space-y-1">
              <p className="text-violet-300 text-sm font-semibold animate-pulse">
                Listening… {elapsed}s / 10s
              </p>
              <div className="w-40 h-1 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-violet-500 rounded-full transition-all duration-1000"
                  style={{ width: `${(elapsed / 10) * 100}%` }}
                />
              </div>
              <p className="text-white/30 text-xs">Tap again to stop early</p>
            </div>
          )}
          {isProcessing && (
            <p className="text-violet-300 text-sm font-semibold">Identifying song…</p>
          )}
        </div>
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3">
          <p className="text-red-400 text-sm">{error}</p>
          <button onClick={reset} className="mt-2 text-xs text-white/40 hover:text-white underline">
            Try again
          </button>
        </div>
      )}

      {/* ── Result ── */}
      {state === "done" && result && (
        <div className="mt-4">
          {result.match ? (
            <div className="rounded-xl border border-violet-500/30 bg-violet-500/10 p-4">
              <div className="flex gap-4">
                {/* Artwork */}
                {result.artwork ? (
                  <img
                    src={result.artwork}
                    alt="Album art"
                    className="w-20 h-20 rounded-xl object-cover shrink-0 shadow-lg"
                  />
                ) : (
                  <div className="w-20 h-20 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-3xl shrink-0">
                    🎵
                  </div>
                )}

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-white font-bold text-base leading-tight truncate">
                    {result.title}
                  </p>
                  <p className="text-violet-300 text-sm mt-0.5 truncate">{result.artist}</p>
                  {result.album && (
                    <p className="text-white/40 text-xs mt-0.5 truncate">{result.album}</p>
                  )}
                  {result.release_date && (
                    <p className="text-white/30 text-xs mt-0.5">{result.release_date}</p>
                  )}
                  {result.genres && result.genres.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {result.genres.map((g, i) => (
                        <span key={i} className="px-1.5 py-0.5 rounded-md bg-violet-500/20 text-violet-300 text-[10px] font-medium">
                          {g}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Action buttons */}
              <div className="mt-4 flex flex-wrap gap-2">
                {/* Search & download on YouTube */}
                {result.yt_search_url && (
                  <button
                    onClick={() => {
                      // Build a direct yt-dlp-friendly search URL for the download tab
                      const ytSearch = `ytsearch1:${result.artist} ${result.title}`;
                      onSelectUrl?.(ytSearch);
                    }}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold transition"
                  >
                    ↓ Download
                  </button>
                )}

                {result.yt_search_url && (
                  <a
                    href={result.yt_search_url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-semibold transition"
                  >
                    ▶ YouTube
                  </a>
                )}

                {result.spotify_url && (
                  <a
                    href={result.spotify_url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#1DB954]/20 hover:bg-[#1DB954]/30 text-[#1DB954] text-xs font-semibold transition"
                  >
                    ♫ Spotify
                  </a>
                )}

                {result.apple_url && (
                  <a
                    href={result.apple_url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-semibold transition"
                  >
                    🍎 Apple Music
                  </a>
                )}
              </div>

              <button onClick={reset} className="mt-3 text-xs text-white/30 hover:text-white/60 underline transition">
                Identify another song
              </button>
            </div>
          ) : (
            <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-5 text-center">
              <p className="text-4xl mb-2">🤷</p>
              <p className="text-white/60 text-sm">{result.message ?? "No match found"}</p>
              <p className="text-white/30 text-xs mt-1">Try holding the mic closer or recording a clearer section</p>
              <button onClick={reset} className="mt-3 text-xs text-violet-400 hover:text-violet-300 underline">
                Try again
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
