"use client";

import { useEffect } from "react";
import { isNativeApp } from "@/lib/nativeApp";
import { restoreNativeMirrorIfEmpty, writeNativeMirror } from "@/lib/storage/nativeMirror";

/** Copy the app's data to the phone's disk this often while it is open, as well as on going to the background. OURS. */
const MIRROR_INTERVAL_MS = 5 * 60 * 1000;

/**
 * The iPhone app's housekeeping (B11), mounted once in the layout and
 * inert in a browser: restore the data copy if iOS cleared the page's
 * storage, then keep the copy current.
 */
export default function NativeShell() {
  useEffect(() => {
    if (!isNativeApp()) return;
    let cancelled = false;
    const save = () => void writeNativeMirror(new Date().toISOString());
    void restoreNativeMirrorIfEmpty().then((restored) => {
      if (restored && !cancelled) window.location.reload();
    });
    const onVisibility = () => {
      if (document.visibilityState === "hidden") save();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", save);
    const timer = window.setInterval(save, MIRROR_INTERVAL_MS);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", save);
      window.clearInterval(timer);
    };
  }, []);
  return null;
}
