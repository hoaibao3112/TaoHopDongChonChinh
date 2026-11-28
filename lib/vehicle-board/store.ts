import fs from 'fs';
import path from 'path';
import {
  getDailyPlanFromDb,
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

function getBoardFilePath(): string {
  try {
    const dir = path.join(process.cwd(), 'data', 'vehicle-board');
    if (!fs.existsSync(dir)) {
      try {
        fs.mkdirSync(dir, { recursive: true });
      } catch {}
    }
    return path.join(dir, 'board.json');
  } catch {
    return '/tmp/vehicle-board.json';
  }
}

function getRedisConfig(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL?.replace(/\/$/, '');
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return { url, token };
}

export async function getVehicleBoardState(): Promise<VehicleBoardState> {
  // 1. PostgreSQL
  try {
    const dbRaw = await getVehicleBoardFromDb('default');
    if (dbRaw && typeof dbRaw === 'object') {
      const sanitized = sanitizeBoardState(dbRaw as Partial<VehicleBoardState>);
      if (sanitized.vehicles.length > 0) return sanitized;
    }
  } catch (err) {
    console.warn('[VehicleBoard] DB read warning:', err);
  }

  // 2. Redis
  const redis = getRedisConfig();
  if (redis) {
    try {
      const res = await fetch(`${redis.url}/get/app:vehicle_board`, {
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
    const filePath = getBoardFilePath();
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<VehicleBoardState>;
      const sanitized = sanitizeBoardState(parsed);
      if (sanitized.vehicles.length > 0) return sanitized;
    }
  } catch (err) {
    console.warn('[VehicleBoard] File read warning:', err);
  }

  // 4. Mặc định
  return createDefaultVehicleBoardState();
}

export async function saveVehicleBoardState(rawState: Partial<VehicleBoardState>): Promise<VehicleBoardState> {
  const sanitized = sanitizeBoardState({
    ...rawState,
    updatedAt: new Date().toISOString(),
  });

  // 1. PostgreSQL
  try {
    await saveVehicleBoardToDb(sanitized, 'default');
  } catch (err) {
    console.warn('[VehicleBoard] DB write warning:', err);
  }

  // 2. Redis
  const redis = getRedisConfig();
  if (redis) {
    try {
      await fetch(`${redis.url}/set/app:vehicle_board`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${redis.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(JSON.stringify(sanitized)),
      });
    } catch (err) {
      console.warn('[VehicleBoard] Redis write warning:', err);
    }
  }

  // 3. File JSON cục bộ
  try {
    const filePath = getBoardFilePath();
    fs.writeFileSync(filePath, JSON.stringify(sanitized, null, 2), 'utf8');
  } catch (err) {
    console.warn('[VehicleBoard] File write warning:', err);
  }

  return sanitized;
}

function getDailyPlanFilePath(date: string): string {
  const safeDate = date.replace(/[^0-9-]/g, '');
  try {
    const dir = path.join(process.cwd(), 'data', 'vehicle-board', 'plans');
    if (!fs.existsSync(dir)) {
      try {
        fs.mkdirSync(dir, { recursive: true });
      } catch {}
    }
    return path.join(dir, `${safeDate}.json`);
  } catch {
    return `/tmp/vehicle-plan-${safeDate}.json`;
  }
}

export async function getDailyIntakePlan(date: string): Promise<DailyIntakePlan> {
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

  return createEmptyDailyPlan(date);
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
