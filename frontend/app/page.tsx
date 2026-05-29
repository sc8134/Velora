"use client";
import { useState } from "react";
import DownloadForm from "./components/DownloadForm";
import DownloadCard from "./components/DownloadCard";
import BatchDownloader from "./components/BatchDownloader";
import JobQueue from "./components/JobQueue";
import Analytics from "./components/Analytics";
import AuthModal from "./components/AuthModal";
import SearchHub from "./components/SearchHub";
import AITools from "./components/AITools";
import PlatformIcon from "./components/PlatformIcon";
import { useAuth } from "./context/AuthContext";
import { VideoInfo } from "./types";

type Tab = "single" | "batch" | "queue" | "search" | "ai" | "analytics";

const NAV_ITEMS: { id: Tab; icon: string; label: string; adminOnly?: boolean }[] = [
  { id: "single",    icon: "↓",  label: "Download"   },
  { id: "batch",     icon: "⊞",  label: "Batch"      },
  { id: "queue",     icon: "≡",  label: "Queue"      },
  { id: "search",    icon: "⌕",  label: "Search"     },
  { id: "ai",        icon: "✦",  label: "AI Tools"   },
  { id: "analytics", icon: "◈",  label: "Analytics", adminOnly: true },
];

const FEATURES = [
  { key: "youtube",    title: "1000+ Sites",      desc: "YouTube, TikTok, SoundCloud, Vimeo and more" },
  { key: "bilibili",   title: "Batch Downloads",  desc: "Entire playlists or channels in one click"   },
  { key: "spotify",    title: "AI Tools",         desc: "Transcribe, summarize & identify songs"       },
  { key: "soundcloud", title: "Universal Search", desc: "Search 10+ platforms simultaneously"          },
  { key: "tiktok",     title: "Song Identifier",  desc: "Shazam-style recognition via mic"             },
  { key: "twitch",     title: "Analytics",        desc: "Audit logs and usage dashboard"               },
];

const PAGE_SUBTITLES: Record<Tab, string> = {
  single:    "Paste any URL from 1000+ supported sites",
  batch:     "Download multiple URLs or entire playlists",
  queue:     "Background jobs with auto-retry",
  search:    "Search YouTube, SoundCloud, Bilibili, Reddit and more",
  ai:        "Transcribe, summarize and get recommendations",
  analytics: "Usage stats and audit log",
};

// ── Ambient background (shared) ───────────────────────────────────────────────
function AmbientBg() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      <div className="blob-a absolute -top-32 -left-10 w-96 h-96 bg-violet-700/10 rounded-full blur-3xl scale-150" />
      <div className="blob-b absolute -bottom-40 -right-10 w-96 h-96 bg-teal-600/10 rounded-full blur-3xl scale-150" />
      <div className="blob-c absolute top-1/3 left-1/3 w-96 h-96 bg-indigo-600/5 rounded-full blur-3xl" />
    </div>
  );
}

// ── Footer (shared) ───────────────────────────────────────────────────────────
function Footer() {
  return (
    <footer className="shrink-0 px-6 py-3 border-t border-white/[0.04] flex items-center justify-between">
      <p className="text-[11px] text-white/20">
        Built by{" "}
        <a href="https://sagarrc.com.np" target="_blank" rel="noreferrer"
           className="text-violet-400/70 font-semibold hover:text-violet-400 transition">
          Sagar RC
        </a>
      </p>
      <div className="flex items-center gap-4 text-[11px] text-white/20">
        <span className="px-2 py-0.5 rounded-md bg-white/5 border border-white/[0.06] font-mono">v2.0</span>
        <a href="https://github.com/yt-dlp/yt-dlp" target="_blank" rel="noreferrer"
           className="hover:text-violet-400 transition">yt-dlp docs</a>
      </div>
    </footer>
  );
}

