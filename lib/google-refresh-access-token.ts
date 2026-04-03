import type { JWT } from "next-auth/jwt";

type TokenWithGoogle = JWT & {
  access_token?: string;
  refresh_token?: string;
  expires_at?: number;
};

export async function refreshGoogleAccessToken(
  token: TokenWithGoogle,
): Promise<TokenWithGoogle> {
  const refresh = token.refresh_token;
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!refresh || !clientId || !clientSecret) {
    return { ...token, error: "RefreshAccessTokenError" };
  }

  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "refresh_token",
        refresh_token: refresh,
      }),
    });

    const json = (await res.json()) as {
      access_token?: string;
      expires_in?: number;
      refresh_token?: string;
      error?: string;
    };

    if (!res.ok || !json.access_token) {
      return { ...token, error: "RefreshAccessTokenError" };
    }

    const expiresAt = Math.floor(Date.now() / 1000 + (json.expires_in ?? 3600));

    return {
      ...token,
      access_token: json.access_token,
      expires_at: expiresAt,
      refresh_token: json.refresh_token ?? token.refresh_token,
      error: undefined,
    };
  } catch {
    return { ...token, error: "RefreshAccessTokenError" };
  }
}
