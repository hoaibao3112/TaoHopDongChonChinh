import { GoogleGenAI, Type } from '@google/genai';
import { OcrProvider } from './types';
import { WeighingSlipOcr, WeighingSlipOcrSchema } from '../husk/types';

/**
 * Thu thập toàn bộ danh sách API Keys có sẵn từ biến môi trường
 * và danh sách dự phòng, loại bỏ trùng lặp.
 */
function getAvailableGeminiKeys(explicitKey?: string): string[] {
  const keys: string[] = [];

  if (explicitKey) {
    keys.push(...explicitKey.split(/[,;\s]+/).filter(Boolean));
  }
  if (process.env.GEMINI_API_KEYS) {
    keys.push(...process.env.GEMINI_API_KEYS.split(/[,;\s]+/).filter(Boolean));
  }
  if (process.env.GEMINI_API_KEY) {
    keys.push(process.env.GEMINI_API_KEY.trim());
  }
  if (process.env.GEMINI_API_KEY_2) {
    keys.push(process.env.GEMINI_API_KEY_2.trim());
  }
  if (process.env.GEMINI_API_KEY_3) {
    keys.push(process.env.GEMINI_API_KEY_3.trim());
  }
  if (process.env.GEMINI_API_KEY_4) {
    keys.push(process.env.GEMINI_API_KEY_4.trim());
  }

  return Array.from(new Set(keys.filter((k) => Boolean(k) && k.trim().length > 10)));
}

export class GeminiOcrProvider implements OcrProvider {
  name = 'Gemini';
  private apiKeys: string[];
  private modelName: string;

  constructor(apiKey?: string, modelName?: string) {
    this.apiKeys = getAvailableGeminiKeys(apiKey);
    if (this.apiKeys.length === 0) {
      throw new Error('Chưa cấu hình bất kỳ GEMINI_API_KEY nào trong biến môi trường');
    }
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

    // Danh sách các model ứng viên để fallback
    const candidateModels = Array.from(
      new Set([this.modelName, 'gemini-3.1-flash-lite', 'gemini-3.5-flash', 'gemini-3.8-flash'])
    );

    let lastError: unknown = null;

    // Vòng lặp luân chuyển qua từng API Key nếu key trước hết quota/token
    for (let kIdx = 0; kIdx < this.apiKeys.length; kIdx++) {
      const currentKey = this.apiKeys[kIdx];
      const maskedKey = currentKey.length > 8 ? `...${currentKey.slice(-6)}` : currentKey;
      let aiClient: GoogleGenAI;
      try {
        aiClient = new GoogleGenAI({ apiKey: currentKey });
      } catch (clientErr) {
        lastError = clientErr;
        continue;
      }

      let keyExhausted = false;

      for (const modelToTry of candidateModels) {
        try {
          const response = await aiClient.models.generateContent({
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

          // Phát hiện lỗi hết token, hết quota hoặc bị giới hạn tần suất
          const isQuotaOrLimitError =
            errMsg.includes('429') ||
            errMsg.includes('403') ||
            errMsg.includes('quota') ||
            errMsg.includes('QUOTA_EXCEEDED') ||
            errMsg.includes('RESOURCE_EXHAUSTED') ||
            errMsg.includes('rate limit') ||
            errMsg.includes('API key not valid') ||
            errMsg.includes('PERMISSION_DENIED');

          if (isQuotaOrLimitError) {
            console.warn(
              `API Key (${maskedKey}) hết token/quota hoặc bị giới hạn (${errMsg.slice(0, 90)}...). Tự động chuyển sang API Key tiếp theo (${kIdx + 2}/${this.apiKeys.length})...`
            );
            keyExhausted = true;
            break; // Thoát vòng lặp model để đổi sang API Key tiếp theo
          }

          // Fallback model khi lỗi quá tải tạm thời hoặc model không tồn tại
          if (
            errMsg.includes('404') ||
            errMsg.includes('503') ||
            errMsg.includes('not found') ||
            errMsg.includes('UNAVAILABLE') ||
            errMsg.includes('no longer available') ||
            errMsg.includes('high demand')
          ) {
            console.warn(`Model ${modelToTry} gặp sự cố (${errMsg.slice(0, 80)}...), thử model tiếp theo...`);
            continue;
          }

          // Các lỗi khác: thử chuyển sang key tiếp theo
          console.warn(`Lỗi OCR với key (${maskedKey}): ${errMsg.slice(0, 80)}...`);
          keyExhausted = true;
          break;
        }
      }

      if (!keyExhausted) {
        // Nếu không phải lỗi do key mà vẫn không return được (ví dụ tất cả model đều lỗi)
        continue;
      }
    }

    throw lastError || new Error('Tất cả các API Key Google Gemini dự phòng đều đã hết token hoặc gặp sự cố.');
  }
}
