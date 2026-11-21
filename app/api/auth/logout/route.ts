import { NextRequest, NextResponse } from 'next/server';
import { clearAuthCookie } from '@/lib/auth';

export const runtime = 'nodejs';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const loginUrl = new URL('/login', request.url);
  const response = NextResponse.redirect(loginUrl, 303);
  clearAuthCookie(response);
  return response;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const loginUrl = new URL('/login', request.url);
  const response = NextResponse.redirect(loginUrl, 303);
  clearAuthCookie(response);
  return response;
}
