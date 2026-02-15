import { NextRequest, NextResponse } from "next/server";

// For server-side calls inside Docker, use the internal backend URL
// BACKEND_INTERNAL_URL is set in docker-compose for container-to-container calls
const INTERNAL_API_URL = process.env.BACKEND_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");

  if (!code || !state) {
    return NextResponse.redirect(
      new URL("/dashboard/settings?error=missing_params", request.url)
    );
  }

  // Forward the callback to the backend
  const backendUrl = `${INTERNAL_API_URL}/api/oauth/google/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`;

  try {
    const response = await fetch(backendUrl, { redirect: "manual" });

    // The backend returns a redirect — extract and use it
    const location = response.headers.get("location");
    if (location) {
      // Ensure redirect goes to localhost (not Docker internal hostname)
      const redirectUrl = location.replace(/http:\/\/0\.0\.0\.0:\d+/, "");
      return NextResponse.redirect(new URL(redirectUrl, request.url));
    }

    return NextResponse.redirect(
      new URL("/dashboard/settings?connected=google", request.url)
    );
  } catch {
    return NextResponse.redirect(
      new URL("/dashboard/settings?error=callback_failed", request.url)
    );
  }
}
