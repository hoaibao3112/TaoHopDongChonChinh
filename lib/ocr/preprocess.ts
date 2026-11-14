import sharp from 'sharp';

export interface PreprocessedImageResult {
  processedBuffer: Buffer;
  thumbnailBase64: string;
  mimeType: string;
  width?: number;
  height?: number;
}

/**
 * Tiền xử lý ảnh phiếu cân trước khi gửi lên Gemini:
 * - Tự động xoay theo EXIF orientation
 * - Thu nhỏ cạnh dài tối đa 1800px (giữ tỷ lệ, đủ nét đọc chữ số)
 * - Nén JPEG chất lượng 90
 * - Tạo thumbnail nhỏ base64 để hiển thị nhanh trên bảng duyệt
 */
export async function preprocessSlipImage(inputBuffer: Buffer): Promise<PreprocessedImageResult> {
  // Xoay EXIF và resize cạnh lớn tối đa 1800px
  const image = sharp(inputBuffer).rotate();

  const processedBuffer = await image
    .resize({
      width: 1800,
      height: 1800,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .jpeg({ quality: 90 })
    .toBuffer();

  const metadata = await sharp(processedBuffer).metadata();

  // Tạo ảnh chất lượng cao 1200px để hiển thị phóng to to nhất có thể, đọc rõ mọi chữ số
  const thumbBuffer = await sharp(processedBuffer)
    .resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer();

  const thumbnailBase64 = `data:image/jpeg;base64,${thumbBuffer.toString('base64')}`;

  return {
    processedBuffer,
    thumbnailBase64,
    mimeType: 'image/jpeg',
    width: metadata.width,
    height: metadata.height,
  };
}

