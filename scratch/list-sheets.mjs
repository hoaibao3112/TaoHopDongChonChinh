import ExcelJS from 'exceljs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const filePath = path.resolve(__dirname, '..', 'THÙY (MỚI)I_BÁO CÁO TRẤU.xlsx');

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(filePath);

console.log('Total sheets:', wb.worksheets.length);
for (const ws of wb.worksheets) {
  console.log(JSON.stringify({ name: ws.name, state: ws.state, rowCount: ws.rowCount }));
}
