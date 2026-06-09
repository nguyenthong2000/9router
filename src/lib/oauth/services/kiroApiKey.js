/**
 * Kiro API Key (ksk_) support.
 *
 * Unlike the OAuth/Builder-ID flow (refresh token starting with aorAAAAAG),
 * a Kiro API key is a long-lived credential created in the Kiro web console
 * (Pro / Pro+ / Power plans) and surfaced to the CLI via the KIRO_API_KEY
 * environment variable. It is used DIRECTLY as a bearer token; no token
 * exchange is required. The only extra requirement versus an OAuth access
 * token is the `tokentype: API_KEY` header, without which CodeWhisperer
 * rejects the request with 403 "The bearer token included in the request is
 * invalid."
 *
 *   Authorization: Bearer ksk_...
 *   tokentype: API_KEY
 */

const KIRO_API_KEY_PREFIX = "ksk_";

// Region-agnostic REST host used for account metadata (no credit cost).
const KIRO_REST_HOST = "https://codewhisperer.us-east-1.amazonaws.com";

/**
 * Whether a string looks like a Kiro API key. We are lenient on the body
 * (only the prefix is checked) so a future prefix change still imports, but
 * the prefix is the strongest signal we have to distinguish it from an
 * aorAAAAAG refresh token or a raw JWT access token.
 */
export function isKiroApiKey(value) {
  return typeof value === "string" && value.trim().startsWith(KIRO_API_KEY_PREFIX);
}

/**
 * Build the headers used for every API-key authenticated Kiro request.
 * `tokentype: API_KEY` is the load-bearing header here.
 */
export function buildKiroApiKeyHeaders(apiKey) {
  return {
    "Authorization": `Bearer ${apiKey}`,
    "tokentype": "API_KEY",
    "Content-Type": "application/json",
    "User-Agent": "aws-sdk-js/1.0.27 KiroIDE-0.7.45",
    "x-amzn-codewhisperer-optout": "true",
  };
}

/**
 * Validate a Kiro API key by calling getUsageLimits, which is a read-only
 * endpoint that consumes no credits and returns the account email, plan and
 * credit usage. A 200 means the key is live.
 *
 * @param {string} apiKey
 * @param {object} [options]
 * @param {number} [options.timeoutMs=15000]
 * @returns {Promise<{
 *   valid: boolean,
 *   status: number,
 *   email: string|null,
 *   planTitle: string|null,
 *   planType: string|null,
 *   creditsUsed: number|null,
 *   creditsLimit: number|null,
 *   error: string|null,
 * }>}
 */
export async function validateKiroApiKey(apiKey, options = {}) {
  const { timeoutMs = 15000 } = options;
  const key = (apiKey || "").trim();

  const base = {
    valid: false,
    status: 0,
    email: null,
    planTitle: null,
    planType: null,
    creditsUsed: null,
    creditsLimit: null,
    error: null,
  };

  if (!key) {
    return { ...base, error: "API key is empty" };
  }

  const url =
    `${KIRO_REST_HOST}/getUsageLimits` +
    `?origin=AI_EDITOR&resourceType=AGENTIC_REQUEST&isEmailRequired=true`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: buildKiroApiKeyHeaders(key),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    const aborted = err?.name === "AbortError";
    return { ...base, error: aborted ? "Request timed out" : err.message };
  }
  clearTimeout(timer);

  const status = response.status;
  const text = await response.text().catch(() => "");

  if (!response.ok) {
    let message = `HTTP ${status}`;
    try {
      const parsed = JSON.parse(text);
      if (parsed?.message) message = parsed.message;
    } catch {
      if (text) message = text.slice(0, 200);
    }
    return { ...base, status, error: message };
  }

  // Parse the usage payload for display metadata. AWS returns scientific
  // notation for some numbers (e.g. 1.782864E9), which JSON.parse handles.
  let data = {};
  try {
    data = JSON.parse(text);
  } catch {
    // A 200 with an unparseable body still means the key authenticated.
    return { ...base, valid: true, status };
  }

  const credit = (data.usageBreakdownList || []).find(
    (u) => u?.resourceType === "CREDIT"
  );

  return {
    valid: true,
    status,
    email: data?.userInfo?.email || null,
    planTitle: data?.subscriptionInfo?.subscriptionTitle || null,
    planType: data?.subscriptionInfo?.type || null,
    creditsUsed: credit ? credit.currentUsage ?? null : null,
    creditsLimit: credit ? credit.usageLimit ?? null : null,
    error: null,
  };
}
