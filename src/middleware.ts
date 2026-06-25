import type { NextRequest } from "next/server";
import { getAuthBackend } from "@/lib/backend/auth";

// IMPORTANT: this runs on the Edge runtime — getAuthBackend() must not pull in
// `pg`. The auth factory imports only auth implementations.
export async function middleware(req: NextRequest) {
  return getAuthBackend().middleware(req);
}

export const config = {
  matcher: ["/admin/:path*"],
};
