import { NextRequest, NextResponse } from 'next/server';
import { isRequestAuthenticated, getRequestUserRole } from '@/lib/auth';

const PUBLIC_ROUTES = ['/login', '/api/auth/login'];

export function proxy(request: NextRequest): NextResponse {
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

  // Phân quyền theo vai trò (Role-based access control)
  const role = getRequestUserRole(request);

  // 1. Phân quyền cho Hoài Bảo ('payroll'): Chỉ vào Tính Lương Nông Sản
  if (role === 'payroll') {
    // Nếu cố vào trang chủ / hoặc các trang contracts -> redirect về /tinh-luong
    if (pathname === '/' || pathname.startsWith('/contracts')) {
      return NextResponse.redirect(new URL('/tinh-luong', request.url));
    }
  }

  // 2. Phân quyền cho Chơn Chính ('contracts'): Chỉ vào Tạo Hợp Đồng
  if (role === 'contracts') {
    // Nếu cố vào /tinh-luong, /nhap-say, /chum-lo hoặc /xuat-trau -> redirect về trang chủ /
    if (
      pathname.startsWith('/tinh-luong') ||
      pathname.startsWith('/nhap-say') ||
      pathname.startsWith('/nhap-say-cs1') ||
      pathname.startsWith('/chum-lo') ||
      pathname.startsWith('/xuat-trau')
    ) {
      return NextResponse.redirect(new URL('/', request.url));
    }
  }

  // 3. Phân quyền cho Đội Trấu ('husk') với mật khẩu teamlua: Chỉ vào Xuất Trấu (/xuat-trau)
  if (role === 'husk') {
    if (!pathname.startsWith('/xuat-trau') && !pathname.startsWith('/api/husk')) {
      return NextResponse.redirect(new URL('/xuat-trau', request.url));
    }
  }

  // 4. Phân quyền Quản trị viên ('admin'): Toàn quyền truy cập tất cả phân hệ
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
