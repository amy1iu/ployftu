import { NextResponse, type NextRequest } from "next/server";
import { PASS_COOKIE, passKey, sitePassword } from "@/lib/site-password";

// A simple password in front of the whole demo: pages send you to /unlock (one
// field, no username) until the cookie it sets is there. The chat route and
// Server Functions (they post to the page's route) are refused instead. Off
// when SITE_PASSWORD isn't set, so local dev stays open. It's a gate for a
// lightly shared URL, not user accounts.

export function proxy(request: NextRequest) {
  const password = sitePassword();
  if (!password) return NextResponse.next();

  const { pathname, search } = request.nextUrl;
  if (pathname === "/unlock" || request.cookies.get(PASS_COOKIE)?.value === passKey(password)) return NextResponse.next();

  if (request.method !== "GET" || pathname.startsWith("/api/")) return new NextResponse("Password required", { status: 401 });
  const unlock = new URL("/unlock", request.url);
  if (pathname !== "/") unlock.searchParams.set("next", pathname + search);
  return NextResponse.redirect(unlock);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
