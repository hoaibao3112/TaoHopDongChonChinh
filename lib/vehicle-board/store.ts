import fs from 'fs';
import path from 'path';
import {
  getDailyPlanFromDb,
  getLatestDailyPlanBeforeDateFromDb,
  getLatestVehicleBoardBeforeDateFromDb,
  getVehicleBoardFromDb,
  saveDailyPlanToDb,
  saveVehicleBoardToDb,
} from '@/lib/db';
import {
  createDefaultVehicleBoardState,
  createEmptyDailyPlan,
  sanitizeBoardState,
} from './defaults';
import { DailyIntakePlan, VehicleBoardState } from './types';

function getBoardDir(): string {
  const dir = path.join(process.cwd(), 'data', 'vehicle-board');
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch {}
  }
  return dir;
}

function getBoardFilePath(boardKey = 'default'): string {
  const safeKey = boardKey.replace(/[^0-9a-zA-Z_-]/g, '');
  try {
    return path.join(getBoardDir(), `${safeKey === 'default' ? 'board' : `board-${safeKey}`}.json`);
  } catch {
    return `/tmp/vehicle-board-${safeKey}.json`;
  }
}

function getRedisConfig(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL?.replace(/\/$/, '');
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return { url, token };
}

async function readBoardExact(boardKey: string): Promise<VehicleBoardState | null> {
  // 1. PostgreSQL
  try {
    const dbRaw = await getVehicleBoardFromDb(boardKey);
    if (dbRaw && typeof dbRaw === 'object') {
      const sanitized = sanitizeBoardState(dbRaw as Partial<VehicleBoardState>);
      if (sanitized.vehicles.length > 0) return sanitized;
    }
  } catch (err) {
    console.warn('[VehicleBoard] DB read warning:', err);
  }

  // 2. Redis
  const redis = getRedisConfig();
  const redisKey = boardKey === 'default' ? 'app:vehicle_board' : `app:vehicle_board:${boardKey}`;
  if (redis) {
    try {
      const res = await fetch(`${redis.url}/get/${redisKey}`, {
        headers: { Authorization: `Bearer ${redis.token}` },
        cache: 'no-store',
      });
      if (res.ok) {
        const data = (await res.json()) as { result?: string };
        if (data.result && typeof data.result === 'string') {
          const parsed = JSON.parse(data.result) as Partial<VehicleBoardState>;
          const sanitized = sanitizeBoardState(parsed);
          if (sanitized.vehicles.length > 0) return sanitized;
        }
      }
    } catch (err) {
      console.warn('[VehicleBoard] Redis read warning:', err);
    }
  }

  // 3. File JSON cục bộ
  try {
    const filePath = getBoardFilePath(boardKey);
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<VehicleBoardState>;
      const sanitized = sanitizeBoardState(parsed);
      if (sanitized.vehicles.length > 0) return sanitized;
    }
  } catch (err) {
    console.warn('[VehicleBoard] File read warning:', err);
  }

  return null;
}

function findLatestBoardFileBefore(targetDate: string): { key: string; state: VehicleBoardState } | null {
  try {
    const dir = getBoardDir();
    if (!fs.existsSync(dir)) return null;
    const files = fs.readdirSync(dir);
    const datedKeys = files
      .map((f) => {
        const m = f.match(/^board-(\d{4}-\d{2}-\d{2})\.json$/);
        return m ? m[1] : null;
      })
      .filter((d): d is string => Boolean(d && d < targetDate))
      .sort((a, b) => b.localeCompare(a));

    for (const d of datedKeys) {
      try {
        const raw = fs.readFileSync(path.join(dir, `board-${d}.json`), 'utf8');
        const parsed = JSON.parse(raw) as Partial<VehicleBoardState>;
        const sanitized = sanitizeBoardState(parsed);
        if (sanitized.vehicles.length > 0) {
          return { key: d, state: sanitized };
        }
      } catch {}
    }

    const legacyFile = path.join(dir, 'board.json');
    if (fs.existsSync(legacyFile)) {
      const raw = fs.readFileSync(legacyFile, 'utf8');
      const parsed = JSON.parse(raw) as Partial<VehicleBoardState>;
      const sanitized = sanitizeBoardState(parsed);
      if (sanitized.vehicles.length > 0) {
        return { key: 'default', state: sanitized };
      }
    }
  } catch {}
  return null;
}

