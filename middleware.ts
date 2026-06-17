import { NextResponse } from 'next/server';

// Middleware must be present for Next.js 16 Vercel routing to work correctly.
// Auth is handled in app/(app)/layout.tsx (server component, Node.js runtime).
// This file intentionally matches only a path that is never visited so the
// Edge Function is never actually invoked.
export function middleware() {
  return NextResponse.next();
}

export const config = {
  matcher: ['/_vyara-middleware-placeholder'],
};
