"use client";
import { useState } from "react";

// Map platform keys / common domain keywords → canonical domain for favicon lookup
const DOMAIN_MAP: Record<string, string> = {
  youtube:     "youtube.com",
  soundcloud:  "soundcloud.com",
  spotify:     "spotify.com",
  tiktok:      "tiktok.com",
  vimeo:       "vimeo.com",
  instagram:   "instagram.com",
  twitter:     "twitter.com",
  "twitter/x": "twitter.com",
  x:           "x.com",
  nicovideo:   "nicovideo.com",
  bilibili:    "bilibili.com",
  twitch:      "twitch.tv",
  odysee:      "odysee.com",
  dailymotion: "dailymotion.com",
  rumble:      "rumble.com",
  reddit:      "reddit.com",
  facebook:    "facebook.com",
  pinterest:   "pinterest.com",
  tumblr:      "tumblr.com",
  bandcamp:    "bandcamp.com",
  mixcloud:    "mixcloud.com",
  peertube:    "joinpeertube.org",
  applemusic:  "music.apple.com",
  deezer:      "deezer.com",
};

// Fallback emoji when favicon fails to load
const FALLBACK_EMOJI: Record<string, string> = {
  youtube:     "▶",
  soundcloud:  "☁",
  spotify:     "🎵",
  tiktok:      "📱",
  vimeo:       "🎬",
  instagram:   "📸",
  twitter:     "🐦",
  "twitter/x": "🐦",
  nicovideo:   "🎌",
  bilibili:    "📺",
  twitch:      "🟣",
  odysee:      "🌊",
  dailymotion: "🎥",
  rumble:      "🟢",
  reddit:      "🔴",
};

interface Props {
  /** Platform key (e.g. "youtube") or a full domain (e.g. "youtube.com") */
  platform: string;
  size?: number;
  className?: string;
}

export default function PlatformIcon({ platform, size = 20, className = "" }: Props) {
  const [failed, setFailed] = useState(false);

  const key = platform.toLowerCase().replace(/\s+/g, "");
  const domain = DOMAIN_MAP[key] ?? (platform.includes(".") ? platform : null);
  const fallback = FALLBACK_EMOJI[key] ?? "🌐";

  if (!domain || failed) {
    return (
      <span
        className={className}
        style={{ fontSize: size * 0.85, lineHeight: 1, display: "inline-flex", alignItems: "center" }}
      >
        {fallback}
      </span>
    );
  }

  const src = `https://www.google.com/s2/favicons?domain=${domain}&sz=${size >= 32 ? 64 : 32}`;

  return (
    <img
      src={src}
      alt={platform}
      width={size}
      height={size}
      className={`rounded-sm object-contain ${className}`}
      style={{ imageRendering: "auto" }}
      onError={() => setFailed(true)}
    />
  );
}
