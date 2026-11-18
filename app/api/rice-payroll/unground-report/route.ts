import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';
import * as XLSX from 'xlsx';
import { isRequestAuthenticated } from '@/lib/auth';
import {
  parseUngroundKhoExcel,
  parseUngroundTuoiExcel,
  buildUngroundReport,
  UngroundKhoBatch,
  UngroundTuoiBatch,
} from '@/lib/rice-payroll/unground-report-parser';

export async function GET(request: NextRequest) {
  if (!isRequestAuthenticated(request)) {
    return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
  }

  try {
    let khoBatches: UngroundKhoBatch[] = [];
    let tuoiBatches: UngroundTuoiBatch[] = [];

    const cwd = process.cwd();
    const pathKho = path.join(cwd, 'THỊNH_TỔNG NHẬP LÚA KHÔ NĂM 2026.xlsx');
    const pathTuoi = path.join(cwd, 'THỊNH_TỔNG SỐ LIỆU NHẬP LÚA TƯƠI 2026.xlsx');
    const pathSampleJson = path.join(cwd, 'data', 'sample-unground-data.json');

    // Ưu tiên đọc file Excel gốc nếu có
    if (fs.existsSync(pathKho)) {
      const bufKho = fs.readFileSync(pathKho);
      khoBatches = parseUngroundKhoExcel(bufKho);
    }
    if (fs.existsSync(pathTuoi)) {
      const bufTuoi = fs.readFileSync(pathTuoi);
      tuoiBatches = parseUngroundTuoiExcel(bufTuoi);
    }

    // Nếu trên môi trường cloud không có 2 file lớn thì dùng fallback JSON
    if ((khoBatches.length === 0 || tuoiBatches.length === 0) && fs.existsSync(pathSampleJson)) {
      try {
        const raw = JSON.parse(fs.readFileSync(pathSampleJson, 'utf-8'));
        if (khoBatches.length === 0 && Array.isArray(raw.kho)) khoBatches = raw.kho;
        if (tuoiBatches.length === 0 && Array.isArray(raw.tuoi)) tuoiBatches = raw.tuoi;
      } catch (e) {
        console.warn('Lỗi đọc sample unground json:', e);
      }
    }

    return NextResponse.json({
      success: true,
      kho: khoBatches,
      tuoi: tuoiBatches,
    });
  } catch (error) {
    console.error('Lỗi API unground-report GET:', error);
    return NextResponse.json(
      { error: 'Lỗi tải dữ liệu lúa chưa xay: ' + (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  if (!isRequestAuthenticated(request)) {
    return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
  }

  try {
    const contentType = request.headers.get('content-type') || '';

    // Trường hợp 1: Nhận file upload qua FormData
    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const fileKho = formData.get('fileKho') as File | null;
      const fileTuoi = formData.get('fileTuoi') as File | null;

      let khoBatches: UngroundKhoBatch[] | undefined;
      let tuoiBatches: UngroundTuoiBatch[] | undefined;

      if (fileKho && fileKho.size > 0) {
        const buf = Buffer.from(await fileKho.arrayBuffer());
        khoBatches = parseUngroundKhoExcel(buf);
      }

      if (fileTuoi && fileTuoi.size > 0) {
        const buf = Buffer.from(await fileTuoi.arrayBuffer());
        tuoiBatches = parseUngroundTuoiExcel(buf);
      }

      return NextResponse.json({
        success: true,
        kho: khoBatches,
        tuoi: tuoiBatches,
      });
    }

    // Trường hợp 2: JSON payload (tính báo cáo hoặc xuất Excel)
    const body = await request.json();
    const {
      khoBatches = [],
      tuoiBatches = [],
      reportDate = '16/11/2026',
      customLossMap = {},
      exportExcel = false,
    } = body;

    const report = buildUngroundReport(khoBatches, tuoiBatches, reportDate, customLossMap);

    // Nếu yêu cầu xuất file Excel
    if (exportExcel) {
      const wb = XLSX.utils.book_new();

      // Sheet 1: Tổng Hợp
      const summaryHeader = [
        ['CÔNG TY TNHH XNK CHƠN CHÍNH'],
        [`BÁO CÁO LƯỢNG LÚA KHÔ CHƯA XAY ĐẾN NGÀY ${reportDate}`],
        [`Tổng lượng ước tính: ${report.totalDryHeadTons} tấn (Theo đầu lúa khô)`],
        [],
        [
          'STT',
          'LOẠI LÚA',
          'LÚA KHÔ NẰM TÀI (KG)',
          'LÚA KHÔ (TẤN)',
          'LÚA TƯƠI CHỜ SẤY (KG)',
          'KCS HAO HỤT (%)',
          'HAO HỤT (KG)',
          'TƯƠI QUY ĐỔI KHÔ (TẤN)',
          'TỔNG ĐẦU LÚA KHÔ (TẤN)',
        ],
      ];

      const summaryRows = report.items.map((it, idx) => [
        idx + 1,
        it.loaiLua,
        it.khoKg,
        it.khoTons,
        it.tuoiKg,
        it.kcsLossPercent + '%',
        it.lossKg,
        it.convertedDryTons,
        it.totalDryHeadTons,
      ]);

      const summaryFooter = [
        [
          'TỔNG CỘNG',
          '',
          report.totalKhoKg,
          report.totalKhoTons,
          report.totalTuoiKg,
          '-',
          report.items.reduce((s, it) => s + it.lossKg, 0),
          report.totalTuoiConvertedTons,
          report.totalDryHeadTons,
        ],
        [],
        ['Ghi chú: Số lượng trên là bao gồm lúa khô đang nằm tài và lúa tươi đang nhập sấy, chờ sấy.'],
      ];

      const wsSummary = XLSX.utils.aoa_to_sheet([...summaryHeader, ...summaryRows, ...summaryFooter]);
      XLSX.utils.book_append_sheet(wb, wsSummary, 'TỔNG HỢP CHƯA XAY');

      // Sheet 2: Danh sách mẻ lúa khô
      const khoHeader = [['STT', 'NGÀY CÂN', 'KHÁCH HÀNG / NCC', 'PHƯƠNG TIỆN', 'LOẠI LÚA', 'SỐ LƯỢNG LÚA KHÔ (KG)', 'TẤN']];
      const khoRows = (khoBatches as UngroundKhoBatch[]).map((b, idx) => [
        idx + 1,
        b.ngayCan,
        b.khachHang || '',
        b.xe || '',
        b.loaiLua,
        b.slKg,
        Math.round(b.slKg / 1000),
      ]);
      const wsKho = XLSX.utils.aoa_to_sheet([...khoHeader, ...khoRows]);
      XLSX.utils.book_append_sheet(wb, wsKho, 'LÚA KHÔ NẰM TÀI');

      // Sheet 3: Danh sách mẻ lúa tươi
      const tuoiHeader = [
        ['STT', 'NGÀY CÂN', 'NGÀY NHẬP SẤY', 'KHÁCH HÀNG', 'PHƯƠNG TIỆN', 'LOẠI LÚA', 'SỐ LƯỢNG (KG)', 'KCS MẤT (%)'],
      ];
      const tuoiRows = (tuoiBatches as UngroundTuoiBatch[]).map((b, idx) => [
        idx + 1,
        b.ngayCan,
        b.ngayNhapSay,
        b.khachHang || '',
        b.xe || '',
        b.loaiLua,
        b.slKg,
        b.kcsPercent ? b.kcsPercent + '%' : b.kcsRaw || '',
      ]);
      const wsTuoi = XLSX.utils.aoa_to_sheet([...tuoiHeader, ...tuoiRows]);
      XLSX.utils.book_append_sheet(wb, wsTuoi, 'LÚA TƯƠI CHỜ SẤY');

      const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      const safeDate = reportDate.replace(/\//g, '-');
      const filename = `BAO_CAO_LUA_CHUA_XAY_${safeDate}.xlsx`;

      return new NextResponse(buf, {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      });
    }

    return NextResponse.json({
      success: true,
      report,
    });
  } catch (error) {
    console.error('Lỗi API unground-report POST:', error);
    return NextResponse.json(
      { error: 'Lỗi xử lý báo cáo: ' + (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}
