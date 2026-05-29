"use client";
import { useState } from "react";
import { useAuth } from "../context/AuthContext";

interface Props {
  onClose: () => void;
  initialMode?: "login" | "register";
}

export default function AuthModal({ onClose, initialMode = "login" }: Props) {
  const { login, register, loginWithGoogle, googleError } = useAuth();
  const [mode, setMode] = useState<"login" | "register">(initialMode);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [showPass, setShowPass] = useState(false);

  const handleSubmit = async () => {
    if (!username || !password) { setError("Fill in all fields"); return; }
    setError(null);
    setLoading(true);
    try {
      if (mode === "login") {
        const err = await login(username, password);
        if (err) { setError(err); return; }
        onClose();
      } else {
        const err = await register(username, password);
        if (err) { setError(err); return; }
        setSuccess(true);
        setTimeout(() => { setMode("login"); setSuccess(false); }, 1500);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md animate-fade-in">
      {/* Backdrop click */}
      <div className="absolute inset-0" onClick={onClose} />

      <div className="animate-scale-in relative w-full max-w-sm mx-4 rounded-2xl overflow-hidden shadow-2xl shadow-black/60">

        {/* Gradient border glow */}
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-violet-500/20 via-transparent to-fuchsia-500/10 pointer-events-none" />

        {/* Card */}
        <div className="relative glass border border-white/[0.08] p-6">

          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-white font-bold text-lg">
                {mode === "login" ? "Welcome back" : "Create account"}
              </h2>
              <p className="text-white/30 text-xs mt-0.5">
                {mode === "login" ? "Sign in to your Velora account" : "Join Velora — it's free"}
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10
                         flex items-center justify-center text-white/40 hover:text-white
                         transition text-lg leading-none"
            >
              ×
            </button>
          </div>

          {/* Success */}
          {success && (
            <div className="animate-fade-up mb-4 px-4 py-3 rounded-xl bg-emerald-500/10
                            border border-emerald-500/20 flex items-center gap-2">
              <span className="text-emerald-400">✓</span>
              <p className="text-emerald-400 text-sm">Account created! Signing you in…</p>
            </div>
          )}

          {/* Fields */}
          <div className="space-y-3 mb-4">
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/25 text-sm">⊙</span>
              <input
                type="text"
                placeholder="Username"
                value={username}
                onChange={e => setUsername(e.target.value)}
                className="w-full bg-white/5 border border-white/10 text-white placeholder-white/25
                           rounded-xl pl-9 pr-4 py-3 text-sm focus:outline-none
                           focus:border-violet-500 focus:ring-1 focus:ring-violet-500/20
                           hover:border-white/20 transition"
              />
            </div>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/25 text-sm">🔑</span>
              <input
                type={showPass ? "text" : "password"}
                placeholder="Password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleSubmit()}
                className="w-full bg-white/5 border border-white/10 text-white placeholder-white/25
                           rounded-xl pl-9 pr-10 py-3 text-sm focus:outline-none
                           focus:border-violet-500 focus:ring-1 focus:ring-violet-500/20
                           hover:border-white/20 transition"
              />
              <button
                type="button"
                onClick={() => setShowPass(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/25
                           hover:text-white/60 transition text-xs"
              >
                {showPass ? "hide" : "show"}
              </button>
            </div>
          </div>

          {/* Errors */}
          {(error || googleError) && (
            <div className="animate-fade-up mb-4 px-3 py-2.5 rounded-xl bg-red-500/10
                            border border-red-500/20">
              <p className="text-red-400 text-xs">{error || googleError}</p>
            </div>
          )}

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="btn-primary w-full py-3 rounded-xl font-bold text-sm text-white
                       disabled:opacity-40 disabled:cursor-not-allowed disabled:transform-none"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                {mode === "login" ? "Signing in…" : "Creating account…"}
              </span>
            ) : (
              mode === "login" ? "Sign In" : "Create Account"
            )}
          </button>

          {/* Divider */}
          <div className="flex items-center gap-3 my-4">
            <div className="flex-1 h-px bg-white/[0.07]" />
            <span className="text-white/20 text-xs">or continue with</span>
            <div className="flex-1 h-px bg-white/[0.07]" />
          </div>

          {/* Google */}
          <button
            onClick={loginWithGoogle}
            className="w-full py-3 rounded-xl font-semibold text-sm
                       border border-white/10 bg-white/[0.04] hover:bg-white/[0.08]
                       hover:border-white/20 text-white transition
                       flex items-center justify-center gap-3 group"
          >
            <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"
                 className="group-hover:scale-110 transition-transform">
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
            </svg>
            Continue with Google
          </button>

          {/* Toggle mode */}
          <p className="text-center text-white/25 text-xs mt-4">
            {mode === "login" ? "Don't have an account?" : "Already have one?"}{" "}
            <button
              onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(null); }}
              className="text-violet-400 hover:text-violet-300 font-semibold underline underline-offset-2 transition"
            >
              {mode === "login" ? "Register" : "Sign in"}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
