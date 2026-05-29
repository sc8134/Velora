"use client";
import { useState } from "react";
import ShazamTool from "./ShazamTool";

type AITab = "transcribe" | "summarize" | "recommend" | "shazam";

interface Recommendation {
  platform: string;
  title: string;
  url: string;
  uploader: string;
  thumbnail: string;
  duration: number | null;
}

interface Props {
  onSelectUrl?: (url: string) => void;
}

export default function AITools({ onSelectUrl }: Props) {
  const [tab, setTab] = useState<AITab>("transcribe");
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Transcribe state
  const [language, setLanguage] = useState("");
  const [transcriptFmt, setTranscriptFmt] = useState<"srt" | "vtt" | "txt">("srt");
  const [transcript, setTranscript] = useState<{ text: string; srt: string; vtt: string; language: string } | null>(null);

  // Summarize state
  const [summaryText, setSummaryText] = useState("");
  const [summary, setSummary] = useState<string | null>(null);
  const [maxSentences, setMaxSentences] = useState(5);

  // Recommend state
  const [recs, setRecs] = useState<Recommendation[]>([]);

  const call = async (endpoint: string, body: object) => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`http://localhost:8000${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Request failed"); return null; }
      return data;
    } catch {
      setError("Could not connect to backend.");
      return null;
    } finally {
      setLoading(false);
    }
  };

  const handleTranscribe = async () => {
    if (!url) { setError("Enter a URL"); return; }
    const data = await call("/api/ai/transcribe", { url, language: language || undefined, format: transcriptFmt });
    if (data) setTranscript(data);
  };

  const handleSummarize = async () => {
    const hasUrl = url.trim().length > 0;
    const hasText = summaryText.trim().length > 0;
    if (!hasUrl && !hasText) { setError("Enter a URL or paste text"); return; }
    const data = await call("/api/ai/summarize", {
      url: hasUrl ? url : undefined,
      text: hasText ? summaryText : undefined,
      max_sentences: maxSentences,
    });
    if (data) setSummary(data.summary);
  };

  const handleRecommend = async () => {
    if (!url) { setError("Enter a URL"); return; }
    const data = await call("/api/ai/recommend", { url, limit: 6 });
    if (data) setRecs(data.recommendations ?? []);
  };

  const downloadText = (content: string, filename: string) => {
    const blob = new Blob([content], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
  };

  const tabs: { id: AITab; label: string }[] = [
    { id: "transcribe", label: "🎙 Transcribe" },
    { id: "summarize",  label: "📝 Summarize" },
    { id: "recommend",  label: "💡 Recommend" },
    { id: "shazam",     label: "🎵 Identify" },
  ];

  return (
    <div className="rounded-2xl border border-white/10 bg-[#0f0d1a]/80 backdrop-blur-sm p-6">
      <h2 className="text-white font-bold text-lg mb-1">AI Tools</h2>
      <p className="text-white/40 text-xs mb-4">Transcription, summarization & recommendations</p>

      {/* Sub-tabs */}
      <div className="flex gap-2 mb-5 bg-white/5 p-1 rounded-xl border border-white/10">
        {tabs.map(t => (
          <button key={t.id} onClick={() => { setTab(t.id); setError(null); }}
            className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition ${
              tab === t.id ? "bg-violet-600 text-white" : "text-white/40 hover:text-white"
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Shared URL input — hidden on shazam tab which has its own UI */}
      {tab !== "shazam" && (
        <input
          type="text"
          value={url}
          onChange={e => setUrl(e.target.value)}
          placeholder="Paste YouTube / SoundCloud URL…"
          className="w-full bg-white/5 border border-white/10 text-white placeholder-white/30 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-violet-500 mb-4"
        />
      )}

      {tab !== "shazam" && error && <p className="text-red-400 text-xs mb-3">{error}</p>}

      {/* ── Transcribe ── */}
      {tab === "transcribe" && (
        <div className="space-y-3">
          <div className="flex gap-3">
            <input
              type="text"
              value={language}
              onChange={e => setLanguage(e.target.value)}
              placeholder="Language (e.g. en, es) — auto-detect if blank"
              className="flex-1 bg-white/5 border border-white/10 text-white placeholder-white/20 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-violet-500"
            />
            <select
              value={transcriptFmt}
              onChange={e => setTranscriptFmt(e.target.value as "srt" | "vtt" | "txt")}
              className="bg-[#1a1730] border border-white/10 text-white rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-violet-500 cursor-pointer"
            >
              <option value="srt">SRT</option>
              <option value="vtt">VTT</option>
              <option value="txt">Plain text</option>
            </select>
          </div>

          <button onClick={handleTranscribe} disabled={loading}
            className="w-full py-3 rounded-xl font-bold text-sm bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white transition">
            {loading ? "⏳ Transcribing… (may take a minute)" : "Transcribe"}
          </button>

          {transcript && (
            <div className="mt-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-white/40 text-xs uppercase tracking-widest">
                  Result · {transcript.language?.toUpperCase()}
                </p>
                <div className="flex gap-2">
                  <button onClick={() => downloadText(transcript.srt, "transcript.srt")}
                    className="text-xs text-violet-400 hover:text-violet-300 underline">↓ SRT</button>
                  <button onClick={() => downloadText(transcript.vtt, "transcript.vtt")}
                    className="text-xs text-violet-400 hover:text-violet-300 underline">↓ VTT</button>
                  <button onClick={() => downloadText(transcript.text, "transcript.txt")}
                    className="text-xs text-violet-400 hover:text-violet-300 underline">↓ TXT</button>
                </div>
              </div>
              <pre className="bg-white/5 border border-white/10 rounded-xl p-3 text-white/70 text-xs max-h-48 overflow-y-auto whitespace-pre-wrap">
                {transcriptFmt === "srt" ? transcript.srt :
                 transcriptFmt === "vtt" ? transcript.vtt :
                 transcript.text}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* ── Summarize ── */}
      {tab === "summarize" && (
        <div className="space-y-3">
          <textarea
            value={summaryText}
            onChange={e => setSummaryText(e.target.value)}
            placeholder="Or paste transcript / article text here to summarize directly…"
            rows={4}
            className="w-full bg-white/5 border border-white/10 text-white placeholder-white/20 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-violet-500 resize-none"
          />
          <div className="flex items-center gap-3">
            <label className="text-white/40 text-xs">Sentences:</label>
            <input type="number" min={2} max={20} value={maxSentences}
              onChange={e => setMaxSentences(Number(e.target.value))}
              className="w-16 bg-white/5 border border-white/10 text-white text-xs rounded-lg px-2 py-1 focus:outline-none" />
          </div>
          <button onClick={handleSummarize} disabled={loading}
            className="w-full py-3 rounded-xl font-bold text-sm bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white transition">
            {loading ? "⏳ Summarizing…" : "Summarize"}
          </button>
          {summary && (
            <div className="mt-3 bg-white/5 border border-white/10 rounded-xl p-4">
              <p className="text-white/40 text-xs uppercase tracking-widest mb-2">Summary</p>
              <p className="text-white/80 text-sm leading-relaxed">{summary}</p>
              <button onClick={() => downloadText(summary, "summary.txt")}
                className="mt-3 text-xs text-violet-400 hover:text-violet-300 underline">↓ Download</button>
            </div>
          )}
        </div>
      )}

      {/* ── Recommend ── */}
      {tab === "recommend" && (
        <div className="space-y-3">
          <button onClick={handleRecommend} disabled={loading}
            className="w-full py-3 rounded-xl font-bold text-sm bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white transition">
            {loading ? "⏳ Finding recommendations…" : "Get Recommendations"}
          </button>
          {recs.length > 0 && (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {recs.map((r, i) => (
                <div key={i}
                  className="flex gap-3 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition p-3 cursor-pointer group"
                  onClick={() => onSelectUrl?.(r.url)}
                >
                  {r.thumbnail ? (
                    <img src={r.thumbnail} alt="" className="w-16 h-10 object-cover rounded-lg shrink-0" />
                  ) : (
                    <div className="w-16 h-10 rounded-lg bg-white/5 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-xs font-medium line-clamp-1 group-hover:text-violet-300 transition">{r.title}</p>
                    <p className="text-white/30 text-xs mt-0.5 truncate">{r.uploader}</p>
                  </div>
                  <span className="text-violet-400 text-xs self-center opacity-0 group-hover:opacity-100 transition shrink-0">↓ Use</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Shazam / Song Identify ── */}
      {tab === "shazam" && (
        <ShazamTool onSelectUrl={onSelectUrl} />
      )}
    </div>
  );
}

