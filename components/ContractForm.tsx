'use client';

import React, { useState } from 'react';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { contractFormSchema, type ContractFormValues } from '@/lib/contract-schema';

// Helper format số hiển thị kiểu Việt Nam có chữ đ
function formatCurrency(val: number): string {
  if (!Number.isFinite(val) || val <= 0) return '0 ₫';
  return val.toLocaleString('vi-VN') + ' ₫';
}

// Helper format số phân cách hàng nghìn bằng dấu chấm khi gõ vào ô input (VD: 200000 -> 200.000)
function formatNumberWithDots(val: number | string | undefined | null): string {
  if (val === undefined || val === null || val === '') return '';
  const numStr = String(val).replace(/\D/g, '');
  if (!numStr) return '';
  return Number(numStr).toLocaleString('vi-VN');
}

function getDefaultDates() {
  const today = new Date();
  const signDate = today.toISOString().split('T')[0];

  const deliveryStart = new Date(today);
  const deliveryStartDate = deliveryStart.toISOString().split('T')[0];

  const deliveryEnd = new Date(today);
  deliveryEnd.setDate(deliveryEnd.getDate() + 30);
  const deliveryEndDate = deliveryEnd.toISOString().split('T')[0];

  return { signDate, deliveryStartDate, deliveryEndDate };
}

