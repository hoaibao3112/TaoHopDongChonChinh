import { NextRequest, NextResponse } from 'next/server';
import { isRequestAuthenticated } from '@/lib/auth';
import {
  getAllCustomersAndAliases,
  upsertCustomCustomer,
  upsertCustomerAlias,
  deleteCustomerAlias,
} from '@/lib/dang-tai/customerStorage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (!isRequestAuthenticated(req)) {
    return NextResponse.json({ error: 'Chưa xác thực phiên đăng nhập' }, { status: 401 });
  }

  try {
    const data = await getAllCustomersAndAliases();
    return NextResponse.json({
      success: true,
      masterCustomers: data.masterCustomers,
      customCustomers: data.customCustomers,
      allCustomers: data.allCustomers,
      aliases: data.aliases,
    });
  } catch (err: unknown) {
    console.error('[API Customers GET Error]:', err);
    return NextResponse.json({ error: 'Lỗi tải danh mục khách hàng' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!isRequestAuthenticated(req)) {
    return NextResponse.json({ error: 'Chưa xác thực phiên đăng nhập' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const action = body.action || (body.alias ? 'add_alias' : 'add_customer');

    if (action === 'add_alias') {
      const alias = String(body.alias || '').trim();
      const targetName = String(body.targetName || '').trim();

      if (!alias || !targetName) {
        return NextResponse.json(
          { error: 'Vui lòng nhập đầy đủ Tên trên phiếu (bí danh) và Tên nhóm đích chuẩn' },
          { status: 400 }
        );
      }

      const result = await upsertCustomerAlias(alias, targetName);
      return NextResponse.json({
        success: true,
        message: `Đã lưu quy tắc ánh xạ: "${alias.toUpperCase()}" -> "${targetName.toUpperCase()}" vào CSDL`,
        alias: result.aliasEntry,
        aliases: result.aliases,
      });
    }

    if (action === 'add_customer') {
      const name = String(body.name || '').trim();
      if (!name) {
        return NextResponse.json({ error: 'Vui lòng nhập tên khách hàng' }, { status: 400 });
      }

      const result = await upsertCustomCustomer(name);
      return NextResponse.json({
        success: true,
        message: `Đã thêm nhóm khách hàng "${result.customer.name}" vào CSDL`,
        customer: result.customer,
        customCustomers: result.list,
      });
    }

    return NextResponse.json({ error: 'Hành động không hợp lệ' }, { status: 400 });
  } catch (err: unknown) {
    console.error('[API Customers POST Error]:', err);
    return NextResponse.json({ error: 'Lỗi cập nhật CSDL khách hàng' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  if (!isRequestAuthenticated(req)) {
    return NextResponse.json({ error: 'Chưa xác thực phiên đăng nhập' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const alias = String(body.alias || '').trim();
    if (!alias) {
      return NextResponse.json({ error: 'Thiếu thông tin alias cần xóa' }, { status: 400 });
    }

    const remaining = await deleteCustomerAlias(alias);
    return NextResponse.json({
      success: true,
      message: `Đã xóa quy tắc ánh xạ cho "${alias}"`,
      aliases: remaining,
    });
  } catch (err: unknown) {
    console.error('[API Customers DELETE Error]:', err);
    return NextResponse.json({ error: 'Lỗi xóa quy tắc bí danh' }, { status: 500 });
  }
}
