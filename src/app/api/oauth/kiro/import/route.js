import { NextResponse } from "next/server";
import { KiroService } from "@/lib/oauth/services/kiro";
import { readKiroSsoCredentials } from "@/lib/oauth/services/kiroCredentials";
import { putPendingKiroImport, takePendingKiroImport } from "@/lib/oauth/services/kiroPendingImport";
import { createProviderConnection } from "@/models";

/**
 * POST /api/oauth/kiro/import
 * Import and validate refresh token from Kiro IDE.
 *
 * Two-phase flow when an account exposes more than one CodeWhisperer profile:
 *  1. Initial call ({ refreshToken }) validates the token once. If multiple
 *     profiles exist it returns { needsProfileSelection, selectionId, profiles }
 *     WITHOUT saving, and stashes the already-refreshed tokens server-side.
 *  2. Selection call ({ selectionId, profileArn }) saves the connection using
 *     the stashed tokens and the chosen profile - no second token refresh, so
 *     a rotating AWS SSO refresh token is never spent twice.
 *
 * The selection call is shared with the device-code flow (Builder ID / IdC),
 * which stashes its own pending entry and confirms through this same route.
 */

const kiroService = () => new KiroService();

/**
 * Save a Kiro connection from a unified pending payload + chosen profile.
 */
async function saveFromPending(pending, chosenProfile) {
  const svc = kiroService();
  const email = svc.extractEmailFromJWT(pending.accessToken);
  const psd = {
    ...pending.providerSpecificData,
    profileArn: chosenProfile?.arn || pending.providerSpecificData?.profileArn || null,
    region: chosenProfile?.region || pending.providerSpecificData?.region || null,
  };

  const connection = await createProviderConnection({
    provider: "kiro",
    authType: "oauth",
    accessToken: pending.accessToken,
    refreshToken: pending.refreshToken,
    expiresAt: new Date(Date.now() + (pending.expiresIn || 3600) * 1000).toISOString(),
    email: email || null,
    providerSpecificData: psd,
    testStatus: "active",
  });

  return NextResponse.json({
    success: true,
    connection: {
      id: connection.id,
      provider: connection.provider,
      email: connection.email,
    },
  });
}

export async function POST(request) {
  try {
    const { refreshToken, selectionId, profileArn } = await request.json();

    // ── Phase 2: confirm a pending multi-profile import (import OR device-code) ──
    if (selectionId && profileArn) {
      const pending = takePendingKiroImport(selectionId);
      if (!pending) {
        return NextResponse.json(
          { error: "Profile selection expired. Please connect again." },
          { status: 410 }
        );
      }
      const chosen = (pending.profiles || []).find(p => p.arn === profileArn);
      if (!chosen) {
        return NextResponse.json({ error: "Invalid profile selection" }, { status: 400 });
      }
      return await saveFromPending(pending, chosen);
    }

    // ── Phase 1: initial import ──
    if (!refreshToken || typeof refreshToken !== "string") {
      return NextResponse.json(
        { error: "Refresh token is required" },
        { status: 400 }
      );
    }

    const token = refreshToken.trim();
    const svc = kiroService();

    // Recover auth metadata from the local AWS SSO cache. Builder ID / IdC
    // tokens must be refreshed against the AWS SSO OIDC endpoint using a
    // clientId/clientSecret pair; without it the request hits the social
    // endpoint and fails with {"message":"Bad credentials"}.
    let resolved = {};
    try {
      const creds = await readKiroSsoCredentials(token);
      if (creds) {
        resolved = {
          authMethod: creds.authMethod,
          clientId: creds.clientId,
          clientSecret: creds.clientSecret,
          region: creds.region,
          profileArn: creds.profileArn,
        };
      }
    } catch {
      // Best effort - fall back to social refresh.
    }

    // Validate and refresh token (routes to AWS SSO OIDC or social endpoint).
    const tokenData = await svc.validateImportToken(token, resolved);

    const providerSpecificData = {
      authMethod: resolved.authMethod || "imported",
      clientId: resolved.clientId || null,
      clientSecret: resolved.clientSecret || null,
      region: resolved.region || null,
      provider: resolved.clientId ? "Imported (AWS SSO)" : "Imported",
    };

    // Determine the profileArn. Builder ID / IdC accounts require it on every
    // CodeWhisperer call (otherwise 403 "User is not authorized to make this
    // call"); it is not stored in the token file.
    let profile = tokenData.profileArn || resolved.profileArn || null;
    let region = resolved.region || null;

    if (!profile && tokenData.accessToken) {
      let profiles = [];
      try {
        profiles = await svc.listAllProfiles(tokenData.accessToken, region || "us-east-1");
      } catch {
        profiles = [];
      }

      if (profiles.length > 1) {
        // Multiple profiles - let the user choose. Stash the refreshed tokens
        // so we don't refresh again on the follow-up request.
        const id = putPendingKiroImport({
          accessToken: tokenData.accessToken,
          refreshToken: tokenData.refreshToken,
          expiresIn: tokenData.expiresIn,
          providerSpecificData,
          profiles,
        });
        return NextResponse.json({
          needsProfileSelection: true,
          selectionId: id,
          profiles: profiles.map(p => ({
            arn: p.arn,
            profileName: p.profileName || null,
            region: p.region || null,
          })),
        });
      }

      if (profiles.length === 1) {
        profile = profiles[0].arn;
        region = profiles[0].region || region;
      }
    }

    return await saveFromPending(
      {
        accessToken: tokenData.accessToken,
        refreshToken: tokenData.refreshToken,
        expiresIn: tokenData.expiresIn,
        providerSpecificData,
      },
      profile ? { arn: profile, region } : null
    );
  } catch (error) {
    console.log("Kiro import token error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
