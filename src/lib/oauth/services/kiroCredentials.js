import { readFile, readdir } from "fs/promises";
import { homedir } from "os";
import { join } from "path";

const KIRO_REFRESH_PREFIX = "aorAAAAAG";

/**
 * Read Kiro credentials from the local AWS SSO cache.
 *
 * Kiro stores its auth token in ~/.aws/sso/cache/kiro-auth-token.json.
 *
 * There are two refresh mechanisms depending on how the user signed in:
 *
 * 1. AWS Builder ID / IAM Identity Center (IdC / Enterprise)
 *    - token file has `authMethod` "builder-id"/"IdC" and a `clientIdHash`
 *    - must be refreshed against https://oidc.{region}.amazonaws.com/token
 *      using a clientId/clientSecret pair stored in a separate device
 *      registration file named after the hash: ~/.aws/sso/cache/{clientIdHash}.json
 *
 * 2. Social login (Google / GitHub)
 *    - no clientIdHash
 *    - refreshed against the Kiro desktop auth service
 *
 * Importing only the refresh token (and refreshing it against the social
 * endpoint) fails for Builder ID / IdC tokens with {"message":"Bad credentials"},
 * because those tokens are not valid for the social endpoint. This helper
 * recovers the extra metadata so the correct endpoint can be used.
 *
 * @param {string} [matchRefreshToken] When provided, only the cache entry whose
 *        refreshToken matches is returned, so a manually pasted token still
 *        resolves to the right metadata. When omitted, the first Kiro token
 *        found is returned (auto-detect).
 * @returns {Promise<null | {
 *   refreshToken: string,
 *   accessToken?: string,
 *   authMethod?: string,
 *   region?: string,
 *   clientId?: string,
 *   clientSecret?: string,
 *   profileArn?: string,
 *   source: string,
 * }>}
 */
export async function readKiroSsoCredentials(matchRefreshToken) {
  const cachePath = join(homedir(), ".aws/sso/cache");

  let files;
  try {
    files = await readdir(cachePath);
  } catch {
    return null;
  }

  // Prefer the canonical kiro-auth-token.json, then scan any other json file.
  const ordered = files
    .filter((f) => f.endsWith(".json"))
    .sort((a, b) => {
      if (a === "kiro-auth-token.json") return -1;
      if (b === "kiro-auth-token.json") return 1;
      return 0;
    });

  for (const file of ordered) {
    let data;
    try {
      const content = await readFile(join(cachePath, file), "utf-8");
      data = JSON.parse(content);
    } catch {
      continue;
    }

    const token = data?.refreshToken;
    if (!token || !token.startsWith(KIRO_REFRESH_PREFIX)) continue;
    if (matchRefreshToken && token !== matchRefreshToken) continue;

    const result = {
      refreshToken: token,
      accessToken: data.accessToken,
      authMethod: data.authMethod,
      region: data.region,
      profileArn: data.profileArn,
      source: file,
    };

    // Resolve AWS SSO OIDC client credentials (Builder ID / IdC) when present.
    if (data.clientIdHash) {
      try {
        const regPath = join(cachePath, `${data.clientIdHash}.json`);
        const reg = JSON.parse(await readFile(regPath, "utf-8"));
        result.clientId = reg.clientId;
        result.clientSecret = reg.clientSecret;
      } catch {
        // Device registration missing - fall back to social refresh.
      }
    }

    return result;
  }

  return null;
}
