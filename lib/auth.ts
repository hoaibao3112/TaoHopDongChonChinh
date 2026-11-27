import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { getRolePasswords } from '@/lib/passwordStore';

export const SESSION_COOKIE_NAME = 'auth_contract_session';
export const ROLE_COOKIE_NAME = 'auth_user_role';
export const SESSION_COOKIE_MAX_AGE = 60 * 60 * 12; // 12 giờ

const JWT_ISSUER = 'chonchinh-internal';
const JWT_AUDIENCE = 'chonchinh-web';
const JWT_SUBJECT = 'session';

export type UserRole = 'payroll' | 'contracts' | 'admin' | 'husk' | 'baocao' | 'dangtai' | 'chingoc' | 'kiemtra';

const VALID_ROLES: readonly UserRole[] = [
  'payroll',
  'contracts',
  'admin',
  'husk',
  'baocao',
  'dangtai',
  'chingoc',
  'kiemtra',
] as const;

export interface AuthCheckResult {
  isAuthenticated: boolean;
  role?: UserRole;
  redirectUrl?: string;
}

export interface SessionJwtPayload {
  sub: string;
  role: UserRole;
  iss: string;
  aud: string;
  iat: number;
  exp: number;
  jti: string;
  pv?: string;
}

/**
 * Lấy khóa bí mật 256-bit để ký JWT HS256.
 * Ưu tiên JWT_SECRET / SESSION_SECRET từ biến môi trường.
 */
function getJwtSigningKey(): Buffer {
  const rawSecret =
    process.env.JWT_SECRET ||
    process.env.SESSION_SECRET ||
    (process.env.APP_PASSWORD
      ? `sec_${process.env.APP_PASSWORD}`
      : 'hopdong_session_secret_key_2026_production');

  return createHash('sha256')
    .update(`chonchinh-jwt-hs256-v1:${rawSecret}`, 'utf8')
    .digest();
}

function toBase64Url(input: Buffer | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : input;
  return buf.toString('base64url');
}

function fromBase64Url(input: string): Buffer {
  return Buffer.from(input, 'base64url');
}

/**
 * Tạo dấu vân tay ngắn (không thể đảo ngược) của mật khẩu hiện tại để vô hiệu hóa phiên cũ khi đổi mật khẩu.
 */
export function computePasswordVersion(password: string): string {
  return createHmac('sha256', getJwtSigningKey())
    .update(`pw-ver:${password}`, 'utf8')
    .digest('hex')
    .slice(0, 16);
}

/**
 * Tạo chuẩn JSON Web Token (JWT) ký bằng HMAC-SHA256 (HS256) với iat, exp, jti, iss, aud.
 */
export function signSessionToken(role: UserRole, passwordVersion?: string): string {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload: SessionJwtPayload = {
    sub: JWT_SUBJECT,
    role,
    iss: JWT_ISSUER,
    aud: JWT_AUDIENCE,
    iat: now,
    exp: now + SESSION_COOKIE_MAX_AGE,
    jti: randomBytes(16).toString('hex'),
    ...(passwordVersion ? { pv: passwordVersion } : {}),
  };

  const encodedHeader = toBase64Url(JSON.stringify(header));
  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const signature = createHmac('sha256', getJwtSigningKey())
    .update(signingInput, 'utf8')
    .digest();

  return `${signingInput}.${toBase64Url(signature)}`;
}

/**
 * Xác thực JWT (HS256): kiểm tra cấu trúc 3 phần, header alg=HS256, chữ ký timing-safe, iss/aud/sub và hạn dùng exp.
 */
export function verifySessionJwt(token: string): SessionJwtPayload | null {
  try {
    if (!token || typeof token !== 'string') return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [encodedHeader, encodedPayload, encodedSig] = parts;
    if (!encodedHeader || !encodedPayload || !encodedSig) return null;

    // 1. Kiểm tra Header chống tấn công alg=none hoặc đổi thuật toán
    const headerRaw = fromBase64Url(encodedHeader).toString('utf8');
    const header = JSON.parse(headerRaw) as { alg?: unknown; typ?: unknown };
    if (header.alg !== 'HS256' || header.typ !== 'JWT') return null;

    // 2. Kiểm tra chữ ký HMAC-SHA256 bằng timingSafeEqual
    const signingInput = `${encodedHeader}.${encodedPayload}`;
    const expectedSig = createHmac('sha256', getJwtSigningKey())
      .update(signingInput, 'utf8')
      .digest();
    const actualSig = fromBase64Url(encodedSig);

    if (actualSig.length !== expectedSig.length) return null;
    if (!timingSafeEqual(actualSig, expectedSig)) return null;

    // 3. Kiểm tra Payload & các trường chuẩn JWT
    const payloadRaw = fromBase64Url(encodedPayload).toString('utf8');
    const payload = JSON.parse(payloadRaw) as Partial<SessionJwtPayload>;

    if (payload.iss !== JWT_ISSUER) return null;
    if (payload.aud !== JWT_AUDIENCE) return null;
    if (payload.sub !== JWT_SUBJECT) return null;
    if (typeof payload.iat !== 'number' || typeof payload.exp !== 'number') return null;

    const now = Math.floor(Date.now() / 1000);
    if (payload.exp <= now) return null;
    if (payload.iat > now + 60) return null; // Chặn token phát hành từ tương lai

    if (!payload.role || !VALID_ROLES.includes(payload.role)) return null;

    return payload as SessionJwtPayload;
  } catch {
    return null;
  }
}

/**
 * Xác thực JWT và trả về vai trò UserRole (hoặc null nếu không hợp lệ / hết hạn).
 */
