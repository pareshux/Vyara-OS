import { NextResponse, type NextRequest } from 'next/server';

// Lightweight edge-compatible auth check: look for the Supabase session cookie.
// The actual JWT is validated by Supabase RLS on every server action/query;
// this check only guards the routing layer.
const SUPABASE_COOKIE_PREFIX = 'sb-bcnxxhvuymhndzbckxol-auth-token';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isPublicPath =
    pathname.startsWith('/login') ||
    pathname.startsWith('/auth') ||
    pathname.startsWith('/api/inngest') ||
    pathname.startsWith('/_next') ||
    pathname === '/favicon.ico';

  if (isPublicPath) {
    return NextResponse.next();
  }

  // Check for Supabase session cookie (handles chunked tokens .0 .1 too)
  const hasSession = request.cookies.getAll().some(
    (c) => c.name.startsWith(SUPABASE_COOKIE_PREFIX) && c.value.length > 0
  );

  if (!hasSession) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
