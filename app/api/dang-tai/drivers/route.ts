import { NextRequest, NextResponse } from 'next/server';
import { isRequestAuthenticated } from '@/lib/auth';
import { getDriverDirectory, upsertDriver, searchDrivers } from '@/lib/dang-tai/drivers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (!isRequestAuthenticated(req)) {
    return NextResponse.json({ error: 'Chưa xác thực phiên đăng nhập' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const query = searchParams.get('q');
    const drivers = await getDriverDirectory();

    if (query) {
      const filtered = searchDrivers(query, drivers);
      return NextResponse.json({ success: true, drivers: filtered });
    }

    return NextResponse.json({ success: true, drivers });
  } catch (err: unknown) {
    console.error('[API Drivers GET Error]:', err);
    return NextResponse.json({ error: 'Lỗi tải danh bạ tài xế' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!isRequestAuthenticated(req)) {
    return NextResponse.json({ error: 'Chưa xác thực phiên đăng nhập' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const ten = String(body.ten || '').trim();
    const sdt = String(body.sdt || '').trim();
    const bienSo = body.bienSo ? String(body.bienSo).trim() : undefined;

    if (!ten) {
      return NextResponse.json({ error: 'Vui lòng nhập tên tài xế' }, { status: 400 });
    }

    const { driver, isNew, list } = await upsertDriver(ten, sdt, bienSo);

    return NextResponse.json({
      success: true,
      message: isNew ? `Đã thêm tài xế ${ten} vào danh bạ` : `Đã cập nhật tài xế ${ten}`,
      driver,
      drivers: list,
    });
  } catch (err: unknown) {
    console.error('[API Drivers POST Error]:', err);
    return NextResponse.json({ error: 'Lỗi lưu thông tin tài xế' }, { status: 500 });
  }
}
