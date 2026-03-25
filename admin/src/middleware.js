import { NextResponse } from 'next/server';

export function middleware(request) {
  console.log('Middleware running');
  const token = request.cookies.get('access_token');
  console.log('Token:', token);

  if (!token) {
    return NextResponse.redirect(new URL('/signin', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/users/all/:path*',
    '/users/admin/:path*',
    '/users/members/:path*',
    '/groups/all/:path*',
    '/profile/:path*',
    '/settings/:path*',
    '/',
  ],
};
