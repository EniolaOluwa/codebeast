import { type NextRequest, NextResponse } from "next/server";

const API_BASE =
  process.env.API_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:3001";

const REFRESH_MAX_AGE = 60 * 60 * 24 * 14;

/**
 * Session middleware (ADR-010): dashboard routes require a session; an
 * expired access token is refreshed server-side (rotation happens in one
 * place) and the refreshed cookies are passed to the request *and* the
 * response so server components see them immediately.
 */
export async function middleware(request: NextRequest) {
  const accessToken = request.cookies.get("cb_access")?.value;
  const refreshToken = request.cookies.get("cb_refresh")?.value;

  if (!accessToken && !refreshToken) {
    return redirectToLogin(request, false);
  }

  if (!accessToken && refreshToken) {
    try {
      const response = await fetch(`${API_BASE}/v1/auth/refresh`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ refreshToken }),
        cache: "no-store",
      });

      if (response.ok) {
        const tokens = (await response.json()) as {
          accessToken: string;
          refreshToken: string;
          expiresIn: number;
        };

        request.cookies.set("cb_access", tokens.accessToken);
        request.cookies.set("cb_refresh", tokens.refreshToken);

        const next = NextResponse.next({ request });
        next.cookies.set("cb_access", tokens.accessToken, {
          httpOnly: true,
          sameSite: "lax",
          path: "/",
          maxAge: tokens.expiresIn,
        });
        next.cookies.set("cb_refresh", tokens.refreshToken, {
          httpOnly: true,
          sameSite: "lax",
          path: "/",
          maxAge: REFRESH_MAX_AGE,
        });

        return next;
      }
    } catch {
      // fall through to a clean re-login
    }

    return redirectToLogin(request, true);
  }

  return NextResponse.next();
}

function redirectToLogin(request: NextRequest, expired: boolean) {
  const url = new URL("/login", request.url);

  if (expired) {
    url.searchParams.set("expired", "1");
  } else {
    url.searchParams.set("next", request.nextUrl.pathname);
  }

  const response = NextResponse.redirect(url);
  response.cookies.delete("cb_access");
  response.cookies.delete("cb_refresh");

  return response;
}

export const config = {
  matcher: [
    "/overview/:path*",
    "/issues/:path*",
    "/sources/:path*",
    "/settings/:path*",
  ],
};
