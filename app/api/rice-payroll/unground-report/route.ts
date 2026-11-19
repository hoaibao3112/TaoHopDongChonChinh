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

/** Tên file lúa khô/tươi mà server sẽ đọc (ưu tiên file người dùng upload) */
const FILE_KHO_NAME = 'THINH_LUA_KHO.xlsx';
const FILE_TUOI_NAME = 'THINH_LUA_TUOI.xlsx';
const FILE_KHO_LEGACY = 'THỊNH_TỔNG NHẬP LÚA KHÔ NĂM 2026.xlsx';
const FILE_TUOI_LEGACY = 'THỊNH_TỔNG SỐ LIỆU NHẬP LÚA TƯƠI 2026.xlsx';
const META_FILE = path.join(process.cwd(), 'data', 'unground-file-meta.json');

/** Đọc metadata file đã lưu (tên gốc, thời gian upload) */
function readFileMeta(): { kho?: { name: string; updatedAt: string }; tuoi?: { name: string; updatedAt: string } } {
  try {
    if (fs.existsSync(META_FILE)) {
      return JSON.parse(fs.readFileSync(META_FILE, 'utf-8'));
    }
  } catch {}
  return {};
}

/** Lưu metadata */
function writeFileMeta(meta: { kho?: { name: string; updatedAt: string }; tuoi?: { name: string; updatedAt: string } }) {
  try {
    const dir = path.dirname(META_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(META_FILE, JSON.stringify(meta, null, 2), 'utf-8');
  } catch (e) {
    console.warn('Không thể ghi metadata file lúa:', e);
  }
}

/** Lấy đường dẫn file lúa (ưu tiên file người dùng upload, fallback sang file legacy) */
function resolveFilePath(cwd: string, newName: string, legacyName: string): string | null {
  const p1 = path.join(cwd, 'data', newName);
  if (fs.existsSync(p1)) return p1;
  const p2 = path.join(cwd, legacyName);
  if (fs.existsSync(p2)) return p2;
  return null;
}

export async function GET(request: NextRequest) {
  if (!isRequestAuthenticated(request)) {
    return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
  }

  try {
    let khoBatches: UngroundKhoBatch[] = [];
    let tuoiBatches: UngroundTuoiBatch[] = [];

    const cwd = process.cwd();
    const pathSampleJson = path.join(cwd, 'data', 'sample-unground-data.json');
    const meta = readFileMeta();

    // Ưu tiên đọc file người dùng đã upload, fallback sang file legacy có tên cũ
    const pathKho = resolveFilePath(cwd, FILE_KHO_NAME, FILE_KHO_LEGACY);
    const pathTuoi = resolveFilePath(cwd, FILE_TUOI_NAME, FILE_TUOI_LEGACY);

    if (pathKho) {
      const bufKho = fs.readFileSync(pathKho);
      khoBatches = parseUngroundKhoExcel(bufKho);
    }
    if (pathTuoi) {
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
      // Metadata để UI hiển thị trạng thái file
      fileMeta: {
        kho: meta.kho ?? null,
        tuoi: meta.tuoi ?? null,
        khoPath: pathKho ? path.basename(pathKho) : null,
        tuoiPath: pathTuoi ? path.basename(pathTuoi) : null,
      },
    });
  } catch (error) {
    console.error('Lỗi API unground-report GET:', error);
    return NextResponse.json(
      { error: 'Lỗi tải dữ liệu lúa chưa xay: ' + (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/rice-payroll/unground-report
 * Nhận FormData với fileKho và/hoặc fileTuoi, lưu vĩnh viễn vào server.
 * Lần sau GET sẽ tự đọc file đã lưu → không cần upload lại mỗi ngày.
 */
export async function PUT(request: NextRequest) {
  if (!isRequestAuthenticated(request)) {
    return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const fileKho = formData.get('fileKho') as File | null;
    const fileTuoi = formData.get('fileTuoi') as File | null;

    if (!fileKho && !fileTuoi) {
      return NextResponse.json({ error: 'Không có file nào được gửi lên' }, { status: 400 });
    }

    const cwd = process.cwd();
    const dataDir = path.join(cwd, 'data');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

    const meta = readFileMeta();
    const result: { kho?: { name: string; count: number }; tuoi?: { name: string; count: number } } = {};

    if (fileKho && fileKho.size > 0) {
      const buf = Buffer.from(await fileKho.arrayBuffer());
      // Kiểm tra parse được không trước khi lưu
      const batches = parseUngroundKhoExcel(buf);
      // Lưu file vào thư mục data/
      fs.writeFileSync(path.join(dataDir, FILE_KHO_NAME), buf);
      meta.kho = { name: fileKho.name, updatedAt: new Date().toISOString() };
      result.kho = { name: fileKho.name, count: batches.length };
    }

    if (fileTuoi && fileTuoi.size > 0) {
      const buf = Buffer.from(await fileTuoi.arrayBuffer());
      const batches = parseUngroundTuoiExcel(buf);
      fs.writeFileSync(path.join(dataDir, FILE_TUOI_NAME), buf);
      meta.tuoi = { name: fileTuoi.name, updatedAt: new Date().toISOString() };
      result.tuoi = { name: fileTuoi.name, count: batches.length };
    }

    writeFileMeta(meta);

    return NextResponse.json({ success: true, saved: result, fileMeta: meta });
  } catch (error) {
    console.error('Lỗi API unground-report PUT:', error);
    return NextResponse.json(
      { error: 'Lỗi lưu file: ' + (error instanceof Error ? error.message : String(error)) },
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
