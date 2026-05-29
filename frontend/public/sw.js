// Velora service worker — placeholder to prevent 404s
// Extend this file if you want offline/PWA support
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", () => self.clients.claim());
