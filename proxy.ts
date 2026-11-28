import { NextRequest, NextResponse } from 'next/server';
import { isRequestAuthenticated, getRequestUserRole } from '@/lib/auth';

const PUBLIC_ROUTES = ['/login', '/api/auth/login'];

export function proxy(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  // Bỏ qua các đường dẫn công khai (bao gồm gate riêng cho trang quản lý mật khẩu nếu chưa đăng nhập)
  if (
    PUBLIC_ROUTES.some((route) => pathname.startsWith(route)) ||
    (pathname === '/admin-mat-khau' && !isRequestAuthenticated(request))
  ) {
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

  // Kiểm tra xác thực JWT từ cookie HttpOnly
  const role = getRequestUserRole(request);
  if (!role) {
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

  // 1. Phân quyền cho Hoài Bảo ('payroll'): Chỉ vào Tính Lương Nông Sản (không vào Báo cáo chưa xay)
  if (role === 'payroll') {
    // Nếu cố vào trang chủ / hoặc các trang contracts hoặc bao-cao-chua-xay -> redirect về /tinh-luong
    if (
      pathname === '/' ||
      pathname.startsWith('/contracts') ||
      pathname.startsWith('/bao-cao-chua-xay') ||
      pathname.startsWith('/bao-cao-nhap-ngay') ||
      pathname.startsWith('/admin-mat-khau')
    ) {
      return NextResponse.redirect(new URL('/tinh-luong', request.url));
    }
  }

  // 2. Phân quyền cho Chơn Chính ('contracts'): Vào Tạo Hợp Đồng & Quản Lý Mật Khẩu (/admin-mat-khau)
  if (role === 'contracts') {
    // Cho phép /admin-mat-khau và /api/admin/passwords; chặn các phân hệ tính lương/báo cáo khác
    if (
      pathname.startsWith('/tinh-luong') ||
      pathname.startsWith('/nhap-say') ||
      pathname.startsWith('/nhap-say-cs1') ||
      pathname.startsWith('/chum-lo') ||
      pathname.startsWith('/xuat-trau') ||
      pathname.startsWith('/bao-cao-chua-xay') ||
      pathname.startsWith('/bao-cao-nhap-ngay') ||
      pathname.startsWith('/dang-tai')
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

  // 4. Phân quyền cho Báo Cáo ('baocao') với mật khẩu baocao: Chỉ vào /bao-cao-chua-xay và /thong-ke-lua
  if (role === 'baocao') {
    if (
      !pathname.startsWith('/bao-cao-chua-xay') &&
      !pathname.startsWith('/thong-ke-lua') &&
      !pathname.startsWith('/api/')
    ) {
      return NextResponse.redirect(new URL('/bao-cao-chua-xay', request.url));
    }
  }

  // 5. Phân quyền cho Chị Ngọc ('chingoc') với mật khẩu chingoc: Chỉ vào /bao-cao-nhap-ngay
  if (role === 'chingoc') {
    if (!pathname.startsWith('/bao-cao-nhap-ngay') && !pathname.startsWith('/api/')) {
      return NextResponse.redirect(new URL('/bao-cao-nhap-ngay', request.url));
    }
  }

  // 6. Phân quyền cho Đăng Tài Xe ('dangtai') với mật khẩu dangtai: Chỉ vào /dang-tai
  if (role === 'dangtai') {
    if (!pathname.startsWith('/dang-tai') && !pathname.startsWith('/api/')) {
      return NextResponse.redirect(new URL('/dang-tai', request.url));
    }
  }

  // 7. Phân quyền cho Kiểm Tra Lỗi Lúa ('kiemtra') với mật khẩu KIEMTRA: Chỉ vào /kiem-tra-lua
  if (role === 'kiemtra') {
    if (!pathname.startsWith('/kiem-tra-lua') && !pathname.startsWith('/api/')) {
      return NextResponse.redirect(new URL('/kiem-tra-lua', request.url));
    }
  }

  // 8. Phân quyền cho Điều Phối Phương Tiện ('dieuphoi') với mật khẩu DIEUPHOI: Chỉ vào /dieu-phoi-pt
  if (role === 'dieuphoi') {
    if (!pathname.startsWith('/dieu-phoi-pt') && !pathname.startsWith('/api/')) {
      return NextResponse.redirect(new URL('/dieu-phoi-pt', request.url));
    }
  }

  // 4. Phân quyền Quản trị viên ('admin'): Toàn quyền truy cập tất cả phân hệ
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