// ── Landing gate ──────────────────────────────────────────────────────────────
function LandingGate({ onOpen }: { onOpen: (mode: "login" | "register") => void }) {
  return (
    <div className="flex h-screen bg-[#07070f] text-white overflow-hidden">
      <AmbientBg />

      {/* Sidebar — locked */}
      <aside className="sidebar-rainbow animate-slide-left relative z-20 flex flex-col shrink-0 w-56 border-r border-white/[0.06] bg-[#0d0b1a]/80 backdrop-blur-xl">
        <div className="flex items-center gap-3 px-4 py-5 border-b border-white/[0.06]">
          <img src="/velora-icon.svg" alt="Velora" className="w-8 h-8 shrink-0 logo-rainbow" />
          <span className="text-lg font-black tracking-tight rainbow-text">Velora</span>
        </div>

        <nav className="flex-1 py-4 space-y-1 px-2">
          {NAV_ITEMS.filter(n => !n.adminOnly).map((item, i) => (
            <div
              key={item.id}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium
                         text-white/15 border border-transparent cursor-not-allowed select-none"
              style={{ animationDelay: `${i * 0.05}s` }}
            >
              <span className="text-base shrink-0">{item.icon}</span>
              <span className="flex-1 text-left">{item.label}</span>
              <svg className="w-3 h-3 text-white/10" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
              </svg>
            </div>
          ))}
        </nav>

        <div className="border-t border-white/[0.06] p-3">
          <button
            onClick={() => onOpen("login")}
            className="btn-rainbow w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs
                       text-white/70 hover:text-white transition group"
          >
            <span className="text-base group-hover:scale-110 transition-transform">⊙</span>
            Sign in to unlock
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 relative z-10">
        <header className="header-prism animate-fade-down shrink-0 flex items-center justify-between px-6 py-4
                           border-b border-white/[0.06] bg-[#07070f]/60 backdrop-blur-xl">
          <div>
            <h1 className="text-lg font-bold rainbow-text">Welcome to Velora</h1>
            <p className="text-xs text-white/30 mt-0.5">Sign in to start downloading from 1000+ supported sites</p>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto">
          <div className="max-w-2xl mx-auto px-6 py-10 space-y-6">

            {/* Hero card */}
            <div className="animate-fade-up glass-prism glass-shine p-8 text-center">
              <div className="flex items-center justify-center gap-3 mb-5">
                <img src="/velora-icon.svg" alt="Velora" className="w-12 h-12 shrink-0 logo-rainbow" />
                <span className="text-3xl font-black tracking-tight rainbow-text">Velora</span>
              </div>
              <h2 className="text-2xl font-bold text-white mb-2 leading-snug">
                Download anything.<br />
                <span className="grad-text">Powered by AI.</span>
              </h2>
              <p className="text-white/40 text-sm mb-8 leading-relaxed max-w-md mx-auto">
                Access downloads, batch mode, AI transcription, song identification,
                and universal search — all in one place.
              </p>
              <div className="flex gap-3 max-w-sm mx-auto">
                <button
                  onClick={() => onOpen("register")}
                  className="btn-primary flex-1 py-3.5 rounded-xl font-bold text-sm text-white"
                >
                  Get Started — Free
                </button>
                <button
                  onClick={() => onOpen("login")}
                  className="flex-1 py-3.5 rounded-xl font-bold text-sm border border-white/10
                             bg-white/5 hover:bg-white/10 hover:border-white/20 text-white transition"
                >
                  Sign In
                </button>
              </div>
              <p className="text-white/20 text-xs mt-4">No credit card required · Free to use</p>
            </div>

            {/* Feature grid */}
            <div>
              <p className="text-white/25 text-xs uppercase tracking-widest mb-3 px-1">Everything included</p>
              <div className="grid grid-cols-2 gap-3 stagger">
                {FEATURES.map(f => (
                  <div key={f.title}
                    className="glass p-4 flex gap-3 items-start
                               hover:border-violet-500/20 hover:bg-violet-500/5 transition group cursor-default">
                    <PlatformIcon platform={f.key} size={22}
                      className="shrink-0 mt-0.5 group-hover:scale-110 transition-transform" />
                    <div>
                      <p className="text-white text-sm font-semibold">{f.title}</p>
                      <p className="text-white/30 text-xs mt-0.5">{f.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </main>
        <Footer />
      </div>
    </div>
  );
}

// ── Main app ──────────────────────────────────────────────────────────────────
export default function Home() {
  const { user, logout } = useAuth();
  const [tab, setTab] = useState<Tab>("single");
  const [data, setData] = useState<VideoInfo | null>(null);
  const [queueCount, setQueueCount] = useState(0);
  const [showAuth, setShowAuth] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [prefillUrl, setPrefillUrl] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const openAuth = (mode: "login" | "register") => { setAuthMode(mode); setShowAuth(true); };
  const handleSelectUrl = (url: string) => { setPrefillUrl(url); setTab("single"); };
  const visibleNav = NAV_ITEMS.filter(n => !n.adminOnly || user?.role === "admin");

  if (!user) {
    return (
      <>
        <LandingGate onOpen={openAuth} />
        {showAuth && <AuthModal initialMode={authMode} onClose={() => setShowAuth(false)} />}
      </>
    );
  }

  return (
    <div className="flex h-screen bg-[#07070f] text-white overflow-hidden">
      <AmbientBg />

      {showAuth && <AuthModal initialMode={authMode} onClose={() => setShowAuth(false)} />}

      {/* ── Sidebar ── */}
      <aside className={`
        sidebar-rainbow animate-slide-left relative z-20 flex flex-col shrink-0
        border-r border-white/[0.06] bg-[#0d0b1a]/80 backdrop-blur-xl
        transition-all duration-300 ease-in-out
        ${sidebarOpen ? "w-56" : "w-16"}
      `}>

        {/* Logo */}
        <div className={`flex items-center gap-3 px-4 py-5 border-b border-white/[0.06]
                         ${!sidebarOpen && "justify-center px-0"}`}>
          <img src="/velora-icon.svg" alt="Velora"
               className="w-8 h-8 shrink-0 logo-rainbow" />
          {sidebarOpen && (
            <span className="text-lg font-black tracking-tight rainbow-text">Velora</span>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4 space-y-1 px-2">
          {visibleNav.map((item, i) => {
            const isActive = tab === item.id;
            const badge = item.id === "queue" && queueCount > 0 ? queueCount : null;
            return (
              <button
                key={item.id}
                onClick={() => setTab(item.id)}
                style={{ animationDelay: `${i * 0.04}s` }}
                className={`
                  animate-slide-left w-full flex items-center gap-3 px-3 py-2.5 rounded-xl
                  text-sm font-medium transition-all duration-200 group relative
                  ${isActive ? "nav-active text-violet-300 border border-violet-500/30"
                             : "text-white/40 hover:text-white nav-item-hover border border-transparent"}
                  ${!sidebarOpen && "justify-center px-0"}
                `}
              >
                {/* Active bar */}
                {isActive && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5
                                   bg-gradient-to-b from-violet-400 to-teal-400 rounded-full" />
                )}

                <span className={`text-base shrink-0 transition-transform duration-200
                  ${isActive ? "text-violet-400 scale-110" : "text-white/30 group-hover:text-white/70 group-hover:scale-105"}`}>
                  {item.icon}
                </span>

                {sidebarOpen && <span className="flex-1 text-left">{item.label}</span>}

                {sidebarOpen && badge && (
                  <span className="ml-auto bg-violet-600 text-white text-[10px] font-bold
                                   px-1.5 py-0.5 rounded-full animate-pulse">
                    {badge}
                  </span>
                )}

                {!sidebarOpen && (
                  <span className="absolute left-full ml-3 px-2.5 py-1.5 bg-[#0d0b1a]
                                   border border-white/10 rounded-lg text-xs text-white
                                   whitespace-nowrap opacity-0 group-hover:opacity-100
                                   pointer-events-none z-50 transition-all duration-150
                                   shadow-xl shadow-black/40">
                    {item.label}{badge ? ` (${badge})` : ""}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* User */}
        <div className={`border-t border-white/[0.06] p-3 ${!sidebarOpen && "flex justify-center"}`}>
          <div className={`flex items-center gap-2 ${!sidebarOpen && "justify-center"}`}>
            {user.picture ? (
              <img src={user.picture} alt=""
                   className="w-7 h-7 rounded-full border border-violet-500/30 shrink-0
                              ring-2 ring-violet-500/10" />
            ) : (
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-600/60 to-teal-600/40
                              border border-violet-500/30 flex items-center justify-center
                              text-xs font-bold text-violet-300 shrink-0">
                {user.username[0].toUpperCase()}
              </div>
            )}
            {sidebarOpen && (
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-white truncate">{user.username}</p>
                <button onClick={logout}
                        className="text-[10px] text-white/30 hover:text-red-400 transition">
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Collapse toggle */}
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="absolute -right-3 top-[72px] w-6 h-6 rounded-full
                     bg-[#0d0b1a] border border-white/10
                     flex items-center justify-center text-white/40
                     hover:text-violet-300 hover:border-violet-500/40
                     hover:bg-violet-500/10 transition z-30 text-xs shadow-lg"
        >
          {sidebarOpen ? "‹" : "›"}
        </button>
      </aside>

      {/* ── Main ── */}
      <div className="flex-1 flex flex-col min-w-0 relative z-10">

        {/* Header */}
        <header className="header-prism animate-fade-down shrink-0 flex items-center justify-between px-6 py-4
                           border-b border-white/[0.06] bg-[#07070f]/60 backdrop-blur-xl">
          <div key={tab} className="animate-fade-up">
            <h1 className="text-lg font-bold text-white capitalize">
              {tab === "single" ? "Download" :
               tab === "batch"  ? "Batch Download" :
               tab === "queue"  ? "Job Queue" :
               tab === "search" ? "Universal Search" :
               tab === "ai"     ? "AI Tools" : "Analytics"}
            </h1>
            <p className="text-xs text-white/30 mt-0.5">{PAGE_SUBTITLES[tab]}</p>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto">
          <div key={tab} className="animate-tab-in max-w-2xl mx-auto px-6 py-8 space-y-6">

            {tab === "single" && (
              <>
                <div className="glass-prism glass-shine p-6">
                  <DownloadForm onResult={d => setData(d)} prefillUrl={prefillUrl} />
                </div>
                {data && <DownloadCard video={data} onEnqueue={() => setQueueCount(c => c + 1)} />}

                {!data && (
                  <>
                    {/* Platforms grid */}
                    <div className="glass-prism glass-shine p-5">
                      <p className="text-white/25 text-xs uppercase tracking-widest mb-4">Popular platforms</p>
                      <div className="grid grid-cols-4 gap-2 stagger">
                        {[
                          { key: "youtube",    name: "YouTube"    },
                          { key: "soundcloud", name: "SoundCloud" },
                          { key: "spotify",    name: "Spotify"    },
                          { key: "tiktok",     name: "TikTok"     },
                          { key: "vimeo",      name: "Vimeo"      },
                          { key: "instagram",  name: "Instagram"  },
                          { key: "twitter",    name: "Twitter/X"  },
                          { key: "nicovideo",  name: "NicoVideo"  },
                          { key: "bilibili",   name: "Bilibili"   },
                          { key: "twitch",     name: "Twitch"     },
                          { key: "odysee",     name: "Odysee"     },
                          { key: "reddit",     name: "Reddit"     },
                        ].map(p => (
                          <div key={p.name}
                            className="flex flex-col items-center gap-1.5 p-3 rounded-xl
                                       bg-white/[0.03] border border-white/[0.05]
                                       hover:bg-white/[0.07] hover:border-violet-500/20
                                       hover:scale-105 transition-all duration-200 cursor-default group">
                            <PlatformIcon platform={p.key} size={24}
                              className="group-hover:scale-110 transition-transform" />
                            <span className="text-white/40 text-[10px] font-medium text-center leading-tight">
                              {p.name}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Quick tips */}
                    <div className="glass-prism p-5">
                      <p className="text-white/25 text-xs uppercase tracking-widest mb-4">Quick tips</p>
                      <div className="space-y-3 stagger">
                        {[
                          { icon: "✂️", tip: "Trim clips",      desc: "Cut a specific start/end time from any video" },
                          { icon: "🎵", tip: "Audio only",      desc: "Pick MP3 or FLAC to extract just the audio"   },
                          { icon: "≡",  tip: "Background jobs", desc: "Enable Queue mode to download without waiting" },
                          { icon: "⊞",  tip: "Batch mode",      desc: "Download entire playlists or channels at once" },
                        ].map(t => (
                          <div key={t.tip}
                            className="flex gap-3 items-start p-3 rounded-xl
                                       hover:bg-white/[0.03] transition-colors group">
                            <span className="text-lg shrink-0 mt-0.5 group-hover:scale-110 transition-transform">
                              {t.icon}
                            </span>
                            <div>
                              <p className="text-white/60 text-xs font-semibold">{t.tip}</p>
                              <p className="text-white/25 text-xs mt-0.5">{t.desc}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </>
            )}

            {tab === "batch"     && <BatchDownloader />}
            {tab === "queue"     && <JobQueue />}
            {tab === "search"    && <SearchHub onSelectUrl={handleSelectUrl} />}
            {tab === "ai"        && <AITools onSelectUrl={handleSelectUrl} />}
            {tab === "analytics" && <Analytics />}
          </div>
        </main>

        <Footer />
      </div>
    </div>
  );
}
