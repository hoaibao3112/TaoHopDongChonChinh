import { Pool } from 'pg';
import { XeDangTai } from './dang-tai/types';
import { TaiXeEntry } from './dang-tai/driverTypes';

let pool: Pool | null = null;

export function normalizeConnectionString(raw: string): string {
  let str = raw.trim();
  if ((str.startsWith('"') && str.endsWith('"')) || (str.startsWith("'") && str.endsWith("'"))) {
    str = str.slice(1, -1).trim();
  }
  const protoMatch = str.match(/^(postgres(?:ql)?:\/\/)(.*)$/);
  if (!protoMatch) return str;
  const rest = protoMatch[2];
  const lastAtIdx = rest.lastIndexOf('@');
  if (lastAtIdx === -1) return str;

  const authPart = rest.slice(0, lastAtIdx);
  const hostPart = rest.slice(lastAtIdx + 1);

  const colonIdx = authPart.indexOf(':');
  if (colonIdx === -1) return str;

  const user = authPart.slice(0, colonIdx);
  const pass = authPart.slice(colonIdx + 1);

  let decodedPass = pass;
  try {
    decodedPass = decodeURIComponent(pass);
  } catch { }
  const encodedPass = encodeURIComponent(decodedPass);

  return `${protoMatch[1]}${user}:${encodedPass}@${hostPart}`;
}

export function getDbPool(): Pool | null {
  const rawConnectionString = process.env.DATABASE_URL || process.env.DIRECT_URL;
  if (!rawConnectionString) {
    return null;
  }

  const connectionString = normalizeConnectionString(rawConnectionString);

  if (!pool) {
    pool = new Pool({
      connectionString,
      ssl: {
        rejectUnauthorized: false,
      },
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });
  }

  return pool;
}

