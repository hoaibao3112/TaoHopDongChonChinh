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

    const sheet = workbook.addWorksheet(`Đăng Tài ${date}`, {
      views: [{ showGridLines: true }],
      pageSetup: {
        orientation: 'landscape',
        paperSize: 9, // A4
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
      },
    });

    // 1. Tiêu đề
    sheet.mergeCells('A1:P1');
    const titleCell = sheet.getCell('A1');
    titleCell.value = 'CÔNG TY TNHH XUẤT NHẬP KHẨU CHƠN CHÍNH';
    titleCell.font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FF0F5132' } };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };

    sheet.mergeCells('A2:P2');
    const subTitle = sheet.getCell('A2');
    subTitle.value = `BẢNG THEO DÕI ĐĂNG TÀI & CÂN XE LÚA VỀ NHẬP - NGÀY ${formatDateVi(date)}`;
    subTitle.font = { name: 'Arial', size: 13, bold: true, color: { argb: 'FF1E293B' } };
    subTitle.alignment = { horizontal: 'center', vertical: 'middle' };

    // 2. Tóm tắt
    sheet.mergeCells('A4:P4');
    const sumCell = sheet.getCell('A4');
    sumCell.value = `Tổng số xe: ${summary.tongXe} | Đã cân: ${summary.daCan} | Đang chờ cân: ${summary.choCan} | Cân sai STT: ${summary.saiStt} | Tổng ước tính: ${summary.tongKgUocTinh.toLocaleString('vi-VN')} Kg | Tổng cân thực tế: ${summary.tongKgThucTe.toLocaleString('vi-VN')} Kg | Chênh lệch: ${summary.tongChenhLechKg > 0 ? '+' : ''}${summary.tongChenhLechKg.toLocaleString('vi-VN')} Kg`;
    sumCell.font = { name: 'Arial', size: 10, italic: true, bold: true, color: { argb: 'FF334155' } };
    sumCell.alignment = { horizontal: 'center', vertical: 'middle' };

    // 3. Headers
    const headers = [
      'STT',
      'Giờ Đăng Tài',
      'Biển Số Xe',
      'Nhà Cung Cấp',
      'Loại Lúa',
      'Ước Tính (Kg)',
      'Tài Xế',
      'Số Điện Thoại',
      'Giờ Cân',
      'Số Phiếu',
      'TL Xe+Hàng (Kg)',
      'TL Xe (Kg)',
      'TL Hàng (Kg)',
      'Chênh Lệch (Kg)',
      'Trạng Thái',
      'Ghi Chú / Cảnh Báo',
    ];

    const headerRow = sheet.getRow(6);
    headers.forEach((h, idx) => {
      const cell = headerRow.getCell(idx + 1);
      cell.value = h;
      cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1E40AF' }, // Blue header
      };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'medium' },
        right: { style: 'thin' },
      };
    });
    headerRow.height = 28;

    // 4. Data Rows
    let currentRowIdx = 7;
    items.forEach((item) => {
      const row = sheet.getRow(currentRowIdx);

      const trangThaiText =
        item.trangThai === 'da_can'
          ? 'Đã cân'
          : item.trangThai === 'sai_stt'
            ? 'Cân sai STT ⚠️'
            : 'Chờ cân ⏳';

      const canhBaoVaGhiChu = [item.canhBaoSTT, item.ghiChu].filter(Boolean).join(' | ');

      row.getCell(1).value = item.stt;
      row.getCell(2).value = item.gioDangTai;
      row.getCell(3).value = item.bienSoXe;
      row.getCell(4).value = item.nhaCungCap || item.khachHangCan || '';
      row.getCell(5).value = item.loaiLua;
      row.getCell(6).value = item.soLuongUocTinh || 0;
      row.getCell(7).value = item.tenTaiXe || '';
      row.getCell(8).value = item.sdtTaiXe || '';
      row.getCell(9).value = item.ngayGioCan || '';
      row.getCell(10).value = item.soPhieuCan || '';
      row.getCell(11).value = item.tlXeHangKg || '';
      row.getCell(12).value = item.tlXeKg || '';
      row.getCell(13).value = item.tlHangKg || '';
      row.getCell(14).value = item.chenhLechKg !== undefined ? item.chenhLechKg : '';
      row.getCell(15).value = trangThaiText;
      row.getCell(16).value = canhBaoVaGhiChu;

      // Number formatting
      row.getCell(6).numFmt = '#,##0';
      if (item.tlXeHangKg) row.getCell(11).numFmt = '#,##0';
      if (item.tlXeKg) row.getCell(12).numFmt = '#,##0';
      if (item.tlHangKg) row.getCell(13).numFmt = '#,##0';
      if (item.chenhLechKg !== undefined) row.getCell(14).numFmt = '+#,##0;-#,##0;0';

      // Alignment
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
      row.getCell(11).alignment = { horizontal: 'right', vertical: 'middle' };
      row.getCell(12).alignment = { horizontal: 'right', vertical: 'middle' };
      row.getCell(13).alignment = { horizontal: 'right', vertical: 'middle' };
      row.getCell(14).alignment = { horizontal: 'right', vertical: 'middle' };
      row.getCell(15).alignment = { horizontal: 'center', vertical: 'middle' };
      row.getCell(16).alignment = { horizontal: 'left', vertical: 'middle' };

      // Highlight according to status
      let rowBg = 'FFFFFFFF';
      if (item.trangThai === 'sai_stt') {
        rowBg = 'FFFFF7ED'; // Orange tint
      } else if (item.trangThai === 'da_can') {
        rowBg = 'FFF0FDF4'; // Green tint
      }

      for (let col = 1; col <= 16; col++) {
        const cell = row.getCell(col);
        cell.font = { name: 'Arial', size: 9 };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        };
        if (rowBg !== 'FFFFFFFF') {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: rowBg },
          };
        }
      }

      row.height = 22;
      currentRowIdx++;
    });

    // 5. Total Row
    const totalRow = sheet.getRow(currentRowIdx);
    sheet.mergeCells(`A${currentRowIdx}:E${currentRowIdx}`);
    totalRow.getCell(1).value = 'TỔNG CỘNG:';
    totalRow.getCell(1).font = { name: 'Arial', size: 10, bold: true };
    totalRow.getCell(1).alignment = { horizontal: 'right', vertical: 'middle' };

    totalRow.getCell(6).value = summary.tongKgUocTinh;
    totalRow.getCell(6).font = { name: 'Arial', size: 10, bold: true };
    totalRow.getCell(6).numFmt = '#,##0';
    totalRow.getCell(6).alignment = { horizontal: 'right', vertical: 'middle' };

    totalRow.getCell(13).value = summary.tongKgThucTe;
    totalRow.getCell(13).font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF15803D' } };
    totalRow.getCell(13).numFmt = '#,##0';
    totalRow.getCell(13).alignment = { horizontal: 'right', vertical: 'middle' };

    totalRow.getCell(14).value = summary.tongChenhLechKg;
    totalRow.getCell(14).font = { name: 'Arial', size: 10, bold: true };
    totalRow.getCell(14).numFmt = '+#,##0;-#,##0;0';
    totalRow.getCell(14).alignment = { horizontal: 'right', vertical: 'middle' };

    for (let col = 1; col <= 16; col++) {
      const cell = totalRow.getCell(col);
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF1F5F9' },
      };
      cell.border = {
        top: { style: 'medium', color: { argb: 'FF0F172A' } },
        bottom: { style: 'double', color: { argb: 'FF0F172A' } },
      };
    }
    totalRow.height = 24;

    // Set Column Widths
    sheet.getColumn(1).width = 6; // STT
    sheet.getColumn(2).width = 14; // Giờ Đăng Tài
    sheet.getColumn(3).width = 14; // Biển số xe
    sheet.getColumn(4).width = 20; // Nhà Cung Cấp
    sheet.getColumn(5).width = 13; // Loại lúa
    sheet.getColumn(6).width = 14; // Ước tính
    sheet.getColumn(7).width = 18; // Tên tài xế
    sheet.getColumn(8).width = 14; // Số điện thoại
    sheet.getColumn(9).width = 20; // Giờ cân
    sheet.getColumn(10).width = 11; // Số phiếu
    sheet.getColumn(11).width = 14; // TL Xe+Hàng
    sheet.getColumn(12).width = 12; // TL Xe
    sheet.getColumn(13).width = 14; // TL Hàng
    sheet.getColumn(14).width = 14; // Chênh lệch
    sheet.getColumn(15).width = 14; // Trạng thái
    sheet.getColumn(16).width = 30; // Ghi chú

    const buffer = await workbook.xlsx.writeBuffer();

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="Bang_Theo_Doi_Dang_Tai_${date}.xlsx"`,
      },
    });
  } catch (err: unknown) {
    console.error('[Export Excel Error]:', err);
    return NextResponse.json({ error: 'Lỗi xuất file Excel' }, { status: 500 });
  }
}
