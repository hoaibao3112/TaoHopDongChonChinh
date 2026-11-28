import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  SESSION_COOKIE_NAME,
  computePasswordVersion,
  setAuthCookie,
  verifySessionJwt,
  UserRole,
} from '@/lib/auth';
import {
  ConfigurableRoleKey,
  ROLE_PASSWORD_METADATA,
  getRolePasswords,
} from '@/lib/passwordStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, private',
  Pragma: 'no-cache',
};

const switchRoleSchema = z.object({
  targetRole: z.enum([
    'contracts',
    'payroll',
    'husk',
    'baocao',
    'dangtai',
    'chingoc',
    'kiemtra',
  ]),
});

function isSameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return true;
  try {
    const originHost = new URL(origin).host;
    const requestHost = req.headers.get('x-forwarded-host') || req.headers.get('host');
    if (!requestHost) return true;
    return originHost === requestHost;
  } catch {
    return false;
  }
}

async function verifyAdminAccess(req: NextRequest): Promise<{ ok: boolean; role?: UserRole }> {
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return { ok: false };

  const payload = verifySessionJwt(token);
  if (!payload || payload.role !== 'admin') {
    return { ok: false };
  }

  if (payload.pv) {
    const currentMap = await getRolePasswords();
    const adminEnv = process.env.APP_PASSWORD;
    const isEnvAdmin = adminEnv && payload.pv === computePasswordVersion(adminEnv);
    const isDevAdmin =
      process.env.NODE_ENV !== 'production' && payload.pv === computePasswordVersion('matkhau123');
    const isPayrollAdmin = payload.pv === computePasswordVersion(currentMap.payroll);
    if (!isEnvAdmin && !isDevAdmin && !isPayrollAdmin) {
      return { ok: false };
    }
  }

  return { ok: true, role: payload.role };
}

export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) {
    return NextResponse.json(
      { error: 'Yêu cầu không hợp lệ (CSRF check failed)' },
      { status: 403, headers: NO_STORE_HEADERS }
    );
  }

  const auth = await verifyAdminAccess(req);
  if (!auth.ok || !auth.role) {
    return NextResponse.json(
      { error: 'Chỉ tài khoản hoaibao hoặc admin mới được chuyển thẳng sang tab khác' },
      { status: 403, headers: NO_STORE_HEADERS }
    );
  }

  try {
    const body: unknown = await req.json();
    const parsed = switchRoleSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Phân hệ đích không hợp lệ' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const targetRole: ConfigurableRoleKey = parsed.data.targetRole;
    const meta = ROLE_PASSWORD_METADATA.find((m) => m.key === targetRole);
    if (!meta) {
      return NextResponse.json(
        { error: 'Không tìm thấy cấu hình phân hệ' },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    const passwords = await getRolePasswords();
    const targetPw = passwords[targetRole] || meta.defaultPassword;
    const pwVersion = computePasswordVersion(targetPw);
    const cookieRole: UserRole = targetRole === 'payroll' ? 'admin' : targetRole;

    const res = NextResponse.json(
      {
        success: true,
        role: cookieRole,
        redirectUrl: meta.route,
      },
      { headers: NO_STORE_HEADERS }
    );

    setAuthCookie(res, cookieRole, req, pwVersion);
    return res;
  } catch (err: unknown) {
    console.error('[API Admin Switch Role Error]:', err);
    return NextResponse.json(
      { error: 'Không thể chuyển sang phân hệ đã chọn' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
