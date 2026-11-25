import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';
import { getRolePasswords } from '@/lib/passwordStore';

export const SESSION_COOKIE_NAME = 'auth_contract_session';
export const ROLE_COOKIE_NAME = 'auth_user_role';
export const SESSION_COOKIE_MAX_AGE = 60 * 60 * 12; // 12 giờ

export type UserRole = 'payroll' | 'contracts' | 'admin' | 'husk' | 'baocao' | 'dangtai' | 'chingoc';

export interface AuthCheckResult {
  isAuthenticated: boolean;
  role?: UserRole;
  redirectUrl?: string;
}

/**
 * Lấy secret key để ký HMAC session token.
 * Ưu tiên SESSION_SECRET từ env; nếu chưa có thì derive từ APP_PASSWORD để luôn an toàn.
 */
function getSessionSecret(): string {
  return (
    process.env.SESSION_SECRET ||
    (process.env.APP_PASSWORD
      ? `sec_${process.env.APP_PASSWORD}`
      : 'hopdong_session_secret_key_2026_production')
  );
}

/**
 * Tạo token đã ký HMAC-SHA256
 */
export function signSessionToken(role: UserRole): string {
  const secret = getSessionSecret();
  const payload = `authenticated:${role}`;
  const hmac = createHmac('sha256', secret).update(payload).digest('hex');
  return `${payload}:${hmac}`;
}

/**
 * Xác thực HMAC session token
 */
export function verifySessionToken(token: string): UserRole | null {
  try {
    const secret = getSessionSecret();
    const parts = token.split(':');
    if (parts.length !== 3) return null;
    const [prefix, role, hmac] = parts;
    if (prefix !== 'authenticated') return null;

    const expected = createHmac('sha256', secret)
      .update(`authenticated:${role}`)
      .digest('hex');

    const hmacBuf = Buffer.from(hmac, 'hex');
    const expectedBuf = Buffer.from(expected, 'hex');
    if (hmacBuf.length !== expectedBuf.length) return null;
    if (!timingSafeEqual(hmacBuf, expectedBuf)) return null;

    const validRoles: UserRole[] = ['payroll', 'contracts', 'admin', 'husk', 'baocao', 'dangtai', 'chingoc'];
    if (!validRoles.includes(role as UserRole)) return null;
    return role as UserRole;
  } catch {
    return null;
  }
}

/**
 * So sánh an toàn hai chuỗi chống timing attack
 */
function safeEqual(a: string, b: string): boolean {
  try {
    const aBuf = Buffer.from(a, 'utf8');
    const bBuf = Buffer.from(b, 'utf8');
    if (aBuf.length !== bBuf.length) return false;
    return timingSafeEqual(aBuf, bBuf);
  } catch {
    return false;
  }
}

/**
 * Kiểm tra mật khẩu phân quyền:
 * - hoaibao -> Phân hệ Tính Lương Nông Sản (/tinh-luong)
 * - chonchinh -> Phân hệ Tạo Hợp Đồng Mua Bán (/)
 * - teamlua -> Phân hệ Quét Phiếu & Bảng Kê Xuất Trấu (/xuat-trau)
 * - baocao -> Phân hệ Báo Cáo Lúa Khô Chưa Xay (/bao-cao-chua-xay)
 * - admin / APP_PASSWORD -> Toàn quyền truy cập cả hai phân hệ
 */
export function checkPassword(password: string): AuthCheckResult {
  const clean = password.trim();

  if (safeEqual(clean, 'hoaibao')) {
    return {
      isAuthenticated: true,
      role: 'payroll',
      redirectUrl: '/tinh-luong',
    };
  }

  if (safeEqual(clean, 'baocao')) {
    return {
      isAuthenticated: true,
      role: 'baocao',
      redirectUrl: '/bao-cao-chua-xay',
    };
  }

  if (safeEqual(clean, 'chonchinh')) {
    return {
      isAuthenticated: true,
      role: 'contracts',
      redirectUrl: '/',
    };
  }

  if (safeEqual(clean, 'teamlua')) {
    return {
      isAuthenticated: true,
      role: 'husk',
      redirectUrl: '/xuat-trau',
    };
  }

  if (safeEqual(clean, 'dangtai')) {
    return {
      isAuthenticated: true,
      role: 'dangtai',
      redirectUrl: '/dang-tai',
    };
  }

  if (safeEqual(clean, 'chingoc')) {
    return {
      isAuthenticated: true,
      role: 'chingoc',
      redirectUrl: '/bao-cao-nhap-ngay',
    };
  }

  // Mật khẩu quản trị viên chính thức từ biến môi trường
  const adminPw = process.env.APP_PASSWORD;
  if (adminPw && safeEqual(clean, adminPw)) {
    return {
      isAuthenticated: true,
      role: 'admin',
      redirectUrl: '/',
    };
  }

  // Fallback matkhau123 chỉ cho phép trong môi trường test/development,
  // tuyệt đối KHÔNG cho phép ở production
  if (process.env.NODE_ENV !== 'production' && safeEqual(clean, 'matkhau123')) {
    return {
      isAuthenticated: true,
      role: 'admin',
      redirectUrl: '/',
    };
  }

  return { isAuthenticated: false };
}

