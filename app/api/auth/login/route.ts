import { NextRequest, NextResponse } from 'next/server';
import { checkPasswordAsync, computePasswordVersion, setAuthCookie } from '@/lib/auth';
import { checkRateLimit, getClientIp } from '@/lib/security/rateLimit';
import { z } from 'zod';

const loginSchema = z.object({
  password: z.string().min(1, 'Vui lòng nhập mật khẩu'),
});

export const runtime = 'nodejs';

// ✅ Rate limit: Tối đa 10 lần thử / 15 phút / IP
const LOGIN_MAX_ATTEMPTS = 10;
const LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 phút

export async function POST(request: NextRequest): Promise<NextResponse> {
  // ✅ Bảo mật: Rate limiting chống brute-force
  const ip = getClientIp(request);
  const rateLimit = checkRateLimit(ip, 'login', LOGIN_MAX_ATTEMPTS, LOGIN_WINDOW_MS);

  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        error: `Quá nhiều lần thử đăng nhập. Vui lòng thử lại sau ${rateLimit.retryAfterSeconds} giây.`,
      },
      {
        status: 429,
        headers: {
          'Retry-After': String(rateLimit.retryAfterSeconds),
          'X-RateLimit-Limit': String(LOGIN_MAX_ATTEMPTS),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(Math.ceil(rateLimit.resetAt / 1000)),
        },
      }
    );
  }

  try {
    const body: unknown = await request.json();
    const parsed = loginSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Dữ liệu yêu cầu không hợp lệ' },
        { status: 400 }
      );
    }

    const { password } = parsed.data;
    const authResult = await checkPasswordAsync(password);

    if (!authResult.isAuthenticated || !authResult.role) {
      return NextResponse.json(
        { error: 'Mật khẩu không chính xác' },
        { status: 401 }
      );
    }

    const response = NextResponse.json(
      {
        success: true,
        message: 'Đăng nhập thành công',
        role: authResult.role,
        redirectUrl: authResult.redirectUrl,
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, private',
          Pragma: 'no-cache',
        },
      }
    );

    const pwVersion = computePasswordVersion(password.trim());
    setAuthCookie(response, authResult.role, request, pwVersion);
    return response;
  } catch (err) {
    console.error('[API Login Error]:', err);
    return NextResponse.json(
      { error: 'Hệ thống gặp sự cố, vui lòng thử lại sau' },
      { status: 500 }
    );
  }
}
