import { randomUUID } from "crypto";

/**
 * Short-lived, in-process store for pending Kiro connections that are waiting
 * on a profile choice (when an account exposes more than one CodeWhisperer
 * profile).
 *
 * Both the import flow (paste / auto-detect) and the device-code flow
 * (Builder ID / IAM Identity Center) stash the already-refreshed tokens here
 * and return a selectionId to the UI. The UI then confirms with the chosen
 * profileArn via POST /api/oauth/kiro/import, which consumes the pending entry
 * and saves the connection - so the refresh token is never spent twice.
 *
 * Pending shape:
 *   {
 *     accessToken, refreshToken, expiresIn,
 *     providerSpecificData: { authMethod, clientId, clientSecret, region, startUrl?, provider? },
 *     profiles: [{ arn, profileName, region }],
 *   }
 */

const PENDING_TTL_MS = 5 * 60 * 1000;

/** @type {Map<string, { data: object, expiresAt: number }>} */
const store = new Map();

function cleanup() {
  const now = Date.now();
  for (const [k, v] of store) {
    if (v.expiresAt < now) store.delete(k);
  }
}

export function putPendingKiroImport(data) {
  cleanup();
  const id = randomUUID();
  store.set(id, { data, expiresAt: Date.now() + PENDING_TTL_MS });
  return id;
}

export function takePendingKiroImport(id) {
  const entry = store.get(id);
  if (!entry) return null;
  store.delete(id);
  if (entry.expiresAt < Date.now()) return null;
  return entry.data;
}