/**
 * Kiểm tra mật khẩu phân quyền động (đọc từ DB / Redis / File JSON đã cấu hình ở trang Admin)
 */
export async function checkPasswordAsync(password: string): Promise<AuthCheckResult> {
  const clean = password.trim();
  if (!clean) return { isAuthenticated: false };

  const map = await getRolePasswords();

  if (safeEqual(clean, map.payroll)) {
    return { isAuthenticated: true, role: 'payroll', redirectUrl: '/tinh-luong' };
  }
  if (safeEqual(clean, map.baocao)) {
    return { isAuthenticated: true, role: 'baocao', redirectUrl: '/bao-cao-chua-xay' };
  }
  if (safeEqual(clean, map.contracts)) {
    return { isAuthenticated: true, role: 'contracts', redirectUrl: '/' };
  }
  if (safeEqual(clean, map.husk)) {
    return { isAuthenticated: true, role: 'husk', redirectUrl: '/xuat-trau' };
  }
  if (safeEqual(clean, map.dangtai)) {
    return { isAuthenticated: true, role: 'dangtai', redirectUrl: '/dang-tai' };
  }
  if (safeEqual(clean, map.chingoc)) {
    return { isAuthenticated: true, role: 'chingoc', redirectUrl: '/bao-cao-nhap-ngay' };
  }

  // Mật khẩu quản trị viên chính thức từ biến môi trường
  const adminPw = process.env.APP_PASSWORD;
  if (adminPw && safeEqual(clean, adminPw)) {
    return { isAuthenticated: true, role: 'admin', redirectUrl: '/' };
  }

  if (process.env.NODE_ENV !== 'production' && safeEqual(clean, 'matkhau123')) {
    return { isAuthenticated: true, role: 'admin', redirectUrl: '/' };
  }

  return { isAuthenticated: false };
}

/**
 * Thiết lập cookie phiên đăng nhập httpOnly với HMAC signature
 */
export function setAuthCookie(response: NextResponse, role: UserRole = 'admin'): void {
  const signedToken = signSessionToken(role);

  response.cookies.set(SESSION_COOKIE_NAME, signedToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_COOKIE_MAX_AGE,
    path: '/',
  });

  // Cookie vai trò để client đọc giao diện
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
  response.cookies.set(SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
    expires: new Date(0),
  });
  response.cookies.set(ROLE_COOKIE_NAME, '', {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
    expires: new Date(0),
  });
  response.cookies.delete(SESSION_COOKIE_NAME);
  response.cookies.delete(ROLE_COOKIE_NAME);
}

/**
 * Kiểm tra xem request có phiên hợp lệ hay không.
 * Chấp nhận HMAC signed token và backwards-compatible với string 'authenticated'
 */
export function isRequestAuthenticated(request: NextRequest): boolean {
  const cookie = request.cookies.get(SESSION_COOKIE_NAME);
  if (!cookie?.value) return false;
  if (cookie.value === 'authenticated') return true;
  return verifySessionToken(cookie.value) !== null;
}

/**
 * Lấy vai trò của người dùng từ cookie
 */
export function getRequestUserRole(request: NextRequest): UserRole {
  const roleCookie = request.cookies.get(ROLE_COOKIE_NAME)?.value as UserRole;
  if (
    roleCookie === 'payroll' ||
    roleCookie === 'contracts' ||
    roleCookie === 'husk' ||
    roleCookie === 'baocao' ||
    roleCookie === 'dangtai' ||
    roleCookie === 'chingoc'
  ) {
    return roleCookie;
  }

  const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (sessionCookie) {
    const verifiedRole = verifySessionToken(sessionCookie);
    if (verifiedRole) return verifiedRole;
  }

  return 'admin';
}

/**
 * Kiểm tra phiên trong Server Components
 */
export async function isServerComponentAuthenticated(): Promise<boolean> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return false;
  if (token === 'authenticated') return true;
  return verifySessionToken(token) !== null;
}

/**
 * Lấy vai trò người dùng trong Server Components
 */
export async function getServerComponentUserRole(): Promise<UserRole> {
  const cookieStore = await cookies();
  const roleCookie = cookieStore.get(ROLE_COOKIE_NAME)?.value as UserRole;
  if (
    roleCookie === 'payroll' ||
    roleCookie === 'contracts' ||
    roleCookie === 'husk' ||
    roleCookie === 'baocao' ||
    roleCookie === 'dangtai' ||
    roleCookie === 'chingoc'
  ) {
    return roleCookie;
  }

  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (sessionCookie) {
    const verifiedRole = verifySessionToken(sessionCookie);
    if (verifiedRole) return verifiedRole;
  }

  return 'admin';
}
