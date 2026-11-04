import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { isRequestAuthenticated } from '@/lib/auth';
import { parseRiceMasterExcel } from '@/lib/rice-payroll/excel-parser';

export async function POST(req: NextRequest) {
  if (!isRequestAuthenticated(req)) {
    return NextResponse.json({ error: 'Chưa xác thực phiên đăng nhập' }, { status: 401 });
  }

  try {
    const contentType = req.headers.get('content-type') || '';

    // Trường hợp 1: Sử dụng file mẫu 2026 có sẵn trong hệ thống
    if (contentType.includes('application/json')) {
      const body = await req.json().catch(() => ({}));
      if (body.useSample) {
        // Ưu tiên đọc từ data/sample-batches.json (nhanh và luôn có trên Vercel)
        const jsonPath = path.join(process.cwd(), 'data', 'sample-batches.json');
        if (fs.existsSync(jsonPath)) {
          const raw = fs.readFileSync(jsonPath, 'utf-8');
          const data = JSON.parse(raw);
          return NextResponse.json({
            success: true,
            fileName: 'THỊNH_TỔNG SỐ LIỆU NHẬP LÚA TƯƠI 2026 (Dữ liệu mẫu)',
            ...data,
          });
        }

        // Dự phòng nếu có file Excel gốc
        const samplePath = path.join(process.cwd(), 'THỊNH_TỔNG SỐ LIỆU NHẬP LÚA TƯƠI 2026.xlsx');
        if (fs.existsSync(samplePath)) {
          const fileBuffer = fs.readFileSync(samplePath);
          const parsed = parseRiceMasterExcel(fileBuffer);
          return NextResponse.json({
            success: true,
            fileName: 'THỊNH_TỔNG SỐ LIỆU NHẬP LÚA TƯƠI 2026.xlsx (Dữ liệu mẫu)',
            ...parsed,
          });
        }

        return NextResponse.json(
          { error: 'Không tìm thấy file dữ liệu mẫu trên máy chủ' },
          { status: 404 }
        );
      }
    }

    // Trường hợp 2: Upload file từ máy người dùng qua FormData
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json(
        { error: 'Vui lòng chọn hoặc tải lên một file Excel (.xlsx)' },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const parsed = parseRiceMasterExcel(buffer);

    return NextResponse.json({
      success: true,
      fileName: file.name,
      ...parsed,
    });
  } catch (error) {
    console.error('Lỗi khi đọc file Excel:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Lỗi không xác định khi đọc file Excel' },
      { status: 500 }
    );
  }
}

