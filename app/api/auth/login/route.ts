import { NextRequest, NextResponse } from 'next/server';
import { getAppPassword, setAuthCookie } from '@/lib/auth';
import { z } from 'zod';

const loginSchema = z.object({
  password: z.string().min(1, 'Vui lòng nhập mật khẩu'),
});

export const runtime = 'nodejs';

export async function POST(request: NextRequest): Promise<NextResponse> {
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
    const correctPassword = getAppPassword();

    if (password !== correctPassword) {
      return NextResponse.json(
        { error: 'Mật khẩu không chính xác' },
        { status: 401 }
      );
    }

    const response = NextResponse.json({ success: true, message: 'Đăng nhập thành công' });
    setAuthCookie(response);
    return response;
  } catch (err) {
    console.error('[API Login Error]:', err);
    return NextResponse.json(
      { error: 'Hệ thống gặp sự cố, vui lòng thử lại sau' },
      { status: 500 }
    );
  }
}

