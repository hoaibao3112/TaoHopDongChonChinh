import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getRequestUserRole } from '@/lib/auth';
import { analyzeRiceMonthlyStats } from '@/lib/rice-stats/monthly-stats-parser';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEFAULT_FRESH_FILE = 'THỊNH_TỔNG SỐ LIỆU NHẬP LÚA TƯƠI 2026.xlsx';
const DEFAULT_DRY_FILE = 'THỊNH_TỔNG NHẬP LÚA KHÔ NĂM 2026.xlsx';
const DEFAULT_CONTRACT_FILE = 'HỢP ĐỒNG LÚA NĂM 2026.xlsx';

function hasStatsAccess(req: NextRequest): boolean {
  const role = getRequestUserRole(req);
  return role === 'admin' || role === 'payroll' || role === 'baocao' || role === 'contracts';
}

export async function POST(req: NextRequest) {
  if (!hasStatsAccess(req)) {
    return NextResponse.json(
      { error: 'Không có quyền truy cập phân hệ Thống Kê Lúa' },
      { status: 403 }
    );
  }

  try {
    const formData = await req.formData();
    const freshEntry = formData.get('freshFile');
    const dryEntry = formData.get('dryFile');
    const contractEntry = formData.get('contractFile');
    const monthKey = String(formData.get('monthKey') || '').trim();
    const useLocalSample = String(formData.get('useLocalSample') || '') === 'true';

    let freshBuffer: Buffer | null = null;
    let dryBuffer: Buffer | null = null;
    let contractBuffer: Buffer | null = null;

    if (freshEntry instanceof File && freshEntry.size > 0) {
      freshBuffer = Buffer.from(await freshEntry.arrayBuffer());
    } else if (useLocalSample) {
      const localFresh = path.join(process.cwd(), DEFAULT_FRESH_FILE);
      if (fs.existsSync(localFresh)) {
        freshBuffer = fs.readFileSync(localFresh);
      }
    }

    if (dryEntry instanceof File && dryEntry.size > 0) {
      dryBuffer = Buffer.from(await dryEntry.arrayBuffer());
    } else if (useLocalSample) {
      const localDry = path.join(process.cwd(), DEFAULT_DRY_FILE);
      if (fs.existsSync(localDry)) {
        dryBuffer = fs.readFileSync(localDry);
      }
    }

    if (contractEntry instanceof File && contractEntry.size > 0) {
      contractBuffer = Buffer.from(await contractEntry.arrayBuffer());
    } else if (useLocalSample) {
      const localContract = path.join(process.cwd(), DEFAULT_CONTRACT_FILE);
      if (fs.existsSync(localContract)) {
        contractBuffer = fs.readFileSync(localContract);
      }
    }

    if (!freshBuffer && !dryBuffer && !contractBuffer) {
      return NextResponse.json(
        { error: 'Vui lòng tải lên ít nhất 1 file Excel Lúa Tươi, Lúa Khô hoặc Hợp Đồng.' },
        { status: 400 }
      );
    }

    const result = analyzeRiceMonthlyStats({
      freshBuffer,
      dryBuffer,
      contractBuffer,
      monthKey: monthKey || undefined,
    });

    return NextResponse.json({ success: true, data: result });
  } catch (err: unknown) {
    console.error('[API Rice Stats Analyze Error]:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Lỗi phân tích file Excel lúa' },
      { status: 500 }
    );
  }
}
