"use client";
import { useState, useEffect, useCallback } from "react";
import { Job } from "../types";

interface JobWithRetry extends Job {
  retries: number;
  max_retries: number;
  history?: { timestamp: number; status: string; message: string }[];
}

export default function JobQueue() {
  const [jobs, setJobs] = useState<JobWithRetry[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const fetchJobs = useCallback(async () => {
    try {
      const res = await fetch("http://localhost:8000/api/jobs");
      const data = await res.json();
      setJobs(data.jobs ?? []);
    } catch { /* backend not reachable */ }
  }, []);

  useEffect(() => {
    fetchJobs();
    const hasActive = jobs.some(j => j.status === "pending" || j.status === "running" || j.status === "retrying");
    if (!hasActive) return;
    const id = setInterval(fetchJobs, 2000);
    return () => clearInterval(id);
  }, [fetchJobs, jobs.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDownload = async (job: JobWithRetry) => {
    try {
      const res = await fetch(`http://localhost:8000/api/jobs/${job.id}/download`);
      if (!res.ok) { alert("File not ready"); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = job.filename ?? "download";
      a.click();
      URL.revokeObjectURL(url);
    } catch { alert("Could not connect to backend."); }
  };

  const handleRetry = async (job: JobWithRetry) => {
    try {
      const res = await fetch(`http://localhost:8000/api/jobs/${job.id}/retry`, { method: "POST" });
      if (!res.ok) { const d = await res.json(); alert(d.error); return; }
      fetchJobs();
    } catch { alert("Could not connect to backend."); }
  };

  const statusColor = (s: string) => ({
    pending:  "text-white/30",
    running:  "text-violet-400",
    retrying: "text-amber-400",
    done:     "text-emerald-400",
    error:    "text-red-400",
  }[s] ?? "text-white/30");

  const statusIcon = (s: string) => ({
    pending:  "○",
    running:  "⏳",
    retrying: "↻",
    done:     "✓",
    error:    "✗",
  }[s] ?? "○");

  return (
    <div className="rounded-2xl border border-white/10 bg-[#0f0d1a]/80 backdrop-blur-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-white font-bold text-lg">Download Queue</h2>
          <p className="text-white/40 text-xs mt-0.5">
            Jobs run in the background · auto-retry on failure
          </p>
        </div>
        <button
          onClick={() => { setLoading(true); fetchJobs().finally(() => setLoading(false)); }}
          className="text-xs text-white/40 hover:text-white transition px-3 py-1.5 rounded-lg bg-white/5 border border-white/10"
        >
          {loading ? "…" : "↻ Refresh"}
        </button>
      </div>

      {jobs.length === 0 ? (
        <p className="text-white/20 text-sm text-center py-8">
          No jobs yet. Use "Add to Queue" when downloading.
        </p>
      ) : (
        <div className="space-y-3">
          {[...jobs].reverse().map(job => (
            <div key={job.id} className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
              <div className="flex items-center gap-3">
                <span className={`text-lg ${statusColor(job.status)}`}>{statusIcon(job.status)}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium truncate">
                    {job.filename ?? `Job ${job.id.slice(0, 8)}…`}
                  </p>
                  <p className={`text-xs mt-0.5 ${statusColor(job.status)}`}>
                    {job.status === "running"
                      ? `${job.progress}% — ${job.message}`
                      : job.status === "retrying"
                      ? `Retrying (${job.retries}/${job.max_retries})…`
                      : job.status === "error"
                      ? job.error
                      : job.message || job.status}
                  </p>
                </div>

                <div className="flex gap-2 shrink-0">
                  {job.status === "done" && (
                    <button onClick={() => handleDownload(job)}
                      className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition">
                      ↓ Save
                    </button>
                  )}
                  {job.status === "error" && (
                    <button onClick={() => handleRetry(job)}
                      className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white transition">
                      ↻ Retry
                    </button>
                  )}
                  {job.history && job.history.length > 0 && (
                    <button
                      onClick={() => setExpanded(expanded === job.id ? null : job.id)}
                      className="text-xs text-white/30 hover:text-white px-2 py-1.5 rounded-lg bg-white/5 border border-white/10 transition"
                    >
                      {expanded === job.id ? "▲" : "▼"}
                    </button>
                  )}
                </div>
              </div>

              {/* Progress bar */}
              {(job.status === "running" || job.status === "pending") && (
                <div className="mt-2 h-1 rounded-full bg-white/10 overflow-hidden">
                  <div className="h-full bg-violet-500 transition-all duration-500"
                    style={{ width: `${job.progress}%` }} />
                </div>
              )}
              {job.status === "retrying" && (
                <div className="mt-2 h-1 rounded-full bg-white/10 overflow-hidden">
                  <div className="h-full bg-amber-500 animate-pulse w-full" />
                </div>
              )}

              {/* History */}
              {expanded === job.id && job.history && (
                <div className="mt-3 border-t border-white/10 pt-3 space-y-1">
                  {job.history.map((h, i) => (
                    <div key={i} className="flex gap-2 text-xs">
                      <span className="text-white/20 shrink-0">
                        {new Date(h.timestamp * 1000).toLocaleTimeString()}
                      </span>
                      <span className={`shrink-0 ${statusColor(h.status)}`}>[{h.status}]</span>
                      <span className="text-white/40 truncate">{h.message}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

