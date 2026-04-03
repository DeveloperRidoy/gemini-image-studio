import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import type { JWT } from "next-auth/jwt";
import { isAllowedEmail } from "@/lib/allowed-emails";
import { refreshGoogleAccessToken } from "@/lib/google-refresh-access-token";

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      authorization: {
        params: {
          scope:
            "openid email profile https://www.googleapis.com/auth/drive.file",
          access_type: "offline",
        },
      },
    }),
  ],
  pages: {
    error: "/auth/error",
  },
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider !== "google") return false;
      if (!isAllowedEmail(user?.email)) return false;
      return true;
    },
    async jwt({ token, account }): Promise<JWT> {
      if (account?.provider === "google") {
        const now = Math.floor(Date.now() / 1000);
        const expiresAt =
          typeof account.expires_at === "number"
            ? account.expires_at
            : now + Number(account.expires_in ?? 3599);
        return {
          ...token,
          access_token: account.access_token,
          refresh_token: account.refresh_token ?? token.refresh_token,
          expires_at: expiresAt,
          error: undefined,
        };
      }

      const t = token as JWT;
      if (t.error === "RefreshAccessTokenError") {
        return t;
      }

      const exp = t.expires_at;
      if (typeof exp === "number" && Date.now() / 1000 < exp - 120) {
        return t;
      }

      if (t.refresh_token) {
        return refreshGoogleAccessToken(t);
      }

      return t;
    },
  },
});
