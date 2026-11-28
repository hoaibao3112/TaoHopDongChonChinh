'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { ConfigurableRoleKey } from '@/lib/passwordStore';

interface PasswordRowItem {
  key: ConfigurableRoleKey;
  label: string;
  route: string;
  icon: string;
  description: string;
  defaultPassword: string;
  password: string;
}

export default function AdminPasswordsView() {
  const [items, setItems] = useState<PasswordRowItem[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [visibleMap, setVisibleMap] = useState<Record<string, boolean>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [switchingKey, setSwitchingKey] = useState<ConfigurableRoleKey | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadPasswords = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/passwords', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Không thể tải danh sách mật khẩu');
      }
      setItems(data.items);
      const d: Record<string, string> = {};
      for (const it of data.items) {
        d[it.key] = it.password;
      }
      setDrafts(d);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/admin/passwords', { cache: 'no-store' })
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (cancelled) return;
        if (!ok || !data.success) {
          throw new Error(data.error || 'Không thể tải danh sách mật khẩu');
        }
        setItems(data.items);
        const d: Record<string, string> = {};
        for (const it of data.items) {
          d[it.key] = it.password;
        }
        setDrafts(d);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSaveAll = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setIsSaving(true);
    try {
      const res = await fetch('/api/admin/passwords', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passwords: drafts }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Không thể lưu mật khẩu');
      }
      setSuccess(data.message || 'Đã lưu mật khẩu mới!');
      await loadPasswords();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSaving(false);
    }
  };

  const handleSwitchTab = async (targetRole: ConfigurableRoleKey) => {
    setError(null);
    setSwitchingKey(targetRole);
    try {
      const res = await fetch('/api/admin/switch-role', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetRole }),
      });
      const data = (await res.json()) as { success?: boolean; error?: string; redirectUrl?: string };
      if (!res.ok || !data.success || !data.redirectUrl) {
        throw new Error(data.error || 'Không thể chuyển sang tab này');
      }
      window.location.assign(data.redirectUrl);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      setSwitchingKey(null);
    }
  };

  const handleResetAll = async () => {
    if (!window.confirm('Khôi phục toàn bộ mật khẩu về mặc định ban đầu (chonchinh, hoaibao, teamlua, baocao, phuongtien, chingoc, KIEMTRA)?')) {
      return;
    }
    setError(null);
    setSuccess(null);
    setIsSaving(true);
    try {
      const res = await fetch('/api/admin/passwords', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resetAll: true }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Không thể khôi phục');
      }
      setSuccess(data.message);
      await loadPasswords();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-slate-500">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-rose-200 border-t-rose-600 mb-3" />
        <p className="text-sm font-semibold">Đang tải danh sách mật khẩu phân quyền...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-rose-200/80 bg-gradient-to-r from-rose-50 via-amber-50/40 to-white p-6 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-tr from-rose-600 to-orange-600 text-3xl text-white shadow-lg shadow-rose-500/20">
            🔐
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              Admin Quản Lý Mật Khẩu Các Tab
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 mt-1">
              Thay đổi mật khẩu truy cập cho từng phân hệ. Sau khi lưu, người dùng phải nhập đúng mật khẩu mới để vào hệ thống.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleResetAll}
          disabled={isSaving}
          className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition cursor-pointer disabled:opacity-50"
        >
          🔄 Khôi phục mặc định
        </button>
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs font-bold text-rose-800">
          ⚠️ {error}
        </div>
      )}

      {success && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-xs font-bold text-emerald-800">
          ✅ {success}
        </div>
      )}

      <form onSubmit={handleSaveAll} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {items.map((it) => {
            const isVisible = !!visibleMap[it.key];
            const currentVal = drafts[it.key] ?? '';
            const isModified = currentVal !== it.password;

            return (
              <div
                key={it.key}
                className={`rounded-2xl border bg-white p-5 shadow-xs space-y-3 transition-all ${
                  isModified ? 'border-amber-400 ring-2 ring-amber-200/60' : 'border-slate-200'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <span className="text-2xl">{it.icon}</span>
                    <div>
                      <h3 className="text-sm font-black text-slate-900">{it.label}</h3>
                      <span className="text-[11px] font-mono text-indigo-600 font-semibold">
                        {it.route}
                      </span>
                    </div>
                  </div>
                  <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold text-slate-500">
                    Mặc định: {it.defaultPassword}
                  </span>
                </div>

                <p className="text-xs text-slate-500 leading-relaxed">{it.description}</p>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                    Mật khẩu hiện tại
                  </label>
                  <div className="relative">
                    <input
                      type={isVisible ? 'text' : 'password'}
                      value={currentVal}
                      onChange={(e) =>
                        setDrafts((prev) => ({ ...prev, [it.key]: e.target.value }))
                      }
                      required
                      className="w-full rounded-xl border border-slate-300 bg-slate-50/70 pl-3.5 pr-11 py-2.5 text-sm font-bold text-slate-900 focus:bg-white focus:border-rose-500 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setVisibleMap((prev) => ({ ...prev, [it.key]: !prev[it.key] }))
                      }
                      aria-label={isVisible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                      className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-400 hover:text-slate-700 cursor-pointer"
                    >
                      {isVisible ? (
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                        </svg>
                      ) : (
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>

                <div className="pt-1 flex items-center justify-end">
                  <button
                    type="button"
                    disabled={isSaving || switchingKey !== null}
                    onClick={() => handleSwitchTab(it.key)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-600 hover:text-white hover:border-indigo-600 transition-all disabled:opacity-50 cursor-pointer"
                  >
                    <span>{switchingKey === it.key ? '⏳ Đang chuyển...' : '🚀 Chuyển thẳng qua tab này'}</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={isSaving}
            className="rounded-2xl bg-gradient-to-r from-rose-600 to-orange-600 px-6 py-3 text-sm font-black text-white shadow-lg shadow-rose-600/25 hover:from-rose-700 hover:to-orange-700 disabled:opacity-50 cursor-pointer transition"
          >
            {isSaving ? '⏳ Đang lưu mật khẩu...' : '💾 Lưu Toàn Bộ Mật Khẩu Mới'}
          </button>
        </div>
      </form>
    </div>
  );
}