export async function getVehicleBoardState(dateKey?: string): Promise<VehicleBoardState> {
  const targetKey = dateKey && /^\d{4}-\d{2}-\d{2}$/.test(dateKey) ? dateKey : 'default';

  // 1. Đọc đúng ngày yêu cầu
  const exact = await readBoardExact(targetKey);
  if (exact) {
    return {
      ...exact,
      date: targetKey === 'default' ? undefined : targetKey,
      inheritedFromDate: undefined,
    };
  }

  // 2. Nếu ngày mới chưa có dữ liệu -> kế thừa từ ngày gần nhất trước đó (giữ nguyên ngày cũ)
  if (targetKey !== 'default') {
    const dbPrev = await getLatestVehicleBoardBeforeDateFromDb(targetKey);
    if (dbPrev && dbPrev.state && typeof dbPrev.state === 'object') {
      const sanitized = sanitizeBoardState(dbPrev.state as Partial<VehicleBoardState>);
      if (sanitized.vehicles.length > 0) {
        return {
          ...sanitized,
          date: targetKey,
          inheritedFromDate: dbPrev.boardKey,
        };
      }
    }

    const filePrev = findLatestBoardFileBefore(targetKey);
    if (filePrev) {
      return {
        ...filePrev.state,
        date: targetKey,
        inheritedFromDate: filePrev.key,
      };
    }

    const legacy = await readBoardExact('default');
    if (legacy) {
      return {
        ...legacy,
        date: targetKey,
        inheritedFromDate: 'default',
      };
    }
  }

  // 3. Mặc định ban đầu
  const def = createDefaultVehicleBoardState();
  return {
    ...def,
    date: targetKey === 'default' ? undefined : targetKey,
  };
}

