import { NextRequest, NextResponse } from "next/server";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

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
  const backendUrl = `${API_URL}/api/oauth/microsoft/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`;

  try {
    const response = await fetch(backendUrl, { redirect: "manual" });

    const location = response.headers.get("location");
    if (location) {
      return NextResponse.redirect(new URL(location, request.url));
    }

    return NextResponse.redirect(
      new URL("/dashboard/settings?connected=microsoft", request.url)
    );
  } catch {
    return NextResponse.redirect(
      new URL("/dashboard/settings?error=callback_failed", request.url)
    );
  }
}
