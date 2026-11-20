import { GoogleGenAI } from '@google/genai';
import { OcrPhieuCanResult } from './types';

function getGeminiApiKeys(): string[] {
  const keys: string[] = [];
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

export async function extractDangTaiSlipData(
  imageBuffer: Buffer,
  mimeType: string = 'image/jpeg'
): Promise<OcrPhieuCanResult> {
  const keys = getGeminiApiKeys();
  if (keys.length === 0) {
    throw new Error('Chưa cấu hình GEMINI_API_KEY trong hệ thống');
  }

  const prompt = `
Bạn là chuyên gia bóc tách dữ liệu từ Phiếu Cân điện tử xe tải nhập lúa gạo của Công ty TNHH XNK Chơn Chính.
Hãy đọc cẩn thận hình ảnh phiếu cân được cung cấp và trích xuất chính xác các thông tin sau dưới dạng JSON duy nhất:

{
  "soPhieu": "Số phiếu in trên phiếu cân (ví dụ: '5', '05')",
  "soXe": "Biển số xe (ví dụ: '70H-03268', '66C-12345')",
  "khachHang": "Tên khách hàng hoặc đối tác (ví dụ: 'A LAM TAY NINH')",
  "loaiHang": "Loại hàng hóa/loại lúa (ví dụ: 'LUA TUOI 5451', '5451', 'OM18')",
  "xuatNhap": "Nhập hoặc Xuất (thường là 'Nhập')",
  "ngayGioCan": "Ngày và giờ cân thực tế theo định dạng 'DD/MM/YYYY HH:mm:ss' (nếu có 2 lần cân thì lấy lần cân thứ 2/muộn hơn, ví dụ: '19/11/2026 11:57:27')",
  "tlXeHangKg": 47710,
  "tlXeKg": 14800,
  "tlHangKg": 32910,
  "ghiChu": "Tất cả các ghi chú viết tay hoặc đóng dấu ở các góc phiếu (ví dụ: 'Kcs nhơn, Bên nsx đtm, Salan triệu tăng bo vô cs1', 'Nhập ĐTM', '2')"
}

QUY TẮC BẮT BUỘC:
1. Các trường trọng lượng (tlXeHangKg, tlXeKg, tlHangKg) là SỐ NGUYÊN (kg). Lưu ý dấu chấm "." trên phiếu là phân cách hàng nghìn (ví dụ 47.710 Kg là 47710, 14.800 Kg là 14800, 32.910 Kg là 32910).
2. Kiểm tra toán học: Trọng lượng hàng = Trọng lượng xe và hàng - Trọng lượng xe.
3. Biển số xe cần lấy đúng từng ký tự (gồm cả mã tỉnh và chữ cái, ví dụ 70H-03268).
4. Chỉ trả về JSON duy nhất, không thêm markdown hay bất kỳ lời giải thích nào khác.
`;

  const candidateModels = [
    process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite',
    'gemini-3.5-flash',
    'gemini-3.8-flash',
  ];

  let lastError: unknown = null;

  for (const currentKey of keys) {
    let aiClient: GoogleGenAI;
    try {
      aiClient = new GoogleGenAI({ apiKey: currentKey });
    } catch (e) {
      lastError = e;
      continue;
    }

    for (const modelName of candidateModels) {
      try {
        const response = await aiClient.models.generateContent({
          model: modelName,
          contents: [
            {
              role: 'user',
              parts: [
                { text: prompt },
                {
                  inlineData: {
                    mimeType,
                    data: imageBuffer.toString('base64'),
                  },
                },
              ],
            },
          ],
        });

        const rawText = response.text || '';
        // Trích xuất JSON từ phản hồi
        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          return {
            soPhieu: parsed.soPhieu ? String(parsed.soPhieu).trim() : undefined,
            soXe: parsed.soXe ? String(parsed.soXe).trim().toUpperCase() : undefined,
            khachHang: parsed.khachHang ? String(parsed.khachHang).trim() : undefined,
            loaiHang: parsed.loaiHang ? String(parsed.loaiHang).trim() : undefined,
            xuatNhap: parsed.xuatNhap ? String(parsed.xuatNhap).trim() : 'Nhập',
            ngayGioCan: parsed.ngayGioCan ? String(parsed.ngayGioCan).trim() : undefined,
            tlXeHangKg: Number(parsed.tlXeHangKg) || undefined,
            tlXeKg: Number(parsed.tlXeKg) || undefined,
            tlHangKg: Number(parsed.tlHangKg) || undefined,
            ghiChu: parsed.ghiChu ? String(parsed.ghiChu).trim() : undefined,
            rawText,
          };
        }
      } catch (err: unknown) {
        lastError = err;
        console.warn(`[DangTai OCR] Lỗi với model ${modelName}:`, err);
        // Thử model tiếp theo hoặc key tiếp theo
      }
    }
  }

  throw new Error(`Không thể nhận diện phiếu cân: ${lastError instanceof Error ? lastError.message : 'Lỗi OCR'}`);
}

/**
 * Trích xuất dữ liệu từ Sổ/Bảng Đăng Tài Viết Tay
 * Có phân tích độ tin cậy và cảnh báo các chữ số dễ nhầm (1/7, 0/6, 3/8, 4/9)
 */
