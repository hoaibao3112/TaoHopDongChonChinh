import { describe, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as XLSX from 'xlsx';

describe('Extract Customers from Fresh Rice Master File', () => {
  it('extracts unique customers and analyzes names', () => {
    const filePath = path.resolve('THỊNH_TỔNG SỐ LIỆU NHẬP LÚA TƯƠI 2026.xlsx');
    const buf = fs.readFileSync(filePath);
    const wb = XLSX.read(buf, {
      type: 'buffer',
      dense: true,
      cellFormula: false,
      cellHTML: false,
      cellText: false,
    });
    const sheetName = wb.SheetNames.find((s) => s.toUpperCase().includes('LUA')) || wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];
    const rawRows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 });
    
    console.log(`Sheet: "${sheetName}", Total rows: ${rawRows.length}`);
    
    // Header is row index 2
    // Column D (index 3) is KHÁCH HÀNG
    const customerCounts: Record<string, number> = {};
    for (let r = 3; r < rawRows.length; r++) {
      const row = rawRows[r];
      if (!row) continue;
      const val = String(row[3] || '').trim();
      if (val && val.length > 1 && !val.toLowerCase().includes('khách hàng') && !val.toLowerCase().includes('tổng cộng')) {
        customerCounts[val] = (customerCounts[val] || 0) + 1;
      }
    }
    
    const sorted = Object.entries(customerCounts).sort((a, b) => b[1] - a[1]);
    console.log(`Total unique customer names in master file: ${sorted.length}`);
    
    // Look for Lâm / Tây Ninh
    const lamMatches = sorted.filter(([name]) => name.toLowerCase().includes('lâm') || name.toLowerCase().includes('tây ninh'));
    console.log('Matches for Lâm / Tây Ninh:', lamMatches);
    
    // Save to a json file in data/dang-tai/master-suppliers.json
    const supplierList = sorted.map(([name, count]) => ({
      name: name.toUpperCase().replace(/\s+/g, ' ').trim(),
      rawName: name,
      count,
    }));
    
    // Remove duplicates after uppercase
    const uniqueMap = new Map<string, { name: string; rawNames: string[]; count: number }>();
    for (const item of supplierList) {
      if (!uniqueMap.has(item.name)) {
        uniqueMap.set(item.name, { name: item.name, rawNames: [item.rawName], count: item.count });
      } else {
        const existing = uniqueMap.get(item.name)!;
        existing.count += item.count;
        if (!existing.rawNames.includes(item.rawName)) existing.rawNames.push(item.rawName);
      }
    }
    
    const finalSuppliers = Array.from(uniqueMap.values()).sort((a, b) => b.count - a.count);
    console.log(`Unique uppercase suppliers: ${finalSuppliers.length}`);
    console.log('Top 20 suppliers:', finalSuppliers.slice(0, 20));
    
    fs.mkdirSync(path.resolve('data/dang-tai'), { recursive: true });
    fs.writeFileSync(
      path.resolve('data/dang-tai/master-customers.json'),
      JSON.stringify(finalSuppliers, null, 2),
      'utf-8'
    );
  });
});
