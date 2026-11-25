import { NextRequest, NextResponse } from 'next/server';
import { getRequestUserRole, isRequestAuthenticated } from '@/lib/auth';
import {
  DEFAULT_ROLE_PASSWORDS,
  ROLE_PASSWORD_METADATA,
  getRolePasswords,
  saveRolePasswords,
  ConfigurableRoleKey,
} from '@/lib/passwordStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function hasAdminPasswordAccess(req: NextRequest): boolean {
  if (!isRequestAuthenticated(req)) return false;
  const role = getRequestUserRole(req);
  return role === 'contracts' || role === 'admin';
}

export async function GET(req: NextRequest) {
  if (!hasAdminPasswordAccess(req)) {
    return NextResponse.json(
      { error: 'Không có quyền truy cập trang quản lý mật khẩu (yêu cầu mật khẩu chonchinh hoặc admin)' },
      { status: 403 }
    );
  }

  try {
    const passwords = await getRolePasswords();
    const items = ROLE_PASSWORD_METADATA.map((meta) => ({
      ...meta,
      password: passwords[meta.key] || meta.defaultPassword,
    }));

    return NextResponse.json({ success: true, items, passwords });
  } catch (err: unknown) {
    console.error('[API Admin Passwords GET Error]:', err);
    return NextResponse.json({ error: 'Lỗi tải danh sách mật khẩu' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  if (!hasAdminPasswordAccess(req)) {
    return NextResponse.json(
      { error: 'Không có quyền thay đổi mật khẩu (yêu cầu mật khẩu chonchinh hoặc admin)' },
      { status: 403 }
    );
  }

  try {
    const body = await req.json();

    if (body.resetAll) {
      const resetMap = await saveRolePasswords(DEFAULT_ROLE_PASSWORDS);
      return NextResponse.json({
        success: true,
        message: 'Đã khôi phục toàn bộ mật khẩu về mặc định ban đầu!',
        passwords: resetMap,
      });
    }

    const updates: Partial<Record<ConfigurableRoleKey, string>> = body.passwords || {};
    const updated = await saveRolePasswords(updates);

    return NextResponse.json({
      success: true,
      message: 'Đã cập nhật và lưu mật khẩu mới thành công! Người dùng đăng nhập lần sau sẽ phải nhập mật khẩu mới.',
      passwords: updated,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Lỗi cập nhật mật khẩu' },
      { status: 400 }
    );
  }
}
