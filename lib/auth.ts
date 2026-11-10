import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

export const SESSION_COOKIE_NAME = 'auth_contract_session';
export const ROLE_COOKIE_NAME = 'auth_user_role';
export const SESSION_COOKIE_MAX_AGE = 60 * 60 * 12; // 12 giờ

export type UserRole = 'payroll' | 'contracts' | 'admin' | 'husk';

export interface AuthCheckResult {
  isAuthenticated: boolean;
  role?: UserRole;
  redirectUrl?: string;
}

/**
 * Kiểm tra mật khẩu phân quyền:
 * - hoaibao -> Phân hệ Tính Lương Nông Sản (/tinh-luong)
 * - chonchinh -> Phân hệ Tạo Hợp Đồng Mua Bán (/)
 * - teamlua -> Phân hệ Quét Phiếu & Bảng Kê Xuất Trấu (/xuat-trau)
 * - admin / APP_PASSWORD -> Toàn quyền truy cập cả hai phân hệ
 */
export function checkPassword(password: string): AuthCheckResult {
  const clean = password.trim();

  if (clean === 'hoaibao') {
    return {
      isAuthenticated: true,
      role: 'payroll',
      redirectUrl: '/tinh-luong',
    };
  }

  if (clean === 'chonchinh') {
    return {
      isAuthenticated: true,
      role: 'contracts',
      redirectUrl: '/',
    };
  }

  if (clean === 'teamlua') {
    return {
      isAuthenticated: true,
      role: 'husk',
      redirectUrl: '/xuat-trau',
    };
  }

  // Mật khẩu quản trị viên hoặc fallback
  const adminPw = process.env.APP_PASSWORD || 'matkhau123';
  if (clean === adminPw) {
    return {
      isAuthenticated: true,
      role: 'admin',
      redirectUrl: '/',
    };
  }

  return { isAuthenticated: false };
}

/**
 * Thiết lập cookie phiên đăng nhập httpOnly và cookie lưu phân quyền vai trò
 */
export function setAuthCookie(response: NextResponse, role: UserRole = 'admin'): void {
  response.cookies.set(SESSION_COOKIE_NAME, 'authenticated', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_COOKIE_MAX_AGE,
    path: '/',
  });

  // Cookie vai trò để client và middleware đọc phân quyền
  response.cookies.set(ROLE_COOKIE_NAME, role, {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_COOKIE_MAX_AGE,
    path: '/',
  });
}

/**
 * Xóa cookie phiên khi đăng xuất
 */
export function clearAuthCookie(response: NextResponse): void {
  response.cookies.delete(SESSION_COOKIE_NAME);
  response.cookies.delete(ROLE_COOKIE_NAME);
}

/**
 * Kiểm tra xem request có phiên hợp lệ hay không
 */
export function isRequestAuthenticated(request: NextRequest): boolean {
  const cookie = request.cookies.get(SESSION_COOKIE_NAME);
  return cookie?.value === 'authenticated';
}

/**
 * Lấy vai trò của người dùng từ cookie
 */
export function getRequestUserRole(request: NextRequest): UserRole {
  const role = request.cookies.get(ROLE_COOKIE_NAME)?.value as UserRole;
  if (role === 'payroll' || role === 'contracts' || role === 'husk') return role;
  return 'admin';
}

/**
 * Kiểm tra phiên trong Server Components
 */
export async function isServerComponentAuthenticated(): Promise<boolean> {
  const cookieStore = await cookies();
  return cookieStore.get(SESSION_COOKIE_NAME)?.value === 'authenticated';
}

/**
 * Lấy vai trò người dùng trong Server Components
 */
export async function getServerComponentUserRole(): Promise<UserRole> {
  const cookieStore = await cookies();
  const role = cookieStore.get(ROLE_COOKIE_NAME)?.value as UserRole;
  if (role === 'payroll' || role === 'contracts' || role === 'husk') return role;
  return 'admin';
}
