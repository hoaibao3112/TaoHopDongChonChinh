import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

interface QuickNoteData {
  text: string;
  updatedAt: string;
}

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL?.replace(/\/$/, '') || 'https://upright-dogfish-99021.upstash.io';
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || 'gQAAAAAAAYLNAAIgcDFmODVkZWM0MDVlZjA0MjljYWY2NTc4YTJhNWYyNmZjOA';

async function redisGet(key: string): Promise<string | null> {
  if (!REDIS_URL || !REDIS_TOKEN) return null;
  try {
    const res = await fetch(`${REDIS_URL}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data.result === 'string' ? data.result : null;
  } catch (err) {
    console.error(`[Redis] Lỗi GET key ${key}:`, err);
    return null;
  }
}

async function redisSet(key: string, value: string): Promise<boolean> {
  if (!REDIS_URL || !REDIS_TOKEN) return false;
  try {
    const res = await fetch(`${REDIS_URL}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${REDIS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(['SET', key, value]),
      cache: 'no-store',
    });
    return res.ok;
  } catch (err) {
    console.error(`[Redis] Lỗi SET key ${key}:`, err);
    return false;
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const scope = searchParams.get('scope') || 'cs1';
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
  try {
    const body = await req.json();
    const scope = body.scope || 'cs1';
    const text = typeof body.text === 'string' ? body.text : '';
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
