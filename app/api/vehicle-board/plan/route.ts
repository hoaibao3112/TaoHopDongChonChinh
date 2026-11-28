import { NextRequest, NextResponse } from 'next/server';
import { getRequestUserRole } from '@/lib/auth';
import { getDailyIntakePlan, saveDailyIntakePlan } from '@/lib/vehicle-board/store';
import { DailyIntakePlan } from '@/lib/vehicle-board/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, private',
  Pragma: 'no-cache',
};

function hasPlanAccess(req: NextRequest): boolean {
  const role = getRequestUserRole(req);
  return role === 'dieuphoi' || role === 'admin' || role === 'contracts' || role === 'payroll';
}

function isSameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return true;
  try {
    const originHost = new URL(origin).host;
    const requestHost = req.headers.get('x-forwarded-host') || req.headers.get('host');
    if (!requestHost) return true;
    return originHost === requestHost;
  } catch {
    return false;
  }
}

export async function GET(req: NextRequest) {
  if (!hasPlanAccess(req)) {
    return NextResponse.json(
      { error: 'Không có quyền truy cập Kế Hoạch Nhận Hàng' },
      { status: 403, headers: NO_STORE_HEADERS }
    );
  }

  const date = req.nextUrl.searchParams.get('date') || new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json(
      { error: 'Định dạng ngày không hợp lệ (YYYY-MM-DD)' },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  try {
    const plan = await getDailyIntakePlan(date);
    return NextResponse.json({ success: true, data: plan }, { headers: NO_STORE_HEADERS });
  } catch (err: unknown) {
    console.error('[API DailyPlan GET Error]:', err);
    return NextResponse.json(
      { error: 'Không thể tải kế hoạch nhận hàng' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

export async function PUT(req: NextRequest) {
  if (!isSameOrigin(req)) {
    return NextResponse.json(
      { error: 'Yêu cầu không hợp lệ (CSRF check failed)' },
      { status: 403, headers: NO_STORE_HEADERS }
    );
  }

  if (!hasPlanAccess(req)) {
    return NextResponse.json(
      { error: 'Không có quyền cập nhật Kế Hoạch Nhận Hàng' },
      { status: 403, headers: NO_STORE_HEADERS }
    );
  }

  try {
    const body = (await req.json()) as { plan?: DailyIntakePlan };
    if (!body.plan || !/^\d{4}-\d{2}-\d{2}$/.test(body.plan.date) || !Array.isArray(body.plan.rows)) {
      return NextResponse.json(
        { error: 'Dữ liệu kế hoạch nhận hàng không hợp lệ' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const saved = await saveDailyIntakePlan(body.plan);
    return NextResponse.json({ success: true, data: saved }, { headers: NO_STORE_HEADERS });
  } catch (err: unknown) {
    console.error('[API DailyPlan PUT Error]:', err);
    return NextResponse.json(
      { error: 'Không thể lưu kế hoạch nhận hàng' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
