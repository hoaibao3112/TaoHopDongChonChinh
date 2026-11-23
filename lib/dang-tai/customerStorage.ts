import fs from 'fs';
import path from 'path';
import { removeVietnameseTones } from './unaccent';
import {
  MasterCustomer,
  CustomerAlias,
  MASTER_CUSTOMERS,
  normalizeCustomerName,
} from './customers';
import {
  getCustomersFromDb,
  upsertCustomerToDb,
  getCustomerAliasesFromDb,
  upsertCustomerAliasToDb,
  deleteCustomerAliasFromDb,
} from '@/lib/db';

function getDataDir(): string {
  try {
    const dir = path.join(process.cwd(), 'data', 'dang-tai');
    if (!fs.existsSync(dir)) {
      try {
        fs.mkdirSync(dir, { recursive: true });
      } catch {}
    }
    return dir;
  } catch {
    return '/tmp';
  }
}

function getCustomCustomersFilePath(): string {
  return path.join(getDataDir(), 'custom-customers.json');
}

function getCustomerAliasesFilePath(): string {
  return path.join(getDataDir(), 'customer-aliases.json');
}

function getRedisConfig(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL?.replace(/\/$/, '');
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return { url, token };
}

/**
 * Đọc toàn bộ danh sách khách hàng (Master 119 + Custom) và bảng Ánh Xạ Bí Danh (Aliases)
 * Đa tầng: Supabase Postgres -> Redis -> Local File
 */
export async function getAllCustomersAndAliases(): Promise<{
  masterCustomers: MasterCustomer[];
  customCustomers: MasterCustomer[];
  allCustomers: MasterCustomer[];
  aliases: CustomerAlias[];
}> {
  let customCustomers: MasterCustomer[] = [];
  let aliases: CustomerAlias[] = [];

  // 1. Thử đọc từ Supabase Postgres
  try {
    const dbCustomers = await getCustomersFromDb();
    if (dbCustomers && Array.isArray(dbCustomers) && dbCustomers.length > 0) {
      customCustomers = dbCustomers.map((c) => ({
        name: c.name,
        count: c.count || 0,
        nameSearch: c.nameSearch || removeVietnameseTones(c.name),
      }));
    }

    const dbAliases = await getCustomerAliasesFromDb();
    if (dbAliases && Array.isArray(dbAliases) && dbAliases.length > 0) {
      aliases = dbAliases.map((a) => ({
        alias: a.alias,
        targetName: a.targetName,
        aliasSearch: a.aliasSearch || removeVietnameseTones(a.alias),
        updatedAt: a.updatedAt,
      }));
    }

    if (customCustomers.length > 0 || aliases.length > 0) {
      return {
        masterCustomers: MASTER_CUSTOMERS,
        customCustomers,
        allCustomers: [...customCustomers, ...MASTER_CUSTOMERS],
        aliases,
      };
    }
  } catch (err) {
    console.warn('[CustomerStorage] DB read warning:', err);
  }

  // 2. Thử đọc từ Redis
  const redis = getRedisConfig();
  if (redis) {
    try {
      if (customCustomers.length === 0) {
        const resC = await fetch(`${redis.url}/get/dangtai:custom_customers`, {
          headers: { Authorization: `Bearer ${redis.token}` },
          cache: 'no-store',
        });
        if (resC.ok) {
          const dataC = await resC.json();
          if (dataC.result && typeof dataC.result === 'string') {
            customCustomers = JSON.parse(dataC.result);
          }
        }
      }

      if (aliases.length === 0) {
        const resA = await fetch(`${redis.url}/get/dangtai:customer_aliases`, {
          headers: { Authorization: `Bearer ${redis.token}` },
          cache: 'no-store',
        });
        if (resA.ok) {
          const dataA = await resA.json();
          if (dataA.result && typeof dataA.result === 'string') {
            aliases = JSON.parse(dataA.result);
          }
        }
      }
    } catch (err) {
      console.warn('[CustomerStorage] Redis read warning:', err);
    }
  }

  // 3. Fallback sang file JSON cục bộ
  try {
    if (customCustomers.length === 0) {
      const cPath = getCustomCustomersFilePath();
      if (fs.existsSync(cPath)) {
        const raw = fs.readFileSync(cPath, 'utf-8');
        const list = JSON.parse(raw);
        if (Array.isArray(list)) customCustomers = list;
      }
    }

    if (aliases.length === 0) {
      const aPath = getCustomerAliasesFilePath();
      if (fs.existsSync(aPath)) {
        const raw = fs.readFileSync(aPath, 'utf-8');
        const list = JSON.parse(raw);
        if (Array.isArray(list)) aliases = list;
      }
    }
  } catch (err) {
    console.warn('[CustomerStorage] File read warning:', err);
  }

  return {
    masterCustomers: MASTER_CUSTOMERS,
    customCustomers,
    allCustomers: [...customCustomers, ...MASTER_CUSTOMERS],
    aliases,
  };
}

/**
 * Thêm một Khách Hàng / Nhóm Khách Hàng mới vào CSDL
 */
