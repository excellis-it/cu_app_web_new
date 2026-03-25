
import { NextResponse } from 'next/server';

export function middleware(request) {
  const token = request.cookies.get('access-token')?.value;
  // If user is on '/' and authenticated, redirect to '/messages'
  if (request.nextUrl.pathname === "/" && token) {
    return NextResponse.redirect(new URL("/messages", request.url));
  }

  // If user is on '/' and NOT authenticated, redirect to '/login'
  if (request.nextUrl.pathname === "/" && !token) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // For protected routes, redirect if not authenticated
  if (!token && ["/messages", "/admin"].some(path => request.nextUrl.pathname.startsWith(path))) {
    // Save the full URL (pathname + query params) for redirect after login
    const redirectUrl = request.nextUrl.pathname + request.nextUrl.search;
    const loginUrl = new URL("/login", request.url);

    // Pass the redirect URL as a query parameter to the login page
    if (redirectUrl !== "/messages") {
      loginUrl.searchParams.set('redirect', redirectUrl);
    }

    return NextResponse.redirect(loginUrl);
  }
  return NextResponse.next();

}

export const config = {
  matcher: [
    '/messages/:path*',
    '/admin/:path*',
    '/',
  ],
};