import { NextResponse } from "next/server";
import { SignJWT } from "jose";

const SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "fallback-secret-change-in-production"
);

export async function GET() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: "Google OAuth not configured" }, { status: 503 });
  }

  // Generate a CSRF state token
  const state = await new SignJWT({ csrf: true })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("10m")
    .sign(SECRET);

  const redirectUri = `${process.env.NEXTAUTH_URL || "http://localhost:3000"}/api/auth/google/callback`;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    access_type: "offline",
    prompt: "consent",
  });

  const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

  return NextResponse.redirect(googleAuthUrl);
}