export async function upsertCustomCustomer(
  name: string,
  count = 1
): Promise<{ customer: MasterCustomer; list: MasterCustomer[] }> {
  const cleanName = name.trim().toUpperCase().replace(/\s+/g, ' ');
  if (!cleanName) {
    throw new Error('Tên khách hàng không hợp lệ');
  }

  const nameSearch = removeVietnameseTones(cleanName);
  const customer: MasterCustomer = {
    name: cleanName,
    count,
    nameSearch,
  };

  // 1. Lưu vào Supabase Postgres
  try {
    await upsertCustomerToDb(customer);
  } catch (err) {
    console.warn('[CustomerStorage] DB upsert customer warning:', err);
  }

  // 2. Lưu vào file cục bộ
  let updatedList: MasterCustomer[] = [];
  try {
    const cPath = getCustomCustomersFilePath();
    let current: MasterCustomer[] = [];
    if (fs.existsSync(cPath)) {
      try {
        current = JSON.parse(fs.readFileSync(cPath, 'utf-8'));
      } catch {}
    }
    const idx = current.findIndex((c) => c.name === cleanName);
    if (idx >= 0) {
      current[idx].count = (current[idx].count || 0) + count;
    } else {
      current.unshift(customer);
    }
    updatedList = current;
    fs.writeFileSync(cPath, JSON.stringify(current, null, 2), 'utf-8');
  } catch {}

  // 3. Đồng bộ lên Redis nếu có
  const redis = getRedisConfig();
  if (redis && updatedList.length > 0) {
    try {
      await fetch(`${redis.url}/set/dangtai:custom_customers`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${redis.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(JSON.stringify(updatedList)),
      });
    } catch {}
  }

  return { customer, list: updatedList };
}

/**
 * Thêm hoặc Cập nhật Quy Tắc Ánh Xạ Bí Danh (Alias Mapping) vào CSDL
 * Ví dụ: alias = "A KHU B" -> targetName = "A KHU E"
 */
export async function upsertCustomerAlias(
  alias: string,
  targetName: string
): Promise<{ aliasEntry: CustomerAlias; aliases: CustomerAlias[] }> {
  const cleanAlias = alias.trim().toUpperCase().replace(/\s+/g, ' ');
  const cleanTarget = targetName.trim().toUpperCase().replace(/\s+/g, ' ');

  if (!cleanAlias || !cleanTarget) {
    throw new Error('Tên nguồn và tên đích không được để trống');
  }

  const aliasSearch = removeVietnameseTones(cleanAlias);
  const entry: CustomerAlias = {
    alias: cleanAlias,
    targetName: cleanTarget,
    aliasSearch,
    updatedAt: new Date().toISOString(),
  };

  // 1. Lưu vào Supabase Postgres
  try {
    await upsertCustomerAliasToDb(cleanAlias, cleanTarget, aliasSearch);
  } catch (err) {
    console.warn('[CustomerStorage] DB upsert alias warning:', err);
  }

  // 2. Lưu vào file cục bộ
  let updatedAliases: CustomerAlias[] = [];
  try {
    const aPath = getCustomerAliasesFilePath();
    let current: CustomerAlias[] = [];
    if (fs.existsSync(aPath)) {
      try {
        current = JSON.parse(fs.readFileSync(aPath, 'utf-8'));
      } catch {}
    }
    const idx = current.findIndex((a) => a.alias === cleanAlias);
    if (idx >= 0) {
      current[idx] = entry;
    } else {
      current.unshift(entry);
    }
    updatedAliases = current;
    fs.writeFileSync(aPath, JSON.stringify(current, null, 2), 'utf-8');
  } catch {}

  // 3. Đồng bộ lên Redis nếu có
  const redis = getRedisConfig();
  if (redis && updatedAliases.length > 0) {
    try {
      await fetch(`${redis.url}/set/dangtai:customer_aliases`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${redis.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(JSON.stringify(updatedAliases)),
      });
    } catch {}
  }

  // 4. Nếu tên đích chưa có trong danh mục Master hay Custom, tự động thêm luôn tên đích vào Custom Customers
  try {
    const isMaster = MASTER_CUSTOMERS.some((c) => c.name === cleanTarget);
    if (!isMaster) {
      await upsertCustomCustomer(cleanTarget, 1);
    }
  } catch {}

  return { aliasEntry: entry, aliases: updatedAliases };
}

/**
 * Xóa một quy tắc ánh xạ bí danh
 */
export async function deleteCustomerAlias(alias: string): Promise<CustomerAlias[]> {
  const cleanAlias = alias.trim().toUpperCase();

  // 1. Xóa trong Postgres
  try {
    await deleteCustomerAliasFromDb(cleanAlias);
  } catch {}

  // 2. Xóa trong File
  let remaining: CustomerAlias[] = [];
  try {
    const aPath = getCustomerAliasesFilePath();
    if (fs.existsSync(aPath)) {
      const current: CustomerAlias[] = JSON.parse(fs.readFileSync(aPath, 'utf-8'));
      remaining = current.filter((a) => a.alias !== cleanAlias);
      fs.writeFileSync(aPath, JSON.stringify(remaining, null, 2), 'utf-8');
    }
  } catch {}

  // 3. Đồng bộ Redis
  const redis = getRedisConfig();
  if (redis) {
    try {
      await fetch(`${redis.url}/set/dangtai:customer_aliases`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${redis.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(JSON.stringify(remaining)),
      });
    } catch {}
  }

  return remaining;
}
