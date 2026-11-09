import { WeighingSlipOcr } from '../husk/types';

/**
 * Interface trừu tượng cho các nhà cung cấp OCR (Gemini, Claude, v.v.)
 */
export interface OcrProvider {
  name: string;
  extractSlipData(imageBuffer: Buffer, mimeType: string): Promise<WeighingSlipOcr>;
}
