import XLSX from 'xlsx-js-style';
import { RiceMonthlyStatsResult } from './types';

function styleHeaderRow(ws: XLSX.WorkSheet, rowIdx: number, colCount: number, fillHex: string) {
  for (let c = 0; c < colCount; c++) {
    const addr = XLSX.utils.encode_cell({ r: rowIdx, c });
    if (!ws[addr]) continue;
    ws[addr].s = {
      font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 11 },
      fill: { fgColor: { rgb: fillHex } },
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
      border: {
        top: { style: 'thin', color: { rgb: 'CBD5E1' } },
        bottom: { style: 'thin', color: { rgb: 'CBD5E1' } },
        left: { style: 'thin', color: { rgb: 'CBD5E1' } },
        right: { style: 'thin', color: { rgb: 'CBD5E1' } },
      },
    };
  }
}

export function buildRiceStatsExcelBuffer(stats: RiceMonthlyStatsResult): Buffer {
  const wb = XLSX.utils.book_new();
  const periodLabel = stats.monthKey === 'ALL' ? 'CẢ NĂM 2026' : `THÁNG ${stats.monthKey}`;

  // Sheet 1: Tổng quan & Cơ cấu loại lúa
  const s1Rows: (string | number)[][] = [
    [`BÁO CÁO THỐNG KÊ TỔNG HỢP LÚA - ${periodLabel}`],
    [],
    ['CHỈ TIÊU TỔNG QUAN', 'SỐ LÔ / CHUYẾN', 'SẢN LƯỢNG (KG)', 'SẢN LƯỢNG (TẤN)', 'THÀNH TIỀN (VNĐ)', 'ĐƠN GIÁ BQ (Đ/KG)'],
    [
      'Lúa Tươi Nhập Sấy',
      stats.overview.freshLots,
      stats.overview.freshTotalKg,
      Number((stats.overview.freshTotalKg / 1000).toFixed(3)),
      stats.overview.freshTotalAmount,
      stats.overview.freshAvgPrice,
    ],
    [
      'Lúa Khô Mua Trực Tiếp',
      stats.overview.dryLots,
      stats.overview.dryTotalKg,
      Number((stats.overview.dryTotalKg / 1000).toFixed(3)),
      stats.overview.dryTotalAmount,
      stats.overview.dryAvgPrice,
    ],
    [
      'TỔNG HỢP',
      stats.overview.combinedTotalLots,
      stats.overview.combinedTotalKg,
      Number((stats.overview.combinedTotalKg / 1000).toFixed(3)),
      stats.overview.combinedTotalAmount,
      stats.overview.combinedTotalKg > 0
        ? Math.round(stats.overview.combinedTotalAmount / stats.overview.combinedTotalKg)
        : 0,
    ],
    [],
    ['CƠ CẤU THEO LOẠI LÚA', 'NGUỒN', 'SỐ LÔ', 'LÚA TƯƠI (KG)', 'LÚA KHÔ (KG)', 'TỔNG (KG)', 'TỶ TRỌNG (%)', 'GIÁ BQ (Đ/KG)', 'GIÁ MIN', 'GIÁ MAX'],
    ...stats.varieties.map((v) => [
      v.variety,
      v.source,
      v.lots,
      v.freshKg,
      v.dryKg,
      v.totalKg,
      v.sharePercent,
      v.avgPrice,
      v.minPrice,
      v.maxPrice,
    ]),
  ];
  const ws1 = XLSX.utils.aoa_to_sheet(s1Rows);
  ws1['!cols'] = [
    { wch: 26 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 20 }, { wch: 18 },
    { wch: 14 }, { wch: 16 }, { wch: 14 }, { wch: 14 },
  ];
  styleHeaderRow(ws1, 2, 6, '0F766E');
  styleHeaderRow(ws1, 7, 10, '1D4ED8');
  XLSX.utils.book_append_sheet(wb, ws1, '1. Tong Quan & Loai Lua');

  // Sheet 2: Nhân viên thu mua, NCC & Vùng
  const s2Rows: (string | number)[][] = [
    [`NHÂN VIÊN THU MUA & NHÀ CUNG CẤP - ${periodLabel}`],
    [],
    ['NHÂN VIÊN THU MUA', 'LÔ TƯƠI', 'KG TƯƠI', 'LÔ KHÔ', 'KG KHÔ', 'TỔNG KG', 'TỔNG TIỀN (VNĐ)', 'GIÁ BQ', '% HAO HỤT'],
    ...stats.buyers.map((b) => [
      b.buyer, b.freshLots, b.freshKg, b.dryLots, b.dryKg, b.totalKg, b.totalAmount, b.avgPrice, b.avgLossPercent,
    ]),
    [],
    ['VÙNG / ĐỊA ĐIỂM CÂN', 'SỐ LÔ', 'LÚA TƯƠI (KG)', 'LÚA KHÔ (KG)', 'TỔNG KG', 'TỔNG CƯỚC VC (VNĐ)', 'CƯỚC BQ (Đ/KG)'],
    ...stats.regions.map((r) => [
      r.region, r.lots, r.freshKg, r.dryKg, r.totalKg, r.totalFreight, r.avgFreightPerKg,
    ]),
  ];
  const ws2 = XLSX.utils.aoa_to_sheet(s2Rows);
  ws2['!cols'] = [
    { wch: 28 }, { wch: 12 }, { wch: 16 }, { wch: 12 }, { wch: 16 }, { wch: 16 }, { wch: 20 }, { wch: 14 }, { wch: 14 },
  ];
  styleHeaderRow(ws2, 2, 9, 'B45309');
  styleHeaderRow(ws2, 5 + stats.buyers.length, 7, '0369A1');
  XLSX.utils.book_append_sheet(wb, ws2, '2. Thu Mua & Vung');

  // Sheet 3: Chi phí & Giá thành thực tế
  const cb = stats.costBreakdown;
  const s3Rows: (string | number)[][] = [
    [`PHÂN TÍCH CHI PHÍ & GIÁ THÀNH THỰC TẾ - ${periodLabel}`],
    [],
    ['NHÓM LÚA', 'KHOẢN MỤC CHI PHÍ', 'SỐ TIỀN (VNĐ)', 'GHI CHÚ'],
    ['Lúa Tươi', 'Tiền lúa lọt lòng phương tiện', cb.fresh.riceAmount, ''],
    ['Lúa Tươi', 'Cước vận chuyển mua vào', cb.fresh.inboundFreight, ''],
    ['Lúa Tươi', 'Cước tăng bo lúa tươi nhập sấy', cb.fresh.transshipmentFreight, ''],
    ['Lúa Tươi', 'Công đoàn bốc xếp tăng bo', cb.fresh.laborUnionCost, ''],
    ['Lúa Tươi', 'Tiền sấy (VAT 5%)', cb.fresh.dryingCostVat5, ''],
    ['Lúa Tươi', 'Tiền xuất trả (VAT 8%)', cb.fresh.exportReturnCostVat8, ''],
    ['Lúa Tươi', 'TỔNG CHI PHÍ LÚA TƯƠI', cb.fresh.totalAllCosts, `Giá thành BQ: ${cb.fresh.realUnitCostPerKg} đ/kg`],
    [],
    ['Lúa Khô', 'Tiền lúa khô', cb.dry.riceAmount, ''],
    ['Lúa Khô', 'Cước vận chuyển lúa khô', cb.dry.dryFreight, ''],
    ['Lúa Khô', 'Chi phí khác', cb.dry.otherCosts, ''],
    ['Lúa Khô', 'TỔNG CHI PHÍ TỚI NHÀ MÁY', cb.dry.totalFactoryCost, `Giá thành BQ: ${cb.dry.realUnitCostPerKg} đ/kg`],
    [],
    ['TỔNG CỘNG', 'TỔNG CHI PHÍ TOÀN BỘ THÁNG', cb.grandTotalCost, ''],
  ];
  const ws3 = XLSX.utils.aoa_to_sheet(s3Rows);
  ws3['!cols'] = [{ wch: 16 }, { wch: 36 }, { wch: 22 }, { wch: 30 }];
  styleHeaderRow(ws3, 2, 4, '4338CA');
  XLSX.utils.book_append_sheet(wb, ws3, '3. Chi Phi & Gia Thanh');

  // Sheet 4: Hao hụt, Cơ sở sấy & Cảnh báo
  const s4Rows: (string | number)[][] = [
    [`HAO HỤT, CƠ SỞ SẤY & CẢNH BÁO BẤT THƯỜNG - ${periodLabel}`],
    [],
    ['CƠ SỞ SẤY', 'SỐ LÔ', 'NHẬP TƯƠI (KG)', 'CÂN NHẬP SẤY (KG)', 'HAO HỤT (KG)', '% HAO HỤT', 'LÚA KHÔ SAU SẤY (KG)', '% THU HỒI BQ'],
    ...stats.facilities.map((f) => [
      f.facility, f.lots, f.inputFreshKg, f.scaleDryInputKg, f.lossKg, f.lossPercent, f.outputDryKg, f.avgRecoveryPercent,
    ]),
    [],
    ['CẢNH BÁO HAO HỤT / CÂN LỖI', 'NGÀY', 'MÃ LÔ', 'NHÀ CUNG CẤP', 'PHƯƠNG TIỆN', 'LOẠI LÚA', 'SỐ LƯỢNG (KG)', 'HAO HỤT (KG)', '% HAO HỤT', 'LÝ DO'],
    ...stats.lossAlerts.map((a) => [
      a.source, a.date, a.lotCode, a.supplier, a.vehicle, a.variety, a.weightKg, a.lossKg, a.lossPercent, a.reason,
    ]),
  ];
  const ws4 = XLSX.utils.aoa_to_sheet(s4Rows);
  ws4['!cols'] = [
    { wch: 20 }, { wch: 12 }, { wch: 16 }, { wch: 24 }, { wch: 18 }, { wch: 14 }, { wch: 16 }, { wch: 14 }, { wch: 12 }, { wch: 28 },
  ];
  styleHeaderRow(ws4, 2, 8, 'BE123C');
  styleHeaderRow(ws4, 5 + stats.facilities.length, 10, '9F1239');
  XLSX.utils.book_append_sheet(wb, ws4, '4. Hao Hut & Say');

  // Sheet 5: Tiến độ xay sát
  const s5Rows: (string | number)[][] = [
    [`TIẾN ĐỘ XAY SÁT & LÔ CHƯA XAY - ${periodLabel}`],
    [],
    ['CHỈ TIÊU', 'GIÁ TRỊ'],
    ['Tổng số lô trong kỳ', stats.milling.totalLots],
    ['Số lô đã xay', stats.milling.milledLots],
    ['Số lô chưa xay', stats.milling.unmilledLots],
    ['Tỷ lệ đã xay theo sản lượng (%)', stats.milling.milledPercentByWeight],
    ['Lúa tươi xay Máy 1 (kg)', stats.milling.freshMilledMay1Kg],
    ['Lúa tươi xay Máy 2 (kg)', stats.milling.freshMilledMay2Kg],
    ['Lúa tươi xay NSX (kg)', stats.milling.freshMilledNsxKg],
    ['Lúa khô đã xay (kg)', stats.milling.dryMilledKg],
    ['Tồn lúa tươi chưa xay (kg)', stats.milling.unmilledFreshKg],
    ['Tồn lúa khô chưa xay (kg)', stats.milling.unmilledDryKg],
    ['Số ngày lưu kho trung bình', stats.milling.avgStorageDays],
    [],
    ['DANH SÁCH LÔ CHƯA XAY', 'NGÀY CÂN', 'MÃ LÔ', 'NHÀ CUNG CẤP', 'LOẠI LÚA', 'KHỐI LƯỢNG (KG)', 'NV THU MUA', 'CƠ SỞ'],
    ...stats.milling.unmilledItems.map((u) => [
      u.source, u.date, u.lotCode, u.supplier, u.variety, u.weightKg, u.buyer, u.facility,
    ]),
  ];
  const ws5 = XLSX.utils.aoa_to_sheet(s5Rows);
  ws5['!cols'] = [{ wch: 30 }, { wch: 14 }, { wch: 18 }, { wch: 26 }, { wch: 14 }, { wch: 16 }, { wch: 16 }, { wch: 18 }];
  styleHeaderRow(ws5, 2, 2, '047857');
  styleHeaderRow(ws5, 15, 8, '065F46');
  XLSX.utils.book_append_sheet(wb, ws5, '5. Tien Do Xay Sat');

  // Sheet 6: Tài chính & Công nợ
  const fin = stats.financial;
  const s6Rows: (string | number)[][] = [
    [`TÀI CHÍNH, TẠM ỨNG & CÔNG NỢ - ${periodLabel}`],
    [],
    ['NGÂN HÀNG', 'SỐ GIAO DỊCH', 'TỔNG THANH TOÁN (VNĐ)'],
    ...fin.banks.map((b) => [b.bank, b.count, b.totalPaid]),
    [],
    ['CẢNH BÁO CÔNG NỢ', 'NGÀY CÂN', 'MÃ LÔ', 'NHÀ CUNG CẤP', 'NV THU MUA', 'TIỀN HÀNG', 'TẠM ỨNG', 'TRỪ CỌC', 'THANH TOÁN', 'NGÂN HÀNG', 'LOẠI CẢNH BÁO'],
    ...fin.debtAlerts.map((d) => [
      d.source, d.date, d.lotCode, d.supplier, d.buyer, d.amount, d.advance, d.depositDeducted, d.payable, d.bank, d.alertType,
    ]),
  ];
  const ws6 = XLSX.utils.aoa_to_sheet(s6Rows);
  ws6['!cols'] = [
    { wch: 20 }, { wch: 14 }, { wch: 18 }, { wch: 26 }, { wch: 16 }, { wch: 18 }, { wch: 16 }, { wch: 16 }, { wch: 18 }, { wch: 14 }, { wch: 24 },
  ];
  styleHeaderRow(ws6, 2, 3, '6D28D9');
  styleHeaderRow(ws6, 5 + fin.banks.length, 11, '7C3AED');
  XLSX.utils.book_append_sheet(wb, ws6, '6. Tai Chinh & Cong No');

  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
}
