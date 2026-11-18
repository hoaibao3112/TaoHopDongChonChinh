import { NextRequest, NextResponse } from 'next/server';
import { isRequestAuthenticated } from '@/lib/auth';

export const runtime = 'nodejs';

// Whitelist scope hợp lệ - chống scope injection
const ALLOWED_SCOPES = ['cs1', 'nsx_tm'] as const;
type AllowedScope = (typeof ALLOWED_SCOPES)[number];

const MAX_TEXT_LENGTH = 10_000; // 10.000 ký tự tối đa

interface QuickNoteData {
  text: string;
  updatedAt: string;
}

function getRedisConfig(): { url: string; token: string } {
  const url = process.env.UPSTASH_REDIS_REST_URL?.replace(/\/$/, '');
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    throw new Error(
      '[QuickNotes] UPSTASH_REDIS_REST_URL hoặc UPSTASH_REDIS_REST_TOKEN chưa được cấu hình trong biến môi trường.'
    );
  }

  return { url, token };
}

function sanitizeScope(raw: string | null): AllowedScope {
  if (raw && ALLOWED_SCOPES.includes(raw as AllowedScope)) {
    return raw as AllowedScope;
  }
  return 'cs1'; // Mặc định an toàn
}

async function redisGet(key: string): Promise<string | null> {
  try {
    const { url, token } = getRedisConfig();
    const res = await fetch(`${url}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data.result === 'string' ? data.result : null;
  } catch (err) {
    console.error(`[Redis] Lỗi GET:`, err);
    return null;
  }
}

async function redisSet(key: string, value: string): Promise<boolean> {
  try {
    const { url, token } = getRedisConfig();
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(['SET', key, value]),
      cache: 'no-store',
    });
    return res.ok;
  } catch (err) {
    console.error(`[Redis] Lỗi SET:`, err);
    return false;
  }
}

export async function GET(req: NextRequest) {
  // ✅ Bảo mật: Yêu cầu đăng nhập
  if (!isRequestAuthenticated(req)) {
    return NextResponse.json({ error: 'Chưa xác thực phiên đăng nhập' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const scope = sanitizeScope(searchParams.get('scope'));
  const key = `quick_notes:${scope}`;

  const raw = await redisGet(key);
  if (!raw) {
    return NextResponse.json({ text: '', updatedAt: '' });
  }

  try {
    const parsed: QuickNoteData = JSON.parse(raw);
    return NextResponse.json(parsed);
  } catch {
    return NextResponse.json({ text: raw, updatedAt: '' });
  }
}

export async function POST(req: NextRequest) {
  // ✅ Bảo mật: Yêu cầu đăng nhập
  if (!isRequestAuthenticated(req)) {
    return NextResponse.json({ error: 'Chưa xác thực phiên đăng nhập' }, { status: 401 });
  }

  try {
    const body = await req.json();

    // ✅ Bảo mật: Sanitize scope (whitelist only)
    const scope = sanitizeScope(typeof body.scope === 'string' ? body.scope : null);

    // ✅ Bảo mật: Giới hạn độ dài text
    const text = typeof body.text === 'string' ? body.text.slice(0, MAX_TEXT_LENGTH) : '';

    const now = new Date();
    const timeStr = now.toLocaleDateString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      day: '2-digit',
      month: '2-digit',
    });

    const payload: QuickNoteData = {
      text,
      updatedAt: timeStr,
    };

    const key = `quick_notes:${scope}`;
    await redisSet(key, JSON.stringify(payload));

    return NextResponse.json({ success: true, ...payload });
  } catch (error) {
    console.error('[QuickNote] Lỗi lưu ghi chú:', error);
    return NextResponse.json({ error: 'Không thể lưu ghi chú' }, { status: 500 });
  }
}
