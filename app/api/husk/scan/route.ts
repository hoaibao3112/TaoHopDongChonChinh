import { NextRequest, NextResponse } from 'next/server';
import { isRequestAuthenticated } from '@/lib/auth';
import { checkRateLimit, getClientIp } from '@/lib/security/rateLimit';
import { GeminiOcrProvider } from '@/lib/ocr/gemini';
import { preprocessSlipImage } from '@/lib/ocr/preprocess';
import { calculateHuskTons } from '@/lib/husk/tonnage';
import { formatWorkDescription, parseVehicle } from '@/lib/husk/plate';
import { validateSlipItem } from '@/lib/husk/validator';
import { readExistingPayrollExcel } from '@/lib/excel/readExisting';
import { ScannedSlipItem, ExistingExcelRow } from '@/lib/husk/types';

// ✅ Rate limit: Tối đa 5 lần scan / phút / IP (mỗi lần tối đa 30 ảnh)
const SCAN_MAX_REQUESTS = 5;
const SCAN_WINDOW_MS = 60 * 1000; // 1 phút

/**
 * Kiểm tra magic bytes để xác nhận file là ảnh thực sự (chống upload file giả)
 */
function validateImageMagicBytes(buffer: Buffer): void {
  if (buffer.length < 12) {
    throw new Error('File quá nhỏ, không phải ảnh hợp lệ');
  }

  const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const isPng =
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a;
  const isWebp =
    buffer.slice(0, 4).toString('ascii') === 'RIFF' &&
    buffer.slice(8, 12).toString('ascii') === 'WEBP';
  const isHeic =
    buffer.slice(4, 8).toString('ascii') === 'ftyp' ||
    buffer.slice(4, 8).toString('ascii') === 'ftypheic' ||
    buffer.slice(4, 8).toString('ascii') === 'ftyphevx';

  if (!isJpeg && !isPng && !isWebp && !isHeic) {
    throw new Error('File không phải định dạng ảnh hợp lệ (chỉ chấp nhận JPEG, PNG, WEBP, HEIC)');
  }
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Tăng timeout cho Vercel Serverless Function lên 60s

export async function POST(req: NextRequest) {
  if (!isRequestAuthenticated(req)) {
    return NextResponse.json({ error: 'Chưa xác thực phiên đăng nhập' }, { status: 401 });
  }

  // ✅ Bảo mật: Rate limit chống quota exhaustion
  const ip = getClientIp(req);
  const rateLimit = checkRateLimit(ip, 'husk-scan', SCAN_MAX_REQUESTS, SCAN_WINDOW_MS);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        error: `Quá nhiều yêu cầu quét. Vui lòng thử lại sau ${rateLimit.retryAfterSeconds} giây.`,
      },
      {
        status: 429,
        headers: {
          'Retry-After': String(rateLimit.retryAfterSeconds),
          'X-RateLimit-Limit': String(SCAN_MAX_REQUESTS),
          'X-RateLimit-Remaining': '0',
        },
      }
    );
  }

  try {
    const formData = await req.formData();
    const excelFile = formData.get('excelFile') as File | null;
    const unitPrice = parseInt(String(formData.get('unitPrice') || '11000'), 10);
    const sheetName = String(formData.get('sheetName') || 'QUÝ');

    // Lấy các file ảnh (tối đa 30 ảnh)
    const imageFiles: File[] = [];
    formData.forEach((value, key) => {
      if (key === 'images' && value instanceof File) {
        imageFiles.push(value);
      }
    });

    if (imageFiles.length === 0) {
      return NextResponse.json({ error: 'Vui lòng tải lên ít nhất một ảnh phiếu cân' }, { status: 400 });
    }

    if (imageFiles.length > 30) {
      return NextResponse.json({ error: 'Giới hạn tối đa 30 ảnh phiếu cân cho mỗi lượt quét' }, { status: 400 });
    }

    // 1. Nếu có file Excel mẫu gửi kèm -> Đọc dữ liệu đã có để phát hiện trùng & nhận diện tên đội
    let existingRows: ExistingExcelRow[] = [];
    let detectedTeam: string | undefined;
    let detectedSheetName: string | undefined;
    if (excelFile && excelFile.size > 0) {
      try {
        const excelBytes = await excelFile.arrayBuffer();
        const analysis = await readExistingPayrollExcel(Buffer.from(excelBytes), sheetName);
        existingRows = analysis.existingRows;
        detectedTeam = analysis.detectedTeam;
        detectedSheetName = analysis.sheetName;
      } catch (excelErr: unknown) {
        console.warn('Cảnh báo: Không thể phân tích file Excel hiện có, tiếp tục quét OCR không đối chiếu trùng:', excelErr);
      }
    }

    // 2. Khởi tạo OCR Provider (Gemini với danh sách nhiều key dự phòng tự động luân chuyển)
    let ocrProvider: GeminiOcrProvider;
    try {
      ocrProvider = new GeminiOcrProvider();
    } catch (e) {
      return NextResponse.json(
        { error: 'Chưa cấu hình GEMINI_API_KEY trên môi trường server: ' + (e instanceof Error ? e.message : String(e)) },
        { status: 500 }
      );
    }

    // 3. Xử lý từng ảnh phiếu cân
    const scannedItems: ScannedSlipItem[] = [];
    const batchSummary: Array<{ id: string; date: string; vehicle: string; weightNetKg: number }> = [];

    for (let i = 0; i < imageFiles.length; i++) {
      const file = imageFiles[i];
      const slipId = `slip-${Date.now()}-${i}`;

      try {
        if (file.size > 10 * 1024 * 1024) {
          throw new Error('Ảnh vượt quá kích thước 10MB');
        }

        const arrayBuf = await file.arrayBuffer();
        const inputBuffer = Buffer.from(arrayBuf);

        // ✅ Bảo mật: Kiểm tra magic bytes để xác nhận đây là file ảnh thực sự
        validateImageMagicBytes(inputBuffer);

        // Tiền xử lý ảnh (xoay EXIF, resize, tạo thumbnail)
        const preprocessed = await preprocessSlipImage(inputBuffer);

        // Gọi OCR với cơ chế Retry 1 lần nếu gặp lỗi mạng/429
        let ocrResult;
        try {
          ocrResult = await ocrProvider.extractSlipData(preprocessed.processedBuffer, preprocessed.mimeType);
        } catch {
          // Retry lần 1
          await new Promise((res) => setTimeout(res, 800));
          ocrResult = await ocrProvider.extractSlipData(preprocessed.processedBuffer, preprocessed.mimeType);
        }

        const rawKg = ocrResult.tl_hang_kg ?? 0;
        const grossKg = ocrResult.tl_xe_hang_kg ?? 0;
        const tareKg = ocrResult.tl_xe_kg ?? 0;

        const tons = calculateHuskTons(rawKg);
        const amount = Math.round(tons * unitPrice);

        const vInfo = parseVehicle(ocrResult.so_xe || '');
        const desc = formatWorkDescription(vInfo.normalized, ocrResult.khach_hang || '');

        const rawSlip = {
          id: slipId,
          fileName: file.name,
          thumbnailBase64: preprocessed.thumbnailBase64,
          ticketNumber: ocrResult.so_phieu || undefined,
          customer: ocrResult.khach_hang || '',
          vehicle: vInfo.normalized,
          productType: ocrResult.loai_hang || '',
          direction: ocrResult.xuat_nhap || 'Xuất',
          date: ocrResult.ngay_can || '',
          weightGrossKg: grossKg,
          weightTareKg: tareKg,
          weightNetKg: rawKg,
          handwrittenNote: ocrResult.ghi_chu_viet_tay || undefined,
          tons,
          unitPrice,
          amount,
          description: desc,
        };

        // Đưa vào batch list để check trùng chéo trong lô
        batchSummary.push({
          id: slipId,
          date: rawSlip.date,
          vehicle: rawSlip.vehicle,
          weightNetKg: rawSlip.weightNetKg,
        });

        // Kiểm tra tính hợp lệ và cảnh báo
        const validation = validateSlipItem(rawSlip, existingRows, batchSummary);

        scannedItems.push({
          ...rawSlip,
          warnings: validation.warnings,
          isDuplicateExisting: validation.isDuplicateExisting,
          isDuplicateInBatch: validation.isDuplicateInBatch,
          selected: validation.selected,
        });
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        scannedItems.push({
          id: slipId,
          fileName: file.name,
          selected: false,
          customer: '',
          vehicle: '',
          productType: '',
          direction: '',
          date: '',
          weightGrossKg: 0,
          weightTareKg: 0,
          weightNetKg: 0,
          tons: 0,
          unitPrice,
          amount: 0,
          description: '',
          warnings: [`Lỗi xử lý ảnh: ${errorMsg}`],
          isDuplicateExisting: false,
          isDuplicateInBatch: false,
        });
      }
    }

    return NextResponse.json({
      success: true,
      slips: scannedItems,
      totalScanned: scannedItems.length,
      existingCount: existingRows.length,
      detectedTeam,
      detectedSheetName,
    });
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: `Quá trình quét phiếu thất bại: ${errorMsg}` }, { status: 500 });
  }
}
