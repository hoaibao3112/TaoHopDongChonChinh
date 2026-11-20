import { NextRequest, NextResponse } from 'next/server';
import { isRequestAuthenticated } from '@/lib/auth';
import { extractDangTaiSlipData } from '@/lib/dang-tai/ocr';
import { processWeighingSlip, calculateDangTaiSummary } from '@/lib/dang-tai/orderValidator';
import { getDangTaiList, saveDangTaiList } from '@/lib/dang-tai/storage';
import { XeDangTai } from '@/lib/dang-tai/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60; // 60s timeout for AI OCR

function getTodayString(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export async function POST(req: NextRequest) {
  if (!isRequestAuthenticated(req)) {
    return NextResponse.json({ error: 'Chưa xác thực phiên đăng nhập' }, { status: 401 });
  }

  try {
    const formData = await req.formData();
    const date = (formData.get('date') as string) || getTodayString();

    const clientItemsRaw = formData.get('currentItems') as string | null;
    let currentList: XeDangTai[] = [];

    if (clientItemsRaw) {
      try {
        const parsed = JSON.parse(clientItemsRaw);
        if (Array.isArray(parsed)) {
          currentList = parsed;
        }
      } catch {
        // Fallback
      }
    }

    if (currentList.length === 0) {
      currentList = await getDangTaiList(date);
    }

    // Lấy danh sách file ảnh
    const imageFiles: File[] = [];
    formData.forEach((value, key) => {
      if (key === 'images' && value instanceof File) {
        imageFiles.push(value);
      }
    });

    if (imageFiles.length === 0) {
      return NextResponse.json({ error: 'Vui lòng chọn ít nhất 1 ảnh phiếu cân' }, { status: 400 });
    }

    const scanResults = [];

    for (let i = 0; i < imageFiles.length; i++) {
      const file = imageFiles[i];
      const buffer = Buffer.from(await file.arrayBuffer());
      const mimeType = file.type || 'image/jpeg';

      // Tạo thumbnail data URI (hoặc preview URI)
      const base64Image = `data:${mimeType};base64,${buffer.toString('base64')}`;

      try {
        // 1. Trích xuất OCR bằng Gemini
        const ocrData = await extractDangTaiSlipData(buffer, mimeType);

        // 2. Khớp xe và kiểm tra tính hợp lệ của thứ tự STT
        const processResult = processWeighingSlip(ocrData, currentList, base64Image);

        // 3. Cập nhật danh sách hiện tại cho lần lặp tiếp theo
        currentList = processResult.danhSachCapNhat;

        scanResults.push({
          fileName: file.name,
          success: true,
          matched: processResult.matched,
          isValidOrder: processResult.isValidOrder,
          warningMessage: processResult.warningMessage,
          phieu: ocrData,
          updatedXe: processResult.updatedXe,
        });
      } catch (err: unknown) {
        console.error(`[Scan Slip Error] File ${file.name}:`, err);
        scanResults.push({
          fileName: file.name,
          success: false,
          error: err instanceof Error ? err.message : 'Không đọc được phiếu cân',
        });
      }
    }

    // Lưu danh sách cập nhật vào bộ nhớ/storage
    await saveDangTaiList(date, currentList);
    const summary = calculateDangTaiSummary(currentList, date);

    return NextResponse.json({
      success: true,
      message: `Đã xử lý ${imageFiles.length} phiếu cân`,
      results: scanResults,
      updatedList: currentList,
      summary,
    });
  } catch (err: unknown) {
    console.error('[API DangTai Scan Error]:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Lỗi hệ thống khi quét phiếu cân' },
      { status: 500 }
    );
  }
}
