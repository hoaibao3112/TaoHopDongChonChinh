import { NextRequest, NextResponse } from 'next/server';
import { getRequestUserRole } from '@/lib/auth';
import { createDefaultVehicleBoardState } from '@/lib/vehicle-board/defaults';
import { getVehicleBoardState, saveVehicleBoardState } from '@/lib/vehicle-board/store';
import { VehicleBoardState } from '@/lib/vehicle-board/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, private',
  Pragma: 'no-cache',
};

function hasBoardAccess(req: NextRequest): boolean {
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
  if (!hasBoardAccess(req)) {
    return NextResponse.json(
      { error: 'Không có quyền truy cập phân hệ Xếp Phương Tiện' },
      { status: 403, headers: NO_STORE_HEADERS }
    );
  }

  try {
    const state = await getVehicleBoardState();
    return NextResponse.json({ success: true, data: state }, { headers: NO_STORE_HEADERS });
  } catch (err: unknown) {
    console.error('[API VehicleBoard GET Error]:', err);
    return NextResponse.json(
      { error: 'Không thể tải dữ liệu bảng phương tiện' },
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

  if (!hasBoardAccess(req)) {
    return NextResponse.json(
      { error: 'Không có quyền cập nhật bảng phương tiện' },
      { status: 403, headers: NO_STORE_HEADERS }
    );
  }

  try {
    const body = (await req.json()) as {
      resetDefault?: boolean;
      state?: Partial<VehicleBoardState>;
    };

    if (body.resetDefault) {
      const def = createDefaultVehicleBoardState();
      const saved = await saveVehicleBoardState(def);
      return NextResponse.json({ success: true, data: saved }, { headers: NO_STORE_HEADERS });
    }

    if (!body.state || !Array.isArray(body.state.vehicles)) {
      return NextResponse.json(
        { error: 'Dữ liệu bảng phương tiện không hợp lệ' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const saved = await saveVehicleBoardState(body.state);
    return NextResponse.json({ success: true, data: saved }, { headers: NO_STORE_HEADERS });
  } catch (err: unknown) {
    console.error('[API VehicleBoard PUT Error]:', err);
    return NextResponse.json(
      { error: 'Không thể lưu bảng phương tiện' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
