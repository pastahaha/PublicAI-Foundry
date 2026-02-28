import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { NextRequest } from "next/server";

export interface SessionPayload {
  userId: string;
  email: string;
  name: string;
}

const SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "fallback-secret-change-in-production"
);

const SESSION_COOKIE = "session";
const SESSION_DURATION = 60 * 60 * 24 * 7; // 7 days in seconds

export async function signToken(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION}s`)
    .sign(SECRET);
}

export async function verifyToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifyToken(token);
}

export async function getSessionFromRequest(req: NextRequest): Promise<SessionPayload | null> {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifyToken(token);
}

// Use secure cookies only when the app is explicitly served over HTTPS.
// In Docker (HTTP), secure:true prevents the browser from storing/sending the cookie.
const IS_HTTPS = (process.env.NEXTAUTH_URL || "").startsWith("https://");

export function createSessionCookie(token: string) {
  return {
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    secure: IS_HTTPS,
    sameSite: "lax" as const,
    maxAge: SESSION_DURATION,
    path: "/",
  };
}

export function clearSessionCookie() {
  return {
    name: SESSION_COOKIE,
    value: "",
    httpOnly: true,
    secure: IS_HTTPS,
    sameSite: "lax" as const,
    maxAge: 0,
    path: "/",
  };
}
