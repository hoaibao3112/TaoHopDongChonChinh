import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getRequestUserRole } from '@/lib/auth';
import { analyzeRiceAudit } from '@/lib/rice-audit/audit-engine';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEFAULT_FRESH_FILE = 'THỊNH_TỔNG SỐ LIỆU NHẬP LÚA TƯƠI 2026.xlsx';
const DEFAULT_DRY_FILE = 'THỊNH_TỔNG NHẬP LÚA KHÔ NĂM 2026.xlsx';
const DEFAULT_CONTRACT_FILE = 'HỢP ĐỒNG LÚA NĂM 2026.xlsx';

function hasAuditAccess(req: NextRequest): boolean {
  const role = getRequestUserRole(req);
  return (
    role === 'kiemtra' ||
    role === 'admin' ||
    role === 'payroll' ||
    role === 'baocao' ||
    role === 'contracts'
  );
}

export async function POST(req: NextRequest) {
  if (!hasAuditAccess(req)) {
    return NextResponse.json(
      { error: 'Không có quyền truy cập phân hệ Kiểm Tra Lỗi Lúa' },
      { status: 403 }
    );
  }

  try {
    const body = (await req.json().catch(() => ({}))) as { priceDeviationPct?: number };
    const priceDeviationPct =
      typeof body.priceDeviationPct === 'number' && body.priceDeviationPct >= 1 && body.priceDeviationPct <= 50
        ? body.priceDeviationPct
        : 6;

    const localFresh = path.join(process.cwd(), DEFAULT_FRESH_FILE);
    const localDry = path.join(process.cwd(), DEFAULT_DRY_FILE);
    const localContract = path.join(process.cwd(), DEFAULT_CONTRACT_FILE);

    const freshBuffer = fs.existsSync(localFresh) ? fs.readFileSync(localFresh) : null;
    const dryBuffer = fs.existsSync(localDry) ? fs.readFileSync(localDry) : null;
    const contractBuffer = fs.existsSync(localContract) ? fs.readFileSync(localContract) : null;

    if (!freshBuffer && !dryBuffer) {
      return NextResponse.json(
        { error: 'Không tìm thấy 2 file Excel mẫu trên máy chủ. Vui lòng chọn file trực tiếp từ máy của bạn.' },
        { status: 404 }
      );
    }

    const result = analyzeRiceAudit({
      freshBuffer,
      dryBuffer,
      contractBuffer,
      priceDeviationPct,
    });

    return NextResponse.json({ success: true, data: result });
  } catch (err: unknown) {
    console.error('[API Rice Audit Sample Error]:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Lỗi phân tích file Excel mẫu' },
      { status: 500 }
    );
  }
}
