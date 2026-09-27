import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

// A simple password in front of the whole demo: the browser's own sign-in
// prompt (HTTP Basic Auth), any username, the password in SITE_PASSWORD. Off
// when SITE_PASSWORD isn't set, so local dev stays open. It covers pages, the
// chat route, and Server Functions (they post to the page's route), not static
// assets. It's a gate for a lightly shared URL, not user accounts.

const same = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

export function proxy(request: NextRequest) {
  const password = process.env.SITE_PASSWORD;
  if (!password) return NextResponse.next();

  const [scheme, encoded] = (request.headers.get("authorization") ?? "").split(" ");
  if (scheme === "Basic" && encoded) {
    const decoded = Buffer.from(encoded, "base64").toString();
    if (same(decoded.slice(decoded.indexOf(":") + 1), password)) return NextResponse.next();
  }
  return new NextResponse("Password required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Ploy demo", charset="UTF-8"' },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
