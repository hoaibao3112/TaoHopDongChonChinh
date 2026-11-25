import { NextRequest, NextResponse } from 'next/server';
import { clearAuthCookie } from '@/lib/auth';

export const runtime = 'nodejs';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const loginUrl = new URL('/login', request.url);
  const response = NextResponse.redirect(loginUrl, 303);
  response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  clearAuthCookie(response, request);
  return response;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const loginUrl = new URL('/login', request.url);
  const response = NextResponse.redirect(loginUrl, 303);
  response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  clearAuthCookie(response, request);
  return response;
}