export async function extractBangDangTaiLogData(
  imageBuffer: Buffer,
  mimeType: string = 'image/jpeg'
): Promise<import('./types').OcrBangDangTaiItem[]> {
  const keys = getGeminiApiKeys();
  if (keys.length === 0) {
    throw new Error('Chưa cấu hình GEMINI_API_KEY trong hệ thống');
  }

  const prompt = `
Bạn là chuyên gia thẩm định và bóc tách chữ viết tay từ Sổ Đăng Tài Xe Lúa của nhà máy xay xát lúa gạo Chơn Chính.
Hình ảnh cung cấp là Sổ/Bảng kê viết tay ghi danh sách xe đăng tài về nhập.

CẢNH BÁO RỦI RO CHỮ VIẾT TAY ĐẶC BIỆT:
- Các chữ số viết tay tiếng Việt rất hay bị nhầm lẫn:
  + Số 1 và số 7 (1/7)
  + Số 0 và số 6 (0/6)
  + Số 3 và số 8 (3/8)
  + Số 4 và số 9 (4/9)
- Biển số xe là KHÓA CHÍNH quan trọng nhất để đối soát phiếu cân sau này. Nếu bất kỳ ký tự nào trong biển số bị mờ, nét đứt, hoặc phân vân giữa các cặp số trên, BẮT BUỘC phải đánh dấu vào "uncertainFields" và ghi rõ vào "canhBao".
- Khối lượng ước tính thường ghi dạng: "34T", "34 tấn", "32t", "30"... Hãy chuẩn hóa thành số nguyên kilogram (ví dụ 34T -> 34000).

Hãy phân tích từng dòng và trả về JSON DUY NHẤT theo định dạng sau:
{
  "danhSach": [
    {
      "stt": 1,
      "gioDangTai": "07:30",
      "bienSoXe": "70H-03268",
      "loaiLua": "5451",
      "soLuongUocTinh": 32000,
      "tenTaiXe": "Anh Lâm",
      "sdtTaiXe": "0987778797",
      "ghiChu": "Viết tay ghi chú nếu có",
      "confidence": "high", // "high" nếu chữ rõ ràng; "medium" nếu có 1-2 nét phân vân; "low" nếu mờ hoặc khó đọc
      "uncertainFields": [], // mảng các trường nghi ngờ, ví dụ: ["bienSoXe"] nếu phân vân 1/7, 0/6, 3/8, 4/9
      "canhBao": "Nêu rõ điểm nghi ngờ nếu có (ví dụ: Chữ số thứ 4 nghi ngờ giữa 1 và 7)"
    }
  ]
}

QUY TẮC BẮT BUỘC:
1. Đọc đúng số thứ tự STT từng dòng theo thứ tự từ trên xuống dưới.
2. Nếu dòng nào chỉ ghi đuôi số xe (ví dụ chỉ ghi 00463 hay 03773 thiếu mã tỉnh), hãy ghi đúng ký tự nhìn thấy và đánh dấu vào "uncertainFields": ["bienSoXe"] để người dùng bổ sung tỉnh.
3. Không tự chế thông tin không có trên sổ.
4. Chỉ trả về JSON duy nhất, không có markdown phụ nào khác.
`;

  const candidateModels = [
    process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite',
    'gemini-3.5-flash',
    'gemini-3.8-flash',
  ];

  let lastError: unknown = null;

  for (const currentKey of keys) {
    let aiClient: GoogleGenAI;
    try {
      aiClient = new GoogleGenAI({ apiKey: currentKey });
    } catch (e) {
      lastError = e;
      continue;
    }

    for (const modelName of candidateModels) {
      try {
        const response = await aiClient.models.generateContent({
          model: modelName,
          contents: [
            {
              role: 'user',
              parts: [
                { text: prompt },
                {
                  inlineData: {
                    mimeType,
                    data: imageBuffer.toString('base64'),
                  },
                },
              ],
            },
          ],
        });

        const rawText = response.text || '';
        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          const rawItems = Array.isArray(parsed.danhSach) ? parsed.danhSach : [];

          // Import helpers dynamically or inline
          const { isValidPlateFormat, normalizeEstimatedWeight, formatPlateDisplay } = await import('./plate');

          const items: import('./types').OcrBangDangTaiItem[] = rawItems.map((item: any, idx: number) => {
            const plateStr = String(item.bienSoXe || '').trim().toUpperCase();
            const isValidPlate = isValidPlateFormat(plateStr);
            const uocTinhKg = normalizeEstimatedWeight(item.soLuongUocTinh);

            const uncertainFields = Array.isArray(item.uncertainFields) ? [...item.uncertainFields] : [];
            if (!isValidPlate && !uncertainFields.includes('bienSoXe')) {
              uncertainFields.push('bienSoXe');
            }

            return {
              tempId: `temp_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 6)}`,
              stt: Number(item.stt) || idx + 1,
              gioDangTai: item.gioDangTai ? String(item.gioDangTai).trim() : '07:00',
              bienSoXe: formatPlateDisplay(plateStr),
              loaiLua: item.loaiLua ? String(item.loaiLua).trim().toUpperCase() : '5451',
              soLuongUocTinh: uocTinhKg,
              tenTaiXe: item.tenTaiXe ? String(item.tenTaiXe).trim() : undefined,
              sdtTaiXe: item.sdtTaiXe ? String(item.sdtTaiXe).trim() : undefined,
              ghiChu: item.ghiChu ? String(item.ghiChu).trim() : undefined,
              confidence: item.confidence === 'low' ? 'low' : item.confidence === 'medium' ? 'medium' : 'high',
              uncertainFields,
              canhBao: item.canhBao || (!isValidPlate ? 'Biển số chưa đúng định dạng chuẩn xe VN' : undefined),
              isValidPlate,
            };
          });

          return items;
        }
      } catch (err: unknown) {
        lastError = err;
        console.warn(`[BangDangTai OCR] Lỗi với model ${modelName}:`, err);
      }
    }
  }

  throw new Error(`Không thể nhận diện sổ đăng tài: ${lastError instanceof Error ? lastError.message : 'Lỗi OCR'}`);
}

