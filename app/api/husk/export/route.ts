import { NextRequest, NextResponse } from 'next/server';
import { isRequestAuthenticated } from '@/lib/auth';
import { writeHuskRowsToExcel } from '@/lib/excel/writer';
import { ScannedSlipItem, HuskSettings } from '@/lib/husk/types';
import { groupSlipsIfEnabled } from '@/lib/husk/merger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  if (!isRequestAuthenticated(req)) {
    return NextResponse.json({ error: 'Chưa xác thực phiên đăng nhập' }, { status: 401 });
  }

  try {
    const formData = await req.formData();
    const excelFile = formData.get('excelFile') as File | null;
    const slipsJson = formData.get('slips') as string | null;
    const settingsJson = formData.get('settings') as string | null;

    if (!excelFile) {
      return NextResponse.json({ error: 'Vui lòng cung cấp file Excel gốc' }, { status: 400 });
    }

    if (!slipsJson) {
      return NextResponse.json({ error: 'Không có dữ liệu phiếu cân' }, { status: 400 });
    }

    const slips: ScannedSlipItem[] = JSON.parse(slipsJson);
    const settings: HuskSettings = settingsJson ? JSON.parse(settingsJson) : {};

    // Lọc các phiếu được tick chọn "Ghi?"
    const selectedSlips = slips.filter((s) => s.selected);

    if (selectedSlips.length === 0) {
      return NextResponse.json({ error: 'Chưa có phiếu cân nào được chọn để ghi vào Excel' }, { status: 400 });
    }

    // Áp dụng tùy chọn gộp chuyến nếu người dùng bật
    const finalSlips = groupSlipsIfEnabled(selectedSlips, Boolean(settings.mergeTrips), settings.unitPrice);

    const templateArrayBuf = await excelFile.arrayBuffer();
    const templateBuffer = Buffer.from(templateArrayBuf);

    // Ghi các dòng vào file Excel
    const result = await writeHuskRowsToExcel(templateBuffer, finalSlips, settings);

    // Đặt tên file xuất: tên gốc bỏ đuôi + "_cap_nhat.xlsx"
    const originalName = excelFile.name.replace(/\.[^/.]+$/, '');
    const outputFileName = `${originalName}_cap_nhat.xlsx`;

    return new NextResponse(result.updatedBuffer as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(outputFileName)}`,
        'X-Inserted-Count': String(result.insertedCount),
        'X-Start-Stt': String(result.startStt),
        'X-End-Stt': String(result.endStt),
        'X-Total-Amount': String(result.totalAmount),
      },
    });
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: `Lỗi ghi file Excel: ${errorMsg}` }, { status: 500 });
  }
}

