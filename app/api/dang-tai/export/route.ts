import { NextRequest, NextResponse } from 'next/server';
import { isRequestAuthenticated } from '@/lib/auth';
import { getDangTaiList } from '@/lib/dang-tai/storage';
import { calculateDangTaiSummary } from '@/lib/dang-tai/orderValidator';
import ExcelJS from 'exceljs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function formatDateVi(isoDate: string): string {
  const parts = isoDate.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return isoDate;
}

export async function GET(req: NextRequest) {
  if (!isRequestAuthenticated(req)) {
    return NextResponse.json({ error: 'Chưa xác thực phiên đăng nhập' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const date = searchParams.get('date') || new Date().toISOString().slice(0, 10);

  try {
    const items = await getDangTaiList(date);
    const summary = calculateDangTaiSummary(items, date);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Công ty TNHH XNK Chơn Chính';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Dang_Tai', {
      views: [{ showGridLines: true }],
      pageSetup: {
        orientation: 'landscape',
        paperSize: 9, // A4
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        margins: {
          left: 0.4,
          right: 0.4,
          top: 0.5,
          bottom: 0.5,
          header: 0.2,
          footer: 0.2,
        },
      },
    });

    const FONT_FAMILY = 'Segoe UI';

    // ==========================================
    // 1. BANNER TIÊU ĐỀ CÔNG TY & BẢNG BÁO CÁO
    // ==========================================
    sheet.mergeCells('A1:Q1');
    const headerCompany = sheet.getCell('A1');
    headerCompany.value = 'CÔNG TY TNHH XUẤT NHẬP KHẨU CHƠN CHÍNH';
    headerCompany.font = { name: FONT_FAMILY, size: 11, bold: true, color: { argb: 'FF1E3A8A' } };
    headerCompany.alignment = { horizontal: 'center', vertical: 'middle' };
    sheet.getRow(1).height = 20;

    sheet.mergeCells('A2:Q2');
    const headerTitle = sheet.getCell('A2');
    headerTitle.value = 'BẢNG THEO DÕI ĐĂNG TÀI & CÂN XE LÚA VỀ NHẬP';
    headerTitle.font = { name: FONT_FAMILY, size: 16, bold: true, color: { argb: 'FF0F172A' } };
    headerTitle.alignment = { horizontal: 'center', vertical: 'middle' };
    sheet.getRow(2).height = 26;

    sheet.mergeCells('A3:Q3');
    const headerSubtitle = sheet.getCell('A3');
    headerSubtitle.value = `Ngày theo dõi: ${formatDateVi(date)}  •  Đơn vị: Nhà máy Xay xát & Sấy lúa Chơn Chính  •  Xuất lúc: ${new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`;
    headerSubtitle.font = { name: FONT_FAMILY, size: 9.5, italic: true, color: { argb: 'FF64748B' } };
    headerSubtitle.alignment = { horizontal: 'center', vertical: 'middle' };
    sheet.getRow(3).height = 18;

    // ==========================================
    // 2. KHỐI THẺ TÓM TẮT CHỈ SỐ (KPI CARDS)
    // ==========================================
    // Thẻ 1: Tổng số xe (A4:D5)
    sheet.mergeCells('A4:D4');
    sheet.mergeCells('A5:D5');
    const card1Title = sheet.getCell('A4');
    card1Title.value = `🚛 TỔNG XE ĐĂNG TÀI: ${summary.tongXe} XE`;
    card1Title.font = { name: FONT_FAMILY, size: 10, bold: true, color: { argb: 'FF1E40AF' } };
    card1Title.alignment = { horizontal: 'center', vertical: 'middle' };

    const card1Sub = sheet.getCell('A5');
    card1Sub.value = `Đã cân: ${summary.daCan}  |  Chờ cân: ${summary.choCan}  |  Lệch STT: ${summary.saiStt}`;
    card1Sub.font = { name: FONT_FAMILY, size: 9, bold: true, color: { argb: 'FF3B82F6' } };
    card1Sub.alignment = { horizontal: 'center', vertical: 'middle' };

    // Thẻ 2: Ước tính (E4:H5)
    sheet.mergeCells('E4:H4');
    sheet.mergeCells('E5:H5');
    const card2Title = sheet.getCell('E4');
    card2Title.value = '🌾 TỔNG ƯỚC TÍNH (TÀI XẾ)';
    card2Title.font = { name: FONT_FAMILY, size: 10, bold: true, color: { argb: 'FF854D0E' } };
    card2Title.alignment = { horizontal: 'center', vertical: 'middle' };

    const card2Sub = sheet.getCell('E5');
    const uocTinhTan = (summary.tongKgUocTinh / 1000).toLocaleString('vi-VN', { maximumFractionDigits: 1 });
    card2Sub.value = `${summary.tongKgUocTinh.toLocaleString('vi-VN')} kg (~${uocTinhTan} tấn)`;
    card2Sub.font = { name: FONT_FAMILY, size: 10, bold: true, color: { argb: 'FFA16207' } };
    card2Sub.alignment = { horizontal: 'center', vertical: 'middle' };

    // Thẻ 3: Thực cân (I4:L5)
    sheet.mergeCells('I4:L4');
    sheet.mergeCells('I5:L5');
    const card3Title = sheet.getCell('I4');
    card3Title.value = '⚖️ TỔNG CÂN THỰC TẾ';
    card3Title.font = { name: FONT_FAMILY, size: 10, bold: true, color: { argb: 'FF065F46' } };
    card3Title.alignment = { horizontal: 'center', vertical: 'middle' };

    const card3Sub = sheet.getCell('I5');
    const thucTeTan = (summary.tongKgThucTe / 1000).toLocaleString('vi-VN', { maximumFractionDigits: 1 });
    card3Sub.value = `${summary.tongKgThucTe.toLocaleString('vi-VN')} kg (~${thucTeTan} tấn)`;
    card3Sub.font = { name: FONT_FAMILY, size: 10, bold: true, color: { argb: 'FF047857' } };
    card3Sub.alignment = { horizontal: 'center', vertical: 'middle' };

    // Thẻ 4: Chênh lệch (M4:Q5)
    sheet.mergeCells('M4:Q4');
    sheet.mergeCells('M5:Q5');
    const card4Title = sheet.getCell('M4');
    card4Title.value = '📊 CHÊNH LỆCH (THỰC TẾ - ƯỚC TÍNH)';
    card4Title.font = { name: FONT_FAMILY, size: 10, bold: true, color: { argb: 'FF475569' } };
    card4Title.alignment = { horizontal: 'center', vertical: 'middle' };

    const card4Sub = sheet.getCell('M5');
    const chenhLechTan = (summary.tongChenhLechKg / 1000).toLocaleString('vi-VN', {
      maximumFractionDigits: 1,
      minimumFractionDigits: 1,
    });
    const chenhLechSign = summary.tongChenhLechKg > 0 ? '+' : '';
    card4Sub.value = `${chenhLechSign}${summary.tongChenhLechKg.toLocaleString('vi-VN')} kg (${chenhLechSign}${chenhLechTan} tấn)`;
    card4Sub.font = {
      name: FONT_FAMILY,
      size: 10,
      bold: true,
      color: { argb: summary.tongChenhLechKg >= 0 ? 'FF0284C7' : 'FFBE123C' },
    };
    card4Sub.alignment = { horizontal: 'center', vertical: 'middle' };

    // Style đường viền & nền các thẻ KPI
    const styleKpiRange = (startCol: number, endCol: number, bg: string, borderCol: string) => {
      for (let r = 4; r <= 5; r++) {
        for (let c = startCol; c <= endCol; c++) {
          const cell = sheet.getRow(r).getCell(c);
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
          cell.border = {
            top: r === 4 ? { style: 'thin', color: { argb: borderCol } } : undefined,
            bottom: r === 5 ? { style: 'thin', color: { argb: borderCol } } : undefined,
            left: c === startCol ? { style: 'thin', color: { argb: borderCol } } : undefined,
            right: c === endCol ? { style: 'thin', color: { argb: borderCol } } : undefined,
          };
        }
      }
    };

    styleKpiRange(1, 4, 'FFEFF6FF', 'FFBFDBFE'); // Blue
    styleKpiRange(5, 8, 'FFFEFCE8', 'FFFEF08A'); // Amber
    styleKpiRange(9, 12, 'FFECFDF5', 'FFA7F3D0'); // Emerald
    styleKpiRange(13, 17, 'FFF8FAFC', 'FFE2E8F0'); // Slate

    sheet.getRow(4).height = 18;
    sheet.getRow(5).height = 20;

    // Row 6: Dòng đệm phân cách
    sheet.getRow(6).height = 8;

    // ==========================================
    // 3. TIÊU ĐỀ CỘT BẢNG (TABLE HEADERS)
    // ==========================================
    const headers = [
      'STT',
      'Giờ Đăng Tài',
      'Biển Số Xe',
      'Nhà Cung Cấp',
      'Loại Lúa',
      'Ước Tính (Kg)',
      'Tài Xế',
      'Số Điện Thoại',
      'Ngày Cân',
      'Giờ Cân',
      'Số Phiếu',
      'TL Xe+Hàng (Kg)',
      'TL Xe (Kg)',
      'TL Hàng (Kg)',
      'Chênh Lệch (Kg)',
      'Trạng Thái',
      'Ghi Chú / Cảnh Báo',
    ];

    const headerRow = sheet.getRow(7);
    headers.forEach((h, idx) => {
      const cell = headerRow.getCell(idx + 1);
      cell.value = h;
      cell.font = { name: FONT_FAMILY, size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1E3A8A' }, // Navy Blue sang trọng
      };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = {
        top: { style: 'medium', color: { argb: 'FF172554' } },
        left: { style: 'thin', color: { argb: 'FF3B82F6' } },
        bottom: { style: 'medium', color: { argb: 'FF172554' } },
        right: { style: 'thin', color: { argb: 'FF3B82F6' } },
      };
    });
    headerRow.height = 30;

    // ==========================================
    // 4. DỮ LIỆU CÁC DÒNG (DATA ROWS)
    // ==========================================
    let currentRowIdx = 8;
    let sumUocTinh = 0;
    let sumXeHang = 0;
    let sumXe = 0;
    let sumHang = 0;
    let sumChenhLech = 0;

    items.forEach((item) => {
      const row = sheet.getRow(currentRowIdx);

      const isApproved = !!item.daChapNhanHopLe;
      const isSaiStt = (item.trangThai === 'sai_stt' || item.canHopLeSTT === false) && !isApproved;
      const isDaCan = item.trangThai === 'da_can' || isApproved;

      // Khi người dùng đã chấp nhận thì hiển thị trạng thái như bình thường ("Đã cân ✓")
      const trangThaiText = isSaiStt
        ? 'Cân sai STT ⚠️'
        : isDaCan
        ? 'Đã cân ✓'
        : 'Chờ cân ⏳';

      // Khi đã chấp nhận: chỉ ghi nội dung ghi chú bình thường (không ghi lời cảnh báo và không ghi chú thích ngoại lệ)
      // Khi KHÔNG chấp nhận: mới hiện ra phần cảnh báo kèm ghi chú
      const canhBaoVaGhiChu = isApproved
        ? (item.ghiChu || '')
        : isSaiStt
        ? [item.canhBaoSTT, item.ghiChu].filter(Boolean).join(' | ')
        : (item.ghiChu || '');

      const ngayCanVal =
        item.ngayCan ||
        (item.ngayGioCan && item.ngayGioCan.includes(' ')
          ? item.ngayGioCan.split(' ')[0]
          : item.ngayGioCan || '');
      const gioCanVal =
        item.gioCan ||
        (item.ngayGioCan && item.ngayGioCan.includes(' ')
          ? item.ngayGioCan.split(' ')[1]
          : item.ngayGioCan || '');

      const uocTinhNum = typeof item.soLuongUocTinh === 'number' ? item.soLuongUocTinh : 0;
      const tlXeHangNum = typeof item.tlXeHangKg === 'number' ? item.tlXeHangKg : null;
      const tlXeNum = typeof item.tlXeKg === 'number' ? item.tlXeKg : null;
      const tlHangNum = typeof item.tlHangKg === 'number' ? item.tlHangKg : null;
      const chenhLechNum = typeof item.chenhLechKg === 'number' ? item.chenhLechKg : null;

      sumUocTinh += uocTinhNum;
      if (tlXeHangNum !== null) sumXeHang += tlXeHangNum;
      if (tlXeNum !== null) sumXe += tlXeNum;
      if (tlHangNum !== null) sumHang += tlHangNum;
      if (chenhLechNum !== null) sumChenhLech += chenhLechNum;

      row.getCell(1).value = item.stt;
      row.getCell(2).value = item.gioDangTai || '';
      row.getCell(3).value = item.bienSoXe;
      row.getCell(4).value = item.nhaCungCap || item.khachHangCan || '';
      row.getCell(5).value = item.loaiLua || '5451';
      row.getCell(6).value = uocTinhNum > 0 ? uocTinhNum : '';
      row.getCell(7).value = item.tenTaiXe || '';
      row.getCell(8).value = item.sdtTaiXe || '';
      row.getCell(9).value = ngayCanVal;
      row.getCell(10).value = gioCanVal;
      row.getCell(11).value = item.soPhieuCan || '';
      row.getCell(12).value = tlXeHangNum !== null ? tlXeHangNum : '';
      row.getCell(13).value = tlXeNum !== null ? tlXeNum : '';
      row.getCell(14).value = tlHangNum !== null ? tlHangNum : '';
      row.getCell(15).value = chenhLechNum !== null ? chenhLechNum : '';
      row.getCell(16).value = trangThaiText;
      row.getCell(17).value = canhBaoVaGhiChu;

      // Định dạng số chuẩn (chống lỗi tam giác xanh Excel)
      if (uocTinhNum > 0) row.getCell(6).numFmt = '#,##0';
      if (tlXeHangNum !== null) row.getCell(12).numFmt = '#,##0';
      if (tlXeNum !== null) row.getCell(13).numFmt = '#,##0';
      if (tlHangNum !== null) row.getCell(14).numFmt = '#,##0';
      if (chenhLechNum !== null) row.getCell(15).numFmt = '+#,##0;-#,##0;0';

      // Canh lề chuẩn
      row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
      row.getCell(2).alignment = { horizontal: 'center', vertical: 'middle' };
      row.getCell(3).alignment = { horizontal: 'center', vertical: 'middle' };
      row.getCell(4).alignment = { horizontal: 'left', vertical: 'middle' };
      row.getCell(5).alignment = { horizontal: 'center', vertical: 'middle' };
      row.getCell(6).alignment = { horizontal: 'right', vertical: 'middle' };
      row.getCell(7).alignment = { horizontal: 'left', vertical: 'middle' };
      row.getCell(8).alignment = { horizontal: 'center', vertical: 'middle' };
      row.getCell(9).alignment = { horizontal: 'center', vertical: 'middle' };
      row.getCell(10).alignment = { horizontal: 'center', vertical: 'middle' };
      row.getCell(11).alignment = { horizontal: 'center', vertical: 'middle' };
      row.getCell(12).alignment = { horizontal: 'right', vertical: 'middle' };
      row.getCell(13).alignment = { horizontal: 'right', vertical: 'middle' };
      row.getCell(14).alignment = { horizontal: 'right', vertical: 'middle' };
      row.getCell(15).alignment = { horizontal: 'right', vertical: 'middle' };
      row.getCell(16).alignment = { horizontal: 'center', vertical: 'middle' };
      row.getCell(17).alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };

      // Font chữ từng ô
      for (let col = 1; col <= 17; col++) {
        row.getCell(col).font = { name: FONT_FAMILY, size: 9.5 };
      }

      // Điểm nhấn font chữ
      row.getCell(1).font = { name: FONT_FAMILY, size: 9.5, bold: true };
      row.getCell(3).font = { name: FONT_FAMILY, size: 9.5, bold: true, color: { argb: 'FF0F172A' } };
      row.getCell(5).font = { name: FONT_FAMILY, size: 9.5, bold: true, color: { argb: 'FF1E40AF' } };
      row.getCell(11).font = { name: FONT_FAMILY, size: 9.5, bold: true, color: { argb: 'FF0F172A' } };
      row.getCell(14).font = { name: FONT_FAMILY, size: 10, bold: true, color: { argb: 'FF047857' } }; // TL Hàng nổi bật xanh lá đậm

      // Màu chênh lệch
      if (chenhLechNum !== null) {
        row.getCell(15).font = {
          name: FONT_FAMILY,
          size: 9.5,
          bold: true,
          color: { argb: chenhLechNum > 0 ? 'FF2563EB' : chenhLechNum < 0 ? 'FFDC2626' : 'FF475569' },
        };
      }

      // Màu trạng thái
      if (isSaiStt) {
        row.getCell(16).font = { name: FONT_FAMILY, size: 9.5, bold: true, color: { argb: 'FFDC2626' } };
      } else if (isDaCan) {
        row.getCell(16).font = { name: FONT_FAMILY, size: 9.5, bold: true, color: { argb: 'FF16A34A' } };
      } else {
        row.getCell(16).font = { name: FONT_FAMILY, size: 9.5, bold: false, color: { argb: 'FFD97706' } };
      }

      // Màu nền dòng theo trạng thái
      let rowBg = 'FFFFFFFF';
      let borderColor = 'FFE2E8F0';

      if (isSaiStt) {
        rowBg = 'FFFFF1F2'; // Hồng nhạt cảnh báo khi chưa chấp nhận
        borderColor = 'FFFECDD3';
      } else if (isDaCan) {
        rowBg = 'FFF0FDF4'; // Xanh nhạt đã cân bình thường (áp dụng cho cả xe cân chuẩn và xe đã được chấp nhận)
        borderColor = 'FFDCFCE7';
      } else {
        rowBg = currentRowIdx % 2 === 0 ? 'FFF8FAFC' : 'FFFFFFFF'; // Zebra nhạt cho xe chờ cân
      }

      for (let col = 1; col <= 17; col++) {
        const cell = row.getCell(col);
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: rowBg },
        };
        cell.border = {
          top: { style: 'thin', color: { argb: borderColor } },
          left: { style: 'thin', color: { argb: borderColor } },
          bottom: { style: 'thin', color: { argb: borderColor } },
          right: { style: 'thin', color: { argb: borderColor } },
        };
      }

      // Độ cao hàng tự giãn nếu có ghi chú cảnh báo dài
      const hasLongText = canhBaoVaGhiChu.length > 50;
      row.height = hasLongText ? 36 : 24;
      currentRowIdx++;
    });

    // ==========================================
    // 5. DÒNG TỔNG CỘNG (TOTAL ROW)
    // ==========================================
    const totalRow = sheet.getRow(currentRowIdx);
    sheet.mergeCells(`A${currentRowIdx}:E${currentRowIdx}`);
    const totalLabel = totalRow.getCell(1);
    totalLabel.value = `TỔNG CỘNG (${items.length} XE):`;
    totalLabel.font = { name: FONT_FAMILY, size: 10.5, bold: true, color: { argb: 'FF0F172A' } };
    totalLabel.alignment = { horizontal: 'right', vertical: 'middle' };

    // Tổng Ước tính
    totalRow.getCell(6).value = sumUocTinh;
    totalRow.getCell(6).font = { name: FONT_FAMILY, size: 10.5, bold: true, color: { argb: 'FF0F172A' } };
    totalRow.getCell(6).numFmt = '#,##0';
    totalRow.getCell(6).alignment = { horizontal: 'right', vertical: 'middle' };

    // Tổng TL Xe+Hàng
    if (sumXeHang > 0) {
      totalRow.getCell(12).value = sumXeHang;
      totalRow.getCell(12).font = { name: FONT_FAMILY, size: 10, bold: true, color: { argb: 'FF475569' } };
      totalRow.getCell(12).numFmt = '#,##0';
      totalRow.getCell(12).alignment = { horizontal: 'right', vertical: 'middle' };
    }

    // Tổng TL Xe
    if (sumXe > 0) {
      totalRow.getCell(13).value = sumXe;
      totalRow.getCell(13).font = { name: FONT_FAMILY, size: 10, bold: true, color: { argb: 'FF475569' } };
      totalRow.getCell(13).numFmt = '#,##0';
      totalRow.getCell(13).alignment = { horizontal: 'right', vertical: 'middle' };
    }

    // Tổng TL Hàng thực tế
    totalRow.getCell(14).value = sumHang;
    totalRow.getCell(14).font = { name: FONT_FAMILY, size: 11, bold: true, color: { argb: 'FF047857' } };
    totalRow.getCell(14).numFmt = '#,##0';
    totalRow.getCell(14).alignment = { horizontal: 'right', vertical: 'middle' };

    // Tổng Chênh lệch
    totalRow.getCell(15).value = sumChenhLech;
    totalRow.getCell(15).font = {
      name: FONT_FAMILY,
      size: 10.5,
      bold: true,
      color: { argb: sumChenhLech >= 0 ? 'FF2563EB' : 'FFDC2626' },
    };
    totalRow.getCell(15).numFmt = '+#,##0;-#,##0;0';
    totalRow.getCell(15).alignment = { horizontal: 'right', vertical: 'middle' };

    // Style toàn bộ dòng tổng cộng
    for (let col = 1; col <= 17; col++) {
      const cell = totalRow.getCell(col);
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF1F5F9' }, // Xám Slate nhạt sang trọng
      };
      cell.border = {
        top: { style: 'medium', color: { argb: 'FF0F172A' } },
        bottom: { style: 'double', color: { argb: 'FF0F172A' } },
        left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      };
    }
    totalRow.height = 28;

    // ==========================================
    // 6. KHỐI KÝ TÊN PHÊ DUYỆT (SIGNATURES)
    // ==========================================
    const signRowStart = currentRowIdx + 2;

    sheet.mergeCells(`B${signRowStart}:D${signRowStart}`);
    const sign1 = sheet.getCell(`B${signRowStart}`);
    sign1.value = 'NGƯỜI LẬP BẢNG ĐĂNG TÀI';
    sign1.font = { name: FONT_FAMILY, size: 10, bold: true, color: { argb: 'FF1E293B' } };
    sign1.alignment = { horizontal: 'center', vertical: 'middle' };

    sheet.mergeCells(`B${signRowStart + 1}:D${signRowStart + 1}`);
    const sign1Sub = sheet.getCell(`B${signRowStart + 1}`);
    sign1Sub.value = '(Ký & ghi rõ họ tên)';
    sign1Sub.font = { name: FONT_FAMILY, size: 9, italic: true, color: { argb: 'FF64748B' } };
    sign1Sub.alignment = { horizontal: 'center', vertical: 'middle' };

    sheet.mergeCells(`F${signRowStart}:I${signRowStart}`);
    const sign2 = sheet.getCell(`F${signRowStart}`);
    sign2.value = 'BỘ PHẬN CÂN & KIỂM SOÁT LÚA';
    sign2.font = { name: FONT_FAMILY, size: 10, bold: true, color: { argb: 'FF1E293B' } };
    sign2.alignment = { horizontal: 'center', vertical: 'middle' };

    sheet.mergeCells(`F${signRowStart + 1}:I${signRowStart + 1}`);
    const sign2Sub = sheet.getCell(`F${signRowStart + 1}`);
    sign2Sub.value = '(Ký & ghi rõ họ tên)';
    sign2Sub.font = { name: FONT_FAMILY, size: 9, italic: true, color: { argb: 'FF64748B' } };
    sign2Sub.alignment = { horizontal: 'center', vertical: 'middle' };

    sheet.mergeCells(`M${signRowStart}:P${signRowStart}`);
    const sign3 = sheet.getCell(`M${signRowStart}`);
    sign3.value = 'BAN GIÁM ĐỐC / ĐIỀU PHỐI DUYỆT';
    sign3.font = { name: FONT_FAMILY, size: 10, bold: true, color: { argb: 'FF1E293B' } };
    sign3.alignment = { horizontal: 'center', vertical: 'middle' };

    sheet.mergeCells(`M${signRowStart + 1}:P${signRowStart + 1}`);
    const sign3Sub = sheet.getCell(`M${signRowStart + 1}`);
    sign3Sub.value = '(Ký duyệt & đóng dấu)';
    sign3Sub.font = { name: FONT_FAMILY, size: 9, italic: true, color: { argb: 'FF64748B' } };
    sign3Sub.alignment = { horizontal: 'center', vertical: 'middle' };

    sheet.getRow(signRowStart).height = 20;
    sheet.getRow(signRowStart + 1).height = 18;
    sheet.getRow(signRowStart + 4).height = 22; // Chừa khoảng trống để ký tay

    // ==========================================
    // 7. ĐỘ RỘNG CỘT RỘNG RÃI, THOÁNG ĐẸP
    // ==========================================
    sheet.getColumn(1).width = 7; // STT
    sheet.getColumn(2).width = 14; // Giờ Đăng Tài
    sheet.getColumn(3).width = 16; // Biển số xe (rộng rãi)
    sheet.getColumn(4).width = 24; // Nhà Cung Cấp
    sheet.getColumn(5).width = 13; // Loại lúa
    sheet.getColumn(6).width = 16; // Ước tính
    sheet.getColumn(7).width = 24; // Tên tài xế (thoải mái họ tên 4 chữ)
    sheet.getColumn(8).width = 15; // Số điện thoại
    sheet.getColumn(9).width = 14; // Ngày cân
    sheet.getColumn(10).width = 13; // Giờ cân
    sheet.getColumn(11).width = 12; // Số phiếu
    sheet.getColumn(12).width = 16; // TL Xe+Hàng
    sheet.getColumn(13).width = 14; // TL Xe
    sheet.getColumn(14).width = 16; // TL Hàng
    sheet.getColumn(15).width = 16; // Chênh lệch
    sheet.getColumn(16).width = 18; // Trạng thái
    sheet.getColumn(17).width = 46; // Ghi chú / Cảnh báo (rộng 46, wrapText)

    const buffer = await workbook.xlsx.writeBuffer();

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="Bang_Dang_Tai_Nhap_Lua_${date}.xlsx"`,
      },
    });
  } catch (err: unknown) {
    console.error('[Export Excel Error]:', err);
    return NextResponse.json({ error: 'Lỗi xuất file Excel' }, { status: 500 });
  }
}
