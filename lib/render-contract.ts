import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import { readFileSync } from 'fs';
import { join } from 'path';
import type { ContractTemplateData } from './contract-schema';

/**
 * Render file hợp đồng docx hoàn chỉnh trong bộ nhớ (Buffer).
 * Tuyệt đối không ghi file ra đĩa (tuân thủ Vercel Read-Only File System).
 */
export function renderContractDocx(data: ContractTemplateData): Buffer {
  const templatePath = join(process.cwd(), 'templates', 'hop-dong-mua-ban.docx');
  const templateContent = readFileSync(templatePath);

  const zip = new PizZip(templateContent);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
  });

  doc.render(data);

  const buf = doc.getZip().generate({
    type: 'nodebuffer',
    compression: 'DEFLATE',
  });

  return buf;
}

