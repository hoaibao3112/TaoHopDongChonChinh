import { NextRequest, NextResponse } from 'next/server';
import { isRequestAuthenticated } from '@/lib/auth';
import { reconcileDailyBatches } from '@/lib/rice-payroll/subset-sum-matcher';
import { RiceBatch, DailyWorkReportInput } from '@/lib/rice-payroll/types';

export async function POST(req: NextRequest) {
  if (!isRequestAuthenticated(req)) {
    return NextResponse.json({ error: 'Chưa xác thực phiên đăng nhập' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const batches: RiceBatch[] = body.batches;
    const report: DailyWorkReportInput = body.report;

    if (!report || !report.date) {
      return NextResponse.json(
        { error: 'Vui lòng cung cấp ngày làm việc và thông tin báo công' },
        { status: 400 }
      );
    }

    if (!Array.isArray(batches)) {
      return NextResponse.json(
        { error: 'Danh sách mẻ lúa không hợp lệ' },
        { status: 400 }
      );
    }

    const result = reconcileDailyBatches(batches, report);

    return NextResponse.json({
      success: true,
      result,
    });
  } catch (error) {
    console.error('Lỗi khi đối soát công nhật:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Lỗi khi đối soát công nhật' },
      { status: 500 }
    );
  }
}
