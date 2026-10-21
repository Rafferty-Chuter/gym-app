/**
 * Server-only account administration (TR1) with the service-role key:
 * check whose sign-in token a request carries, and delete that account.
 * Supabase Auth checks the token (signature, expiry, a user that still
 * exists), so nothing here trusts a user id sent by the device. Never logs
 * tokens or values (CLAUDE.md rule 10).
 */

import { createClient } from "@supabase/supabase-js";
import { supabaseConfig } from "@/lib/server/supabaseRest";

export type AccountAdmin = {
  /** The account the token belongs to; null when the token is not a valid, current sign-in. Throws when Auth can't be reached. */
  userFromToken(jwt: string): Promise<{ id: string } | null>;
  /** Delete the account for good. Rows that reference it (`sync_records`) go with it. */
  deleteUser(id: string): Promise<void>;
};

/** Statuses with which Auth says "not a valid sign-in" rather than "couldn't answer". */
const REJECTED = new Set([400, 401, 403, 404]);

/** The admin client, or null when the server has no Supabase keys. */
export function accountAdmin(): AccountAdmin | null {
  const cfg = supabaseConfig();
  if (!cfg) return null;
  const sb = createClient(cfg.url, cfg.key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  return {
    async userFromToken(jwt) {
      const { data, error } = await sb.auth.getUser(jwt);
      if (error) {
        if (error.status != null && REJECTED.has(error.status)) return null;
        throw new Error(`auth check failed: ${error.status ?? "network"}`);
      }
      return data.user ? { id: data.user.id } : null;
    },
    async deleteUser(id) {
      const { error } = await sb.auth.admin.deleteUser(id);
      if (error) throw new Error(`user delete failed: ${error.status ?? "network"}`);
    },
  };
}
