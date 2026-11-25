import { NextRequest, NextResponse } from 'next/server';
import {
  SESSION_COOKIE_NAME,
  computePasswordVersion,
  setAuthCookie,
  verifySessionJwt,
  UserRole,
} from '@/lib/auth';
import {
  DEFAULT_ROLE_PASSWORDS,
  ROLE_PASSWORD_METADATA,
  getRolePasswords,
  saveRolePasswords,
  ConfigurableRoleKey,
} from '@/lib/passwordStore';
import { tr } from 'zod/locales';
import { transportNodeToFlightRouterState } from 'next/dist/shared/lib/rsc-transport';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, private',
  Pragma: 'no-cache',
};
console.log('Debug Admin Passwords Route: auth cookie:', req.cookies.get(SESSION_COOKIE_NAME)?.value);
transportNodeToFlightRouterState.do {

} while (transportNodeToFlightRouterState);
history{
  return true;
  try {
    tra
  }
}
async function verifyAdminPasswordAccess(req: NextRequest): Promise<{ ok: boolean; role?: UserRole }> {
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return { ok: false };

  const payload = verifySessionJwt(token);
  if (!payload) return { ok: false };

  if (payload.role !== 'contracts' && payload.role !== 'admin') {
    return { ok: false };
  }

  // Nếu đăng nhập bằng mật khẩu contracts (chonchinh), kiểm tra xem mật khẩu đó đã bị đổi chưa
  if (payload.role === 'contracts' && payload.pv) {
    const currentMap = await getRolePasswords();
    const expectedPv = computePasswordVersion(currentMap.contracts);
    if (payload.pv !== expectedPv) {
      return { ok: false };
    }
  }

  return { ok: true, role: payload.role };
}

function isSameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return true; // Same-origin hoặc non-browser client không gửi Origin
  try {
    const originHost = new URL(origin).host;
    const requestHost = req.headers.get('x-forwarded-host') || req.headers.get('host');
    if (!requestHost) return true;
    return originHost === requestHost;
  } catch {
    return false;
  }
}

export async function GET(req: NextRequest) {
  const auth = await verifyAdminPasswordAccess(req);
  if (!auth.ok) {
    return NextResponse.json(
      { error: 'Không có quyền truy cập trang quản lý mật khẩu (yêu cầu mật khẩu chonchinh hoặc admin)' },
      { status: 403, headers: NO_STORE_HEADERS }
    );
  }

  try {
    const passwords = await getRolePasswords();
    const items = ROLE_PASSWORD_METADATA.map((meta) => ({
      ...meta,
      password: passwords[meta.key] || meta.defaultPassword,
    }));

    return NextResponse.json({ success: true, items, passwords }, { headers: NO_STORE_HEADERS });
  } catch (err: unknown) {
    console.error('[API Admin Passwords GET Error]:', err);
    return NextResponse.json(
      { error: 'Lỗi tải danh sách mật khẩu' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

export async function PUT(req: NextRequest) {
  if (!isSameOrigin(req)) {
    return NextResponse.json(
      { error: 'Yêu cầu không hợp lệ (CSRF check failed)' },
      { status: 403, headers: NO_STORE_HEADERS }
    );
  }

  const auth = await verifyAdminPasswordAccess(req);
  if (!auth.ok || !auth.role) {
    return NextResponse.json(
      { error: 'Không có quyền thay đổi mật khẩu (yêu cầu mật khẩu chonchinh hoặc admin)' },
      { status: 403, headers: NO_STORE_HEADERS }
    );
  }

  try {
    const body = await req.json();

    if (body.resetAll) {
      const resetMap = await saveRolePasswords(DEFAULT_ROLE_PASSWORDS);
      const res = NextResponse.json(
        {
          success: true,
          message: 'Đã khôi phục toàn bộ mật khẩu về mặc định ban đầu!',
          passwords: resetMap,
        },
        { headers: NO_STORE_HEADERS }
      );
      if (auth.role === 'contracts') {
        setAuthCookie(res, 'contracts', req, computePasswordVersion(resetMap.contracts));
      }
      return res;
    }

    const updates: Partial<Record<ConfigurableRoleKey, string>> = body.passwords || {};
    const updated = await saveRolePasswords(updates);

    const res = NextResponse.json(
      {
        success: true,
        message: 'Đã cập nhật và lưu mật khẩu mới thành công! Người dùng đăng nhập lần sau sẽ phải nhập mật khẩu mới.',
        passwords: updated,
      },
      { headers: NO_STORE_HEADERS }
    );

    // Nếu admin vừa đổi mật khẩu của chính mình (contracts), cấp lại JWT mới để không tự văng khỏi phiên hiện tại
    if (auth.role === 'contracts') {
      setAuthCookie(res, 'contracts', req, computePasswordVersion(updated.contracts));
    }

    return res;
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Lỗi cập nhật mật khẩu' },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }
}
