"use client";

import { supabase } from "@/lib/sync/client";
import { forgetAccount } from "@/lib/sync/run";
import { withdrawConsent } from "@/lib/consent";
import { healthLinkStore } from "@/lib/physique/io/healthLink";
import { disableReminders } from "@/lib/physique/io/pushLink";
import { clearNativeMirror } from "@/lib/storage/nativeMirror";

/**
 * Deleting the account from the app (TR1, App Review 5.1.1(v)). The server
 * route deletes the account, everything synced to it (the rows cascade)
 * and the Apple Health link's rows on our server; this side then forgets
 * the account and, if asked, clears the device too.
 */

/** The body the delete route accepts; the user is always the one the sign-in token belongs to. */
export const DELETE_CONFIRM = "delete-account";

export type DeleteAccountResult = { ok: true } | { ok: false; error: "signed_out" | "network" | "server" };

export async function deleteAccount(opts: { clearDevice: boolean; nowIso: string }): Promise<DeleteAccountResult> {
  const sb = supabase();
  if (!sb) return { ok: false, error: "signed_out" };
  const { data } = await sb.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return { ok: false, error: "signed_out" };
  const link = await healthLinkStore.get();
  let res: Response;
  try {
    res = await fetch("/api/account/delete", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: DELETE_CONFIRM, ...(link?.token ? { healthToken: link.token } : {}) }),
    });
  } catch {
    return { ok: false, error: "network" };
  }
  if (!res.ok) return { ok: false, error: res.status === 401 ? "signed_out" : "server" };

  // The account no longer exists: sign out here (the server may refuse a session it no longer knows, so the local copy goes regardless).
  try {
    await sb.auth.signOut({ scope: "local" });
  } catch {
    /* forgotten below */
  }
  forgetAccount();
  withdrawConsent("sync", opts.nowIso);
  // The server's copy of the Apple Health link is gone; keeping the token would start a new one.
  if (link?.token) await healthLinkStore.clear();
  if (opts.clearDevice) await clearThisDevice();
  return { ok: true };
}

/**
 * Everything this app keeps on this device: reminders turned off (their
 * server row with them), the iPhone app's own copy, then every key in this
 * site's storage. The caller reloads the app afterwards.
 */
export async function clearThisDevice(): Promise<void> {
  try {
    await disableReminders();
  } catch {
    /* nothing registered */
  }
  await clearNativeMirror();
  try {
    window.localStorage.clear();
    window.sessionStorage.clear();
  } catch {
    /* storage unavailable: nothing to clear */
  }
}
