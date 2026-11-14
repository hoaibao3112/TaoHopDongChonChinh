import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { isRequestAuthenticated } from '@/lib/auth';
import { parseXuatNSXTMWorkbook } from '@/lib/rice-payroll/xuat-nsx-tm-parser';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const isAuth = await isRequestAuthenticated(req);
    if (!isAuth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) {
      return NextResponse.json({ error: 'Chưa đính kèm file Excel' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const wb = XLSX.read(buffer, { type: 'buffer' });

    const entries = parseXuatNSXTMWorkbook(wb);

    return NextResponse.json({
      success: true,
      fileName: file.name,
      totalEntries: entries.length,
      entries,
    });
  } catch (error: any) {
    console.error('Lỗi parse file Xuất NSX TM:', error);
    return NextResponse.json({ error: error?.message || 'Lỗi đọc file Excel' }, { status: 500 });
  }
}

