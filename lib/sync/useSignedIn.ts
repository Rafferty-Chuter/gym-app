"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/sync/client";

/**
 * Whether this device is signed in to an account (TR12), for copy that
 * differs once it is ("Your log is kept in your account"). False while
 * accounts are off or before the session is read, so the signed-out
 * wording is the default. Follows sign-in and sign-out as they happen.
 */
export function useSignedIn(): boolean {
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    const sb = supabase();
    if (!sb) return;
    void sb.auth.getSession().then(({ data }) => setSignedIn(data.session != null));
    const sub = sb.auth.onAuthStateChange((_e, session) => setSignedIn(session != null));
    return () => sub.data.subscription.unsubscribe();
  }, []);
  return signedIn;
}
