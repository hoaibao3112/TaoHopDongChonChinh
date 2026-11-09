import { GoogleGenAI, Type } from '@google/genai';
import { OcrProvider } from './types';
import { WeighingSlipOcr, WeighingSlipOcrSchema } from '../husk/types';

export class GeminiOcrProvider implements OcrProvider {
  name = 'Gemini';
  private ai: GoogleGenAI;
  private modelName: string;

  constructor(apiKey?: string, modelName?: string) {
    const key = apiKey || process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error('GEMINI_API_KEY chưa được cấu hình trong biến môi trường');
    }
    this.ai = new GoogleGenAI({ apiKey: key });
    this.modelName = modelName || process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite';
  }

  async extractSlipData(imageBuffer: Buffer, mimeType: string = 'image/jpeg'): Promise<WeighingSlipOcr> {
    const prompt = `
Bạn là chuyên gia phân tích phiếu cân nông sản (nhà máy xay xát lúa gạo Chơn Chính tại Đồng Tháp).
Hãy đọc cẩn thận hình ảnh phiếu cân và trích xuất các trường thông tin theo đúng định dạng JSON:

1. so_phieu: Số phiếu in trên phiếu (vd: "15", "08").
2. khach_hang: Tên khách hàng (vd: "Chị 7", "Thái Bảo Ngọc").
3. loai_hang: Tên hàng hóa (vd: "Trấu", "Gạo", "Lúa").
4. so_xe: Biển số xe hoặc tên ghe (vd: "63H-02309", "Được Phường").
5. xuat_nhap: Xác định "Xuất" hay "Nhập" (ghi rõ chữ "Xuất" hoặc "Nhập").
6. ngay_can: Ngày cân theo định dạng DD/MM/YYYY. Lưu ý: Phiếu cân thường in 2 lần cân (lần 1 và lần 2). Nếu có 2 ngày/giờ cân, hãy lấy NGÀY CỦA LẦN CÂN MUỘN HƠN.
7. tl_xe_hang_kg: Trọng lượng xe và hàng (kg), số nguyên. Lưu ý dấu chấm "." trên phiếu là phân cách hàng nghìn (vd: 14.400 Kg tức là 14400).
8. tl_xe_kg: Trọng lượng xe (kg), số nguyên (vd: 7.890 Kg tức 7890).
9. tl_hang_kg: Trọng lượng hàng (kg), số nguyên (vd: 6.510 Kg tức 6510).
10. ghi_chu_viet_tay: Bất kỳ chữ viết tay nào ở góc (vd: "6", "Xuất ĐTM").

QUY TẮC QUAN TRỌNG:
- Trọng lượng xe + hàng - trọng lượng xe = trọng lượng hàng.
- Trường nào không đọc được hoặc mờ, hãy để null. TUYỆT ĐỐI KHÔNG TỰ ĐOÁN SỐ.
- Giá tiền / đơn giá / thành tiền in 0Đ bỏ qua.
`;

    // Ưu tiên model nhanh và ổn định nhất gemini-3.1-flash-lite, tiếp theo là gemini-3.5-flash và gemini-3.8-flash
    const candidateModels = Array.from(new Set([this.modelName, 'gemini-3.1-flash-lite', 'gemini-3.5-flash', 'gemini-3.8-flash']));
    let lastError: unknown = null;

    for (const modelToTry of candidateModels) {
      try {
        const response = await this.ai.models.generateContent({
          model: modelToTry,
          contents: [
            {
              role: 'user',
              parts: [
                { text: prompt },
                {
                  inlineData: {
                    data: imageBuffer.toString('base64'),
                    mimeType,
                  },
                },
              ],
            },
          ],
          config: {
            temperature: 0,
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                so_phieu: { type: Type.STRING },
                khach_hang: { type: Type.STRING },
                loai_hang: { type: Type.STRING },
                so_xe: { type: Type.STRING },
                xuat_nhap: { type: Type.STRING },
                ngay_can: { type: Type.STRING },
                tl_xe_hang_kg: { type: Type.INTEGER },
                tl_xe_kg: { type: Type.INTEGER },
                tl_hang_kg: { type: Type.INTEGER },
                ghi_chu_viet_tay: { type: Type.STRING },
              },
            },
          },
        });

        const text = response.text?.trim() || '{}';
        let parsedJson: unknown;
        try {
          parsedJson = JSON.parse(text);
        } catch {
          throw new Error(`Gemini (${modelToTry}) trả về JSON không hợp lệ: ${text}`);
        }

        const validated = WeighingSlipOcrSchema.parse(parsedJson);
        return validated;
      } catch (err: unknown) {
        lastError = err;
        const errMsg = err instanceof Error ? err.message : String(err);
        // Fallback khi gặp lỗi 404, 503 (quá tải), 429 hoặc model ngừng hỗ trợ
        if (
          errMsg.includes('404') ||
          errMsg.includes('503') ||
          errMsg.includes('429') ||
          errMsg.includes('not found') ||
          errMsg.includes('UNAVAILABLE') ||
          errMsg.includes('no longer available') ||
          errMsg.includes('high demand')
        ) {
          console.warn(`Model ${modelToTry} gặp sự cố (${errMsg.slice(0, 80)}...), chuyển sang model dự phòng tiếp theo...`);
          continue;
        }
        throw err;
      }
    }

    throw lastError || new Error('Không thể kết nối đến bất kỳ model Gemini nào');
  }
}