export async function saveVehicleBoardState(
  rawState: Partial<VehicleBoardState>,
  dateKey?: string
): Promise<VehicleBoardState> {
  const targetKey =
    dateKey && /^\d{4}-\d{2}-\d{2}$/.test(dateKey)
      ? dateKey
      : rawState.date && /^\d{4}-\d{2}-\d{2}$/.test(rawState.date)
      ? rawState.date
      : 'default';

  const sanitized = sanitizeBoardState({
    ...rawState,
    date: targetKey === 'default' ? undefined : targetKey,
    inheritedFromDate: undefined,
    updatedAt: new Date().toISOString(),
  });
  const payload: VehicleBoardState = {
    ...sanitized,
    date: targetKey === 'default' ? undefined : targetKey,
  };

  // 1. PostgreSQL
  try {
    await saveVehicleBoardToDb(payload, targetKey);
  } catch (err) {
    console.warn('[VehicleBoard] DB write warning:', err);
  }

  // 2. Redis
  const redis = getRedisConfig();
  const redisKey = targetKey === 'default' ? 'app:vehicle_board' : `app:vehicle_board:${targetKey}`;
  if (redis) {
    try {
      await fetch(`${redis.url}/set/${redisKey}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${redis.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(JSON.stringify(payload)),
      });
    } catch (err) {
      console.warn('[VehicleBoard] Redis write warning:', err);
    }
  }

  // 3. File JSON cục bộ
  try {
    const filePath = getBoardFilePath(targetKey);
    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
  } catch (err) {
    console.warn('[VehicleBoard] File write warning:', err);
  }

  return payload;
}

function getDailyPlanDir(): string {
  const dir = path.join(process.cwd(), 'data', 'vehicle-board', 'plans');
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch {}
  }
  return dir;
}

function getDailyPlanFilePath(date: string): string {
  const safeDate = date.replace(/[^0-9-]/g, '');
  try {
    return path.join(getDailyPlanDir(), `${safeDate}.json`);
  } catch {
    return `/tmp/vehicle-plan-${safeDate}.json`;
  }
}

async function readDailyPlanExact(date: string): Promise<DailyIntakePlan | null> {
  // 1. PostgreSQL
  try {
    const dbRaw = await getDailyPlanFromDb(date);
    if (dbRaw && typeof dbRaw === 'object') {
      const parsed = dbRaw as DailyIntakePlan;
      if (Array.isArray(parsed.rows)) return parsed;
    }
  } catch (err) {
    console.warn('[DailyPlan] DB read warning:', err);
  }

  // 2. Redis
  const redis = getRedisConfig();
  if (redis) {
    try {
      const res = await fetch(`${redis.url}/get/app:vehicle_plan:${date}`, {
        headers: { Authorization: `Bearer ${redis.token}` },
        cache: 'no-store',
      });
      if (res.ok) {
        const data = (await res.json()) as { result?: string };
        if (data.result && typeof data.result === 'string') {
          const parsed = JSON.parse(data.result) as DailyIntakePlan;
          if (Array.isArray(parsed.rows)) return parsed;
        }
      }
    } catch (err) {
      console.warn('[DailyPlan] Redis read warning:', err);
    }
  }

  // 3. File JSON cục bộ
  try {
    const filePath = getDailyPlanFilePath(date);
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(raw) as DailyIntakePlan;
      if (Array.isArray(parsed.rows)) return parsed;
    }
  } catch (err) {
    console.warn('[DailyPlan] File read warning:', err);
  }

  return null;
}

function findLatestPlanFileBefore(targetDate: string): { date: string; plan: DailyIntakePlan } | null {
  try {
    const dir = getDailyPlanDir();
    if (!fs.existsSync(dir)) return null;
    const files = fs.readdirSync(dir);
    const dated = files
      .map((f) => {
        const m = f.match(/^(\d{4}-\d{2}-\d{2})\.json$/);
        return m ? m[1] : null;
      })
      .filter((d): d is string => Boolean(d && d < targetDate))
      .sort((a, b) => b.localeCompare(a));

    for (const d of dated) {
      try {
        const raw = fs.readFileSync(path.join(dir, `${d}.json`), 'utf8');
        const parsed = JSON.parse(raw) as DailyIntakePlan;
        if (Array.isArray(parsed.rows) && parsed.rows.length > 0) {
          return { date: d, plan: parsed };
        }
      } catch {}
    }
  } catch {}
  return null;
}

export async function getDailyIntakePlan(
  date: string
): Promise<{ plan: DailyIntakePlan; inheritedFromDate?: string }> {
  const exact = await readDailyPlanExact(date);
  if (exact) {
    return { plan: exact };
  }

  // Nếu ngày mới chưa có kế hoạch -> lấy nội dung cũ của ngày gần nhất trước đó để điều chỉnh (ngày cũ không đổi)
  const dbPrev = await getLatestDailyPlanBeforeDateFromDb(date);
  if (dbPrev && dbPrev.plan && typeof dbPrev.plan === 'object') {
    const prevPlan = dbPrev.plan as DailyIntakePlan;
    if (Array.isArray(prevPlan.rows) && prevPlan.rows.length > 0) {
      return {
        plan: {
          date,
          rows: prevPlan.rows.map((r, i) => ({ ...r, id: `plan-${date}-${i + 1}` })),
          updatedAt: new Date().toISOString(),
        },
        inheritedFromDate: dbPrev.planDate,
      };
    }
  }

  const filePrev = findLatestPlanFileBefore(date);
  if (filePrev) {
    return {
      plan: {
        date,
        rows: filePrev.plan.rows.map((r, i) => ({ ...r, id: `plan-${date}-${i + 1}` })),
        updatedAt: new Date().toISOString(),
      },
      inheritedFromDate: filePrev.date,
    };
  }

  return { plan: createEmptyDailyPlan(date) };
}

export async function saveDailyIntakePlan(plan: DailyIntakePlan): Promise<DailyIntakePlan> {
  const clean: DailyIntakePlan = {
    date: plan.date,
    rows: Array.isArray(plan.rows) ? plan.rows : [],
    updatedAt: new Date().toISOString(),
  };

  // 1. PostgreSQL
  try {
    await saveDailyPlanToDb(clean.date, clean);
  } catch (err) {
    console.warn('[DailyPlan] DB write warning:', err);
  }

  // 2. Redis
  const redis = getRedisConfig();
  if (redis) {
    try {
      await fetch(`${redis.url}/set/app:vehicle_plan:${clean.date}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${redis.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(JSON.stringify(clean)),
      });
    } catch (err) {
      console.warn('[DailyPlan] Redis write warning:', err);
    }
  }

  // 3. File JSON cục bộ
  try {
    const filePath = getDailyPlanFilePath(clean.date);
    fs.writeFileSync(filePath, JSON.stringify(clean, null, 2), 'utf8');
  } catch (err) {
    console.warn('[DailyPlan] File write warning:', err);
  }

  return clean;
}
