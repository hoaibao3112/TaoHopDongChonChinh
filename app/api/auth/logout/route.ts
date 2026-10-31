import { NextRequest, NextResponse } from 'next/server';
import { clearAuthCookie } from '@/lib/auth';

export const runtime = 'nodejs';

export async function POST(): Promise<NextResponse> {
  const response = NextResponse.json({ success: true, message: 'Đã đăng xuất' });
  clearAuthCookie(response);
  return response;
}
