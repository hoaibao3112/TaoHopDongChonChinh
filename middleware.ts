import { NextRequest, NextResponse } from 'next/server';
import { isRequestAuthenticated } from '@/lib/auth';

const PUBLIC_ROUTES = ['/login', '/api/auth/login'];

export function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  // Bỏ qua các đường dẫn công khai
  if (PUBLIC_ROUTES.some((route) => pathname.startsWith(route))) {
    return NextResponse.next();
  }

  // Bỏ qua static assets
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  // Kiểm tra xác thực
  if (!isRequestAuthenticated(request)) {
    // Nếu là API route -> trả JSON 401
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: 'Vui lòng đăng nhập để tiếp tục' },
        { status: 401 }
      );
    }

    // Nếu là trang web -> redirect đến /login
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};

