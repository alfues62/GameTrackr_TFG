import type { NextAuthOptions, User } from "next-auth";
import type { JWT } from "next-auth/jwt";
import CredentialsProvider from "next-auth/providers/credentials";

const ACCESS_TOKEN_TTL_MS = 55 * 60 * 1000;

const API_URL =
  process.env.API_INTERNAL_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:8000";

function buildUser(
  djangoUser: { id: number; username: string; email: string; avatar_url?: string | null },
  access: string,
  refresh: string,
): User {
  return {
    id: String(djangoUser.id),
    name: djangoUser.username,
    email: djangoUser.email,
    image: djangoUser.avatar_url ?? null,
    username: djangoUser.username,
    accessToken: access,
    refreshToken: refresh,
  };
}

async function refreshAccessToken(token: JWT): Promise<JWT> {
  try {
    const res = await fetch(`${API_URL}/api/auth/token/refresh/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh: token.refreshToken }),
    });
    if (!res.ok) throw new Error("refresh failed");
    const data = await res.json(); // { access, refresh? }
    return {
      ...token,
      accessToken: data.access,
      refreshToken: data.refresh ?? token.refreshToken,
      accessTokenExpires: Date.now() + ACCESS_TOKEN_TTL_MS,
      error: undefined,
    };
  } catch (err) {
    console.error("[auth] No se pudo renovar el token:", err);
    return { ...token, error: "RefreshAccessTokenError" };
  }
}

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  secret: process.env.NEXTAUTH_SECRET,
  providers: [
    CredentialsProvider({
      id: "credentials",
      name: "Email",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Contraseña", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        try {
          const res = await fetch(`${API_URL}/api/auth/login/`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email: credentials.email,
              password: credentials.password,
            }),
          });

          if (!res.ok) return null;
          const data = await res.json();
          return buildUser(data.user, data.access, data.refresh);
        } catch (err) {
          console.error("[auth] No se pudo contactar con el backend en", API_URL, err);
          return null;
        }
      },
    }),
    CredentialsProvider({
      id: "social",
      name: "Social",
      credentials: {
        access: { label: "Access", type: "text" },
        refresh: { label: "Refresh", type: "text" },
      },
      async authorize(credentials) {
        if (!credentials?.access) return null;

        try {
          const res = await fetch(`${API_URL}/api/auth/me/`, {
            headers: { Authorization: `Bearer ${credentials.access}` },
          });

          if (!res.ok) return null;
          const me = await res.json();
          return buildUser(me, credentials.access, credentials.refresh ?? "");
        } catch (err) {
          console.error("[auth] No se pudo contactar con el backend en", API_URL, err);
          return null;
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.accessToken = user.accessToken;
        token.refreshToken = user.refreshToken;
        token.username = user.username ?? user.name ?? undefined;
        token.picture = user.image ?? null;
        token.accessTokenExpires = Date.now() + ACCESS_TOKEN_TTL_MS;
        return token;
      }

      if (token.accessTokenExpires && Date.now() < token.accessTokenExpires) {
        return token;
      }

      return refreshAccessToken(token);
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken;
      session.error = token.error;
      if (session.user) {
        session.user.id = token.sub;
        session.user.username = token.username;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
};
