"use client";
import { useEffect } from "react";

/** Registers the offline shell in production builds only (dev rebuilds would fight the cache). */
export function RegisterSW() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }, []);
  return null;
}
