import { NextResponse } from 'next/server';

export function middleware() {
  return NextResponse.next();
}

// Empty matcher = middleware present in build (fixes Next.js 16 routing) but never invoked
export const config = { matcher: [] };
