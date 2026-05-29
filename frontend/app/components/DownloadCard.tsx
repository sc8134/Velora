"use client";
import { useState } from "react";
import { VideoInfo, DownloadOption, Profile } from "../types";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

function formatDuration(s: number) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
    : `${m}:${String(sec).padStart(2, "0")}`;
}

interface Props {
  video: VideoInfo;
  onEnqueue?: (jobId: string) => void;
}

export default function DownloadCard({ video, onEnqueue }: Props) {
  const [downloading, setDownloading] = useState<string | null>(null);

  // Trim
  const [trimStart, setTrimStart] = useState("");
  const [trimEnd, setTrimEnd] = useState("");
  const [showTrim, setShowTrim] = useState(false);

  // Metadata / subtitles
  const [embedMeta, setEmbedMeta] = useState(true);
  const [embedThumb, setEmbedThumb] = useState(false);
  const [embedSubs, setEmbedSubs] = useState(false);
  const [subLang, setSubLang] = useState("en");

  // Profile
  const profiles: Profile[] = video.profiles ?? [{ id: "default", label: "Default" }];
  const [profileId, setProfileId] = useState("default");

  // Queue mode
  const [useQueue, setUseQueue] = useState(false);

  const buildBody = (opt: DownloadOption) => ({
    url: video.url,
    type: opt.type,
    quality: opt.quality,
    ext: opt.ext,
    profile: profileId,
    trim_start: trimStart || null,
    trim_end: trimEnd || null,
    embed_metadata: embedMeta,
    embed_thumbnail: embedThumb,
    embed_subs: embedSubs,
    sub_langs: subLang,
  });

  const handleDownload = async (opt: DownloadOption) => {
    setDownloading(opt.label);
    try {
      if (useQueue) {
        // Enqueue job
        const res = await fetch(`${API}/api/jobs/enqueue`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildBody(opt)),
        });
        const data = await res.json();
        if (data.error) {
          alert("Enqueue failed: " + data.error);
        } else {
          onEnqueue?.(data.job_id);
          alert(`Job queued! ID: ${data.job_id.slice(0, 8)}… — check the Queue tab.`);
        }
        return;
      }

      // Direct download
      const res = await fetch(`${API}/api/download/file`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildBody(opt)),
      });

      if (!res.ok) {
        const err = await res.json();
        alert("Download failed: " + err.error);
        return;
      }

      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = `${video.title}.${opt.ext}`;
      a.click();
      URL.revokeObjectURL(blobUrl);
    } catch {
      alert("Could not connect to backend.");
    } finally {
      setDownloading(null);
    }
  };

  return (
    <div className="mt-8 rounded-2xl overflow-hidden border border-white/10 bg-[#0f0d1a]/80 backdrop-blur-sm shadow-2xl">

      {/* Thumbnail + info */}
      <div className="relative">
        {video.thumbnail && (
          <div className="relative w-full h-48 overflow-hidden">
            <img src={video.thumbnail} alt=""
              className="absolute inset-0 w-full h-full object-cover scale-110 blur-2xl opacity-40" />
            <img src={video.thumbnail} alt="thumbnail"
              className="relative mx-auto h-full object-contain z-10" />
            <span className="absolute bottom-2 right-3 z-20 bg-black/70 text-white text-xs px-2 py-0.5 rounded font-mono">
              {formatDuration(video.duration)}
            </span>
          </div>
        )}
      </div>

      {/* Title + uploader */}
      <div className="px-5 py-4 border-b border-white/10">
        <h2 className="text-white font-semibold text-base leading-snug line-clamp-2">{video.title}</h2>
        <p className="text-white/40 text-xs mt-1">{video.uploader}</p>
        {video.is_playlist && (
          <p className="text-violet-400 text-xs mt-1">
            📋 Playlist · {video.playlist_count} videos
          </p>
        )}
      </div>

      {/* Profile selector */}
      <div className="px-5 pt-4 pb-2 border-b border-white/10">
        <p className="text-white/40 text-xs uppercase tracking-widest mb-2 font-medium">Profile</p>
        <div className="flex flex-wrap gap-2">
          {profiles.map((p) => (
            <button
              key={p.id}
              onClick={() => setProfileId(p.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition border ${
                profileId === p.id
                  ? "bg-violet-600 border-violet-500 text-white"
                  : "bg-white/5 border-white/10 text-white/50 hover:bg-white/10"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Options row */}
      <div className="px-5 py-3 border-b border-white/10 flex flex-wrap gap-4 items-center">
        {/* Trim toggle */}
        <button
          onClick={() => setShowTrim(!showTrim)}
          className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition ${
            showTrim
              ? "bg-amber-600/20 border-amber-500/50 text-amber-300"
              : "bg-white/5 border-white/10 text-white/40 hover:bg-white/10"
          }`}
        >
          ✂️ Trim
        </button>

        {/* Metadata */}
        <label className="flex items-center gap-1.5 text-xs text-white/50 cursor-pointer select-none">
          <input type="checkbox" checked={embedMeta} onChange={e => setEmbedMeta(e.target.checked)}
            className="accent-violet-500" />
          Metadata
        </label>

        {/* Thumbnail */}
        <label className="flex items-center gap-1.5 text-xs text-white/50 cursor-pointer select-none">
          <input type="checkbox" checked={embedThumb} onChange={e => setEmbedThumb(e.target.checked)}
            className="accent-violet-500" />
          Embed Thumbnail
        </label>

        {/* Subtitles */}
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

        {/* Queue mode */}
        <label className="flex items-center gap-1.5 text-xs text-white/50 cursor-pointer select-none ml-auto">
          <input type="checkbox" checked={useQueue} onChange={e => setUseQueue(e.target.checked)}
            className="accent-violet-500" />
          Add to Queue
        </label>
      </div>

      {/* Trim inputs */}
      {showTrim && (
        <div className="px-5 py-3 border-b border-white/10 flex gap-3 items-center">
          <div className="flex flex-col gap-1 flex-1">
            <label className="text-white/30 text-xs">Start (HH:MM:SS)</label>
            <input
              type="text"
              value={trimStart}
              onChange={e => setTrimStart(e.target.value)}
              placeholder="00:00:00"
              className="bg-white/5 border border-white/10 text-white text-sm rounded-xl px-3 py-2 focus:outline-none focus:border-amber-500"
            />
          </div>
          <div className="flex flex-col gap-1 flex-1">
            <label className="text-white/30 text-xs">End (HH:MM:SS)</label>
            <input
              type="text"
              value={trimEnd}
              onChange={e => setTrimEnd(e.target.value)}
              placeholder="00:01:30"
              className="bg-white/5 border border-white/10 text-white text-sm rounded-xl px-3 py-2 focus:outline-none focus:border-amber-500"
            />
          </div>
        </div>
      )}

      {/* Video options */}
      {video.video_options.length > 0 && (
        <div className="px-5 py-4 border-b border-white/10">
          <p className="text-white/40 text-xs uppercase tracking-widest mb-3 font-medium">🎬 Video</p>
          <div className="grid grid-cols-2 gap-2">
            {video.video_options.map((opt) => (
              <button
                key={opt.label}
                onClick={() => handleDownload(opt)}
                disabled={downloading !== null}
                className={`
                  relative flex flex-col items-start px-4 py-3 rounded-xl border text-left transition
                  ${downloading === opt.label
                    ? "border-violet-500 bg-violet-500/10 text-violet-300"
                    : "border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20 text-white"
                  }
                  disabled:opacity-50
                `}
              >
                <span className="text-sm font-semibold">{opt.label}</span>
                <span className="text-xs text-white/40 mt-0.5 uppercase">{opt.ext}</span>
                {downloading === opt.label && (
                  <span className="absolute top-2 right-3 text-xs text-violet-400 animate-pulse">⏳</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Audio options */}
      {video.audio_options.length > 0 && (
        <div className="px-5 py-4">
          <p className="text-white/40 text-xs uppercase tracking-widest mb-3 font-medium">🎵 Audio</p>
          <div className="grid grid-cols-2 gap-2">
            {video.audio_options.map((opt) => (
              <button
                key={opt.label}
                onClick={() => handleDownload(opt)}
                disabled={downloading !== null}
                className={`
                  relative flex flex-col items-start px-4 py-3 rounded-xl border text-left transition
                  ${downloading === opt.label
                    ? "border-emerald-500 bg-emerald-500/10 text-emerald-300"
                    : "border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20 text-white"
                  }
                  disabled:opacity-50
                `}
              >
                <span className="text-sm font-semibold">{opt.label}</span>
                <span className="text-xs text-white/40 mt-0.5 uppercase">{opt.ext}</span>
                {downloading === opt.label && (
                  <span className="absolute top-2 right-3 text-xs text-emerald-400 animate-pulse">⏳</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

