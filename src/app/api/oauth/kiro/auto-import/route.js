import { NextResponse } from "next/server";
import { readKiroSsoCredentials } from "@/lib/oauth/services/kiroCredentials";

/**
 * GET /api/oauth/kiro/auto-import
 * Auto-detect and extract Kiro refresh token from AWS SSO cache
 */
export async function GET() {
  try {
    const creds = await readKiroSsoCredentials();

    if (!creds) {
      return NextResponse.json({
        found: false,
        error: "Kiro token not found in AWS SSO cache. Please login to Kiro IDE first.",
      });
    }

    return NextResponse.json({
      found: true,
      refreshToken: creds.refreshToken,
      authMethod: creds.authMethod || null,
      source: creds.source,
    });
  } catch (error) {
    console.log("Kiro auto-import error:", error);
    return NextResponse.json(
      { found: false, error: error.message },
      { status: 500 }
    );
  }
}
