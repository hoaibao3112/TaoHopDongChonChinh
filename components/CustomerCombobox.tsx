'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  MASTER_CUSTOMERS,
  TOP_POPULAR_SUPPLIERS,
  searchMasterCustomers,
  normalizeCustomerName,
  MasterCustomer,
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
}

export default function CustomerCombobox({
  value,
  onChange,
  placeholder = 'Nhập hoặc chọn NCC (VD: A LÂM TÂY NINH -> LÂM TÂY NINH)...',
  className = '',
  inputClassName = '',
  todaySuppliers = [],
  showQuickPills = true,
}: CustomerComboboxProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState(value || '');
  const containerRef = useRef<HTMLDivElement>(null);

  // Đồng bộ search term khi prop value thay đổi
  useEffect(() => {
    setSearchTerm(value || '');
  }, [value]);

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

  // Tên chuẩn hóa tự động theo từ khóa đang gõ
  const normalizedCandidate = useMemo(() => {
    if (!searchTerm.trim()) return '';
    return normalizeCustomerName(searchTerm);
  }, [searchTerm]);

  // Danh sách gợi ý từ danh mục Master (119 khách hàng lúa tươi Chơn Chính)
  const suggestions = useMemo(() => {
    return searchMasterCustomers(searchTerm, 12);
  }, [searchTerm]);

  // Kiểm tra tên hiện tại có khớp chính xác với Master Customer nào không
  const isExactMasterMatch = useMemo(() => {
    if (!value) return false;
    const clean = value.trim().toUpperCase();
    return MASTER_CUSTOMERS.some((c) => c.name === clean);
  }, [value]);

  const handleSelect = (name: string) => {
    const normalized = normalizeCustomerName(name) || name.toUpperCase().trim();
    setSearchTerm(normalized);
    onChange(normalized);
    setIsOpen(false);
  };

  const handleBlur = () => {
    if (!searchTerm.trim()) {
      onChange('');
      return;
    }
    // Tự động chuẩn hóa khi người dùng rời ô nhập
    const normalized = normalizeCustomerName(searchTerm);
    if (normalized && normalized !== searchTerm) {
      setSearchTerm(normalized);
      onChange(normalized);
    } else {
      onChange(searchTerm.toUpperCase().trim());
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
          className={`w-full rounded-xl border border-slate-300 pl-9 pr-16 py-2 text-sm font-semibold text-slate-900 placeholder:font-normal placeholder:text-slate-400 focus:border-amber-500 focus:ring-2 focus:ring-amber-100 outline-none transition-all ${
            isExactMasterMatch ? 'border-emerald-300 bg-emerald-50/20' : ''
          } ${inputClassName}`}
        />

        <div className="absolute right-2 flex items-center gap-1">
          {searchTerm && (
            <button
              type="button"
              onClick={() => {
                setSearchTerm('');
                onChange('');
              }}
              className="rounded-full p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 text-xs"
              title="Xóa nhanh"
            >
              ✕
            </button>
          )}
          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            className="rounded-lg p-1 text-slate-400 hover:text-slate-600 text-xs"
          >
            {isOpen ? '▲' : '▼'}
          </button>
        </div>
      </div>

      {/* Huy hiệu báo chuẩn hóa tự động nếu tên gõ khác tên chuẩn */}
      {searchTerm.trim() &&
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
              📋 {searchTerm ? `Tìm thấy ${suggestions.length} NCC phù hợp` : 'Top Nhà Cung Cấp phổ biến 2026'}
            </span>
            <span className="text-[10px] text-slate-400">119 NCC chuẩn Chơn Chính</span>
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

          {/* Danh sách nhà cung cấp */}
          <div className="mt-1 divide-y divide-slate-100">
            {suggestions.length === 0 ? (
              <div className="p-3 text-center text-slate-500">
                <p>Không tìm thấy NCC nào khớp với &quot;{searchTerm}&quot;</p>
                <button
                  type="button"
                  onMouseDown={() => handleSelect(searchTerm.toUpperCase().trim())}
                  className="mt-2 inline-flex items-center gap-1 rounded-xl bg-slate-100 hover:bg-slate-200 px-3 py-1 text-slate-800 font-bold"
                >
                  Dùng tên mới: &quot;{searchTerm.toUpperCase().trim()}&quot;
                </button>
              </div>
            ) : (
              suggestions.map((c: MasterCustomer) => {
                const isSelected = value?.trim().toUpperCase() === c.name;
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
                        <div className="font-bold text-xs">{c.name}</div>
                        {c.count > 0 && (
                          <div className="text-[10px] text-slate-400">
                            {c.count} chuyến lúa tươi 2026
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
          {/* Ưu tiên hiện các NCC đã có trong ngày trước */}
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

          {/* Các Top NCC phổ biến trong năm */}
          {TOP_POPULAR_SUPPLIERS.slice(0, 6).map((name) => {
            // Tránh trùng với todaySuppliers đã hiện
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
    </div>
  );
}
