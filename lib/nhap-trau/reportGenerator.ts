import ExcelJS from 'exceljs'
import type { ShipmentEntry, WorkbookMetadata } from './types'
import { SHEET_NAMES } from './config'
import { normalizeDate } from './validator'
import { findActualMainLastRow, findSummaryBoxStartRow, isDateLikeCell } from './excelReader'

export interface DailyReportResult {
  dateDisplay: string // DD/MM/YYYY
  dailyShipmentText: string
  contractBalanceText: string
  combinedText: string
  totalKg: number
  hdKg: number
  csKg: number
  totalRemainingKg: number
  contractCount: number
}

interface DailyCustomerAgg {
  displayName: string
  totalKg: number
  xeCount: number
  gheCount: number
}

interface ParsedQ3ContractMeta {
  index: number
  displayName: string
  expiryText: string
}

/**
 * Tìm worksheet an toàn bất kể chuẩn Unicode NFD/NFC hay khoảng trắng thừa.
 */
export function findWorksheetSafe(
  workbook: ExcelJS.Workbook,
  targetName: string
): ExcelJS.Worksheet | undefined {
  const normTarget = targetName.normalize('NFC').trim().toLowerCase()
  return workbook.worksheets.find(
    (ws) => ws.name.normalize('NFC').trim().toLowerCase() === normTarget
  )
}

/**
 * Format số kiểu Việt Nam dùng dấu chấm phân cách hàng nghìn (vd: 57610 -> 57.610).
 */
