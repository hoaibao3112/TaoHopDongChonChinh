import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { isRequestAuthenticated } from '@/lib/auth';
import { DailyReconciliationResult, RiceBatch } from '@/lib/rice-payroll/types';

export async function POST(req: NextRequest) {
  if (!isRequestAuthenticated(req)) {
    return NextResponse.json({ error: 'Chưa xác thực phiên đăng nhập' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const {
      month = new Date().getMonth() + 1,
      year = new Date().getFullYear(),
      teamName = 'ĐỘI CHÚ 6 THANH - XUẤT CS1',
      dailyLogs = [],
    }: {
      month: number;
      year: number;
      teamName: string;
      dailyLogs: DailyReconciliationResult[];
    } = body;

    // Chuẩn bị dữ liệu bảng Excel
    const title = `BẢNG KÊ TÍNH LƯƠNG THÁNG ${month}/${year} ${teamName.toUpperCase()}`;

    // Hàng tiêu đề các cột
    const headers = [
      'STT',
      'NGÀY XUỐNG LÚA',
      'MÃ LÔ',
      'KHÁCH HÀNG',
      'LOẠI LÚA',
      'CƠ SỞ SẤY',
      'PHƯƠNG TIỆN XUẤT',
      'CÂN NHẬP SẤY (KG)',
      'SỐ LƯỢNG (TẤN)',
      'CÔNG ĐOẠN',
      'ĐƠN GIÁ (VNĐ/TẤN)',
      'THÀNH TIỀN (VNĐ)',
      'GHI CHÚ',
    ];

    const rows: (string | number)[][] = [];

    let totalKg = 0;
    let totalTons = 0;
    let totalSalary = 0;
    let stt = 1;

    dailyLogs.forEach((log) => {
      // Các mẻ có trở
      log.batchesCoTro.forEach((b: RiceBatch) => {
        const itemAmount = b.roundedTons * log.unitPriceCoTro;
        totalKg += b.dryWeightKg;
        totalTons += b.roundedTons;
        totalSalary += itemAmount;

        rows.push([
          stt++,
          b.dischargeDate || log.date,
          b.batchCode,
          b.customerName,
          b.riceType,
          b.dryFacility,
          b.dryVehicle,
          b.dryWeightKg,
          b.roundedTons,
          'Xuất có trở',
          log.unitPriceCoTro,
          itemAmount,
          `Khớp ngày ${log.date}`,
        ]);
      });

      // Các mẻ không trở
      log.batchesKhongTro.forEach((b: RiceBatch) => {
        const itemAmount = b.roundedTons * log.unitPriceKhongTro;
        totalKg += b.dryWeightKg;
        totalTons += b.roundedTons;
        totalSalary += itemAmount;

        rows.push([
          stt++,
          b.dischargeDate || log.date,
          b.batchCode,
          b.customerName,
          b.riceType,
          b.dryFacility,
          b.dryVehicle,
          b.dryWeightKg,
          b.roundedTons,
          'Xuất không trở',
          log.unitPriceKhongTro,
          itemAmount,
          `Khớp ngày ${log.date}`,
        ]);
      });
    });

    // Dòng tổng cộng
    const summaryRow: (string | number)[] = [
      'TỔNG',
      '',
      '',
      '',
      '',
      '',
      '',
      totalKg,
      totalTons,
      '',
      '',
      totalSalary,
      '',
    ];

    const sheetData = [
      [title],
      [],
      headers,
      ...rows,
      summaryRow,
    ];

    const ws = XLSX.utils.aoa_to_sheet(sheetData);

    // Cài đặt độ rộng cột
    ws['!cols'] = [
      { wch: 6 },  // STT
      { wch: 16 }, // Ngày
      { wch: 18 }, // Mã lô
      { wch: 22 }, // Khách hàng
      { wch: 14 }, // Loại lúa
      { wch: 16 }, // Cơ sở sấy
      { wch: 16 }, // Phương tiện
      { wch: 18 }, // Cân kg
      { wch: 16 }, // Số tấn
      { wch: 16 }, // Công đoạn
      { wch: 18 }, // Đơn giá
      { wch: 20 }, // Thành tiền
      { wch: 25 }, // Ghi chú
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Lương T${month}-${year}`);

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    const safeFileName = `Bang_Ke_Luong_T${month}_${year}_${teamName.replace(/[^a-zA-Z0-9_-]/g, '_')}.xlsx`;

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(safeFileName)}"`,
      },
    });
  } catch (error) {
    console.error('Lỗi khi xuất bảng lương Excel:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Lỗi khi xuất bảng lương' },
      { status: 500 }
    );
  }
}

