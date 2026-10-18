/**
 * Light or dark Mist (DESIGN.md rev 4). "auto" follows the phone through
 * `prefers-color-scheme`; "light" and "dark" pin it by setting
 * `data-theme` on <html>, which the tokens in app/globals.css key off.
 */

import { kvGet, kvSet } from "@/lib/storage/kv";

export type Appearance = "auto" | "light" | "dark";

export const APPEARANCE_KEY = "appearance";

/** Runs in <head> before first paint so a pinned mode never flashes the other one. */
export const APPEARANCE_BOOT = `try{var a=JSON.parse(localStorage.getItem("${APPEARANCE_KEY}")||"null");if(a==="light"||a==="dark")document.documentElement.dataset.theme=a}catch(e){}`;

export function readAppearance(): Appearance {
  if (typeof window === "undefined") return "auto";
  try {
    const v = kvGet<string>(APPEARANCE_KEY);
    return v === "light" || v === "dark" ? v : "auto";
  } catch {
    return "auto";
  }
}

/** Store the choice and apply it at once. */
export function setAppearance(a: Appearance): void {
  if (typeof window === "undefined") return;
  try {
    kvSet(APPEARANCE_KEY, a);
    if (a === "auto") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = a;
  } catch {
    // Storage blocked: the phone's setting still applies.
  }
}
