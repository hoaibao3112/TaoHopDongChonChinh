import { NextRequest, NextResponse } from 'next/server';
import { getRequestUserRole } from '@/lib/auth';
import { buildRiceStatsExcelBuffer } from '@/lib/rice-stats/excel-exporter';
import { RiceMonthlyStatsResult } from '@/lib/rice-stats/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function hasStatsAccess(req: NextRequest): boolean {
  const role = getRequestUserRole(req);
  return role === 'admin' || role === 'payroll' || role === 'baocao' || role === 'contracts';
}

export async function POST(req: NextRequest) {
  if (!hasStatsAccess(req)) {
    return NextResponse.json(
      { error: 'Không có quyền xuất báo cáo Thống Kê Lúa' },
      { status: 403 }
    );
  }

  try {
    const body = (await req.json()) as { stats?: RiceMonthlyStatsResult };
    if (!body?.stats || !body.stats.overview) {
      return NextResponse.json({ error: 'Thiếu dữ liệu thống kê để xuất Excel' }, { status: 400 });
    }

    const buffer = buildRiceStatsExcelBuffer(body.stats);
    const safePeriod = (body.stats.monthKey || 'ALL').replace(/\//g, '_');
    const fileName = `Thong_Ke_Lua_${safePeriod}.xlsx`;

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err: unknown) {
    console.error('[API Rice Stats Export Error]:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Lỗi xuất file Excel thống kê' },
      { status: 500 }
    );
  }
}
