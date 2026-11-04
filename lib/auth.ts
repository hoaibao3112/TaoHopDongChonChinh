import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

export const SESSION_COOKIE_NAME = 'auth_contract_session';
export const SESSION_COOKIE_MAX_AGE = 60 * 60 * 12; // 12 giờ

export function getAppPassword(): string {
  const pw = process.env.APP_PASSWORD || 'matkhau123';
  return pw;
}

/**
 * Thiết lập cookie phiên đăng nhập httpOnly, secure, sameSite=lax
 */
export function setAuthCookie(response: NextResponse): void {
  response.cookies.set(SESSION_COOKIE_NAME, 'authenticated', {
    httpOnly: true,
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
}

/**
 * Kiểm tra xem request có phiên hợp lệ hay không (dùng trong API route hoặc middleware)
 */
export function isRequestAuthenticated(request: NextRequest): boolean {
  const cookie = request.cookies.get(SESSION_COOKIE_NAME);
  return cookie?.value === 'authenticated';
}

/**
 * Kiểm tra phiên trong Server Components
 */
export async function isServerComponentAuthenticated(): Promise<boolean> {
  const cookieStore = await cookies();
  return cookieStore.get(SESSION_COOKIE_NAME)?.value === 'authenticated';
}