export function formatViNumber(num: number): string {
  return Math.round(num)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

/**
 * Format số nguyên có tối thiểu 2 chữ số (vd: 2 -> 02, 11 -> 11).
 */
function pad2(num: number): string {
  return num < 10 ? `0${num}` : `${num}`
}

/**
 * Format YYYY-MM-DD -> DD/MM/YYYY
 */
export function formatDateDDMMYYYY(dateStr: string): string {
  const norm = normalizeDate(dateStr)
  const parts = norm.split('-')
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`
  }
  return dateStr
}

/**
 * Chuyển tên khách hàng viết hoa trong sổ tổng thành tên hiển thị gọn đẹp trên báo cáo Zalo.
 */
const REPORT_CUSTOMER_DISPLAY_MAP: Record<string, string> = {
  'TRANG BẾN TRE': 'Trang Bến Tre',
  'CHỊ MAI (TBN)': 'Chị Mai TBN',
  'CÔ LIỄU': 'Cô Liễu',
  'PHAN TIẾN': 'Phan Tiến',
  'NAM HH': 'Nam HH',
  'CHỊ 7 (CTC)': 'Chị 7 (CTC)',
  'CẨM THANH XUÂN': 'Cẩm Thanh Xuân',
  'ĐĂNG THÀNH PHÁT': 'Đăng Thành Phát',
  'GIANG THANH BÌNH': 'Giang Thanh Bình',
  'CHỊ BÉ BA (LMA)': 'Chị Bé Ba (LMA)',
  'CHỊ BÉ BA (TTM)': 'Chị Bé Ba (TTM)',
  'MY TÂM': 'My Tâm',
  'TRÂM ANH': 'Trâm Anh',
  'ĐƯỢC PHƯỜNG': 'Được Phường',
}

function getCustomerReportDisplayName(rawName: string): string {
  const upper = rawName.normalize('NFC').trim().toUpperCase()
  if (REPORT_CUSTOMER_DISPLAY_MAP[upper]) {
    return REPORT_CUSTOMER_DISPLAY_MAP[upper]
  }
  // Title case fallback
  return rawName
    .trim()
    .toLowerCase()
    .replace(/(^|\s)\S/g, (l) => l.toUpperCase())
}

/**
 * Đọc bảng tên hiển thị và ngày hết HĐ từ ô Q3 (mẫu báo cáo cũ trong sheet Tổng HĐ)
 */
function parseQ3TemplateMeta(q3Text: string): ParsedQ3ContractMeta[] {
  const results: ParsedQ3ContractMeta[] = []
  if (!q3Text) return results

  const lines = q3Text.split(/\r?\n/)
  for (const line of lines) {
    // Pattern: 1_Chị Bé Bảy (Châu Thị Chi): 416.779 (kg) x 1.700đ =>(ngày hết HĐ 15/10/2026)
    const match = line.match(
      /^\s*(\d+)_\s*([^:]+?):\s*[\d.,]+\s*\(kg\).*?(?:\(\s*(?:ngày hết\s*HĐ[^)]*)\)|=>\s*(.*))/i
    )
    if (match) {
      const idx = parseInt(match[1], 10)
      const displayName = match[2].trim()
      // Lấy nguyên phần ngày hết HĐ ở cuối dòng
      const expMatch = line.match(/(=>\s*\([^)]+\).*)$/)
      const expiryText = expMatch ? expMatch[1].trim() : ''
      results.push({ index: idx, displayName, expiryText })
    }
  }
  return results
}

/**
 * Cộng 1 tháng từ ngày ký HĐ để suy ra ngày hết HĐ mặc định nếu chưa có trong mẫu.
 */
function computeDefaultExpiryDate(signDate: Date | null): string {
  if (!signDate || isNaN(signDate.getTime())) return ''
  const d = new Date(signDate.getTime())
  d.setUTCMonth(d.getUTCMonth() + 1)
  const day = pad2(d.getUTCDate())
  const month = pad2(d.getUTCMonth() + 1)
  const year = d.getUTCFullYear()
  return `=>(ngày hết HĐ ${day}/${month}/${year})`
}

/**
 * Sinh toàn bộ 2 đoạn báo cáo văn bản tự động theo đúng mẫu thực tế của người dùng.
 */
export function generateDailyReports(
  workbook: ExcelJS.Workbook,
  pendingEntries: ShipmentEntry[],
  targetDateStr: string,
  metadata?: WorkbookMetadata
): DailyReportResult {
  const normTargetDate = normalizeDate(targetDateStr)
  const dateDisplay = formatDateDDMMYYYY(normTargetDate)

  // ─── 1. TỔNG HỢP BÁO CÁO XUẤT TRẤU TRONG NGÀY (ĐOẠN 1) ──────────────────────
  interface DailyRowItem {
    team: string
    vehicleName: string
    kgXe: number
    kgGhe: number
    customer: string
    note: string
  }

  const dailyItems: DailyRowItem[] = []

  // A. Quét các chuyến ĐÃ CÓ trong sổ tổng "Xuat Trấu Cty" của ngày targetDateStr
  const mainSheet = findWorksheetSafe(workbook, SHEET_NAMES.MAIN)
  if (mainSheet) {
    const lastRow = findActualMainLastRow(mainSheet)
    const scanStart = Math.max(4, lastRow - 400)
    for (let r = scanStart; r <= lastRow; r++) {
      const row = mainSheet.getRow(r)
      const dateVal = row.getCell('A').value
      if (!isDateLikeCell(dateVal)) continue

      let rowDateNorm = ''
      if (dateVal instanceof Date) {
        rowDateNorm = dateVal.toISOString().split('T')[0]
      } else {
        rowDateNorm = normalizeDate(String(dateVal))
      }

      if (rowDateNorm === normTargetDate) {
        const team = String(row.getCell('B').value || '').trim()
        const vehicleName = String(row.getCell('C').value || '').trim()
        const kgXe = Number(row.getCell('D').value) || 0
        const kgGhe = Number(row.getCell('E').value) || 0
        const customer = String(row.getCell('H').value || '').trim()
        const note = String(row.getCell('I').value || '').trim()

        if (kgXe > 0 || kgGhe > 0) {
          dailyItems.push({ team, vehicleName, kgXe, kgGhe, customer, note })
        }
      }
    }
  }

  // B. Cộng thêm các phiếu ĐANG NHẬP MỚI trong pendingEntries có ngày = targetDateStr
  for (const entry of pendingEntries) {
    if (normalizeDate(entry.date) !== normTargetDate) continue
    const kg = Number(entry.weightKg) || 0
    if (kg <= 0) continue

    const sheetMeta = metadata?.customerSheets.find(
      (s) => s.sheetName === entry.targetSheetName
    )
    const customerName =
      sheetMeta?.mainCustomerName || entry.customer || entry.targetSheetName

    dailyItems.push({
      team: entry.team || '',
      vehicleName: entry.vehicleName || '',
      kgXe: entry.type === 'Xe' ? kg : 0,
      kgGhe: entry.type === 'Ghe' ? kg : 0,
      customer: customerName,
      note: entry.note || 'HĐ',
    })
  }

  // C. Tính toán các chỉ số tổng hợp của ngày
  let totalKg = 0
  let hdKg = 0
  let csKg = 0
  let xeKg = 0
  let xeCount = 0
  let gheKg = 0
  let gheCount = 0

  let nsxKg = 0
  let nsxCount = 0
  let xnkKg = 0
  let xnkCount = 0

  const customerAggMap = new Map<string, DailyCustomerAgg>()

  for (const item of dailyItems) {
    const rowKg = item.kgXe + item.kgGhe
    totalKg += rowKg

    if (/cơ\s*sở|cs\s*[12]/i.test(item.note)) {
      csKg += rowKg
    } else {
      hdKg += rowKg
    }

    if (item.kgXe > 0) {
      xeKg += item.kgXe
      xeCount++
      if (/nsx/i.test(item.team)) {
        nsxKg += item.kgXe
        nsxCount++
      } else if (/xnk/i.test(item.team)) {
        xnkKg += item.kgXe
        xnkCount++
      }
    }

    if (item.kgGhe > 0) {
      gheKg += item.kgGhe
      gheCount++
    }

    const displayCust = getCustomerReportDisplayName(item.customer)
    const key = displayCust.toUpperCase()
    const existing = customerAggMap.get(key) || {
      displayName: displayCust,
      totalKg: 0,
      xeCount: 0,
      gheCount: 0,
    }
    existing.totalKg += rowKg
    if (item.kgXe > 0) existing.xeCount++
    if (item.kgGhe > 0) existing.gheCount++
    customerAggMap.set(key, existing)
  }

  // D. Dựng chuỗi văn bản Đoạn 1
  const lines1: string[] = []
  lines1.push(`Dạ em gửi báo cáo xuất trấu ngày ${dateDisplay}`)
  lines1.push(`Tổng lượng: ${formatViNumber(totalKg)} kg`)
  lines1.push(`Xuất HĐ: ${hdKg > 0 ? `${formatViNumber(hdKg)} kg` : 'Không xuất'}`)
  lines1.push(`Xuất Cơ sở: ${csKg > 0 ? `${formatViNumber(csKg)} kg` : 'Không xuất'}`)

  if (xeKg > 0) {
    lines1.push(`1_Xuất xe: ${formatViNumber(xeKg)} kg (${pad2(xeCount)} xe)`)
    if (nsxCount > 0 || xnkCount > 0) {
      if (nsxCount > 0) lines1.push(`+ NSX: ${formatViNumber(nsxKg)} kg (${pad2(nsxCount)} xe)`)
      if (xnkCount > 0) lines1.push(`+ XNK: ${formatViNumber(xnkKg)} kg (${pad2(xnkCount)} xe)`)
    }
  } else {
    lines1.push(`1_Xuất xe: Không xuất xe`)
  }

  if (gheKg > 0) {
    lines1.push(`2_ Xuất ghe: ${formatViNumber(gheKg)} kg (${pad2(gheCount)} ghe)`)
  } else {
    lines1.push(`2_ Xuất ghe: Không xuất ghe`)
  }

  lines1.push(`* Trong đó:`)
  let custIdx = 1
  customerAggMap.forEach((agg) => {
    const vehicleParts: string[] = []
    if (agg.xeCount > 0) vehicleParts.push(`${pad2(agg.xeCount)} xe`)
    if (agg.gheCount > 0) vehicleParts.push(`${pad2(agg.gheCount)} ghe`)
    const vehText = vehicleParts.length > 0 ? ` (${vehicleParts.join(', ')})` : ''
    lines1.push(`${custIdx}_${agg.displayName}: ${formatViNumber(agg.totalKg)} kg${vehText}`)
    custIdx++
  })
  if (customerAggMap.size === 0) {
    lines1.push(`(Chưa có chuyến xuất nào trong ngày ${dateDisplay})`)
  }

  const dailyShipmentText = lines1.join('\n')

  // ─── 2. TỔNG HỢP BÁO CÁO HỢP ĐỒNG & TỒN KHO (ĐOẠN 2) ──────────────────────
  const tongHdSheet = findWorksheetSafe(workbook, SHEET_NAMES.SUMMARY)
  const lines2: string[] = []
  let totalRemainingKg = 0
  let contractCount = 0

  if (tongHdSheet) {
    const q3Raw = String(tongHdSheet.getCell('Q3').value || '')
    const parsedQ3 = parseQ3TemplateMeta(q3Raw)

    // Tính số kg mới xuất theo từng (sheetName, sumCell) từ pendingEntries (chỉ tính các phiếu xuất HĐ)
    const addedByTarget = new Map<string, number>()
    for (const entry of pendingEntries) {
      if (/cơ\s*sở|cs\s*[12]/i.test(entry.note || '')) continue
      const kg = Number(entry.weightKg) || 0
      if (kg <= 0 || !entry.targetSheetName) continue

      const sheetMeta = metadata?.customerSheets.find(
        (s) => s.sheetName === entry.targetSheetName
      )
      const contractMeta = sheetMeta?.contracts.find((c) => c.row === entry.contractRow)
      if (contractMeta) {
        const key = `${entry.targetSheetName.normalize('NFC').trim().toUpperCase()}!${contractMeta.sumCell.toUpperCase()}`
        addedByTarget.set(key, (addedByTarget.get(key) || 0) + kg)
      }
    }

    const contractDetailLines: string[] = []

    for (let r = 4; r <= 30; r++) {
      const row = tongHdSheet.getRow(r)
      const rawName = row.getCell('B').value
      const qtyContract = Number(row.getCell('G').value) || 0
      if (!rawName || qtyContract <= 0) continue

      const idx = contractDetailLines.length + 1
      const price = Number(row.getCell('E').value) || 0
      const signDateVal = row.getCell('D').value
      const signDate = signDateVal instanceof Date ? signDateVal : null

      // Đọc giá trị tồn hiện có ở cột I hoặc tính từ G - H
      const hCell = row.getCell('H')
      const iCell = row.getCell('I')

      let currentExported = 0
      if (typeof hCell.result === 'number') {
        currentExported = hCell.result
      } else if (typeof hCell.value === 'number') {
        currentExported = hCell.value
      }

      let currentRemaining = 0
      if (typeof iCell.result === 'number') {
        currentRemaining = iCell.result
      } else if (typeof iCell.value === 'number') {
        currentRemaining = iCell.value
      } else {
        currentRemaining = Math.max(0, qtyContract - currentExported)
      }

      // Kiểm tra công thức liên kết ở cột H: ví dụ ='CHỊ 7 (CTC)'!F6
      let linkFormula = ''
      if (hCell.formula) {
        linkFormula = hCell.formula
      } else if (typeof hCell.value === 'object' && hCell.value !== null && 'formula' in hCell.value) {
        linkFormula = (hCell.value as { formula: string }).formula
      }

      let addedKg = 0
      if (linkFormula) {
        const refMatch = linkFormula.match(/^'?([^'!]+)'?!([A-Z]+\d+)$/i)
        if (refMatch) {
          const refSheet = refMatch[1].normalize('NFC').trim().toUpperCase()
          const refCell = refMatch[2].toUpperCase()
          addedKg = addedByTarget.get(`${refSheet}!${refCell}`) || 0
        }
      }

      const finalRemaining = Math.max(0, currentRemaining - addedKg)
      totalRemainingKg += finalRemaining

      // Lấy tên hiển thị và ngày hết HĐ từ mẫu Q3 tương ứng nếu khớp số thứ tự
      const q3Match = parsedQ3.find((p) => p.index === idx)
      const displayName = q3Match?.displayName || String(rawName).trim()
      const expiryStr = q3Match?.expiryText || computeDefaultExpiryDate(signDate)

      contractDetailLines.push(
        `${idx}_${displayName}: ${formatViNumber(finalRemaining)} (kg) x ${formatViNumber(price)}đ ${expiryStr}`.trim()
      )
    }

    contractCount = contractDetailLines.length
    lines2.push(`Dạ em gửi báo cáo hợp đồng & xuất trấu:`)
    lines2.push(`Ngày ${dateDisplay}`)
    lines2.push(`Xuất HĐ: ${formatViNumber(hdKg)} (kg)`)
    lines2.push(`Tổng tồn: ${formatViNumber(totalRemainingKg)} (kg)`)
    lines2.push(`Tổng: ${contractCount} hợp đồng`)
    lines2.push(`* Trong đó:`)
    lines2.push(...contractDetailLines)
  }

  const contractBalanceText = lines2.join('\n')
  const combinedText = [dailyShipmentText, contractBalanceText].filter(Boolean).join('\n\n')

  return {
    dateDisplay,
    dailyShipmentText,
    contractBalanceText,
    combinedText,
    totalKg,
    hdKg,
    csKg,
    totalRemainingKg,
    contractCount,
  }
}

/**
 * Cập nhật luôn 2 ô hộp báo cáo văn bản ngay bên trong file Excel trước khi xuất.
 */
export function updateExcelReportTextBoxes(
  workbook: ExcelJS.Workbook,
  report: DailyReportResult
): void {
  // 1. Cập nhật hộp màu xanh cuối sheet "Xuat Trấu Cty"
  const mainSheet = findWorksheetSafe(workbook, SHEET_NAMES.MAIN)
  if (mainSheet) {
    const summaryStart = findSummaryBoxStartRow(mainSheet, 4)
    if (summaryStart !== null) {
      // Hộp màu xanh được merge C{start}:F{end}, ô góc trên bên trái là C{start}
      const boxCell = mainSheet.getCell(`C${summaryStart}`)
      boxCell.value = report.dailyShipmentText
    }
  }

  // 2. Cập nhật ô Q3 và ngày tiêu đề B1 trên sheet "Tổng HĐ"
  const tongHdSheet = findWorksheetSafe(workbook, SHEET_NAMES.SUMMARY)
  if (tongHdSheet) {
    if (report.contractBalanceText) {
      tongHdSheet.getCell('Q3').value = report.contractBalanceText
    }
    const b1Val = String(tongHdSheet.getCell('B1').value || '')
    if (b1Val.includes('TÍNH ĐẾN HẾT NGÀY')) {
      tongHdSheet.getCell('B1').value = b1Val.replace(
        /TÍNH ĐẾN HẾT NGÀY\s+\d{1,2}\/\d{1,2}\/\d{4}/i,
        `TÍNH ĐẾN HẾT NGÀY ${report.dateDisplay}`
      )
    }
  }
}
