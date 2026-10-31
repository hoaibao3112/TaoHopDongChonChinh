'use client';

import React, { useState } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { contractFormSchema, type ContractFormValues } from '@/lib/contract-schema';

// Helper format số hiển thị kiểu Việt Nam
function formatCurrency(val: number): string {
  if (!Number.isFinite(val) || val <= 0) return '0 ₫';
  return val.toLocaleString('vi-VN') + ' ₫';
}

function getDefaultDates() {
  const today = new Date();
  const signDate = today.toISOString().split('T')[0];

  const delivery = new Date(today);
  delivery.setDate(delivery.getDate() + 30);
  const deliveryDate = delivery.toISOString().split('T')[0];

  return { signDate, deliveryDate };
}

export default function ContractForm() {
  const [isExporting, setIsExporting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  const { signDate, deliveryDate } = getDefaultDates();

  const {
    register,
    control,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<ContractFormValues>({
    resolver: zodResolver(contractFormSchema),
    defaultValues: {
      contractNo: '250926/CC-TP',
      signDate,
      deliveryDate,
      bName: '',
      bAddress: '',
      bPhone: '',
      bMst: '',
      bRepresentative: '',
      bTitle: 'Giám Đốc',
      bBankAccount: '',
      bBankName: '',
      deliveryLocation: 'Giao hàng tại kho Bên A.',
      paymentMethod: 'Chuyển khoản 100% giá trị đơn hàng.',
      items: [
        {
          name: 'Trấu',
          quantity: 200000,
          unit: 'kg',
          unitPrice: 1800,
        },
      ],
    },
    mode: 'onBlur',
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'items',
  });

  const watchedItems = watch('items') || [];

  // Tính nhẩm xem trước trên Client (Server luôn tính lại chuẩn xác)
  const previewTotals = watchedItems.map((item) => {
    const q = Number(item?.quantity) || 0;
    const p = Number(item?.unitPrice) || 0;
    return q * p;
  });
  const grandTotalPreview = previewTotals.reduce((sum, current) => sum + current, 0);

  const onSubmit = async (data: ContractFormValues) => {
    setIsExporting(true);
    setErrorMessage(null);
    setSuccessToast(null);

    try {
      const response = await fetch('/api/contracts/export', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        let msg = 'Không thể xuất hợp đồng. Vui lòng kiểm tra lại thông tin.';
        try {
          const errorJson = (await response.json()) as { error?: string };
          if (errorJson.error) msg = errorJson.error;
        } catch {
          // ignore
        }
        throw new Error(msg);
      }

      // Nhận blob docx và kích hoạt tải về
      const blob = await response.blob();
      const contentDisposition = response.headers.get('Content-Disposition');
      let filename = 'hop-dong.docx';
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="?([^";]+)"?/);
        if (match?.[1]) filename = match[1];
      }

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      setSuccessToast(`Đã xuất và tải về thành công file ${filename}`);
      setTimeout(() => setSuccessToast(null), 6000);
    } catch (err: unknown) {
      const errorStr = err instanceof Error ? err.message : 'Có lỗi bất ngờ xảy ra';
      setErrorMessage(errorStr);
    } finally {
      setIsExporting(false);
    }
  };

  const inputClass =
    'w-full rounded-xl border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 transition-colors focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100 placeholder:text-gray-400';
  const labelClass = 'mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-700';
  const errorTextClass = 'mt-1 text-xs text-red-600 font-medium';

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* Thông báo lỗi server hoặc thành công */}
      {errorMessage && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 shadow-sm flex items-start gap-3">
          <span className="text-xl">⚠️</span>
          <div>
            <p className="font-semibold">Xuất hợp đồng không thành công</p>
            <p className="mt-0.5">{errorMessage}</p>
          </div>
        </div>
      )}

      {successToast && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 shadow-sm flex items-start gap-3">
          <span className="text-xl">🎉</span>
          <div>
            <p className="font-semibold">Thành công!</p>
            <p className="mt-0.5">{successToast}</p>
          </div>
        </div>
      )}

      {/* KHỐI 1: THÔNG TIN HỢP ĐỒNG */}
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-xs sm:p-7">
        <h2 className="mb-5 flex items-center gap-2 text-base font-bold text-gray-900 border-b border-gray-100 pb-3">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-100 text-blue-700 text-sm font-bold">1</span>
          Thông tin số hợp đồng & Thời gian ký
        </h2>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className={labelClass}>Số Hợp Đồng *</label>
            <input
              {...register('contractNo')}
              placeholder="VD: 250926/CC-TP"
              className={inputClass}
            />
            {errors.contractNo && <p className={errorTextClass}>{errors.contractNo.message}</p>}
          </div>

          <div>
            <label className={labelClass}>Ngày Ký *</label>
            <input
              type="date"
              {...register('signDate')}
              className={inputClass}
            />
            {errors.signDate && <p className={errorTextClass}>{errors.signDate.message}</p>}
          </div>

          <div>
            <label className={labelClass}>Hạn Giao Hàng *</label>
            <input
              type="date"
              {...register('deliveryDate')}
              className={inputClass}
            />
            {errors.deliveryDate && <p className={errorTextClass}>{errors.deliveryDate.message}</p>}
          </div>
        </div>
      </div>

      {/* KHỐI 2: THÔNG TIN BÊN B (BÊN MUA) */}
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-xs sm:p-7">
        <h2 className="mb-5 flex items-center gap-2 text-base font-bold text-gray-900 border-b border-gray-100 pb-3">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700 text-sm font-bold">2</span>
          Thông tin Bên B (Bên Mua)
        </h2>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={labelClass}>Tên Đơn Vị / Công Ty Bên B *</label>
            <input
              {...register('bName')}
              placeholder="VD: CÔNG TY TNHH SẢN XUẤT - THƯƠNG MẠI - DỊCH VỤ THÀNH PHÁT TG"
              className={inputClass}
            />
            {errors.bName && <p className={errorTextClass}>{errors.bName.message}</p>}
          </div>

          <div className="sm:col-span-2">
            <label className={labelClass}>Địa Chỉ Trụ Sở *</label>
            <input
              {...register('bAddress')}
              placeholder="VD: 135 Trần Ngọc Giải, Phường Thới Sơn, Tỉnh Đồng Tháp"
              className={inputClass}
            />
            {errors.bAddress && <p className={errorTextClass}>{errors.bAddress.message}</p>}
          </div>

          <div>
            <label className={labelClass}>Mã Số Thuế (MST) *</label>
            <input
              {...register('bMst')}
              placeholder="VD: 1201695642"
              className={inputClass}
            />
            {errors.bMst && <p className={errorTextClass}>{errors.bMst.message}</p>}
          </div>

          <div>
            <label className={labelClass}>Số Điện Thoại Liên Hệ *</label>
            <input
              {...register('bPhone')}
              placeholder="VD: 0902 589 705"
              className={inputClass}
            />
            {errors.bPhone && <p className={errorTextClass}>{errors.bPhone.message}</p>}
          </div>

          <div>
            <label className={labelClass}>Người Đại Diện Ký *</label>
            <input
              {...register('bRepresentative')}
              placeholder="VD: MAI TRẦN ĐĂNG GIANG"
              className={inputClass}
            />
            {errors.bRepresentative && <p className={errorTextClass}>{errors.bRepresentative.message}</p>}
          </div>

          <div>
            <label className={labelClass}>Chức Vụ *</label>
            <input
              {...register('bTitle')}
              placeholder="VD: Phó Giám đốc"
              className={inputClass}
            />
            {errors.bTitle && <p className={errorTextClass}>{errors.bTitle.message}</p>}
          </div>

          <div>
            <label className={labelClass}>Số Tài Khoản Ngân Hàng (Không bắt buộc)</label>
            <input
              {...register('bBankAccount')}
              placeholder="VD: 1903348829..."
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>Tên Ngân Hàng & Chi Nhánh (Không bắt buộc)</label>
            <input
              {...register('bBankName')}
              placeholder="VD: Vietcombank - CN Mỹ Tho"
              className={inputClass}
            />
          </div>
        </div>
      </div>

      {/* KHỐI 3: ĐIỀU KHOẢN GIAO HÀNG & THANH TOÁN */}
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-xs sm:p-7">
        <h2 className="mb-5 flex items-center gap-2 text-base font-bold text-gray-900 border-b border-gray-100 pb-3">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-teal-100 text-teal-700 text-sm font-bold">3</span>
          Địa điểm & Phương thức thanh toán
        </h2>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass}>Địa Điểm Giao Hàng (Điều 3) *</label>
            <input
              {...register('deliveryLocation')}
              placeholder="VD: Giao hàng tại kho Bên A."
              className={inputClass}
            />
            {errors.deliveryLocation && <p className={errorTextClass}>{errors.deliveryLocation.message}</p>}
          </div>

          <div>
            <label className={labelClass}>Phương Thức Thanh Toán (Điều 4) *</label>
            <input
              {...register('paymentMethod')}
              placeholder="VD: Chuyển khoản 100% giá trị đơn hàng."
              className={inputClass}
            />
            {errors.paymentMethod && <p className={errorTextClass}>{errors.paymentMethod.message}</p>}
          </div>
        </div>
      </div>

      {/* KHỐI 4: BẢNG HÀNG HÓA */}
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-xs sm:p-7">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 pb-3">
          <h2 className="flex items-center gap-2 text-base font-bold text-gray-900">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-100 text-amber-700 text-sm font-bold">4</span>
            Danh mục hàng hóa (Điều 1)
          </h2>
          <button
            type="button"
            onClick={() => append({ name: '', quantity: 1, unit: 'kg', unitPrice: 0 })}
            className="inline-flex items-center gap-1.5 rounded-xl bg-blue-50 px-3.5 py-2 text-xs font-semibold text-blue-700 transition hover:bg-blue-100"
          >
            <span>+</span> Thêm mặt hàng
          </button>
        </div>

        {errors.items?.root && (
          <p className="mb-3 text-sm text-red-600 font-medium">{errors.items.root.message}</p>
        )}

        <div className="space-y-3">
          {fields.map((field, idx) => (
            <div
              key={field.id}
              className="relative rounded-xl border border-gray-100 bg-gray-50/70 p-4 transition hover:border-gray-200"
            >
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-12 sm:items-start">
                {/* Tên hàng */}
                <div className="sm:col-span-4">
                  <label className="mb-1 block text-xs font-medium text-gray-600">
                    Mặt hàng #{idx + 1} *
                  </label>
                  <input
                    {...register(`items.${idx}.name`)}
                    placeholder="VD: Trấu xay nhuyễn..."
                    className={inputClass}
                  />
                  {errors.items?.[idx]?.name && (
                    <p className={errorTextClass}>{errors.items[idx].name?.message}</p>
                  )}
                </div>

                {/* Số lượng */}
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-medium text-gray-600">Số lượng *</label>
                  <input
                    type="number"
                    step="any"
                    {...register(`items.${idx}.quantity`, { valueAsNumber: true })}
                    placeholder="200000"
                    className={inputClass}
                  />
                  {errors.items?.[idx]?.quantity && (
                    <p className={errorTextClass}>{errors.items[idx].quantity?.message}</p>
                  )}
                </div>

                {/* Đơn vị tính */}
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-medium text-gray-600">ĐVT *</label>
                  <input
                    {...register(`items.${idx}.unit`)}
                    placeholder="kg"
                    className={inputClass}
                  />
                  {errors.items?.[idx]?.unit && (
                    <p className={errorTextClass}>{errors.items[idx].unit?.message}</p>
                  )}
                </div>

                {/* Đơn giá */}
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-medium text-gray-600">Đơn giá (đồng) *</label>
                  <input
                    type="number"
                    step="any"
                    {...register(`items.${idx}.unitPrice`, { valueAsNumber: true })}
                    placeholder="1800"
                    className={inputClass}
                  />
                  {errors.items?.[idx]?.unitPrice && (
                    <p className={errorTextClass}>{errors.items[idx].unitPrice?.message}</p>
                  )}
                </div>

                {/* Thành tiền tính trước */}
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-medium text-gray-600">Thành tiền tạm tính</label>
                  <div className="flex items-center justify-between gap-2 pt-2">
                    <span className="font-semibold text-gray-900 text-sm">
                      {formatCurrency(previewTotals[idx] || 0)}
                    </span>
                    {fields.length > 1 && (
                      <button
                        type="button"
                        onClick={() => remove(idx)}
                        className="rounded-lg p-1 text-gray-400 hover:bg-red-50 hover:text-red-600 transition"
                        title="Xóa mặt hàng này"
                      >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Tổng tiền xem trước */}
        <div className="mt-5 rounded-xl bg-blue-50/60 p-4 border border-blue-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <p className="text-xs uppercase tracking-wider font-semibold text-blue-900">
              Tổng giá trị hợp đồng (ước tính)
            </p>
            <p className="text-xs text-blue-700 italic">
              * Hệ thống sẽ tự động tính toán lại và tạo chuỗi tiền bằng chữ trên Server khi tải về.
            </p>
          </div>
          <div className="text-right">
            <span className="text-2xl font-black text-blue-800">
              {formatCurrency(grandTotalPreview)}
            </span>
          </div>
        </div>
      </div>

      {/* NÚT SUBMIT XUẤT HỢP ĐỒNG */}
      <div className="sticky bottom-4 z-10 pt-2">
        <button
          type="submit"
          disabled={isExporting}
          className="w-full flex items-center justify-center gap-3 rounded-2xl bg-blue-600 px-6 py-4 text-base font-bold text-white shadow-lg shadow-blue-500/25 transition-all hover:bg-blue-700 active:scale-[0.99] disabled:bg-blue-300 disabled:shadow-none cursor-pointer"
        >
          {isExporting ? (
            <>
              <svg className="h-5 w-5 animate-spin text-white" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
              <span>Đang tính toán và kết xuất file Word...</span>
            </>
          ) : (
            <>
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span>XUẤT HỢP ĐỒNG (.DOCX)</span>
            </>
          )}
        </button>
      </div>
    </form>
  );
}

