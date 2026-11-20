'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { TaiXeEntry, INITIAL_DRIVERS } from '@/lib/dang-tai/driverTypes';
import { removeVietnameseTones, matchUnaccent } from '@/lib/dang-tai/unaccent';

interface DriverComboboxProps {
  value: string;
  phoneValue?: string;
  onSelect: (name: string, phone: string) => void;
  onPhoneChange?: (phone: string) => void;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  showPhoneInput?: boolean;
}

export default function DriverCombobox({
  value,
  phoneValue = '',
  onSelect,
  onPhoneChange,
  placeholder = 'Chọn hoặc nhập tên tài xế...',
  className = '',
  inputClassName = '',
  showPhoneInput = false,
}: DriverComboboxProps) {
  // Luôn khởi tạo ngay bằng danh bạ 20 tài xế chuẩn của công ty để không bao giờ bị rỗng
  const [drivers, setDrivers] = useState<TaiXeEntry[]>(INITIAL_DRIVERS);
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState(value);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newDriverName, setNewDriverName] = useState('');
  const [newDriverPhone, setNewDriverPhone] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);

  // Đồng bộ search term khi value bên ngoài thay đổi
  useEffect(() => {
    setSearchTerm(value);
  }, [value]);

  // Tải danh bạ tài xế từ localStorage và máy chủ
  useEffect(() => {
    // 1. Tải từ localStorage (nếu người dùng từng thêm tài xế trước đó trên trình duyệt này)
    try {
      const localStr = localStorage.getItem('dangtai_custom_drivers');
      if (localStr) {
        const localDrivers: TaiXeEntry[] = JSON.parse(localStr);
        if (Array.isArray(localDrivers) && localDrivers.length > 0) {
          setDrivers((prev) => {
            const existing = new Set(prev.map((d) => d.nameSearch));
            const toAdd = localDrivers.filter((d) => !existing.has(d.nameSearch));
            return [...toAdd, ...prev];
          });
        }
      }
    } catch {}

    // 2. Tải thêm từ server để đồng bộ
    fetch('/api/dang-tai/drivers')
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => {
        if (data.drivers && Array.isArray(data.drivers) && data.drivers.length > 0) {
          setDrivers((prev) => {
            const serverDrivers: TaiXeEntry[] = data.drivers;
            const existing = new Set(serverDrivers.map((d) => d.nameSearch));
            const localOnly = prev.filter((d) => !existing.has(d.nameSearch));
            return [...localOnly, ...serverDrivers];
          });
        }
      })
      .catch(() => {
        // Đã có INITIAL_DRIVERS làm fallback an toàn
      });
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

  // Lọc tài xế theo tìm kiếm không dấu
  const filteredDrivers = useMemo(() => {
    if (!searchTerm.trim()) return drivers;
    const cleanSearch = removeVietnameseTones(searchTerm.trim());

    return drivers.filter((d) => {
      const matchName = d.nameSearch.includes(cleanSearch) || matchUnaccent(d.ten, searchTerm);
      const matchPhone = d.sdt.includes(searchTerm.trim());
      return matchName || matchPhone;
    });
  }, [drivers, searchTerm]);

  // Kiểm tra tên hiện tại đã có chính xác trong danh bạ chưa
  const matchedDriverInDirectory = useMemo(() => {
    if (!value.trim()) return null;
    const cleanVal = removeVietnameseTones(value.trim());
    return drivers.find(
      (d) => d.nameSearch === cleanVal || d.ten.toLowerCase() === value.trim().toLowerCase()
    );
  }, [drivers, value]);

  // Gợi ý tương tự khi mở dialog thêm tài xế
  const matchedSuggestions = useMemo(() => {
    if (!newDriverName.trim()) return [];
    const clean = removeVietnameseTones(newDriverName.trim());
    return drivers
      .filter((d) => d.nameSearch.includes(clean) || clean.includes(d.nameSearch))
      .slice(0, 3);
  }, [drivers, newDriverName]);

  // Kiểm tra nếu SĐT hiện tại khác với SĐT trong danh bạ để hiện gợi ý "Cập nhật vào danh bạ?"
  const isPhoneDifferent = useMemo(() => {
    if (!matchedDriverInDirectory) return false;
    if (!phoneValue.trim()) return false;
    const cleanDirPhone = matchedDriverInDirectory.sdt.replace(/[^0-9]/g, '');
    const cleanCurrentPhone = phoneValue.replace(/[^0-9]/g, '');
    return cleanDirPhone !== cleanCurrentPhone && cleanCurrentPhone.length >= 9;
  }, [matchedDriverInDirectory, phoneValue]);

  // Xử lý chọn tài xế từ danh sách
  const handleSelectDriver = (driver: TaiXeEntry) => {
    setSearchTerm(driver.ten);
    setIsOpen(false);
    onSelect(driver.ten, driver.sdt);
  };

  // Mở dialog thêm tài xế mới
  const handleOpenAddDialog = (nameToAdd: string) => {
    setNewDriverName(nameToAdd.trim());
    setNewDriverPhone(phoneValue || '');
    setShowAddDialog(true);
    setIsOpen(false);
  };

  // Lưu tài xế mới vào danh bạ (Lưu ngay vào state & localStorage)
  const handleSaveNewDriver = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDriverName.trim()) return;

    const cleanName = newDriverName.trim();
    const cleanPhone = newDriverPhone.trim();

    const newEntry: TaiXeEntry = {
      id: `drv_custom_${Date.now()}`,
      ten: cleanName,
      sdt: cleanPhone,
      nameSearch: removeVietnameseTones(cleanName),
      updatedAt: new Date().toISOString(),
    };

    // 1. Cập nhật state ngay lập tức
    setDrivers((prev) => [newEntry, ...prev.filter((d) => d.nameSearch !== newEntry.nameSearch)]);

    // 2. Lưu vào localStorage để không bao giờ mất trên máy này
    try {
      const localStr = localStorage.getItem('dangtai_custom_drivers');
      const existing: TaiXeEntry[] = localStr ? JSON.parse(localStr) : [];
      const updatedLocal = [newEntry, ...existing.filter((x) => x.nameSearch !== newEntry.nameSearch)];
      localStorage.setItem('dangtai_custom_drivers', JSON.stringify(updatedLocal));
    } catch {}

    // 3. Tự động điền luôn tên và SĐT vào form
    onSelect(cleanName, cleanPhone);
    setSearchTerm(cleanName);
    setShowAddDialog(false);

    // 4. Đồng bộ lên server (background)
    try {
      setIsSaving(true);
      await fetch('/api/dang-tai/drivers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ten: cleanName,
          sdt: cleanPhone,
        }),
      });
    } catch (err) {
      console.warn('[Drivers] Lỗi đồng bộ server (đã lưu cục bộ):', err);
    } finally {
      setIsSaving(false);
    }
  };

  // Cập nhật SĐT mới vào danh bạ
  const handleUpdatePhoneToDirectory = async () => {
    if (!matchedDriverInDirectory || !phoneValue.trim()) return;

    try {
      const res = await fetch('/api/dang-tai/drivers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ten: matchedDriverInDirectory.ten,
          sdt: phoneValue.trim(),
        }),
      });

      const data = await res.json();
      if (data.drivers) {
        setDrivers(data.drivers);
      }
      alert(`Đã cập nhật SĐT mới cho tài xế ${matchedDriverInDirectory.ten} vào danh bạ!`);
    } catch {
      alert('Lỗi cập nhật danh bạ');
    }
  };

  const hasExactMatch = drivers.some(
    (d) => removeVietnameseTones(d.ten) === removeVietnameseTones(searchTerm)
  );

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      <div className="flex items-center gap-2">
        {/* Input Combobox */}
        <div className="relative flex-1">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => {
              const val = e.target.value;
              setSearchTerm(val);
              setIsOpen(true);

              // Tự động tìm xem có khớp tài xế nào không
              const cleanVal = removeVietnameseTones(val.trim());
              const matched = drivers.find(
                (d) => d.nameSearch === cleanVal || d.ten.toLowerCase() === val.trim().toLowerCase()
              );
              if (matched) {
                onSelect(matched.ten, matched.sdt);
              } else {
                onSelect(val, phoneValue);
              }
            }}
            onKeyDown={(e) => {
              // Bấm Enter tự động chọn gợi ý đầu tiên
              if (e.key === 'Enter' && isOpen && filteredDrivers.length > 0) {
                e.preventDefault();
                handleSelectDriver(filteredDrivers[0]);
              }
            }}
            onFocus={() => setIsOpen(true)}
            placeholder={placeholder}
            className={`w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900 shadow-2xs focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 ${inputClassName}`}
          />
          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            className="absolute inset-y-0 right-0 flex items-center pr-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
          >
            <span className="text-[10px] transform transition-transform duration-200">
              {isOpen ? '▲' : '▼'}
            </span>
          </button>
        </div>

        {/* Ô nhập SĐT nếu được bật kèm */}
        {showPhoneInput && (
          <div className="w-32 relative">
            <input
              type="text"
              value={phoneValue}
              onChange={(e) => onPhoneChange?.(e.target.value)}
              placeholder="SĐT..."
              className="w-full rounded-xl border border-slate-300 bg-white px-2.5 py-2 text-xs font-mono font-semibold text-slate-900 shadow-2xs focus:border-blue-500 focus:outline-none"
            />
          </div>
        )}
      </div>

      {/* Gợi ý cập nhật danh bạ nếu SĐT khác */}
      {isPhoneDifferent && (
        <div className="mt-1 flex items-center gap-1.5 text-[11px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded-lg border border-amber-200 font-medium animate-fadeIn">
          <span>⚠️ SĐT khác danh bạ ({matchedDriverInDirectory?.sdt})</span>
          <button
            type="button"
            onClick={handleUpdatePhoneToDirectory}
            className="text-blue-700 font-bold hover:underline cursor-pointer ml-auto"
          >
            Cập nhật vào danh bạ?
          </button>
        </div>
      )}

      {/* DROPDOWN POPOVER + COMMAND LIST */}
      {isOpen && (
        <div className="absolute left-0 right-0 z-50 mt-1 max-h-60 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl shadow-slate-200/50 backdrop-blur-md">
          {filteredDrivers.length > 0 ? (
            <div className="space-y-0.5">
              <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Gợi ý tài xế ({filteredDrivers.length})
              </div>
              {filteredDrivers.map((driver) => (
                <button
                  key={driver.id}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleSelectDriver(driver);
                  }}
                  className="w-full flex items-center justify-between rounded-xl px-3 py-2 text-left text-xs transition-colors hover:bg-blue-50 hover:text-blue-900 cursor-pointer group"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400 group-hover:text-blue-600">👤</span>
                    <span className="font-bold text-slate-800 group-hover:text-blue-900">
                      {driver.ten}
                    </span>
                  </div>
                  {driver.sdt && (
                    <span className="font-mono text-[11px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md group-hover:bg-blue-100 group-hover:text-blue-800">
                      📞 {driver.sdt}
                    </span>
                  )}
                </button>
              ))}
            </div>
          ) : (
            <div className="px-3 py-3 text-center text-xs text-slate-400">
              Không tìm thấy tài xế &quot;{searchTerm}&quot;
            </div>
          )}

          {/* Mục "+ Thêm tài xế 'xxx'" khi gõ tên chưa có */}
          {searchTerm.trim().length > 0 && !hasExactMatch && (
            <div className="border-t border-slate-100 pt-1 mt-1">
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleOpenAddDialog(searchTerm);
                }}
                className="w-full flex items-center gap-2 rounded-xl bg-blue-50/80 px-3 py-2 text-left text-xs font-bold text-blue-700 hover:bg-blue-100 transition-colors cursor-pointer"
              >
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-white text-xs">
                  +
                </span>
                <span>Thêm tài xế &quot;{searchTerm.trim()}&quot; vào danh bạ</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* DIALOG NHỎ THÊM TÀI XẾ MỚI (KHÔNG CẦN CHUYỂN TRANG) */}
      {showAddDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h4 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                <span>👤</span>
                <span>Thêm Tài Xế Mới Vào Danh Bạ</span>
              </h4>
              <button
                type="button"
                onClick={() => setShowAddDialog(false)}
                className="rounded-full p-1 text-slate-400 hover:bg-slate-100"
              >
                ✕
              </button>
            </div>

            {/* Gợi ý nếu tên đang gõ tương tự người đã có trong danh bạ */}
            {matchedSuggestions.length > 0 && (
              <div className="mt-3 rounded-2xl bg-blue-50 p-3 border border-blue-200 text-xs text-blue-900">
                <span className="font-bold flex items-center gap-1">
                  <span>💡</span>
                  <span>Gợi ý tài xế có sẵn trong danh bạ:</span>
                </span>
                <div className="mt-2 space-y-1.5">
                  {matchedSuggestions.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => {
                        handleSelectDriver(s);
                        setShowAddDialog(false);
                      }}
                      className="w-full flex items-center justify-between rounded-xl bg-white p-2 text-left font-bold text-blue-700 hover:bg-blue-100 border border-blue-100 transition-all cursor-pointer shadow-2xs"
                    >
                      <div className="flex items-center gap-1.5">
                        <span>👤</span>
                        <span>{s.ten}</span>
                      </div>
                      <span className="font-mono text-[11px] text-emerald-700">
                        📞 {s.sdt} (Bấm chọn)
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <form onSubmit={handleSaveNewDriver} className="mt-4 space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Tên tài xế <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={newDriverName}
                  onChange={(e) => setNewDriverName(e.target.value)}
                  required
                  placeholder="Họ và tên tài xế..."
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-bold text-slate-900 focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Số điện thoại</label>
                <input
                  type="text"
                  value={newDriverPhone}
                  onChange={(e) => setNewDriverPhone(e.target.value)}
                  placeholder="VD: 0912345678"
                  autoFocus
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-mono font-bold text-slate-900 focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddDialog(false)}
                  className="rounded-xl px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-100"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSaving || !newDriverName.trim()}
                  className="rounded-xl bg-blue-600 hover:bg-blue-700 px-4 py-1.5 text-xs font-bold text-white shadow-md disabled:opacity-50 cursor-pointer"
                >
                  {isSaving ? 'Đang lưu...' : 'Lưu & Chọn Luôn'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
