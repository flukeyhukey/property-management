"use client";

import { useEffect } from "react";

/** Registers /sw.js once the page has mounted. Renders nothing. Mount it in the root layout. */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch((err) => {
      console.warn("[sw] registration failed", err);
    });
  }, []);
  return null;
}
