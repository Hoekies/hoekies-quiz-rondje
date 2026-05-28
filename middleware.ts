import { NextResponse, type NextRequest } from "next/server";

// Middleware: admin routes worden client-side bewaakt via Firebase Auth
// Hier alleen statische redirects voor routes zonder sessiecode
export function middleware(request: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml|webmanifest)$).*)"],
};
