/**
 * NextAuth v5 (Auth.js) configuration with custom Strava OAuth provider.
 *
 * Strava is the sole identity + data source for v1.
 * Tokens are persisted (encrypted) into `StravaToken` so the worker can refresh.
 */

import NextAuth from "next-auth";
import { prisma } from "@coaching/db";
import { encryptToken } from "@/server/crypto";
import { stravaSyncQueue } from "@/server/queues";

const STRAVA_AUTH_URL = "https://www.strava.com/oauth/authorize";
const STRAVA_TOKEN_URL = "https://www.strava.com/oauth/token";

export const { handlers, auth, signIn, signOut } = NextAuth({
  // No DB adapter: we use JWT sessions and upsert the User row ourselves
  // in the signIn callback. Our schema does not have NextAuth's
  // Account/Session tables (Strava is the sole identity).
  session: { strategy: "jwt" },
  trustHost: true,
  providers: [
    {
      id: "strava",
      name: "Strava",
      type: "oauth",
      authorization: {
        url: STRAVA_AUTH_URL,
        params: {
          scope: "read,activity:read_all,profile:read_all",
          approval_prompt: "auto",
          response_type: "code",
        },
      },
      token: STRAVA_TOKEN_URL,
      clientId: process.env.STRAVA_CLIENT_ID,
      clientSecret: process.env.STRAVA_CLIENT_SECRET,
      // Strava's token endpoint requires credentials in the POST body
      // (not HTTP Basic). Auth.js defaults to client_secret_basic.
      client: { token_endpoint_auth_method: "client_secret_post" },
      checks: ["pkce"],
      userinfo: "https://www.strava.com/api/v3/athlete",
      profile(profile: {
        id: number;
        firstname?: string;
        lastname?: string;
        profile?: string;
        sex?: string;
      }) {
        return {
          id: String(profile.id),
          name: [profile.firstname, profile.lastname].filter(Boolean).join(" ") || `Strava ${profile.id}`,
          image: profile.profile,
          email: null,
        };
      },
    },
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      if (account?.provider !== "strava" || !user.id) return false;
      // Ensure a User row exists for the FK on StravaToken (no adapter).
      await prisma.user.upsert({
        where: { id: user.id },
        create: {
          id: user.id,
          name: user.name ?? null,
          image: user.image ?? null,
          stravaAthleteId: BigInt((profile as { id?: number } | undefined)?.id ?? Number(user.id)),
        },
        update: {
          name: user.name ?? undefined,
          image: user.image ?? undefined,
        },
      });
      // Persist (encrypted) Strava tokens for the worker to use
      if (account.access_token && account.refresh_token && account.expires_at) {
        await prisma.stravaToken.upsert({
          where: { userId: user.id },
          create: {
            userId: user.id,
            accessTokenEnc: await encryptToken(account.access_token),
            refreshTokenEnc: await encryptToken(account.refresh_token),
            expiresAt: new Date(account.expires_at * 1000),
            scope: (account.scope as string | undefined) ?? "",
          },
          update: {
            accessTokenEnc: await encryptToken(account.access_token),
            refreshTokenEnc: await encryptToken(account.refresh_token),
            expiresAt: new Date(account.expires_at * 1000),
            scope: (account.scope as string | undefined) ?? "",
          },
        });
        // Kick off an initial Strava sync in the background. Deduped on the
        // worker side because BullMQ jobs for a fresh user finish in seconds
        // and we use a stable jobId per user for the first-ever sync.
        try {
          await stravaSyncQueue.add(
            "post-signin",
            { userId: user.id },
            { jobId: `signin:${user.id}`, removeOnComplete: 100, removeOnFail: 50 },
          );
        } catch (err) {
          // Don't block sign-in if Redis is unavailable; the user can hit
          // "Sync now" from the dashboard once infra is back.
          console.warn("[auth] failed to enqueue post-signin sync:", err);
        }
      }
      return true;
    },
    async jwt({ token, user }) {
      if (user?.id) token.userId = user.id;
      return token;
    },
    async session({ session, token }) {
      if (token.userId && session.user) {
        (session.user as { id?: string }).id = token.userId as string;
      }
      return session;
    },
  },
});
