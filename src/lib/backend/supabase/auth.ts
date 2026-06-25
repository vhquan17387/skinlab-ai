import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import type { AuthBackend, AuthUser } from "@/lib/backend/types";

type CookieToSet = { name: string; value: string; options: CookieOptions };

function env() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    throw new Error("Supabase URL/anon key not set");
  }
  return { url, anon };
}

export class SupabaseAuthBackend implements AuthBackend {
  async signIn(
    email: string,
    password: string,
  ): Promise<{ ok: true; user: AuthUser } | { ok: false; error: string }> {
    const { url, anon } = env();
    const store = await cookies();
    const supabase = createServerClient(url, anon, {
      cookies: {
        getAll: () => store.getAll(),
        setAll: (toSet: CookieToSet[]) =>
          toSet.forEach(({ name, value, options }) =>
            store.set(name, value, options),
          ),
      },
    });
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error || !data.user) {
      return { ok: false, error: "Email hoặc mật khẩu không đúng" };
    }
    return {
      ok: true,
      user: { id: data.user.id, email: data.user.email ?? email },
    };
  }

  async signOut(): Promise<void> {
    const { url, anon } = env();
    const store = await cookies();
    const supabase = createServerClient(url, anon, {
      cookies: {
        getAll: () => store.getAll(),
        setAll: (toSet: CookieToSet[]) =>
          toSet.forEach(({ name, value, options }) =>
            store.set(name, value, options),
          ),
      },
    });
    await supabase.auth.signOut();
  }

  async getCurrentUser(): Promise<AuthUser | null> {
    const { url, anon } = env();
    const store = await cookies();
    const supabase = createServerClient(url, anon, {
      cookies: {
        getAll: () => store.getAll(),
        setAll: () => {},
      },
    });
    const { data } = await supabase.auth.getUser();
    if (!data.user) return null;
    return { id: data.user.id, email: data.user.email ?? "" };
  }

  // Official @supabase/ssr middleware pattern: refresh the session and gate
  // /admin/* on the presence of an authenticated user.
  async middleware(req: NextRequest): Promise<NextResponse> {
    const { url, anon } = env();
    let res = NextResponse.next({ request: req });

    const supabase = createServerClient(url, anon, {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (toSet: CookieToSet[]) => {
          toSet.forEach(({ name, value }) => req.cookies.set(name, value));
          res = NextResponse.next({ request: req });
          toSet.forEach(({ name, value, options }) =>
            res.cookies.set(name, value, options),
          );
        },
      },
    });

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { pathname } = req.nextUrl;
    const isLogin = pathname === "/admin/login";

    if (!user && !isLogin) {
      const redirectUrl = req.nextUrl.clone();
      redirectUrl.pathname = "/admin/login";
      redirectUrl.searchParams.set("next", pathname);
      return NextResponse.redirect(redirectUrl);
    }
    if (user && isLogin) {
      const redirectUrl = req.nextUrl.clone();
      redirectUrl.pathname = "/admin/submissions";
      redirectUrl.search = "";
      return NextResponse.redirect(redirectUrl);
    }
    return res;
  }
}
