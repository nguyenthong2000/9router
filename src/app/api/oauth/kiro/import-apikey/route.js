import { NextResponse } from "next/server";
import { validateKiroApiKey, isKiroApiKey } from "@/lib/oauth/services/kiroApiKey";
import { createProviderConnection } from "@/models";

/**
 * POST /api/oauth/kiro/import-apikey
 * Import one or more Kiro API keys (ksk_...).
 *
 * Accepts any of:
 *   { apiKey: "ksk_..." }
 *   { apiKeys: ["ksk_...", "ksk_..."] }
 *   { apiKeys: "ksk_...\nksk_...\nksk_..." }   (newline/comma/space separated)
 *
 * Each key is validated against Kiro's getUsageLimits endpoint (no credit
 * cost). Valid keys are saved as provider connections (authType "apikey").
 * Invalid keys are reported back without being saved, so the caller can show
 * a per-key result. The endpoint always returns 200 with a results array
 * unless the request itself is malformed.
 */

/** Split mixed single/array/multiline input into a deduped list of candidates. */
function collectKeys(body) {
  const raw = [];
  if (typeof body?.apiKey === "string") raw.push(body.apiKey);
  if (typeof body?.apiKeys === "string") raw.push(body.apiKeys);
  if (Array.isArray(body?.apiKeys)) {
    for (const k of body.apiKeys) {
      if (typeof k === "string") raw.push(k);
    }
  }

  const seen = new Set();
  const keys = [];
  for (const chunk of raw) {
    for (const piece of chunk.split(/[\s,]+/)) {
      const key = piece.trim();
      if (key && !seen.has(key)) {
        seen.add(key);
        keys.push(key);
      }
    }
  }
  return keys;
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const keys = collectKeys(body);
  if (keys.length === 0) {
    return NextResponse.json(
      { error: "Provide an apiKey or apiKeys (single value, array, or newline-separated list)" },
      { status: 400 }
    );
  }

  const results = [];
  let imported = 0;

  for (const key of keys) {
    const masked = key.length > 12 ? `${key.slice(0, 8)}…${key.slice(-4)}` : key;

    if (!isKiroApiKey(key)) {
      results.push({
        key: masked,
        success: false,
        error: "Not a Kiro API key (expected ksk_ prefix)",
      });
      continue;
    }

    const check = await validateKiroApiKey(key);
    if (!check.valid) {
      results.push({
        key: masked,
        success: false,
        error: check.error || `Validation failed (HTTP ${check.status})`,
      });
      continue;
    }

    try {
      const connection = await createProviderConnection({
        provider: "kiro",
        authType: "apikey",
        apiKey: key,
        name: check.email || `Kiro API Key (${masked})`,
        email: check.email || null,
        providerSpecificData: {
          authMethod: "api_key",
          provider: "API Key",
          planTitle: check.planTitle,
          planType: check.planType,
          creditsUsed: check.creditsUsed,
          creditsLimit: check.creditsLimit,
        },
        testStatus: "active",
      });

      imported += 1;
      results.push({
        key: masked,
        success: true,
        connection: {
          id: connection.id,
          provider: connection.provider,
          email: connection.email,
          name: connection.name,
        },
        plan: check.planTitle,
        creditsUsed: check.creditsUsed,
        creditsLimit: check.creditsLimit,
      });
    } catch (err) {
      // Validation passed but persistence failed (e.g. duplicate key).
      results.push({
        key: masked,
        success: false,
        error: err.message || "Failed to save connection",
        validated: true,
      });
    }
  }

  return NextResponse.json({
    success: imported > 0,
    total: keys.length,
    imported,
    failed: keys.length - imported,
    results,
  });
}
