import { NextRequest, NextResponse } from 'next/server';
import { isRequestAuthenticated } from '@/lib/auth';
import { extractBangDangTaiLogData } from '@/lib/dang-tai/ocr';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  if (!isRequestAuthenticated(req)) {
    return NextResponse.json({ error: 'Chưa xác thực phiên đăng nhập' }, { status: 401 });
  }

  try {
    const formData = await req.formData();
    const imageFile = formData.get('image') as File | null;

    if (!imageFile) {
      return NextResponse.json({ error: 'Vui lòng chọn ảnh sổ đăng tài' }, { status: 400 });
    }

    const buffer = Buffer.from(await imageFile.arrayBuffer());
    const mimeType = imageFile.type || 'image/jpeg';
    const base64Preview = `data:${mimeType};base64,${buffer.toString('base64')}`;

    // Phân tích OCR sổ viết tay
    const items = await extractBangDangTaiLogData(buffer, mimeType);

    // Không lưu thẳng! Trả về để người dùng xem trước và sửa tay
    return NextResponse.json({
      success: true,
      message: `Đã nhận diện ${items.length} dòng từ sổ đăng tài`,
      items,
      previewImage: base64Preview,
    });
  } catch (err: unknown) {
    console.error('[Scan Log Error]:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Lỗi khi đọc ảnh sổ đăng tài' },
      { status: 500 }
    );
  }
}
