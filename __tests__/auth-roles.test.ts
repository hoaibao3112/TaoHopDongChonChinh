import { describe, it, expect } from 'vitest';
import { checkPassword, getRequestUserRole, ROLE_COOKIE_NAME, SESSION_COOKIE_NAME } from '@/lib/auth';
import { NextRequest } from 'next/server';

describe('Bảo mật Phân quyền Đăng nhập (Auth & Role-Based Access)', () => {
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

  it('getRequestUserRole nhận diện đúng role từ cookie request', () => {
    const req = new NextRequest('http://localhost:3000/tinh-luong', {
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=authenticated; ${ROLE_COOKIE_NAME}=payroll`,
      },
    });

    const role = getRequestUserRole(req);
    expect(role).toBe('payroll');
  });

  it('getRequestUserRole nhận diện role contracts từ cookie request', () => {
    const req = new NextRequest('http://localhost:3000/', {
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=authenticated; ${ROLE_COOKIE_NAME}=contracts`,
      },
    });

    const role = getRequestUserRole(req);
    expect(role).toBe('contracts');
  });
});

