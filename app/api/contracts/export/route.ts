import { NextRequest, NextResponse } from 'next/server';
import { contractFormSchema, type ContractTemplateData } from '@/lib/contract-schema';
import { renderContractDocx } from '@/lib/render-contract';
import { moneyToVietnameseWords, formatVND } from '@/lib/number-to-vi-words';
import { COMPANY_A } from '@/lib/company-config';
import { isRequestAuthenticated } from '@/lib/auth';

export const runtime = 'nodejs';
export const maxDuration = 30;

function formatDateVi(isoDate: string): string {
  const [y, m, d] = isoDate.split('-');
  if (!y || !m || !d) return isoDate;
  return `${d}/${m}/${y}`;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  // 1. Kiểm tra xác thực phiên đăng nhập
  if (!isRequestAuthenticated(request)) {
    return NextResponse.json(
      { error: 'Vui lòng đăng nhập để thực hiện xuất hợp đồng' },
      { status: 401 }
    );
  }

  try {
    // 2. Parse & Validate input với Zod ở server (nguồn sự thật duy nhất)
    const body: unknown = await request.json();
    const parsed = contractFormSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Dữ liệu biểu mẫu không hợp lệ, vui lòng kiểm tra lại các trường báo lỗi',
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 422 }
      );
    }

    const form = parsed.data;

    // 3. Tính toán Thành tiền từng dòng và Tổng tiền HOÀN TOÀN Ở SERVER
    // Tuyệt đối không nhận giá trị tính sẵn từ client để chống gian lận
    let grandTotal = 0;
    const itemsFormatted = form.items.map((item, index) => {
      const lineTotal = item.quantity * item.unitPrice;
      grandTotal += lineTotal;

      return {
        stt: index + 1,
        name: item.name,
        quantity: formatVND(item.quantity),
        unit_price: formatVND(item.unitPrice),
        total: formatVND(lineTotal),
      };
    });

    const [signYear = '', signMonth = '', signDay = ''] = form.signDate.split('-');

    // Người đại diện Bên B luôn chuyển thành chữ IN HOA
    const representativeB = form.bRepresentative.trim().toUpperCase();

    // 4. Chuẩn bị dữ liệu map vào Docxtemplater
    const templateData: ContractTemplateData = {
      contract_no: form.contractNo,
      sign_day: signDay,
      sign_month: signMonth,
      sign_year: signYear,

      // Bên A - CỐ ĐỊNH TỪ HỆ THỐNG, không phụ thuộc client
      a_name: COMPANY_A.name,
      a_address: COMPANY_A.address,
      a_phone: COMPANY_A.phone,
      a_mst: COMPANY_A.mst,
      a_representative: COMPANY_A.representative.toUpperCase(),
      a_title: COMPANY_A.title,
      a_authorization: COMPANY_A.authorizationNote,
      a_bank_account: COMPANY_A.bankAccount,
      a_bank_name: COMPANY_A.bankName,
      a_signer_name: COMPANY_A.signerName.toUpperCase(),

      // Bên B - từ form đã validate, loại bỏ hậu tố (BÊN MUA) nếu người dùng tự nhập để tránh bị trùng lặp
      b_name: form.bName.trim().replace(/\s*\(\s*BÊN\s*MUA\s*\)\.?$/i, '').trim(),
      b_address: form.bAddress,
      b_phone: form.bPhone,
      b_mst: form.bMst,
      b_representative: representativeB,
      b_title: form.bTitle,
      b_signer_name: representativeB,

      // Điều khoản
      delivery_start_date: formatDateVi(form.deliveryStartDate),
      delivery_end_date: formatDateVi(form.deliveryEndDate),
      delivery_location: form.deliveryLocation,
      payment_method: form.paymentMethod,

      // Hàng hóa và tổng cộng
      items: itemsFormatted,
      total_amount: formatVND(grandTotal),
      total_words: moneyToVietnameseWords(grandTotal),
    };

    // 5. Render file docx trong bộ nhớ Buffer
    const docxBuffer = renderContractDocx(templateData);

    // 6. Tên file an toàn ASCII theo chuẩn RFC
    const sanitizedNo = form.contractNo.replace(/[^a-zA-Z0-9_\-]/g, '_');
    const safeFilename = `hop-dong-${sanitizedNo}.docx`;

    return new NextResponse(new Uint8Array(docxBuffer), {
      status: 200,
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${safeFilename}"`,
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    });
  } catch (error) {
    // Không bao giờ để lộ stack trace ra ngoài response
    console.error('[API Contracts Export Error]:', error);
    return NextResponse.json(
      { error: 'Không thể xuất hợp đồng lúc này. Vui lòng kiểm tra lại dữ liệu và thử lại.' },
      { status: 500 }
    );
  }
}
