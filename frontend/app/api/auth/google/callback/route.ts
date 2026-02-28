import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { db } from "@/lib/db";
import { signToken, createSessionCookie } from "@/lib/auth";

const SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "fallback-secret-change-in-production"
);

// Always use NEXTAUTH_URL for redirects — never req.url, which inside Docker
// resolves to the container's internal hostname instead of localhost.
const BASE_URL = process.env.NEXTAUTH_URL || "http://localhost:3000";

function redirect(path: string) {
  return NextResponse.redirect(`${BASE_URL}${path}`);
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  if (error) {
    return redirect("/login?error=google_cancelled");
  }

  // Verify CSRF state
  try {
    await jwtVerify(state || "", SECRET);
  } catch {
    return redirect("/login?error=invalid_state");
  }

  const clientId = process.env.GOOGLE_CLIENT_ID!;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET!;
  const redirectUri = `${BASE_URL}/api/auth/google/callback`;

  // Exchange code for tokens
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: code || "",
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenRes.ok) {
    return redirect("/login?error=token_exchange");
  }

  const tokens = await tokenRes.json();

  // Get user info from Google
  const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });

  if (!userInfoRes.ok) {
    return redirect("/login?error=userinfo");
  }

  const googleUser = await userInfoRes.json();

  // Find or create user
  let user = await db.user.findUnique({ where: { email: googleUser.email } });
  if (!user) {
    user = await db.user.create({
      data: {
        name: googleUser.name,
        email: googleUser.email,
        image: googleUser.picture,
      },
    });
  }

  const token = await signToken({ userId: user.id, email: user.email, name: user.name });
  const cookie = createSessionCookie(token);

  const response = NextResponse.redirect(`${BASE_URL}/dashboard`);
  response.cookies.set(cookie);
  return response;
}
