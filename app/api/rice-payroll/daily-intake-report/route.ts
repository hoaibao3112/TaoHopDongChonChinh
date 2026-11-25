import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';
import { isRequestAuthenticated } from '@/lib/auth';
import {
  parseDailyIntakeKhoExcel,
  parseDailyIntakeTuoiExcel,
  buildDailyIntakeReport,
  getYesterdayDateStr,
  DailyIntakeKhoRow,
  DailyIntakeTuoiRow,
} from '@/lib/rice-payroll/daily-intake-report';

const FILE_KHO_NAME = 'THINH_LUA_KHO.xlsx';
const FILE_TUOI_NAME = 'THINH_LUA_TUOI.xlsx';
const FILE_KHO_LEGACY = 'THỊNH_TỔNG NHẬP LÚA KHÔ NĂM 2026.xlsx';
const FILE_TUOI_LEGACY = 'THỊNH_TỔNG SỐ LIỆU NHẬP LÚA TƯƠI 2026.xlsx';

function resolveFilePath(cwd: string, newName: string, legacyName: string): string | null {
  try {
    const p1 = path.join(cwd, 'data', newName);
    if (fs.existsSync(p1)) return p1;
    const p2 = path.join(cwd, legacyName);
    if (fs.existsSync(p2)) return p2;
  } catch {}
  return null;
}

export async function GET(request: NextRequest) {
  if (!isRequestAuthenticated(request)) {
    return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const targetDate = searchParams.get('date')?.trim() || getYesterdayDateStr();

    const cwd = process.cwd();
    const pathKho = resolveFilePath(cwd, FILE_KHO_NAME, FILE_KHO_LEGACY);
    const pathTuoi = resolveFilePath(cwd, FILE_TUOI_NAME, FILE_TUOI_LEGACY);

    let khoRows: DailyIntakeKhoRow[] = [];
    let tuoiRows: DailyIntakeTuoiRow[] = [];

    if (pathKho) {
      try {
        khoRows = parseDailyIntakeKhoExcel(fs.readFileSync(pathKho));
      } catch (err) {
        console.warn('Lỗi đọc parse daily intake lúa khô:', err);
      }
    }

    if (pathTuoi) {
      try {
        tuoiRows = parseDailyIntakeTuoiExcel(fs.readFileSync(pathTuoi));
      } catch (err) {
        console.warn('Lỗi đọc parse daily intake lúa tươi:', err);
      }
    }

    const report = buildDailyIntakeReport(khoRows, tuoiRows, targetDate);

    return NextResponse.json({
      success: true,
      reportDate: targetDate,
      khoRows,
      tuoiRows,
      report,
    });
  } catch (error: unknown) {
    console.error('Lỗi tạo báo cáo nhập ngày:', error);
    return NextResponse.json(
      { error: 'Không thể tạo báo cáo nhập ngày: ' + (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}