let tablesEnsured = false;
export async function ensureTables(): Promise<void> {
  if (tablesEnsured) return;
  const db = getDbPool();
  if (!db) return;
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS dang_tai_records (
        date VARCHAR(20) PRIMARY KEY,
        items JSONB NOT NULL DEFAULT '[]'::jsonb,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS dang_tai_drivers (
        id VARCHAR(100) PRIMARY KEY,
        ten VARCHAR(255) NOT NULL,
        sdt VARCHAR(50) NOT NULL,
        name_search VARCHAR(255) NOT NULL,
        bien_so_thuong_chay VARCHAR(50),
        ghi_chu TEXT,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS dang_tai_customers (
        name VARCHAR(255) PRIMARY KEY,
        count INT DEFAULT 0,
        name_search VARCHAR(255) NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS dang_tai_customer_aliases (
        alias VARCHAR(255) PRIMARY KEY,
        target_name VARCHAR(255) NOT NULL,
        alias_search VARCHAR(255) NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS husk_monthly_records (
        month_key VARCHAR(20) PRIMARY KEY,
        items JSONB NOT NULL DEFAULT '[]'::jsonb,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS app_role_passwords (
        role_key VARCHAR(32) PRIMARY KEY,
        password_value VARCHAR(255) NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS vehicle_board_state (
        board_key VARCHAR(32) PRIMARY KEY,
        state JSONB NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS vehicle_daily_plans (
        plan_date VARCHAR(20) PRIMARY KEY,
        plan JSONB NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    tablesEnsured = true;
  } catch (err) {
    console.warn('[DB ensureTables Warning]:', err);
  }
}

/**
 * Khởi tạo tự động các bảng cần thiết trên Supabase Postgres nếu chưa tồn tại
 */
export async function initSupabaseTables(): Promise<boolean> {
  const db = getDbPool();
  if (!db) return false;

  try {
    const client = await db.connect();
    try {
      await client.query(`
        -- Bảng lưu trữ danh sách xe đăng tài theo ngày
        CREATE TABLE IF NOT EXISTS dang_tai_records (
          date VARCHAR(20) PRIMARY KEY,
          items JSONB NOT NULL DEFAULT '[]'::jsonb,
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );

        -- Bảng lưu trữ danh bạ tài xế
        CREATE TABLE IF NOT EXISTS dang_tai_drivers (
          id VARCHAR(100) PRIMARY KEY,
          ten VARCHAR(255) NOT NULL,
          sdt VARCHAR(50) NOT NULL,
          name_search VARCHAR(255) NOT NULL,
          bien_so_thuong_chay VARCHAR(50),
          ghi_chu TEXT,
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );

        -- Bảng lưu trữ danh mục Nhà Cung Cấp / Nhóm Khách Hàng tự tạo
        CREATE TABLE IF NOT EXISTS dang_tai_customers (
          name VARCHAR(255) PRIMARY KEY,
          count INT DEFAULT 0,
          name_search VARCHAR(255) NOT NULL,
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );

        -- Bảng lưu trữ quy tắc ánh xạ bí danh khách hàng (vd: "A KHU B" -> "A KHU E")
        CREATE TABLE IF NOT EXISTS dang_tai_customer_aliases (
          alias VARCHAR(255) PRIMARY KEY,
          target_name VARCHAR(255) NOT NULL,
          alias_search VARCHAR(255) NOT NULL,
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );

        -- Bảng lưu trữ số liệu xuất trấu theo tháng (đồng bộ sang Nhập Sấy NSX TM)
        CREATE TABLE IF NOT EXISTS husk_monthly_records (
          month_key VARCHAR(20) PRIMARY KEY,
          items JSONB NOT NULL DEFAULT '[]'::jsonb,
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );
      `);
      return true;
    } finally {
      client.release();
    }
  } catch (err) {
    console.warn('[Supabase Init Warning]:', err);
    return false;
  }
}

/**
 * Đọc danh sách xe đăng tài từ Supabase Postgres
 */
export async function getDangTaiListFromDb(dateStr: string): Promise<XeDangTai[] | null> {
  const db = getDbPool();
  if (!db) return null;
  try {
    await ensureTables();
    const res = await db.query('SELECT items FROM dang_tai_records WHERE date = $1', [dateStr]);
    if (res.rows.length > 0 && Array.isArray(res.rows[0].items)) {
      return res.rows[0].items as XeDangTai[];
    }
    return null;
  } catch (err) {
    console.warn('[DB getDangTaiList Warning]:', err);
    return null;
  }
}

/**
 * Lưu danh sách xe đăng tài lên Supabase Postgres (giữ nguyên thứ tự hàng)
 */
export async function saveDangTaiListToDb(dateStr: string, list: XeDangTai[]): Promise<boolean> {
  const db = getDbPool();
  if (!db) return false;
  try {
    await ensureTables();
    await db.query(
      `INSERT INTO dang_tai_records (date, items, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (date) DO UPDATE SET items = $2, updated_at = NOW()`,
      [dateStr, JSON.stringify(list)]
    );
    return true;
  } catch (err) {
    console.warn('[DB saveDangTaiList Warning]:', err);
    return false;
  }
}

/**
 * Đọc toàn bộ danh bạ tài xế từ Supabase Postgres
 */
export async function getDriversFromDb(): Promise<TaiXeEntry[] | null> {
  const db = getDbPool();
  if (!db) return null;
  try {
    await ensureTables();
    const res = await db.query(
      `SELECT id, ten, sdt, name_search AS "nameSearch", bien_so_thuong_chay AS "bienSoThuongChay", ghi_chu AS "ghiChu", updated_at AS "updatedAt"
       FROM dang_tai_drivers
       ORDER BY updated_at DESC`
    );
    if (res.rows.length > 0) {
      return res.rows.map((r: { id: string; ten: string; sdt: string; nameSearch?: string; bienSoThuongChay?: string; ghiChu?: string; updatedAt?: string | Date }) => ({
        id: r.id,
        ten: r.ten,
        sdt: r.sdt,
        nameSearch: r.nameSearch || r.ten || '',
        bienSoThuongChay: r.bienSoThuongChay || undefined,
        ghiChu: r.ghiChu || undefined,
        updatedAt: r.updatedAt ? new Date(r.updatedAt).toISOString() : new Date().toISOString(),
      }));
    }
    return null;
  } catch (err) {
    console.warn('[DB getDrivers Warning]:', err);
    return null;
  }
}

/**
 * Thêm hoặc cập nhật 1 tài xế lên Supabase Postgres
 */
export async function upsertDriverToDb(driver: TaiXeEntry): Promise<boolean> {
  const db = getDbPool();
  if (!db) return false;
  try {
    await ensureTables();
    await db.query(
      `INSERT INTO dang_tai_drivers (id, ten, sdt, name_search, bien_so_thuong_chay, ghi_chu, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (id) DO UPDATE SET
         ten = $2,
         sdt = $3,
         name_search = $4,
         bien_so_thuong_chay = $5,
         ghi_chu = $6,
         updated_at = NOW()`,
      [
        driver.id,
        driver.ten,
        driver.sdt,
        driver.nameSearch,
        driver.bienSoThuongChay || null,
        driver.ghiChu || null,
      ]
    );
    return true;
  } catch (err) {
    console.warn('[DB upsertDriver Warning]:', err);
    return false;
  }
}

/**
 * Lưu nhiều tài xế lên Supabase Postgres
 */
export async function saveDriversListToDb(drivers: TaiXeEntry[]): Promise<boolean> {
  const db = getDbPool();
  if (!db) return false;
  try {
    await ensureTables();
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      for (const d of drivers) {
        await client.query(
          `INSERT INTO dang_tai_drivers (id, ten, sdt, name_search, bien_so_thuong_chay, ghi_chu, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, NOW())
           ON CONFLICT (id) DO UPDATE SET
             ten = $2,
             sdt = $3,
             name_search = $4,
             bien_so_thuong_chay = $5,
             ghi_chu = $6,
             updated_at = NOW()`,
          [d.id, d.ten, d.sdt, d.nameSearch, d.bienSoThuongChay || null, d.ghiChu || null]
        );
      }
      await client.query('COMMIT');
      return true;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (err) {
    console.warn('[DB saveDriversList Warning]:', err);
    return false;
  }
}

/**
 * Đọc danh sách Nhà Cung Cấp tự tạo từ Supabase Postgres
 */
export async function getCustomersFromDb(): Promise<{ name: string; count: number; nameSearch: string }[] | null> {
  const db = getDbPool();
  if (!db) return null;
  try {
    await ensureTables();
    const res = await db.query('SELECT name, count, name_search AS "nameSearch" FROM dang_tai_customers ORDER BY count DESC, name ASC');
    return res.rows;
  } catch (err) {
    console.warn('[DB getCustomers Warning]:', err);
    return null;
  }
}

/**
 * Thêm hoặc cập nhật Nhà Cung Cấp vào Supabase Postgres
 */
export async function upsertCustomerToDb(customer: { name: string; count?: number; nameSearch: string }): Promise<boolean> {
  const db = getDbPool();
  if (!db) return false;
  try {
    await ensureTables();
    await db.query(
      `INSERT INTO dang_tai_customers (name, count, name_search, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (name) DO UPDATE SET
         count = dang_tai_customers.count + EXCLUDED.count,
         name_search = EXCLUDED.name_search,
         updated_at = NOW()`,
      [customer.name, customer.count || 0, customer.nameSearch]
    );
    return true;
  } catch (err) {
    console.warn('[DB upsertCustomer Warning]:', err);
    return false;
  }
}

/**
 * Đọc danh sách ánh xạ bí danh khách hàng (Customer Aliases) từ Supabase Postgres
 */
export async function getCustomerAliasesFromDb(): Promise<{ alias: string; targetName: string; aliasSearch: string; updatedAt?: string }[] | null> {
  const db = getDbPool();
  if (!db) return null;
  try {
    await ensureTables();
    const res = await db.query('SELECT alias, target_name AS "targetName", alias_search AS "aliasSearch", updated_at AS "updatedAt" FROM dang_tai_customer_aliases ORDER BY updated_at DESC');
    return res.rows;
  } catch (err) {
    console.warn('[DB getCustomerAliases Warning]:', err);
    return null;
  }
}

/**
 * Thêm hoặc cập nhật quy tắc ánh xạ bí danh khách hàng vào Supabase Postgres
 * vd: alias="A KHU B", targetName="A KHU E"
 */
export async function upsertCustomerAliasToDb(alias: string, targetName: string, aliasSearch: string): Promise<boolean> {
  const db = getDbPool();
  if (!db) return false;
  try {
    await ensureTables();
    await db.query(
      `INSERT INTO dang_tai_customer_aliases (alias, target_name, alias_search, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (alias) DO UPDATE SET
         target_name = $2,
         alias_search = $3,
         updated_at = NOW()`,
      [alias, targetName, aliasSearch]
    );
    return true;
  } catch (err) {
    console.warn('[DB upsertCustomerAlias Warning]:', err);
    return false;
  }
}

/**
 * Xóa quy tắc ánh xạ bí danh khách hàng khỏi Supabase Postgres
 */
export async function deleteCustomerAliasFromDb(alias: string): Promise<boolean> {
  const db = getDbPool();
  if (!db) return false;
  try {
    await ensureTables();
    await db.query('DELETE FROM dang_tai_customer_aliases WHERE alias = $1', [alias]);
    return true;
  } catch (err) {
    console.warn('[DB deleteCustomerAlias Warning]:', err);
    return false;
  }
}

/**
 * Đọc danh sách mẻ trấu theo tháng từ Supabase Postgres
 */
export async function getHuskMonthlyFromDb(monthKey: string): Promise<any[] | null> {
  const db = getDbPool();
  if (!db) return null;
  try {
    await ensureTables();
    const res = await db.query('SELECT items FROM husk_monthly_records WHERE month_key = $1', [monthKey]);
    if (res.rows.length > 0 && Array.isArray(res.rows[0].items)) {
      return res.rows[0].items;
    }
    return null;
  } catch (err) {
    console.warn('[DB getHuskMonthly Warning]:', err);
    return null;
  }
}

/**
 * Lưu danh sách mẻ trấu theo tháng vào Supabase Postgres
 */
export async function saveHuskMonthlyToDb(monthKey: string, items: any[]): Promise<boolean> {
  const db = getDbPool();
  if (!db) return false;
  try {
    await ensureTables();
    await db.query(
      `INSERT INTO husk_monthly_records (month_key, items, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (month_key) DO UPDATE SET
         items = EXCLUDED.items,
         updated_at = NOW()`,
      [monthKey, JSON.stringify(items)]
    );
    return true;
  } catch (err) {
    console.warn('[DB saveHuskMonthly Warning]:', err);
    return false;
  }
}

/**
 * Đọc bảng mật khẩu phân quyền từ Supabase Postgres
 */
export async function getRolePasswordsFromDb(): Promise<Record<string, string> | null> {
  const db = getDbPool();
  if (!db) return null;
  try {
    await ensureTables();
    const res = await db.query('SELECT role_key, password_value FROM app_role_passwords');
    if (!res.rows || res.rows.length === 0) return null;
    const map: Record<string, string> = {};
    for (const row of res.rows) {
      if (row.role_key && row.password_value) {
        map[String(row.role_key)] = String(row.password_value);
      }
    }
    return map;
  } catch (err) {
    console.warn('[DB getRolePasswords Warning]:', err);
    return null;
  }
}

/**
 * Lưu bảng mật khẩu phân quyền vào Supabase Postgres
 */
export async function saveRolePasswordsToDb(passwords: Record<string, string>): Promise<boolean> {
  const db = getDbPool();
  if (!db) return false;
  try {
    await ensureTables();
    for (const [roleKey, passwordValue] of Object.entries(passwords)) {
      await db.query(
        `INSERT INTO app_role_passwords (role_key, password_value, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (role_key) DO UPDATE SET
           password_value = EXCLUDED.password_value,
           updated_at = NOW()`,
        [roleKey, passwordValue]
      );
    }
    return true;
  } catch (err) {
    console.warn('[DB saveRolePasswords Warning]:', err);
    return false;
  }
}

export async function getVehicleBoardFromDb(boardKey = 'default'): Promise<unknown | null> {
  const db = getDbPool();
  if (!db) return null;
  try {
    await ensureTables();
    const res = await db.query(
      'SELECT state FROM vehicle_board_state WHERE board_key = $1 LIMIT 1',
      [boardKey]
    );
    if (!res.rows || res.rows.length === 0) return null;
    return res.rows[0].state ?? null;
  } catch (err) {
    console.warn('[DB getVehicleBoard Warning]:', err);
    return null;
  }
}

export async function saveVehicleBoardToDb(state: unknown, boardKey = 'default'): Promise<boolean> {
  const db = getDbPool();
  if (!db) return false;
  try {
    await ensureTables();
    await db.query(
      `INSERT INTO vehicle_board_state (board_key, state, updated_at)
       VALUES ($1, $2::jsonb, NOW())
       ON CONFLICT (board_key) DO UPDATE SET
         state = EXCLUDED.state,
         updated_at = NOW()`,
      [boardKey, JSON.stringify(state)]
    );
    return true;
  } catch (err) {
    console.warn('[DB saveVehicleBoard Warning]:', err);
    return false;
  }
}

export async function getDailyPlanFromDb(planDate: string): Promise<unknown | null> {
  const db = getDbPool();
  if (!db) return null;
  try {
    await ensureTables();
    const res = await db.query(
      'SELECT plan FROM vehicle_daily_plans WHERE plan_date = $1 LIMIT 1',
      [planDate]
    );
    if (!res.rows || res.rows.length === 0) return null;
    return res.rows[0].plan ?? null;
  } catch (err) {
    console.warn('[DB getDailyPlan Warning]:', err);
    return null;
  }
}

export async function saveDailyPlanToDb(planDate: string, plan: unknown): Promise<boolean> {
  const db = getDbPool();
  if (!db) return false;
  try {
    await ensureTables();
    await db.query(
      `INSERT INTO vehicle_daily_plans (plan_date, plan, updated_at)
       VALUES ($1, $2::jsonb, NOW())
       ON CONFLICT (plan_date) DO UPDATE SET
         plan = EXCLUDED.plan,
         updated_at = NOW()`,
      [planDate, JSON.stringify(plan)]
    );
    return true;
  } catch (err) {
    console.warn('[DB saveDailyPlan Warning]:', err);
    return false;
  }
}
