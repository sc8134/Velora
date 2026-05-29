"use client";
import { useEffect, useState, ReactNode } from "react";

/**
 * Renders children only after the first client-side mount.
 * This prevents SSR/hydration mismatches caused by:
 *  - localStorage-dependent state (auth)
 *  - Browser extensions that mutate the DOM (e.g. Bitdefender bis_skin_checked)
 */
export default function ClientOnly({ children, fallback = null }: {
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted ? <>{children}</> : <>{fallback}</>;
}
