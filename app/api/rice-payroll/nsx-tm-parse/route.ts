import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';
import { isRequestAuthenticated } from '@/lib/auth';
import {
  parseLuaTuoiWorkbook,
  parseLuaKhoWorkbook,
} from '@/lib/rice-payroll/nsx-tm-parser';
import { autoAssignAlternating2Days } from '@/lib/rice-payroll/nsx-tm-utils';
import { NSXTMEntry } from '@/lib/rice-payroll/nsx-tm-types';

export const runtime = 'nodejs';

/**
 * Đọc dữ liệu mẫu từ các file có sẵn trên máy (chạy trên Node.js server)
 */
function loadLocalSampleData(): NSXTMEntry[] {
  const filePathTuoi = path.join(process.cwd(), 'THỊNH_TỔNG SỐ LIỆU NHẬP LÚA TƯƠI 2026.xlsx');
  const filePathKho = path.join(process.cwd(), 'THỊNH_TỔNG NHẬP LÚA KHÔ NĂM 2026.xlsx');

  const entries: NSXTMEntry[] = [];

  if (fs.existsSync(filePathTuoi)) {
    try {
      const buf = fs.readFileSync(filePathTuoi);
      const wb = XLSX.read(buf, {
        type: 'buffer',
        dense: true,
        cellFormula: false,
        cellHTML: false,
        cellText: false,
      });
      const tuoi = parseLuaTuoiWorkbook(wb);
      entries.push(...tuoi);
    } catch (e) {
      console.warn('Lỗi đọc file lúa tươi mẫu:', e);
    }
  }

  if (fs.existsSync(filePathKho)) {
    try {
      const buf = fs.readFileSync(filePathKho);
      const wb = XLSX.read(buf, {
        type: 'buffer',
        dense: true,
        cellFormula: false,
        cellHTML: false,
        cellText: false,
      });
      const kho = parseLuaKhoWorkbook(wb);
      entries.push(...kho);
    } catch (e) {
      console.warn('Lỗi đọc file lúa khô mẫu:', e);
    }
  }

  return autoAssignAlternating2Days(entries);
}

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
        const wbTuoi = XLSX.read(buf, {
          type: 'buffer',
          dense: true,
          cellFormula: false,
          cellHTML: false,
          cellText: false,
        });
        const entriesTuoi = parseLuaTuoiWorkbook(wbTuoi);
        allEntries.push(...entriesTuoi);
      }

      if (fileKho) {
        const buf = Buffer.from(await fileKho.arrayBuffer());
        const wbKho = XLSX.read(buf, {
          type: 'buffer',
          dense: true,
          cellFormula: false,
          cellHTML: false,
          cellText: false,
        });
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

    return NextResponse.json(
      { error: 'Định dạng yêu cầu không hợp lệ' },
      { status: 400 }
    );
  } catch (err: any) {
    console.error('Lỗi khi phân tích file nhập sấy NSX TM:', err);
    return NextResponse.json(
      { error: err?.message || 'Không thể đọc file Excel. Vui lòng kiểm tra lại định dạng file.' },
      { status: 500 }
    );
  }
}
