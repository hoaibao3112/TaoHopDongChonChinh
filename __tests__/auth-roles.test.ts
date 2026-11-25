import { describe, it, expect } from 'vitest';
import {
  checkPassword,
  getRequestUserRole,
  isRequestAuthenticated,
  setAuthCookie,
  signSessionToken,
  verifySessionJwt,
  verifySessionToken,
  ROLE_COOKIE_NAME,
  SESSION_COOKIE_NAME,
} from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';

describe('Bảo mật Phân quyền Đăng nhập & JWT Cookie (Auth & Role-Based Access)', () => {
  it('Mật khẩu hoaibao -> Phân hệ Tính Lương Nông Sản (/tinh-luong)', () => {
    const result = checkPassword('hoaibao');
    expect(result.isAuthenticated).toBe(true);
    expect(result.role).toBe('payroll');
    expect(result.redirectUrl).toBe('/tinh-luong');
  });

  it('Mật khẩu hoaibao có khoảng trắng thừa -> vẫn nhận diện chuẩn xác', () => {
    const result = checkPassword('   hoaibao  ');
    expect(result.isAuthenticated).toBe(true);
    expect(result.role).toBe('payroll');
    expect(result.redirectUrl).toBe('/tinh-luong');
  });

  it('Mật khẩu chonchinh -> Phân hệ Tạo Hợp Đồng Mua Bán (/)', () => {
    const result = checkPassword('chonchinh');
    expect(result.isAuthenticated).toBe(true);
    expect(result.role).toBe('contracts');
    expect(result.redirectUrl).toBe('/');
  });

  it('Mật khẩu teamlua -> Phân hệ Quét Phiếu & Bảng Kê Xuất Trấu (/xuat-trau)', () => {
    const result = checkPassword('teamlua');
    expect(result.isAuthenticated).toBe(true);
    expect(result.role).toBe('husk');
    expect(result.redirectUrl).toBe('/xuat-trau');
  });

  it('Mật khẩu teamlua có khoảng trắng thừa -> vẫn nhận diện chuẩn xác', () => {
    const result = checkPassword('   teamlua   ');
    expect(result.isAuthenticated).toBe(true);
    expect(result.role).toBe('husk');
    expect(result.redirectUrl).toBe('/xuat-trau');
  });

  it('Mật khẩu admin chuẩn (matkhau123) -> Toàn quyền quản trị', () => {
    const result = checkPassword('matkhau123');
    expect(result.isAuthenticated).toBe(true);
    expect(result.role).toBe('admin');
  });

  it('Mật khẩu sai -> Trả về isAuthenticated: false', () => {
    const result = checkPassword('matkhausai999');
    expect(result.isAuthenticated).toBe(false);
    expect(result.role).toBeUndefined();
  });

  it('Tạo và xác thực chuẩn JWT HS256 (3 phần header.payload.signature)', () => {
    const jwt = signSessionToken('contracts', 'ver123');
    expect(jwt.split('.')).toHaveLength(3);

    const payload = verifySessionJwt(jwt);
    expect(payload).not.toBeNull();
    expect(payload?.role).toBe('contracts');
    expect(payload?.iss).toBe('chonchinh-internal');
    expect(payload?.aud).toBe('chonchinh-web');
    expect(payload?.pv).toBe('ver123');
    expect(payload?.exp).toBeGreaterThan(payload!.iat);
  });

  it('Từ chối cookie giả mạo "authenticated" và không leo thang đặc quyền qua auth_user_role', () => {
    const req = new NextRequest('https://app.chonchinh.vn/admin-mat-khau', {
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=authenticated; ${ROLE_COOKIE_NAME}=admin`,
      },
    });

    expect(isRequestAuthenticated(req)).toBe(false);
    expect(getRequestUserRole(req)).toBeNull();
  });

  it('Không thể giả mạo vai trò bằng cách sửa cookie auth_user_role khi JWT là payroll', () => {
    const payrollJwt = signSessionToken('payroll');
    const req = new NextRequest('https://app.chonchinh.vn/admin-mat-khau', {
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${payrollJwt}; ${ROLE_COOKIE_NAME}=admin`,
      },
    });

    expect(isRequestAuthenticated(req)).toBe(true);
    expect(getRequestUserRole(req)).toBe('payroll');
  });

  it('Từ chối JWT bị sửa chữ ký hoặc giả mạo alg=none', () => {
    const validJwt = signSessionToken('contracts');
    const parts = validJwt.split('.');
    const tamperedSig = `${parts[0]}.${parts[1]}.invalid_signature_xyz`;
    expect(verifySessionToken(tamperedSig)).toBeNull();

    const noneHeader = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const adminPayload = Buffer.from(
      JSON.stringify({
        sub: 'session',
        role: 'admin',
        iss: 'chonchinh-internal',
        aud: 'chonchinh-web',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      })
    ).toString('base64url');
    expect(verifySessionToken(`${noneHeader}.${adminPayload}.`)).toBeNull();
  });

  it('getRequestUserRole nhận diện đúng các role từ JWT hợp lệ', () => {
    const roles = ['payroll', 'contracts', 'husk'] as const;
    for (const r of roles) {
      const jwt = signSessionToken(r);
      const req = new NextRequest('https://app.chonchinh.vn/', {
        headers: {
          cookie: `${SESSION_COOKIE_NAME}=${jwt}`,
        },
      });
      expect(getRequestUserRole(req)).toBe(r);
    }
  });

  it('setAuthCookie thiết lập HttpOnly, SameSite=Lax và Secure=true trên HTTPS', () => {
    const httpsReq = new NextRequest('https://app.chonchinh.vn/api/auth/login', {
      headers: { 'x-forwarded-proto': 'https', host: 'app.chonchinh.vn' },
    });
    const res = NextResponse.json({ ok: true });
    setAuthCookie(res, 'contracts', httpsReq);

    const sessionCookie = res.cookies.get(SESSION_COOKIE_NAME);
    expect(sessionCookie).toBeDefined();
    expect(sessionCookie?.httpOnly).toBe(true);
    expect(sessionCookie?.secure).toBe(true);
    expect(sessionCookie?.sameSite).toBe('lax');
    expect(sessionCookie?.value.split('.')).toHaveLength(3);
  });
});
