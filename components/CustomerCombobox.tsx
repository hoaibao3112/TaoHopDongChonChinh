'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  MASTER_CUSTOMERS,
  TOP_POPULAR_SUPPLIERS,
  searchMasterCustomers,
  normalizeCustomerName,
  MasterCustomer,
  CustomerAlias,
} from '@/lib/dang-tai/customers';
import { removeVietnameseTones } from '@/lib/dang-tai/unaccent';

interface CustomerComboboxProps {
  value: string;
  onChange: (customerName: string) => void;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  todaySuppliers?: { name: string; count: number }[];
  showQuickPills?: boolean;
  onAliasSaved?: (alias: CustomerAlias) => void;
}

export default function CustomerCombobox({
  value,
  onChange,
  placeholder = 'Nhập hoặc chọn NCC (VD: A LÂM TÂY NINH -> LÂM TÂY NINH)...',
  className = '',
  inputClassName = '',
  todaySuppliers = [],
  showQuickPills = true,
  onAliasSaved,
}: CustomerComboboxProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState(value || '');
  const [customCustomers, setCustomCustomers] = useState<MasterCustomer[]>([]);
  const [aliases, setAliases] = useState<CustomerAlias[]>([]);
  const [isSavingDb, setIsSavingDb] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ text: string; type: 'success' | 'info' | 'error' } | null>(null);

  // Modal Ánh Xạ Bí Danh (vd: "A KHU B" -> "A KHU E")
  const [showAliasModal, setShowAliasModal] = useState(false);
  const [aliasSourceInput, setAliasSourceInput] = useState('');
  const [aliasTargetInput, setAliasTargetInput] = useState('');

  const containerRef = useRef<HTMLDivElement>(null);

  // Đồng bộ search term khi prop value thay đổi
  useEffect(() => {
    setSearchTerm(value || '');
  }, [value]);

  // Tải danh mục Custom Customers & Aliases từ CSDL (kèm LocalStorage cache)
  useEffect(() => {
    try {
      const cachedCust = localStorage.getItem('dangtai_custom_customers');
      if (cachedCust) setCustomCustomers(JSON.parse(cachedCust));
      const cachedAlias = localStorage.getItem('dangtai_customer_aliases');
      if (cachedAlias) setAliases(JSON.parse(cachedAlias));
    } catch {}

    fetch('/api/dang-tai/customers')
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => {
        if (data.customCustomers && Array.isArray(data.customCustomers)) {
          setCustomCustomers(data.customCustomers);
          try {
            localStorage.setItem('dangtai_custom_customers', JSON.stringify(data.customCustomers));
          } catch {}
        }
        if (data.aliases && Array.isArray(data.aliases)) {
          setAliases(data.aliases);
          try {
            localStorage.setItem('dangtai_customer_aliases', JSON.stringify(data.aliases));
          } catch {}
        }
      })
      .catch(() => {});
  }, []);

  // Đóng dropdown khi click ra ngoài
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Tự ẩn thông báo sau 3.5s
  useEffect(() => {
    if (feedbackMsg) {
      const timer = setTimeout(() => setFeedbackMsg(null), 3500);
      return () => clearTimeout(timer);
    }
  }, [feedbackMsg]);

  // Danh mục tất cả khách hàng
  const allCustomers = useMemo(() => {
    return [...customCustomers, ...MASTER_CUSTOMERS];
  }, [customCustomers]);

  // Tên chuẩn hóa tự động theo từ khóa đang gõ (áp dụng cả Aliases và Custom Customers)
  const normalizedCandidate = useMemo(() => {
    if (!searchTerm.trim()) return '';
    return normalizeCustomerName(searchTerm, aliases, customCustomers);
  }, [searchTerm, aliases, customCustomers]);

  // Kiểm tra xem từ khóa hiện tại có khớp với một quy tắc alias đã lưu trong CSDL không
  const matchedAliasEntry = useMemo(() => {
    if (!searchTerm.trim()) return null;
    const cleanSearch = removeVietnameseTones(searchTerm.trim());
    const cleanUpper = searchTerm.trim().toUpperCase();
    return (
      aliases.find(
        (a) =>
          a.alias.toUpperCase() === cleanUpper ||
          a.aliasSearch === cleanSearch ||
          removeVietnameseTones(a.alias) === cleanSearch
      ) || null
    );
  }, [searchTerm, aliases]);

  // Danh sách gợi ý từ danh mục Master + Custom
  const suggestions = useMemo(() => {
    return searchMasterCustomers(searchTerm, 12, customCustomers, aliases);
  }, [searchTerm, customCustomers, aliases]);

  // Kiểm tra tên hiện tại có khớp chính xác với Master hoặc Custom Customer nào không
  const isExactMasterMatch = useMemo(() => {
    if (!value) return false;
    const clean = value.trim().toUpperCase();
    return allCustomers.some((c) => c.name === clean);
  }, [value, allCustomers]);

  const handleSelect = (name: string) => {
    const normalized = normalizeCustomerName(name, aliases, customCustomers) || name.toUpperCase().trim();
    setSearchTerm(normalized);
    onChange(normalized);
    setIsOpen(false);
  };

  const handleBlur = () => {
    if (!searchTerm.trim()) {
      onChange('');
      return;
    }
    const normalized = normalizeCustomerName(searchTerm, aliases, customCustomers);
    if (normalized && normalized !== searchTerm) {
      setSearchTerm(normalized);
      onChange(normalized);
    } else {
      onChange(searchTerm.toUpperCase().trim());
    }
  };

  // 1-Click Thêm nhóm khách hàng mới vào CSDL
  const handleAddNewCustomerToDb = async (nameToAdd?: string) => {
    const raw = (nameToAdd || searchTerm).trim();
    if (!raw) return;
    setIsSavingDb(true);

    try {
      const res = await fetch('/api/dang-tai/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add_customer', name: raw }),
      });

      if (!res.ok) throw new Error('Không thể lưu vào CSDL');
      const data = await res.json();
      if (data.customer) {
        setCustomCustomers((prev) => [data.customer, ...prev.filter((c) => c.name !== data.customer.name)]);
        try {
          const updated = [data.customer, ...customCustomers.filter((c) => c.name !== data.customer.name)];
          localStorage.setItem('dangtai_custom_customers', JSON.stringify(updated));
        } catch {}

        handleSelect(data.customer.name);
        setFeedbackMsg({
          text: `Đã thêm "${data.customer.name}" vào CSDL nhóm khách hàng thành công!`,
          type: 'success',
        });
      }
    } catch (err: unknown) {
      setFeedbackMsg({ text: 'Lỗi lưu vào CSDL khách hàng', type: 'error' });
    } finally {
      setIsSavingDb(false);
    }
  };

  // Mở modal tạo ánh xạ bí danh (vd: A KHU B -> A KHU E)
  const openAliasModal = (sourceName?: string) => {
    const src = (sourceName || searchTerm).trim().toUpperCase();
    setAliasSourceInput(src);
    setAliasTargetInput(normalizedCandidate && normalizedCandidate !== src ? normalizedCandidate : '');
    setShowAliasModal(true);
    setIsOpen(false);
  };

  // Lưu quy tắc ánh xạ bí danh vào CSDL
  const handleSaveAliasToDb = async () => {
    if (!aliasSourceInput.trim() || !aliasTargetInput.trim()) {
      alert('Vui lòng nhập cả tên trên phiếu và tên nhóm đích');
      return;
    }

    setIsSavingDb(true);
    try {
      const res = await fetch('/api/dang-tai/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add_alias',
          alias: aliasSourceInput.trim(),
          targetName: aliasTargetInput.trim(),
        }),
      });

      if (!res.ok) throw new Error('Lỗi lưu quy tắc vào CSDL');
      const data = await res.json();

      if (data.alias) {
        setAliases((prev) => [data.alias, ...prev.filter((a) => a.alias !== data.alias.alias)]);
        try {
          const updated = [data.alias, ...aliases.filter((a) => a.alias !== data.alias.alias)];
          localStorage.setItem('dangtai_customer_aliases', JSON.stringify(updated));
        } catch {}

        if (onAliasSaved) onAliasSaved(data.alias);

        // Đổi giá trị hiện tại sang tên đích
        handleSelect(data.alias.targetName);
        setShowAliasModal(false);
        setFeedbackMsg({
          text: `Đã lưu quy tắc: "${data.alias.alias}" -> "${data.alias.targetName}" vào CSDL!`,
          type: 'success',
        });
      }
    } catch (err) {
      alert('Không thể lưu quy tắc ánh xạ vào CSDL. Vui lòng thử lại!');
    } finally {
      setIsSavingDb(false);
    }
  };

  return (
    <div ref={containerRef} className={`relative w-full ${className}`}>
      {/* Ô nhập liệu với icon & nút xóa nhanh */}
      <div className="relative flex items-center">
        <span className="absolute left-3 text-slate-400 text-sm pointer-events-none select-none">
          🏢
        </span>
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            onChange(e.target.value);
            if (!isOpen) setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onBlur={handleBlur}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              if (normalizedCandidate) {
                handleSelect(normalizedCandidate);
              } else if (suggestions.length > 0) {
                handleSelect(suggestions[0].name);
              }
            } else if (e.key === 'Escape') {
              setIsOpen(false);
            }
          }}
          placeholder={placeholder}
          className={`w-full rounded-xl border border-slate-300 pl-9 pr-24 py-2 text-sm font-semibold text-slate-900 placeholder:font-normal placeholder:text-slate-400 focus:border-amber-500 focus:ring-2 focus:ring-amber-100 outline-none transition-all ${
            isExactMasterMatch ? 'border-emerald-300 bg-emerald-50/20' : ''
          } ${inputClassName}`}
        />

        {/* Nút hành động góc phải ô nhập */}
        <div className="absolute right-2 flex items-center gap-1">
          {searchTerm && (
            <button
              type="button"
              onClick={() => openAliasModal(searchTerm)}
              className="rounded-lg px-1.5 py-0.5 text-[10px] font-bold text-amber-800 bg-amber-100/80 hover:bg-amber-200 cursor-pointer"
              title="Tạo quy tắc ánh xạ bí danh cho tên này"
            >
              🔗 Ghép
            </button>
          )}

          {searchTerm && (
            <button
              type="button"
              onClick={() => {
                setSearchTerm('');
                onChange('');
              }}
              className="rounded-full p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 text-xs cursor-pointer"
              title="Xóa nhanh"
            >
              ✕
            </button>
          )}
          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            className="rounded-lg p-1 text-slate-400 hover:text-slate-600 text-xs cursor-pointer"
          >
            {isOpen ? '▲' : '▼'}
          </button>
        </div>
      </div>

      {/* Thông báo tức thời (Toast nhỏ) */}
      {feedbackMsg && (
        <div
          className={`mt-1 rounded-xl px-2.5 py-1 text-xs font-bold animate-fadeIn ${
            feedbackMsg.type === 'success'
              ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
              : 'bg-rose-100 text-rose-800 border border-rose-200'
          }`}
        >
          {feedbackMsg.text}
        </div>
      )}

      {/* Báo hiệu Quy tắc Ánh Xạ Đã Lưu trong CSDL (vd: A KHU B -> A KHU E) */}
      {matchedAliasEntry && (
        <div className="mt-1 flex items-center justify-between gap-1.5 px-1 text-xs">
          <span className="text-blue-700 flex items-center gap-1 font-semibold">
            🔄 Quy tắc CSDL:{' '}
            <span className="font-normal text-slate-600">&quot;{matchedAliasEntry.alias}&quot;</span> →{' '}
            <strong className="font-bold text-blue-900 bg-blue-100 px-1.5 py-0.5 rounded-md">
              {matchedAliasEntry.targetName}
            </strong>
          </span>
          <button
            type="button"
            onClick={() => handleSelect(matchedAliasEntry.targetName)}
            className="text-[11px] font-bold text-blue-700 hover:underline cursor-pointer"
          >
            Áp dụng ✓
          </button>
        </div>
      )}

      {/* Huy hiệu báo chuẩn hóa tự động nếu tên gõ khác tên chuẩn */}
      {!matchedAliasEntry &&
        searchTerm.trim() &&
        normalizedCandidate &&
        normalizedCandidate !== searchTerm.trim() &&
        !isExactMasterMatch && (
          <div className="mt-1 flex items-center justify-between gap-1.5 px-1 text-xs">
            <span className="text-amber-700 flex items-center gap-1 font-medium">
              ✨ Tự chuẩn hóa thành:
              <strong className="font-bold text-amber-900 bg-amber-100/70 px-1.5 py-0.5 rounded-md">
                {normalizedCandidate}
              </strong>
            </span>
            <button
              type="button"
              onClick={() => handleSelect(normalizedCandidate)}
              className="text-[11px] font-bold text-emerald-700 hover:text-emerald-900 hover:underline cursor-pointer"
            >
              Áp dụng ngay ✓
            </button>
          </div>
        )}

      {/* DROPDOWN GỢI Ý KHÁCH HÀNG / NHÀ CUNG CẤP */}
      {isOpen && (
        <div className="absolute left-0 right-0 z-50 mt-1 max-h-72 overflow-y-auto rounded-2xl bg-white p-2 shadow-2xl border border-slate-200 animate-fadeIn text-xs">
          {/* Header dropdown */}
          <div className="flex items-center justify-between pb-1.5 px-2 border-b border-slate-100 text-[11px] text-slate-500 font-medium">
            <span>
              📋 {searchTerm ? `Tìm thấy ${suggestions.length} NCC phù hợp` : 'Top Nhà Cung Cấp phổ biến'}
            </span>
            <span className="text-[10px] text-slate-400">
              {allCustomers.length} NCC ({aliases.length} quy tắc ánh xạ)
            </span>
          </div>

          {/* Gợi ý chuẩn hóa nếu đang gõ */}
          {normalizedCandidate && normalizedCandidate !== searchTerm.trim() && (
            <div
              onMouseDown={() => handleSelect(normalizedCandidate)}
              className="mt-1 flex items-center justify-between p-2 rounded-xl bg-amber-50 hover:bg-amber-100 border border-amber-200 cursor-pointer transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className="text-base">✨</span>
                <div>
                  <div className="font-bold text-amber-950 text-xs flex items-center gap-1">
                    {normalizedCandidate}
                    <span className="text-[10px] bg-amber-200 text-amber-900 px-1.5 py-0.2 rounded-full font-normal">
                      Khớp chuẩn
                    </span>
                  </div>
                  <div className="text-[10px] text-amber-700">
                    Chuyển từ &quot;{searchTerm}&quot; sang tên chuẩn in hoa
                  </div>
                </div>
              </div>
              <span className="text-xs font-bold text-amber-800">Chọn ↵</span>
            </div>
          )}

          {/* Nút hành động nhanh: THÊM MỚI VÀO DB hoặc ÁNH XẠ SANG NHÓM KHÁC */}
          {searchTerm.trim() && !isExactMasterMatch && (
            <div className="mt-1.5 p-2 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5">
              <div className="text-[11px] text-slate-500 font-bold">
                ⚙️ Tùy chọn CSDL cho &quot;{searchTerm.trim().toUpperCase()}&quot;:
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleAddNewCustomerToDb(searchTerm);
                  }}
                  disabled={isSavingDb}
                  className="rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1 text-[11px] font-bold shadow-2xs cursor-pointer flex items-center gap-1 transition-all"
                >
                  <span>➕</span>
                  <span>Thêm mới vào CSDL</span>
                </button>

                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    openAliasModal(searchTerm);
                  }}
                  className="rounded-lg bg-amber-500 hover:bg-amber-600 text-white px-2.5 py-1 text-[11px] font-bold shadow-2xs cursor-pointer flex items-center gap-1 transition-all"
                >
                  <span>🔗</span>
                  <span>Ánh xạ sang nhóm khác (VD: A KHU E)</span>
                </button>
              </div>
            </div>
          )}

          {/* Danh sách nhà cung cấp */}
          <div className="mt-1 divide-y divide-slate-100">
            {suggestions.length === 0 ? (
              <div className="p-3 text-center text-slate-500">
                <p>Không tìm thấy NCC nào khớp với &quot;{searchTerm}&quot;</p>
                <div className="mt-2 flex items-center justify-center gap-2">
                  <button
                    type="button"
                    onMouseDown={() => handleAddNewCustomerToDb(searchTerm)}
                    className="inline-flex items-center gap-1 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1 font-bold shadow-xs cursor-pointer"
                  >
                    ➕ Thêm &quot;{searchTerm.toUpperCase().trim()}&quot; vào CSDL
                  </button>
                </div>
              </div>
            ) : (
              suggestions.map((c: MasterCustomer) => {
                const isSelected = value?.trim().toUpperCase() === c.name;
                const isCustom = customCustomers.some((cust) => cust.name === c.name);

                return (
                  <div
                    key={c.name}
                    onMouseDown={() => handleSelect(c.name)}
                    className={`flex items-center justify-between p-2 rounded-xl cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-emerald-50 text-emerald-950 font-bold'
                        : 'hover:bg-slate-50 text-slate-800'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-slate-400">🏢</span>
                      <div>
                        <div className="font-bold text-xs flex items-center gap-1">
                          {c.name}
                          {isCustom && (
                            <span className="text-[9px] bg-purple-100 text-purple-800 px-1 py-0.2 rounded font-bold">
                              CSDL
                            </span>
                          )}
                        </div>
                        {c.count > 0 && (
                          <div className="text-[10px] text-slate-400">
                            {c.count} chuyến lúa tươi
                          </div>
                        )}
                      </div>
                    </div>
                    {isSelected ? (
                      <span className="text-emerald-600 font-bold text-xs">✓ Đang chọn</span>
                    ) : (
                      c.count > 0 && (
                        <span className="font-mono text-[11px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                          {c.count} xe
                        </span>
                      )
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* QUICK SELECTION PILLS (Top phổ biến hoặc các NCC đã có trong ngày) */}
      {showQuickPills && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-slate-400">Chọn nhanh:</span>
          {todaySuppliers.slice(0, 4).map((ncc) => (
            <button
              key={`today-${ncc.name}`}
              type="button"
              onClick={() => handleSelect(ncc.name)}
              className={`rounded-lg px-2 py-0.5 text-[11px] font-bold border transition-colors cursor-pointer ${
                value === ncc.name
                  ? 'bg-emerald-600 text-white border-emerald-600'
                  : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border-emerald-200'
              }`}
              title="NCC đã có trong ngày"
            >
              {ncc.name} ({ncc.count})
            </button>
          ))}

          {TOP_POPULAR_SUPPLIERS.slice(0, 6).map((name) => {
            if (todaySuppliers.some((t) => t.name === name)) return null;
            return (
              <button
                key={`top-${name}`}
                type="button"
                onClick={() => handleSelect(name)}
                className={`rounded-lg px-2 py-0.5 text-[11px] font-bold border transition-colors cursor-pointer ${
                  value === name
                    ? 'bg-amber-600 text-white border-amber-600'
                    : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                }`}
              >
                {name}
              </button>
            );
          })}
        </div>
      )}

      {/* MODAL ÁNH XẠ BÍ DANH KHÁCH HÀNG (VD: A KHU B -> A KHU E) */}
      {showAliasModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fadeIn">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl border border-slate-100">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div className="flex items-center gap-2">
                <span className="text-2xl">🔗</span>
                <div>
                  <h3 className="font-black text-slate-900 text-base">Tạo Quy Tắc Ánh Xạ Bí Danh</h3>
                  <p className="text-xs text-slate-500">Tự động chuyển đổi tên trên phiếu vào nhóm khách hàng chuẩn</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAliasModal(false)}
                className="text-slate-400 hover:text-slate-600 rounded-lg p-1 text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 mb-6">
              <div className="rounded-2xl bg-amber-50/70 border border-amber-200/80 p-3 text-xs text-amber-950 space-y-1">
                <p>
                  💡 <strong>Ví dụ thực tế:</strong> Trên phiếu cân ghi là{' '}
                  <span className="font-bold underline text-amber-900">A KHU B</span> nhưng thực tế khách hàng của bạn
                  là nhóm <span className="font-bold underline text-amber-900">A KHU E</span> (hoặc KHU E).
                </p>
                <p className="text-slate-600 text-[11px]">
                  Sau khi lưu, mọi phiếu cân quét được hoặc tên gõ vào có chứa tên nguồn sẽ tự động đổi sang nhóm đích!
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  1. Tên xuất hiện trên phiếu (Bí danh / Tên viết tắt):
                </label>
                <input
                  type="text"
                  value={aliasSourceInput}
                  onChange={(e) => setAliasSourceInput(e.target.value)}
                  placeholder="VD: A KHU B"
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm font-bold text-slate-900 focus:border-amber-500 focus:ring-2 focus:ring-amber-100 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  2. Tên nhóm khách hàng chuẩn đích (Được lưu vào CSDL):
                </label>
                <input
                  type="text"
                  value={aliasTargetInput}
                  onChange={(e) => setAliasTargetInput(e.target.value)}
                  placeholder="VD: A KHU E hoặc KHU E"
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm font-bold text-slate-900 focus:border-amber-500 focus:ring-2 focus:ring-amber-100 outline-none"
                />

                {/* Gợi ý các tên NCC phổ biến để bấm chọn nhanh làm đích */}
                <div className="mt-2">
                  <span className="block text-[11px] text-slate-400 mb-1">Hoặc chọn nhanh từ danh mục:</span>
                  <div className="flex flex-wrap gap-1 max-h-28 overflow-y-auto p-1 bg-slate-50 rounded-xl border border-slate-100">
                    {allCustomers.slice(0, 15).map((c) => (
                      <button
                        key={`modal-pick-${c.name}`}
                        type="button"
                        onClick={() => setAliasTargetInput(c.name)}
                        className={`rounded-lg px-2 py-0.5 text-[10px] font-bold border transition-colors cursor-pointer ${
                          aliasTargetInput.toUpperCase() === c.name
                            ? 'bg-amber-600 text-white border-amber-600'
                            : 'bg-white hover:bg-amber-50 text-slate-700 border-slate-200'
                        }`}
                      >
                        {c.name}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowAliasModal(false)}
                className="rounded-xl px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={handleSaveAliasToDb}
                disabled={isSavingDb || !aliasSourceInput.trim() || !aliasTargetInput.trim()}
                className="rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white px-5 py-2 text-xs font-black shadow-md transition-all active:scale-95 cursor-pointer flex items-center gap-1.5"
              >
                {isSavingDb ? 'Đang lưu CSDL...' : '💾 Lưu Quy Tắc Vào CSDL'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
