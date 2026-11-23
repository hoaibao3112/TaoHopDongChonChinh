import { NextRequest, NextResponse } from 'next/server';
import { isRequestAuthenticated } from '@/lib/auth';
import {
  getHuskRecordsByMonth,
  saveHuskRecordsByMonth,
  upsertHuskBatch,
  convertHuskRecordsToNSXTM,
  extractMonthKey,
  HuskMonthlyRecord,
} from '@/lib/husk/monthlyStorage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (!isRequestAuthenticated(req)) {
    return NextResponse.json({ error: 'Chưa xác thực phiên đăng nhập' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const month = searchParams.get('month') || '10/2026';
    const cleanMonth = month.trim();

    const items = await getHuskRecordsByMonth(cleanMonth);
    const nsxEntries = convertHuskRecordsToNSXTM(items);

    return NextResponse.json({
      success: true,
      monthKey: cleanMonth,
      count: items.length,
      items,
      nsxEntries,
    });
  } catch (err: unknown) {
    console.error('[API Husk Monthly GET Error]:', err);
    return NextResponse.json({ error: 'Lỗi tải dữ liệu xuất trấu theo tháng' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!isRequestAuthenticated(req)) {
    return NextResponse.json({ error: 'Chưa xác thực phiên đăng nhập' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const items: HuskMonthlyRecord[] = Array.isArray(body.items) ? body.items : [];
    const directMonthKey = body.monthKey ? String(body.monthKey).trim() : '';

    if (items.length === 0) {
      return NextResponse.json({ error: 'Danh sách mẻ trấu rỗng' }, { status: 400 });
    }

    if (directMonthKey) {
      // Lưu toàn bộ danh sách cho đúng 1 tháng chỉ định
      const itemsWithMonth = items.map((it) => ({
        ...it,
        monthKey: directMonthKey,
        updatedAt: new Date().toISOString(),
      }));
      await saveHuskRecordsByMonth(directMonthKey, itemsWithMonth);

      return NextResponse.json({
        success: true,
        message: `Đã lưu ${itemsWithMonth.length} mẻ trấu vào CSDL Tháng ${directMonthKey}!`,
        savedMonths: [directMonthKey],
        count: itemsWithMonth.length,
      });
    }

    // Tự động phân loại theo từng tháng dựa trên ngày của từng dòng
    const result = await upsertHuskBatch(items);

    return NextResponse.json({
      success: true,
      message: `Đã lưu thành công ${result.count} mẻ trấu vào CSDL (các tháng: ${result.savedMonths.join(', ')})!`,
      savedMonths: result.savedMonths,
      count: result.count,
    });
  } catch (err: unknown) {
    console.error('[API Husk Monthly POST Error]:', err);
    return NextResponse.json({ error: 'Lỗi lưu số liệu xuất trấu vào CSDL' }, { status: 500 });
  }
}
