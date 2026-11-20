import { NextRequest, NextResponse } from 'next/server';
import { isRequestAuthenticated } from '@/lib/auth';
import { getDangTaiList, saveDangTaiList } from '@/lib/dang-tai/storage';
import { calculateDangTaiSummary } from '@/lib/dang-tai/orderValidator';
import { XeDangTai } from '@/lib/dang-tai/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getTodayString(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export async function GET(req: NextRequest) {
  if (!isRequestAuthenticated(req)) {
    return NextResponse.json({ error: 'Chưa xác thực phiên đăng nhập' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const date = searchParams.get('date') || getTodayString();

  try {
    const items = await getDangTaiList(date);
    const summary = calculateDangTaiSummary(items, date);
    return NextResponse.json({ success: true, date, items, summary });
  } catch (err: unknown) {
    console.error('[API DangTai GET Error]:', err);
    return NextResponse.json({ error: 'Lỗi tải dữ liệu đăng tài' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!isRequestAuthenticated(req)) {
    return NextResponse.json({ error: 'Chưa xác thực phiên đăng nhập' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const date = body.date || getTodayString();
    const action = body.action || 'save_all';

    let currentList = await getDangTaiList(date);

    if (action === 'save_all') {
      if (Array.isArray(body.items)) {
        currentList = body.items;
      }
    } else if (action === 'add_truck') {
      const newTruck: XeDangTai = body.truck;
      if (!newTruck.bienSoXe) {
        return NextResponse.json({ error: 'Vui lòng nhập biển số xe' }, { status: 400 });
      }
      // Tự động gán STT nếu chưa có
      if (!newTruck.stt) {
        const maxStt = currentList.reduce((max, x) => Math.max(max, x.stt || 0), 0);
        newTruck.stt = maxStt + 1;
      }
      currentList.push(newTruck);
    } else if (action === 'update_truck') {
      const updated: XeDangTai = body.truck;
      currentList = currentList.map((x) => (x.id === updated.id ? updated : x));
    } else if (action === 'delete_truck') {
      const targetId: string = body.id;
      currentList = currentList.filter((x) => x.id !== targetId);
    } else if (action === 'clear_all') {
      currentList = [];
    }

    await saveDangTaiList(date, currentList);
    const summary = calculateDangTaiSummary(currentList, date);

    return NextResponse.json({
      success: true,
      message: 'Lưu thành công',
      date,
      items: currentList,
      summary,
    });
  } catch (err: unknown) {
    console.error('[API DangTai POST Error]:', err);
    return NextResponse.json({ error: 'Lỗi cập nhật dữ liệu' }, { status: 500 });
  }
}
