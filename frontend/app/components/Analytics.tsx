"use client";
import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";

interface Summary {
  total_events: number;
  total_downloads: number;
  total_errors: number;
  by_event: Record<string, number>;
  top_users: [string, number][];
  hourly_last_24h: { hours_ago: number; count: number }[];
}

export default function Analytics() {
  const { user } = useAuth();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchAnalytics = async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("http://localhost:8000/api/analytics", {
        headers: { Authorization: `Bearer ${user.token}` },
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed"); return; }
      setSummary(data);
    } catch {
      setError("Could not connect to backend");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAnalytics(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!user || user.role !== "admin") {
    return (
      <div className="rounded-2xl border border-white/10 bg-black/40 p-6 text-center">
        <p className="text-white/30 text-sm">Analytics are available to admins only.</p>
      </div>
    );
  }

  const maxHourly = summary ? Math.max(...summary.hourly_last_24h.map(h => h.count), 1) : 1;

  return (
    <div className="rounded-2xl border border-white/10 bg-[#0f0d1a]/80 backdrop-blur-sm p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-white font-bold text-lg">Analytics Dashboard</h2>
        <button
          onClick={fetchAnalytics}
          className="text-xs text-white/40 hover:text-white px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 transition"
        >
          {loading ? "…" : "↻ Refresh"}
        </button>
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}

      {summary && (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Total Events",   value: summary.total_events },
              { label: "Downloads",      value: summary.total_downloads },
              { label: "Errors",         value: summary.total_errors },
            ].map(kpi => (
              <div key={kpi.label} className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-center">
                <p className="text-2xl font-black text-white">{kpi.value}</p>
                <p className="text-white/40 text-xs mt-1">{kpi.label}</p>
              </div>
            ))}
          </div>

          {/* Hourly activity bar chart */}
          <div>
            <p className="text-white/40 text-xs uppercase tracking-widest mb-3">Activity — last 24h</p>
            <div className="flex items-end gap-1 h-16">
              {[...summary.hourly_last_24h].reverse().map(h => (
                <div
                  key={h.hours_ago}
                  title={`${h.hours_ago}h ago: ${h.count}`}
                  className="flex-1 rounded-sm bg-violet-500/60 hover:bg-violet-400 transition"
                  style={{ height: `${Math.max(4, (h.count / maxHourly) * 100)}%` }}
                />
              ))}
            </div>
            <div className="flex justify-between text-white/20 text-xs mt-1">
              <span>24h ago</span><span>now</span>
            </div>
          </div>

          {/* Event breakdown */}
          <div>
            <p className="text-white/40 text-xs uppercase tracking-widest mb-3">Events</p>
            <div className="space-y-1.5">
              {Object.entries(summary.by_event)
                .sort((a, b) => b[1] - a[1])
                .map(([ev, count]) => (
                  <div key={ev} className="flex items-center gap-3">
                    <span className="text-white/50 text-xs w-40 truncate">{ev}</span>
                    <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
                      <div
                        className="h-full bg-indigo-500 rounded-full"
                        style={{ width: `${(count / summary.total_events) * 100}%` }}
                      />
                    </div>
                    <span className="text-white/40 text-xs w-8 text-right">{count}</span>
                  </div>
                ))}
            </div>
          </div>

          {/* Top users */}
          {summary.top_users.length > 0 && (
            <div>
              <p className="text-white/40 text-xs uppercase tracking-widest mb-3">Top Users</p>
              <div className="space-y-1">
                {summary.top_users.map(([u, c]) => (
                  <div key={u} className="flex justify-between text-xs">
                    <span className="text-white/60">{u}</span>
                    <span className="text-white/30">{c} events</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