export default function ContractForm() {
  const [isExporting, setIsExporting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  const { signDate, deliveryStartDate, deliveryEndDate } = getDefaultDates();

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
      deliveryStartDate,
      deliveryEndDate,
      bName: '',
      bAddress: '',
      bPhone: '',
      bMst: '',
      bRepresentative: '',
      bTitle: 'Giám Đốc',
      deliveryLocation: 'Giao hàng tại kho Bên A.',
      paymentMethod: 'Chuyển khoản 100% giá trị đơn hàng.',
      items: [
        {
          name: 'Trấu',
          quantity: 200000,
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

      setSuccessToast(`Đã xuất và tải về thành công file: ${filename}`);
      setTimeout(() => setSuccessToast(null), 6000);
    } catch (err: unknown) {
      const errorStr = err instanceof Error ? err.message : 'Có lỗi bất ngờ xảy ra';
      setErrorMessage(errorStr);
    } finally {
      setIsExporting(false);
    }
  };

  const inputClass =
    'w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-2xs transition-all focus:border-blue-600 focus:bg-white focus:outline-none focus:ring-3 focus:ring-blue-100 placeholder:text-slate-400 hover:border-slate-400';
  const labelClass = 'mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-700';
  const errorTextClass = 'mt-1 text-xs text-rose-600 font-semibold flex items-center gap-1';

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
      {/* Thông báo lỗi server hoặc thành công */}
      {errorMessage && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50/90 p-4 text-sm text-rose-800 shadow-sm flex items-start gap-3 animate-in fade-in duration-200">
          <span className="text-xl">⚠️</span>
          <div>
            <p className="font-bold">Lỗi xuất hợp đồng:</p>
            <p className="mt-0.5">{errorMessage}</p>
          </div>
        </div>
      )}

      {successToast && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/90 p-4 text-sm text-emerald-800 shadow-sm flex items-start gap-3 animate-in fade-in duration-200">
          <span className="text-xl">🎉</span>
          <div>
            <p className="font-bold">Xuất hợp đồng thành công!</p>
            <p className="mt-0.5">{successToast}</p>
          </div>
        </div>
      )}

      {/* KHỐI 1: THÔNG TIN HỢP ĐỒNG */}
      <section className="rounded-3xl border border-slate-200/80 bg-white p-6 sm:p-7 shadow-xs">
        <div className="mb-6 flex items-center gap-3 border-b border-slate-100 pb-4">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 text-blue-700 text-sm font-black border border-blue-100">
            1
          </span>
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Thông tin số hợp đồng & Thời gian ký kết
            </h2>
            <p className="text-xs text-slate-500">Mã định danh hợp đồng và thời hạn hiệu lực</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div>
            <label className={labelClass}>Số Hợp Đồng *</label>
            <input
              {...register('contractNo')}
              placeholder="VD: 250926/CC-TP"
              className={inputClass}
            />
            {errors.contractNo && (
              <p className={errorTextClass}>
                <span>●</span> {errors.contractNo.message}
              </p>
            )}
          </div>

          <div>
            <label className={labelClass}>Ngày Ký Hợp Đồng *</label>
            <input
              type="date"
              {...register('signDate')}
              className={inputClass}
            />
            {errors.signDate && (
              <p className={errorTextClass}>
                <span>●</span> {errors.signDate.message}
              </p>
            )}
          </div>
        </div>
      </section>

      {/* KHỐI 2: THÔNG TIN BÊN B (BÊN MUA) */}
      <section className="rounded-3xl border border-slate-200/80 bg-white p-6 sm:p-7 shadow-xs">
        <div className="mb-6 flex items-center gap-3 border-b border-slate-100 pb-4">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700 text-sm font-black border border-indigo-100">
            2
          </span>
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Thông tin Bên B (Bên Mua)
            </h2>
            <p className="text-xs text-slate-500">Các thông tin pháp nhân của đơn vị đối tác mua hàng</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={labelClass}>Tên Đơn Vị / Công Ty Bên B *</label>
            <input
              {...register('bName')}
              placeholder="VD: CÔNG TY TNHH SẢN XUẤT - THƯƠNG MẠI - DỊCH VỤ THÀNH PHÁT TG"
              className={inputClass}
            />
            {errors.bName && (
              <p className={errorTextClass}>
                <span>●</span> {errors.bName.message}
              </p>
            )}
          </div>

          <div className="sm:col-span-2">
            <label className={labelClass}>Địa Chỉ Trụ Sở Đăng Ký *</label>
            <input
              {...register('bAddress')}
              placeholder="VD: 135 Trần Ngọc Giải, Phường Thới Sơn, Tỉnh Đồng Tháp"
              className={inputClass}
            />
            {errors.bAddress && (
              <p className={errorTextClass}>
                <span>●</span> {errors.bAddress.message}
              </p>
            )}
          </div>

          <div>
            <label className={labelClass}>Mã Số Thuế (MST) *</label>
            <input
              {...register('bMst')}
              placeholder="VD: 1201695642"
              className={inputClass}
            />
            {errors.bMst && (
              <p className={errorTextClass}>
                <span>●</span> {errors.bMst.message}
              </p>
            )}
          </div>

          <div>
            <label className={labelClass}>Số Điện Thoại Liên Hệ *</label>
            <input
              {...register('bPhone')}
              placeholder="VD: 0902 589 705"
              className={inputClass}
            />
            {errors.bPhone && (
              <p className={errorTextClass}>
                <span>●</span> {errors.bPhone.message}
              </p>
            )}
          </div>

          <div>
            <label className={labelClass}>Người Đại Diện Ký *</label>
            <input
              {...register('bRepresentative')}
              placeholder="VD: MAI TRẦN ĐĂNG GIANG"
              className={inputClass}
            />
            {errors.bRepresentative && (
              <p className={errorTextClass}>
                <span>●</span> {errors.bRepresentative.message}
              </p>
            )}
          </div>

          <div>
            <label className={labelClass}>Chức Vụ Đại Diện *</label>
            <input
              {...register('bTitle')}
              placeholder="VD: Phó Giám đốc"
              className={inputClass}
            />
            {errors.bTitle && (
              <p className={errorTextClass}>
                <span>●</span> {errors.bTitle.message}
              </p>
            )}
          </div>
        </div>
      </section>

      {/* KHỐI 3: ĐIỀU KHOẢN GIAO HÀNG & THANH TOÁN */}
      <section className="rounded-3xl border border-slate-200/80 bg-white p-6 sm:p-7 shadow-xs">
        <div className="mb-6 flex items-center gap-3 border-b border-slate-100 pb-4">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-teal-50 text-teal-700 text-sm font-black border border-teal-100">
            3
          </span>
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Điều khoản giao nhận & Phương thức thanh toán
            </h2>
            <p className="text-xs text-slate-500">Quy định Điều 3 & Điều 4 trong văn bản hợp đồng</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div>
            <label className={labelClass}>Thời Gian Bắt Đầu Giao Hàng (Điều 3) *</label>
            <input
              type="date"
              {...register('deliveryStartDate')}
              className={inputClass}
            />
            {errors.deliveryStartDate && (
              <p className={errorTextClass}>
                <span>●</span> {errors.deliveryStartDate.message}
              </p>
            )}
          </div>

          <div>
            <label className={labelClass}>Thời Gian Kết Thúc Giao Hàng (Điều 3) *</label>
            <input
              type="date"
              {...register('deliveryEndDate')}
              className={inputClass}
            />
            {errors.deliveryEndDate && (
              <p className={errorTextClass}>
                <span>●</span> {errors.deliveryEndDate.message}
              </p>
            )}
          </div>

          <div>
            <label className={labelClass}>Địa Điểm Giao Hàng (Điều 3) *</label>
            <input
              {...register('deliveryLocation')}
              placeholder="VD: Giao hàng tại kho Bên A."
              className={inputClass}
            />
            {errors.deliveryLocation && (
              <p className={errorTextClass}>
                <span>●</span> {errors.deliveryLocation.message}
              </p>
            )}
          </div>

          <div>
            <label className={labelClass}>Phương Thức Thanh Toán (Điều 4) *</label>
            <input
              {...register('paymentMethod')}
              placeholder="VD: Chuyển khoản 100% giá trị đơn hàng."
              className={inputClass}
            />
            {errors.paymentMethod && (
              <p className={errorTextClass}>
                <span>●</span> {errors.paymentMethod.message}
              </p>
            )}
          </div>
        </div>
      </section>

      {/* KHỐI 4: BẢNG HÀNG HÓA */}
      <section className="rounded-3xl border border-slate-200/80 bg-white p-6 sm:p-7 shadow-xs">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-50 text-amber-700 text-sm font-black border border-amber-100">
              4
            </span>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Danh mục hàng hóa (Điều 1)
              </h2>
              <p className="text-xs text-slate-500">Bảng chi tiết tên mặt hàng, khối lượng và đơn giá thỏa thuận</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => append({ name: '', quantity: 1, unitPrice: 0 })}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-50 px-4 py-2.5 text-xs font-bold text-blue-700 border border-blue-200/60 shadow-2xs transition-all hover:bg-blue-600 hover:text-white cursor-pointer active:scale-95"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
            </svg>
            <span>Thêm mặt hàng</span>
          </button>
        </div>

        {errors.items?.root && (
          <p className="mb-4 text-sm text-rose-600 font-semibold">{errors.items.root.message}</p>
        )}

        <div className="space-y-4">
          {fields.map((field, idx) => (
            <div
              key={field.id}
              className="relative rounded-2xl border border-slate-200/90 bg-slate-50/60 p-4 sm:p-5 transition-all hover:border-blue-300 hover:bg-white shadow-2xs"
            >
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-12 sm:items-start">
                {/* Tên hàng */}
                <div className="sm:col-span-5">
                  <label className="mb-1.5 block text-xs font-bold text-slate-700">
                    Mặt hàng #{idx + 1} *
                  </label>
                  <input
                    {...register(`items.${idx}.name`)}
                    placeholder="VD: Trấu..."
                    className={inputClass}
                  />
                  {errors.items?.[idx]?.name && (
                    <p className={errorTextClass}>{errors.items[idx].name?.message}</p>
                  )}
                </div>

                {/* Số lượng */}
                <div className="sm:col-span-2">
                  <label className="mb-1.5 block text-xs font-bold text-slate-700">Số lượng (kg) *</label>
                  <Controller
                    control={control}
                    name={`items.${idx}.quantity`}
                    render={({ field }) => (
                      <input
                        type="text"
                        inputMode="numeric"
                        value={formatNumberWithDots(field.value)}
                        onChange={(e) => {
                          const raw = e.target.value.replace(/\D/g, '');
                          field.onChange(raw ? Number(raw) : '');
                        }}
                        onBlur={field.onBlur}
                        placeholder="200.000"
                        className={inputClass}
                      />
                    )}
                  />
                  {errors.items?.[idx]?.quantity && (
                    <p className={errorTextClass}>{errors.items[idx].quantity?.message}</p>
                  )}
                </div>

                {/* Đơn giá */}
                <div className="sm:col-span-2">
                  <label className="mb-1.5 block text-xs font-bold text-slate-700">Đơn giá (đồng/kg) *</label>
                  <Controller
                    control={control}
                    name={`items.${idx}.unitPrice`}
                    render={({ field }) => (
                      <input
                        type="text"
                        inputMode="numeric"
                        value={formatNumberWithDots(field.value)}
                        onChange={(e) => {
                          const raw = e.target.value.replace(/\D/g, '');
                          field.onChange(raw ? Number(raw) : '');
                        }}
                        onBlur={field.onBlur}
                        placeholder="1.800"
                        className={inputClass}
                      />
                    )}
                  />
                  {errors.items?.[idx]?.unitPrice && (
                    <p className={errorTextClass}>{errors.items[idx].unitPrice?.message}</p>
                  )}
                </div>

                {/* Thành tiền tính trước */}
                <div className="sm:col-span-3">
                  <label className="mb-1.5 block text-xs font-bold text-slate-700">Thành tiền tạm tính</label>
                  <div className="flex items-center justify-between gap-2 pt-1.5">
                    <span className="font-bold text-slate-900 text-sm font-mono">
                      {formatCurrency(previewTotals[idx] || 0)}
                    </span>
                    {fields.length > 1 && (
                      <button
                        type="button"
                        onClick={() => remove(idx)}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition cursor-pointer"
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
        <div className="mt-6 rounded-2xl bg-gradient-to-r from-blue-50/80 via-indigo-50/50 to-blue-50/80 p-5 border border-blue-200/70 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wider font-bold text-blue-900">
              Tổng giá trị hợp đồng (tạm tính)
            </p>
            <p className="text-xs text-blue-700/80 mt-0.5">
              * Server sẽ tính toán lại chính xác và tự động đọc số tiền bằng chữ tiếng Việt khi tải về file Word.
            </p>
          </div>
          <div className="text-right">
            <span className="text-2xl sm:text-3xl font-black text-blue-900 tracking-tight font-mono">
              {formatCurrency(grandTotalPreview)}
            </span>
          </div>
        </div>
      </section>

      {/* NÚT SUBMIT XUẤT HỢP ĐỒNG */}
      <div className="sticky bottom-6 z-20 pt-2">
        <button
          type="submit"
          disabled={isExporting}
          className="w-full flex items-center justify-center gap-3 rounded-2xl bg-gradient-to-r from-blue-600 via-blue-700 to-indigo-700 px-8 py-4 text-base font-bold text-white shadow-xl shadow-blue-600/30 transition-all hover:opacity-95 hover:shadow-2xl active:scale-[0.99] disabled:opacity-50 disabled:shadow-none cursor-pointer"
        >
          {isExporting ? (
            <>
              <svg className="h-5 w-5 animate-spin text-white" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
              <span>Đang kết xuất hợp đồng và tải về...</span>
            </>
          ) : (
            <>
              <svg className="w-5 h-5 text-blue-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span className="tracking-wide">XUẤT HỢP ĐỒNG (.DOCX)</span>
            </>
          )}
        </button>
      </div>
    </form>
  );
}
