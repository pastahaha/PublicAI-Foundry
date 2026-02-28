import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";

const PROTECTED_PATHS = ["/dashboard", "/agents", "/playground", "/settings"];
const AUTH_PATHS = ["/login", "/signup"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isProtected = PROTECTED_PATHS.some((p) => pathname.startsWith(p));
  const isAuth = AUTH_PATHS.some((p) => pathname.startsWith(p));

  const session = await getSessionFromRequest(req);

  if (isProtected && !session) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  if (isAuth && session) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\..*|$).*)",
  ],
};
