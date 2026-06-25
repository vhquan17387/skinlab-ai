import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import type { AuthBackend, AuthUser } from "@/lib/backend/types";
import { signSession, verifySession } from "./sign";

const COOKIE_NAME = "session";

interface SessionPayload {
  sub: string;
  exp: number;
}

function getSecret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("SESSION_SECRET is not set");
  return s;
}

function sessionTtl(): number {
  return Number(process.env.SESSION_TTL || 28800);
}

async function parseToken(token: string | undefined): Promise<AuthUser | null> {
  if (!token) return null;
  const payload = await verifySession<SessionPayload>(token, getSecret());
  if (!payload) return null;
  if (Math.floor(Date.now() / 1000) > payload.exp) return null;
  return { id: payload.sub, email: payload.sub };
}

export class LocalAuthBackend implements AuthBackend {
  async signIn(
    email: string,
    password: string,
  ): Promise<{ ok: true; user: AuthUser } | { ok: false; error: string }> {
    const adminEmail = process.env.ADMIN_EMAIL;
    const adminPassword = process.env.ADMIN_PASSWORD;
    if (!adminEmail || !adminPassword) {
      return { ok: false, error: "Admin credentials not configured" };
    }
    if (email.trim().toLowerCase() !== adminEmail.toLowerCase() || password !== adminPassword) {
      return { ok: false, error: "Email hoặc mật khẩu không đúng" };
    }

    const exp = Math.floor(Date.now() / 1000) + sessionTtl();
    const token = await signSession({ sub: adminEmail, exp }, getSecret());

    const store = await cookies();
    store.set(COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: sessionTtl(),
    });
    return { ok: true, user: { id: adminEmail, email: adminEmail } };
  }

  async signOut(): Promise<void> {
    const store = await cookies();
    store.delete(COOKIE_NAME);
  }

  async getCurrentUser(): Promise<AuthUser | null> {
    const store = await cookies();
    return parseToken(store.get(COOKIE_NAME)?.value);
  }

  async middleware(req: NextRequest): Promise<NextResponse> {
    const { pathname } = req.nextUrl;
    const isLogin = pathname === "/admin/login";
    const user = await parseToken(req.cookies.get(COOKIE_NAME)?.value);

    if (!user && !isLogin) {
      const url = req.nextUrl.clone();
      url.pathname = "/admin/login";
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }
    if (user && isLogin) {
      const url = req.nextUrl.clone();
      url.pathname = "/admin/submissions";
      url.search = "";
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }
}
