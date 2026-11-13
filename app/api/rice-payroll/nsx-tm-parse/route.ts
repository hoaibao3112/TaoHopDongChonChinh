import { NextRequest, NextResponse } from 'next/server';
import XLSX from 'xlsx-js-style';
import { isRequestAuthenticated } from '@/lib/auth';
import {
  parseLuaTuoiWorkbook,
  parseLuaKhoWorkbook,
  loadLocalSampleData,
  autoAssignAlternating2Days,
} from '@/lib/rice-payroll/nsx-tm-parser';
import { NSXTMEntry } from '@/lib/rice-payroll/nsx-tm-types';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  if (!isRequestAuthenticated(req)) {
    return NextResponse.json({ error: 'Chưa xác thực phiên đăng nhập' }, { status: 401 });
  }

  try {
    const contentType = req.headers.get('content-type') || '';

    // 1. Trường hợp nạp dữ liệu mẫu có sẵn trên server
    if (contentType.includes('application/json')) {
      const body = await req.json().catch(() => ({}));
      if (body.useSample) {
        const entries = loadLocalSampleData();
        return NextResponse.json({
          success: true,
          entries,
          total: entries.length,
        });
      }
    }

    // 2. Trường hợp upload FormData (file lúa tươi và/hoặc file lúa khô)
    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const fileTuoi = formData.get('fileTuoi') as File | null;
      const fileKho = formData.get('fileKho') as File | null;

      if (!fileTuoi && !fileKho) {
        return NextResponse.json(
          { error: 'Vui lòng chọn ít nhất 1 file Excel (Lúa Tươi hoặc Lúa Khô)' },
          { status: 400 }
        );
      }

      const allEntries: NSXTMEntry[] = [];

      if (fileTuoi) {
        const buf = Buffer.from(await fileTuoi.arrayBuffer());
        const wbTuoi = XLSX.read(buf, { type: 'buffer' });
        const entriesTuoi = parseLuaTuoiWorkbook(wbTuoi);
        allEntries.push(...entriesTuoi);
      }

      if (fileKho) {
        const buf = Buffer.from(await fileKho.arrayBuffer());
        const wbKho = XLSX.read(buf, { type: 'buffer' });
        const entriesKho = parseLuaKhoWorkbook(wbKho);
        allEntries.push(...entriesKho);
      }

      // Tự động gán xen kẽ 2 ngày cho danh sách
      const assigned = autoAssignAlternating2Days(allEntries);

      return NextResponse.json({
        success: true,
        entries: assigned,
        total: assigned.length,
      });
    }

    return NextResponse.json({ error: 'Content-Type không hợp lệ' }, { status: 400 });
  } catch (error) {
    console.error('Lỗi phân tích file NSX TM:', error);
    return NextResponse.json(
      { error: (error as Error).message || 'Không thể phân tích dữ liệu NSX TM' },
      { status: 500 }
    );
  }
}