export function verifySessionToken(token: string): UserRole | null {
  const payload = verifySessionJwt(token);
  return payload ? payload.role : null;
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
 * Kiểm tra mật khẩu phân quyền đồng bộ (dùng cho test tương thích ngược)
 */
export function checkPassword(password: string): AuthCheckResult {
  const clean = password.trim();

  if (safeEqual(clean, 'hoaibao')) {
    return { isAuthenticated: true, role: 'payroll', redirectUrl: '/tinh-luong' };
  }
  if (safeEqual(clean, 'baocao')) {
    return { isAuthenticated: true, role: 'baocao', redirectUrl: '/bao-cao-chua-xay' };
  }
  if (safeEqual(clean, 'chonchinh')) {
    return { isAuthenticated: true, role: 'contracts', redirectUrl: '/' };
  }
  if (safeEqual(clean, 'teamlua')) {
    return { isAuthenticated: true, role: 'husk', redirectUrl: '/xuat-trau' };
  }
  if (safeEqual(clean, 'dangtai')) {
    return { isAuthenticated: true, role: 'dangtai', redirectUrl: '/dang-tai' };
  }
  if (safeEqual(clean, 'chingoc')) {
    return { isAuthenticated: true, role: 'chingoc', redirectUrl: '/bao-cao-nhap-ngay' };
  }
  if (safeEqual(clean, 'KIEMTRA')) {
    return { isAuthenticated: true, role: 'kiemtra', redirectUrl: '/kiem-tra-lua' };
  }

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
  if (safeEqual(clean, map.kiemtra)) {
    return { isAuthenticated: true, role: 'kiemtra', redirectUrl: '/kiem-tra-lua' };
  }

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
 * Xác định có bật cờ Secure (chỉ gửi cookie qua HTTPS) hay không.
 * Luôn bật trên HTTPS / production domain; chỉ tắt trên localhost HTTP để dev thử nghiệm.
 */
export function shouldUseSecureCookie(request?: NextRequest): boolean {
  if (process.env.FORCE_HTTPS_COOKIES === 'true') return true;
  if (request) {
    const forwardedProto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim().toLowerCase();
    if (forwardedProto === 'https' || request.nextUrl.protocol === 'https:') {
      return true;
    }
    const host = (request.headers.get('host') || request.nextUrl.hostname || '').toLowerCase();
    const isLocal =
      host.startsWith('localhost') || host.startsWith('127.0.0.1') || host.startsWith('[::1]');
    if (process.env.NODE_ENV === 'production' && !isLocal) {
      return true;
    }
    return false;
  }
  return process.env.NODE_ENV === 'production';
}

/**
 * Thiết lập cookie phiên đăng nhập HttpOnly + Secure (HTTPS) + SameSite=Lax chứa JWT đã ký HS256
 */
export function setAuthCookie(
  response: NextResponse,
  role: UserRole = 'admin',
  request?: NextRequest,
  passwordVersion?: string
): void {
  const signedJwt = signSessionToken(role, passwordVersion);
  const isSecure = shouldUseSecureCookie(request);

  response.cookies.set(SESSION_COOKIE_NAME, signedJwt, {
    httpOnly: true,
    secure: isSecure,
    sameSite: 'lax',
    maxAge: SESSION_COOKIE_MAX_AGE,
    path: '/',
  });

  // Cookie vai trò chỉ dùng để hiển thị menu UI phía client; server KHÔNG bao giờ tin cookie này để phân quyền
  response.cookies.set(ROLE_COOKIE_NAME, role, {
    httpOnly: false,
    secure: isSecure,
    sameSite: 'lax',
    maxAge: SESSION_COOKIE_MAX_AGE,
    path: '/',
  });
}

/**
 * Xóa cookie phiên khi đăng xuất
 */
export function clearAuthCookie(response: NextResponse, request?: NextRequest): void {
  const isSecure = shouldUseSecureCookie(request);

  response.cookies.set(SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    secure: isSecure,
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
    expires: new Date(0),
  });
  response.cookies.set(ROLE_COOKIE_NAME, '', {
    httpOnly: false,
    secure: isSecure,
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
    expires: new Date(0),
  });
  response.cookies.delete(SESSION_COOKIE_NAME);
  response.cookies.delete(ROLE_COOKIE_NAME);
}

/**
 * Kiểm tra xem request có JWT hợp lệ trong cookie HttpOnly hay không.
 */
export function isRequestAuthenticated(request: NextRequest): boolean {
  const cookie = request.cookies.get(SESSION_COOKIE_NAME);
  if (!cookie?.value) return false;
  return verifySessionToken(cookie.value) !== null;
}

/**
 * Lấy vai trò của người dùng CHỈ từ JWT đã được xác thực chữ ký trong cookie HttpOnly.
 * Tuyệt đối không tin cookie ROLE_COOKIE_NAME từ client và không fallback về 'admin'.
 */
export function getRequestUserRole(request: NextRequest): UserRole | null {
  const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!sessionCookie) return null;
  return verifySessionToken(sessionCookie);
}

/**
 * Kiểm tra phiên trong Server Components bằng JWT HttpOnly
 */
export async function isServerComponentAuthenticated(): Promise<boolean> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return false;
  return verifySessionToken(token) !== null;
}

/**
 * Lấy vai trò người dùng trong Server Components CHỈ từ JWT đã xác thực chữ ký
 */
export async function getServerComponentUserRole(): Promise<UserRole | null> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!sessionCookie) return null;
  return verifySessionToken(sessionCookie);
}
