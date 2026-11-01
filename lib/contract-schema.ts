import { z } from 'zod';

// Mã số thuế Việt Nam: 10 chữ số hoặc 10 chữ số kèm dấu gạch ngang và 3 chữ số chi nhánh (vd: 1402017541 hoặc 1402017541-001)
export const MST_REGEX = /^\d{10}(-\d{3})?$/;

// Schema từng mặt hàng
export const contractItemSchema = z.object({
  name: z.string().trim().min(1, 'Tên hàng không được để trống').max(200, 'Tên hàng tối đa 200 ký tự'),
  quantity: z
    .number({ message: 'Số lượng phải là số' })
    .positive('Số lượng phải lớn hơn 0')
    .max(10_000_000, 'Số lượng vượt quá giới hạn tối đa (10.000.000)'),
  unitPrice: z
    .number({ message: 'Đơn giá phải là số' })
    .positive('Đơn giá phải lớn hơn 0')
    .max(10_000_000_000, 'Đơn giá vượt quá giới hạn tối đa'),
});

// Schema toàn bộ form hợp đồng
export const contractFormSchema = z
  .object({
    contractNo: z
      .string()
      .trim()
      .min(1, 'Số hợp đồng không được để trống')
      .max(50, 'Số hợp đồng tối đa 50 ký tự')
      .regex(/^[\w\-\/\.]+$/, 'Số hợp đồng chỉ được chứa ký tự chữ, số, -, /, .'),
    signDate: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày ký phải có định dạng YYYY-MM-DD'),
    deliveryStartDate: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày bắt đầu giao hàng phải có định dạng YYYY-MM-DD'),
    deliveryEndDate: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày kết thúc giao hàng phải có định dạng YYYY-MM-DD'),

    // Thông tin Bên B (Bên Mua)
    bName: z
      .string()
      .trim()
      .min(2, 'Tên công ty Bên B tối thiểu 2 ký tự')
      .max(250, 'Tên công ty Bên B tối đa 250 ký tự'),
    bAddress: z
      .string()
      .trim()
      .min(5, 'Địa chỉ Bên B tối thiểu 5 ký tự')
      .max(300, 'Địa chỉ Bên B tối đa 300 ký tự'),
    bPhone: z
      .string()
      .trim()
      .min(9, 'Số điện thoại Bên B tối thiểu 9 số')
      .max(20, 'Số điện thoại Bên B tối đa 20 ký tự')
      .regex(/^[\d\s\-\+\(\)\.]+$/, 'Số điện thoại không hợp lệ'),
    bMst: z
      .string()
      .trim()
      .regex(MST_REGEX, 'Mã số thuế không hợp lệ (phải gồm 10 số hoặc dạng 10 số - 3 số)'),
    bRepresentative: z
      .string()
      .trim()
      .min(2, 'Người đại diện Bên B tối thiểu 2 ký tự')
      .max(100, 'Người đại diện Bên B tối đa 100 ký tự')
      .transform((val) => val.toUpperCase()),
    bTitle: z
      .string()
      .trim()
      .min(2, 'Chức vụ tối thiểu 2 ký tự')
      .max(100, 'Chức vụ tối đa 100 ký tự'),

    // Điều khoản giao hàng & thanh toán
    deliveryLocation: z
      .string()
      .trim()
      .min(2, 'Địa điểm giao hàng không được để trống')
      .max(300, 'Địa điểm giao hàng tối đa 300 ký tự'),
    paymentMethod: z
      .string()
      .trim()
      .min(2, 'Phương thức thanh toán không được để trống')
      .max(200, 'Phương thức thanh toán tối đa 200 ký tự'),

    // Danh sách mặt hàng
    items: z
      .array(contractItemSchema)
      .min(1, 'Hợp đồng phải có ít nhất 1 mặt hàng')
      .max(50, 'Tối đa 50 mặt hàng trong một hợp đồng'),
  })
  .refine(
    (data) => {
      const start = new Date(data.deliveryStartDate).getTime();
      const end = new Date(data.deliveryEndDate).getTime();
      return end >= start;
    },
    {
      message: 'Ngày kết thúc giao hàng phải bằng hoặc sau ngày bắt đầu giao hàng',
      path: ['deliveryEndDate'],
    }
  );

export type ContractFormValues = z.infer<typeof contractFormSchema>;
export type ContractItem = z.infer<typeof contractItemSchema>;

// Dữ liệu truyền vào Docxtemplater lúc render
export interface ContractTemplateData {
  contract_no: string;
  sign_day: string;
  sign_month: string;
  sign_year: string;
  
  // Bên A (Cố định)
  a_name: string;
  a_address: string;
  a_phone: string;
  a_mst: string;
  a_representative: string;
  a_title: string;
  a_authorization: string;
  a_bank_account: string;
  a_bank_name: string;
  a_signer_name: string;

  // Bên B
  b_name: string;
  b_address: string;
  b_phone: string;
  b_mst: string;
  b_representative: string;
  b_title: string;
  b_signer_name: string;

  // Điều khoản
  delivery_start_date: string;
  delivery_end_date: string;
  delivery_location: string;
  payment_method: string;

  // Hàng hóa (Chuẩn 5 cột theo hợp đồng gốc)
  items: Array<{
    stt: number;
    name: string;
    quantity: string;
    unit_price: string;
    total: string;
  }>;
  total_amount: string;
  total_words: string;
}
