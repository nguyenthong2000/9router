import { NextResponse } from "next/server";
import { createProviderConnection } from "@/models";
import { extractCodexAccountInfo } from "@/lib/oauth/providers";

/**
 * POST /api/oauth/codex/import-json
 * Import a full Codex CLI JSON credential file as an OAuth provider connection.
 * This creates a proper OAuth connection with refresh token support.
 *
 * Body: The full JSON object exported from Codex CLI, containing:
 *   - access_token (required)
 *   - refresh_token (required for OAuth refresh)
 *   - id_token (optional, used to extract email/account info)
 *   - expired / expires_at (optional, ISO string)
 *   - account_id (optional)
 *   - email (optional)
 *   - scope (optional)
 *   - token_type (optional)
 *   - oauth_start (optional, ignored - only used during OAuth flow)
 *   - type (optional, should be "codex")
 *   - name (optional, display name for the connection)
 */
export async function POST(request) {
  try {
    const body = await request.json();

    // Support both direct fields and nested structure
    const accessToken = body.access_token || body.accessToken;
    const refreshToken = body.refresh_token || body.refreshToken || body.rt;
    const idToken = body.id_token || body.idToken;

    if (!accessToken || typeof accessToken !== "string") {
      return NextResponse.json(
        { error: "access_token is required" },
        { status: 400 }
      );
    }

    if (!refreshToken || typeof refreshToken !== "string") {
      return NextResponse.json(
        { error: "refresh_token is required for OAuth import (use /import-token for access-token-only import)" },
        { status: 400 }
      );
    }

    // Extract account info from id_token or access_token
    let email = body.email || null;
    let chatgptAccountId = body.account_id || null;
    let chatgptPlanType = null;

    // Try extracting from id_token first (most reliable)
    if (idToken) {
      const info = extractCodexAccountInfo(idToken);
      if (info.email && !email) email = info.email;
      if (info.chatgptAccountId && !chatgptAccountId) chatgptAccountId = info.chatgptAccountId;
      if (info.chatgptPlanType) chatgptPlanType = info.chatgptPlanType;
    }

    // Fallback: extract from access_token JWT
    if (!email || !chatgptAccountId) {
      const info = extractCodexAccountInfo(accessToken);
      if (info.email && !email) email = info.email;
      if (info.chatgptAccountId && !chatgptAccountId) chatgptAccountId = info.chatgptAccountId;
      if (info.chatgptPlanType && !chatgptPlanType) chatgptPlanType = info.chatgptPlanType;
    }

    // Compute expiresAt from the JSON
    let expiresAt = null;
    if (body.expired) {
      expiresAt = body.expired;
    } else if (body.expires_at) {
      expiresAt = body.expires_at;
    } else if (body.created_at && body.access_token) {
      // Default: access tokens typically last 10 days for Codex
      const created = new Date(body.created_at);
      if (!isNaN(created.getTime())) {
        expiresAt = new Date(created.getTime() + 10 * 24 * 60 * 60 * 1000).toISOString();
      }
    }

    // Compute expiresIn (seconds from now)
    let expiresIn = null;
    if (expiresAt) {
      const exp = new Date(expiresAt);
      if (!isNaN(exp.getTime())) {
        expiresIn = Math.max(0, Math.floor((exp.getTime() - Date.now()) / 1000));
      }
    }

    // Build providerSpecificData
    const providerSpecificData = {};
    if (chatgptAccountId) providerSpecificData.chatgptAccountId = chatgptAccountId;
    if (chatgptPlanType) providerSpecificData.chatgptPlanType = chatgptPlanType;

    // Store oauth_start code_verifier in case needed for future token refresh
    if (body.oauth_start?.code_verifier) {
      providerSpecificData.codeVerifier = body.oauth_start.code_verifier;
    }
    if (body.authorization_code) {
      providerSpecificData.authorizationCode = body.authorization_code;
    }

    const connectionName = body.name || email || "Codex Import";

    // Save as OAuth connection (supports refresh)
    const connection = await createProviderConnection({
      provider: "codex",
      authType: "oauth",
      accessToken: accessToken.trim(),
      refreshToken: refreshToken.trim(),
      ...(idToken ? { idToken: idToken.trim() } : {}),
      email,
      name: connectionName,
      expiresAt,
      expiresIn,
      lastRefreshAt: body.last_refresh || body.created_at || new Date().toISOString(),
      scope: body.scope || "openid email profile offline_access",
      ...(Object.keys(providerSpecificData).length > 0 ? { providerSpecificData } : {}),
      testStatus: "active",
    });

    return NextResponse.json({
      success: true,
      connection: {
        id: connection.id,
        provider: connection.provider,
        email: connection.email,
        name: connection.name,
        workspace: chatgptAccountId || null,
        plan: chatgptPlanType || null,
        expiresAt,
        authType: "oauth",
      },
    });
  } catch (error) {
    console.log("Codex JSON import error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
