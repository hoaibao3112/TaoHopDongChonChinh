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
import sampleUngroundData from '@/data/sample-unground-data.json';

/** Tên file lúa khô/tươi sau khi người dùng upload lên server */
const FILE_KHO_NAME = 'THINH_LUA_KHO.xlsx';
const FILE_TUOI_NAME = 'THINH_LUA_TUOI.xlsx';
/** Tên file gốc (legacy) — dùng làm fallback nếu chưa upload file mới */
const FILE_KHO_LEGACY = 'THỊNH_TỔNG NHẬP LÚA KHÔ NĂM 2026.xlsx';
const FILE_TUOI_LEGACY = 'THỊNH_TỔNG SỐ LIỆU NHẬP LÚA TƯƠI 2026.xlsx';

/** Đường dẫn metadata — gọi trong request handler */
function getMetaFilePath(): string {
  return path.join(process.cwd(), 'data', 'unground-file-meta.json');
}

/** Đọc metadata file đã lưu (tên gốc, thời gian upload) */
function readFileMeta(): { kho?: { name: string; updatedAt: string }; tuoi?: { name: string; updatedAt: string } } {
  try {
    const metaFile = getMetaFilePath();
    if (fs.existsSync(metaFile)) {
      return JSON.parse(fs.readFileSync(metaFile, 'utf-8'));
    }
  } catch {}
  return {};
}

/** Lưu metadata (nếu hệ thống tệp cho phép ghi) */
function writeFileMeta(meta: { kho?: { name: string; updatedAt: string }; tuoi?: { name: string; updatedAt: string } }) {
  try {
    const metaFile = getMetaFilePath();
    const dir = path.dirname(metaFile);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(metaFile, JSON.stringify(meta, null, 2), 'utf-8');
  } catch (e) {
    console.warn('Hệ thống tệp read-only hoặc không thể ghi metadata:', e);
  }
}

/** Lấy đường dẫn file lúa (ưu tiên file người dùng upload, fallback sang file legacy) */
function resolveFilePath(cwd: string, newName: string, legacyName: string): string | null {
  try {
    const p1 = path.join(cwd, 'data', newName);
    if (fs.existsSync(p1)) return p1;
    const p2 = path.join(cwd, legacyName);
    if (fs.existsSync(p2)) return p2;
  } catch {}
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
    const meta = readFileMeta();

    // Ưu tiên đọc file Excel nếu có trong môi trường
    const pathKho = resolveFilePath(cwd, FILE_KHO_NAME, FILE_KHO_LEGACY);
    const pathTuoi = resolveFilePath(cwd, FILE_TUOI_NAME, FILE_TUOI_LEGACY);

    if (pathKho) {
      try {
        const bufKho = fs.readFileSync(pathKho);
        khoBatches = parseUngroundKhoExcel(bufKho);
      } catch (errKho) {
        console.warn('Lỗi đọc parse lúa khô:', errKho);
      }
    }
    if (pathTuoi) {
      try {
        const bufTuoi = fs.readFileSync(pathTuoi);
        tuoiBatches = parseUngroundTuoiExcel(bufTuoi);
      } catch (errTuoi) {
        console.warn('Lỗi đọc parse lúa tươi:', errTuoi);
      }
    }

    // Luôn fallback an toàn sang sample data tĩnh nếu không có file hoặc file rỗng
    if (khoBatches.length === 0 && Array.isArray(sampleUngroundData.kho)) {
      khoBatches = sampleUngroundData.kho as UngroundKhoBatch[];
    }
    if (tuoiBatches.length === 0 && Array.isArray(sampleUngroundData.tuoi)) {
      tuoiBatches = sampleUngroundData.tuoi as UngroundTuoiBatch[];
    }

    return NextResponse.json({
      success: true,
      kho: khoBatches,
      tuoi: tuoiBatches,
      fileMeta: {
        kho: meta.kho ?? null,
        tuoi: meta.tuoi ?? null,
        khoPath: pathKho ? path.basename(pathKho) : null,
        tuoiPath: pathTuoi ? path.basename(pathTuoi) : null,
      },
    });
  } catch (error) {
    console.error('Lỗi API unground-report GET:', error);
    // Vẫn trả về fallback an toàn kèm status 200 để client không bị trắng trang / lỗi 500
    return NextResponse.json({
      success: true,
      kho: (sampleUngroundData.kho || []) as UngroundKhoBatch[],
      tuoi: (sampleUngroundData.tuoi || []) as UngroundTuoiBatch[],
      fileMeta: { kho: null, tuoi: null, khoPath: null, tuoiPath: null },
      warning: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * PUT /api/rice-payroll/unground-report
 * Nhận FormData với fileKho và/hoặc fileTuoi.
 * Parse mẻ lúa và lưu vĩnh viễn (nếu filesystem cho phép) hoặc trả batches về để client lưu LocalStorage.
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
    const meta = readFileMeta();
    const result: { kho?: { name: string; count: number }; tuoi?: { name: string; count: number } } = {};
    let parsedKhoBatches: UngroundKhoBatch[] | undefined;
    let parsedTuoiBatches: UngroundTuoiBatch[] | undefined;

    if (fileKho && fileKho.size > 0) {
      const buf = Buffer.from(await fileKho.arrayBuffer());
      parsedKhoBatches = parseUngroundKhoExcel(buf);
      try {
        if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
        fs.writeFileSync(path.join(dataDir, FILE_KHO_NAME), buf);
      } catch (fsErr) {
        console.warn('Serverless read-only, không thể ghi fileKho vào đĩa:', fsErr);
      }
      meta.kho = { name: fileKho.name, updatedAt: new Date().toISOString() };
      result.kho = { name: fileKho.name, count: parsedKhoBatches.length };
    }

    if (fileTuoi && fileTuoi.size > 0) {
      const buf = Buffer.from(await fileTuoi.arrayBuffer());
      parsedTuoiBatches = parseUngroundTuoiExcel(buf);
      try {
        if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
        fs.writeFileSync(path.join(dataDir, FILE_TUOI_NAME), buf);
      } catch (fsErr) {
        console.warn('Serverless read-only, không thể ghi fileTuoi vào đĩa:', fsErr);
      }
      meta.tuoi = { name: fileTuoi.name, updatedAt: new Date().toISOString() };
      result.tuoi = { name: fileTuoi.name, count: parsedTuoiBatches.length };
    }

    writeFileMeta(meta);

    return NextResponse.json({
      success: true,
      saved: result,
      fileMeta: meta,
      kho: parsedKhoBatches,
      tuoi: parsedTuoiBatches,
    });
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
