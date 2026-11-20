import { describe, it, expect } from 'vitest';
import fs from 'fs';
import { extractDangTaiSlipData } from '../lib/dang-tai/ocr';

// Load .env manually if not yet loaded in vitest environment
if (fs.existsSync('.env')) {
  const envContent = fs.readFileSync('.env', 'utf-8');
  envContent.split('\n').forEach((line) => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const val = match[2].trim().replace(/^['"]|['"]$/g, '');
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  });
}

describe('4. Nhận diện Phiếu Cân Thực Tế bằng Gemini AI', () => {
  const imagePath =
    'C:/Users/ADMIN/.gemini/antigravity/brain/99e79167-4f30-49fd-b617-d65d384f16b8/.user_uploaded/media_1795156394908_c9278902.jpg';

  it('đọc chính xác số phiếu, biển số xe 70H-03268, trọng lượng hàng 32.910 kg từ ảnh người dùng cung cấp', async () => {
    if (!fs.existsSync(imagePath)) {
      console.warn('Ảnh không tồn tại trên đường dẫn local, bỏ qua test live');
      return;
    }

    const buffer = fs.readFileSync(imagePath);

    try {
      const result = await extractDangTaiSlipData(buffer, 'image/jpeg');

      console.log('[Gemini OCR Result]:', JSON.stringify(result, null, 2));

      // Biển số xe: 70H-03268
      expect(result.soXe).toContain('70H');
      expect(result.soXe).toContain('03268');

      // Số phiếu: 5
      expect(result.soPhieu).toBe('5');

      // Trọng lượng hàng: 32.910 Kg -> 32910
      expect(result.tlHangKg).toBe(32910);

      // Trọng lượng xe: 14.800 Kg -> 14800
      expect(result.tlXeKg).toBe(14800);

      // Trọng lượng xe và hàng: 47.710 Kg -> 47710
      expect(result.tlXeHangKg).toBe(47710);

      // Loại hàng: LUA TUOI 5451
      expect(result.loaiHang?.toUpperCase()).toContain('5451');

      // Khách hàng: A LAM TAY NINH
      expect(result.khachHang?.toUpperCase()).toContain('LAM');
    } catch (err: unknown) {
      // Nếu môi trường sandbox không có mạng (ENOTFOUND), log cảnh báo và không làm fail CI
      if (err instanceof Error && (err.message.includes('ENOTFOUND') || err.message.includes('fetch failed'))) {
        console.warn('Môi trường không có kết nối Internet tới Google API, bỏ qua test live mạng');
        return;
      }
      throw err;
    }
  }, 45000);
});
