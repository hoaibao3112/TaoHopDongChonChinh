import ExcelJS from 'exceljs'
import type {
  WorkbookMetadata,
  CustomerSheetMeta,
  ContractInfo,
} from './types'
import {
  SHEET_NAMES,
  PROTECTED_SHEETS,
  PRECONFIGURED_CUSTOMER_SHEETS,
  getCustomerSheetConfig,
  parseTabName,
} from './config'
import { extractRangesFromFormula } from './formulaUpdater'

/**
 * Kiểm tra một ô có phải chứa ngày tháng hợp lệ không (tránh nhận nhầm text hộp báo cáo).
 */
export function isDateLikeCell(val: ExcelJS.CellValue): boolean {
  if (val instanceof Date) return true
  if (typeof val === 'string') {
    const clean = val.trim()
    return /^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}$/.test(clean) || /^\d{4}-\d{2}-\d{2}/.test(clean)
  }
  return false
}

/**
 * Tìm vị trí dòng bắt đầu của hộp báo cáo tổng kết (nếu có) trong sheet.
 */
export function findSummaryBoxStartRow(
  mainSheet: ExcelJS.Worksheet,
  fromRow: number = 4
): number | null {
  for (let r = fromRow; r <= mainSheet.rowCount; r++) {
    const row = mainSheet.getRow(r)
    for (let c = 1; c <= 10; c++) {
      const val = row.getCell(c).value
      if (
        typeof val === 'string' &&
        /báo cáo xuất trấu|dạ em gửi báo cáo|tổng lượng\s*:/i.test(val)
      ) {
        return r
      }
    }
  }
  return null
}

/**
 * Tìm dòng cuối cùng thực sự có dữ liệu chuyến xe/ghe trong Sổ tổng "Xuat Trấu Cty".
 * Luôn tìm Ở PHÍA TRÊN hộp báo cáo tổng kết (đảm bảo hộp báo cáo luôn nằm ở cuối cùng).
 */
export function findActualMainLastRow(mainSheet: ExcelJS.Worksheet): number {
  const summaryRow = findSummaryBoxStartRow(mainSheet, 4)
  const scanLimit = summaryRow ? summaryRow - 1 : mainSheet.rowCount

  for (let r = scanLimit; r >= 4; r--) {
    const row = mainSheet.getRow(r)
    const dateVal = row.getCell('A').value
    if (isDateLikeCell(dateVal)) {
      return r
    }
  }
  return 3
}

/**
 * Tìm dòng cuối cùng đã được ghi dữ liệu thực tế bên trong dải [dataRowStart .. dataRowEnd] của 1 hợp đồng.
 */
export function findLastUsedRowInRange(
  ws: ExcelJS.Worksheet,
  dataRowStart: number,
  dataRowEnd: number,
  colDate: string,
  colVehicle: string,
  colSoLuong: string
): number {
  for (let r = dataRowEnd; r >= dataRowStart; r--) {
    const row = ws.getRow(r)
    const dateVal = row.getCell(colDate).value
    const vehVal = row.getCell(colVehicle).value

    let qtyVal: ExcelJS.CellValue = null
    if (colSoLuong === 'EF') {
      qtyVal = row.getCell('E').value || row.getCell('F').value
    } else {
      qtyVal = row.getCell(colSoLuong).value
    }

    const hasQty = typeof qtyVal === 'number' && qtyVal !== 0
    const hasDate = isDateLikeCell(dateVal)
    const hasVeh = typeof vehVal === 'string' && vehVal.trim().length > 0

    if (hasDate || hasVeh || hasQty) {
      return r
    }
  }
  return dataRowStart - 1
}

/**
 * Đọc file Excel từ ArrayBuffer hoặc File và phân tích toàn bộ cấu trúc phục vụ app.
 */
export async function readWorkbook(
  input: ArrayBuffer | Uint8Array | File
): Promise<{ workbook: ExcelJS.Workbook; metadata: WorkbookMetadata }> {
  let buffer: ArrayBuffer

  if (input instanceof File) {
    buffer = await input.arrayBuffer()
  } else if (input instanceof Uint8Array) {
    buffer = input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength) as ArrayBuffer
  } else {
    buffer = input
  }

  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer)

  const metadata = extractWorkbookMetadata(
    workbook,
    input instanceof File ? input.name : 'workbook.xlsx'
  )

  return { workbook, metadata }
}

/**
 * Trích xuất toàn bộ metadata từ workbook đã nạp.
 */
export function extractWorkbookMetadata(
  workbook: ExcelJS.Workbook,
  fileName: string = 'workbook.xlsx'
): WorkbookMetadata {
  const customerList: string[] = []
  const vehicleMap: { [customer: string]: Set<string> } = {}
  const existingEntries: { date: string; vehicleName: string; customer: string }[] = []
  let mainLastRow = 3

  // 1. Quét sổ tổng "Xuat Trấu Cty"
  const mainSheet = workbook.getWorksheet(SHEET_NAMES.MAIN)
  if (mainSheet) {
    mainLastRow = findActualMainLastRow(mainSheet)

    // Thu thập 300 dòng gần nhất để đối chiếu trùng
    const scanStart = Math.max(4, mainLastRow - 300)
    for (let r = scanStart; r <= mainLastRow; r++) {
      const row = mainSheet.getRow(r)
      const dateCell = row.getCell('A')
      const vehCell = row.getCell('C')
      const custCell = row.getCell('H')

      let dateStr = ''
      if (dateCell.value instanceof Date) {
        dateStr = dateCell.value.toISOString().split('T')[0]
      } else if (dateCell.value) {
        dateStr = String(dateCell.value).trim()
      }

      const vehicleName = vehCell.value ? String(vehCell.value).trim() : ''
      const customer = custCell.value ? String(custCell.value).trim() : ''

      if (dateStr && vehicleName) {
        existingEntries.push({ date: dateStr, vehicleName, customer })
      }
    }
  }

  // 2. Quét THÔNG TIN KH
  const custSheet = workbook.getWorksheet(SHEET_NAMES.CUSTOMERS)
  if (custSheet) {
    custSheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber >= 4) {
        const nameVal = row.getCell('C').value
        if (nameVal) {
          const str = String(nameVal).trim()
          if (str && !customerList.includes(str)) {
            customerList.push(str)
          }
        }
      }
    })
  }

  // 3. Quét DS PHƯƠNG TIỆN
  const vehSheet = workbook.getWorksheet(SHEET_NAMES.VEHICLES)
  if (vehSheet) {
    vehSheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber >= 4) {
        const custNameXe = row.getCell('C').value ? String(row.getCell('C').value).trim() : ''
        const xeListStr = row.getCell('E').value ? String(row.getCell('E').value).trim() : ''
        if (custNameXe && xeListStr) {
          if (!vehicleMap[custNameXe]) vehicleMap[custNameXe] = new Set()
          xeListStr.split('\n').forEach((v) => {
            const clean = v.trim()
            if (clean) vehicleMap[custNameXe].add(clean)
          })
        }

        const custNameGhe = row.getCell('J').value ? String(row.getCell('J').value).trim() : ''
        const gheListStr = row.getCell('K').value ? String(row.getCell('K').value).trim() : ''
        if (custNameGhe && gheListStr) {
          if (!vehicleMap[custNameGhe]) vehicleMap[custNameGhe] = new Set()
          gheListStr.split('\n').forEach((v) => {
            const clean = v.trim()
            if (clean) vehicleMap[custNameGhe].add(clean)
          })
        }
      }
    })
  }

  // 4. Quét các tab khách hàng
  const customerSheetsMeta: CustomerSheetMeta[] = []

  workbook.eachSheet((ws) => {
    const sheetName = ws.name
    const normName = sheetName.normalize('NFC').trim().toLowerCase()
    if (PROTECTED_SHEETS.some((p) => p.normalize('NFC').trim().toLowerCase() === normName)) return

    const isVisible = ws.state === 'visible'
    // Chỉ lấy các tab hợp đồng đang hiển thị thực tế (bỏ qua sheet ẩn cũ như HIẾU CẦN THƠ, TIẾN CÁI BÈ...)
    if (!isVisible) return

    // Phân tích tên tab theo định dạng: <Tên KH> <Ngày ký ddMMyy><Số HĐ NN>
    const parsedTab = parseTabName(sheetName)
    const preConfig = getCustomerSheetConfig(sheetName) || {}
    const colDate = preConfig.colDate || 'B'
    const colVehicle = preConfig.colVehicle || 'C'
    const contracts: ContractInfo[] = []
    const warnings: string[] = []

    // Quét các dòng 2 đến 30 để phát hiện bảng hợp đồng & công thức SUM
    const maxHeaderScan = Math.min(ws.rowCount, 30)
    for (let r = 2; r <= maxHeaderScan; r++) {
      const row = ws.getRow(r)

      const labelCellVal = row.getCell('B').value || row.getCell('C').value || row.getCell('A').value
      const labelStr = labelCellVal ? String(labelCellVal).trim() : `Hợp đồng dòng ${r}`

      // Bỏ qua hàng "Tổng Hợp Đồng"
      if (/^Tổng\s+Hợp\s+Đồng/i.test(labelStr)) {
        continue
      }

      // Tìm cell chứa công thức SUM trên hàng này (ưu tiên cột E, F, J, L)
      for (let colIdx = 1; colIdx <= 16; colIdx++) {
        const cell = row.getCell(colIdx)
        let formulaStr = ''
        if (cell.formula) {
          formulaStr = cell.formula
        } else if (typeof cell.value === 'object' && cell.value !== null && 'formula' in cell.value) {
          formulaStr = (cell.value as { formula: string }).formula
        }

        if (formulaStr && /SUM\(/i.test(formulaStr)) {
          const ranges = extractRangesFromFormula(formulaStr)
          if (ranges.length > 0) {
            const primaryRange = ranges[0].parsed
            const colLetter = cell.address ? cell.address.replace(/[0-9]/g, '') : String.fromCharCode(64 + colIdx)
            const sumCellAddr = `${colLetter}${r}`

            // Phát hiện trường hợp SUM kép (ví dụ SUM(E23:E41)+SUM(F23:F41))
            const isDualEF =
              ranges.length >= 2 &&
              ranges.some((rg) => rg.parsed.colStart === 'E') &&
              ranges.some((rg) => rg.parsed.colStart === 'F')
            const colSoLuong = isDualEF ? 'EF' : primaryRange.colStart

            // Tìm số lượng HĐ (slKg): cột D hoặc E
            let slKg = 0
            const slVal = row.getCell('D').value || row.getCell('E').value
            if (typeof slVal === 'number') {
              slKg = slVal
            } else if (typeof slVal === 'string') {
              const parsed = parseFloat(slVal.replace(/[^0-9.]/g, ''))
              if (!isNaN(parsed)) slKg = parsed
            }

            // Giá trị đã nhận hiện tại
            let currentReceived = 0
            if (typeof cell.result === 'number') {
              currentReceived = cell.result
            } else if (typeof cell.value === 'number') {
              currentReceived = cell.value
            }

            const lastUsedRow = findLastUsedRowInRange(
              ws,
              primaryRange.rowStart,
              primaryRange.rowEnd,
              colDate,
              colVehicle,
              colSoLuong
            )

            contracts.push({
              row: r,
              label: labelStr,
              slKg,
              colSoLuong,
              sumCell: sumCellAddr,
              sumRange: ranges[0].original,
              dataRowStart: primaryRange.rowStart,
              dataRowEnd: primaryRange.rowEnd,
              lastUsedRow,
              currentReceivedKg: currentReceived,
              remainingKg: slKg > 0 ? Math.max(0, slKg - currentReceived) : undefined,
            })

            // Mỗi dòng HĐ thường chỉ lấy SUM chính đầu tiên
            break
          }
        }
      }
    }

    if (sheetName.includes('CẨM')) {
      warnings.push('Hợp đồng có sử dụng SUM gộp cả 2 cột Xe và Ghe.')
    }
    if (sheetName.includes('TRANG BẾN TRE')) {
      warnings.push('Vui lòng chọn đúng hợp đồng hiện tại của Trang Bến Tre.')
    }

    const customerDisplayName =
      preConfig.mainCustomerName ||
      (parsedTab.baseCustomerName ? parsedTab.baseCustomerName : sheetName.replace(/\(.*?\)/g, '').trim())

    customerSheetsMeta.push({
      sheetName,
      customerName: customerDisplayName,
      mainCustomerName: preConfig.mainCustomerName,
      state: isVisible ? 'visible' : 'hidden',
      headerRow: preConfig.headerRow || 7,
      dataStartRow: preConfig.dataStartRow || 8,
      colDate,
      colVehicle,
      colNote: preConfig.colNote || 'D',
      colXe: preConfig.colXe || 'E',
      colGhe: preConfig.colGhe || 'F',
      contracts,
      warnings,
      parsedContractDate: parsedTab.dateStr,
      parsedContractDateIso: parsedTab.dateIso,
      parsedContractSeq: parsedTab.contractSeq,
      hasMultipleContracts: parsedTab.hasMultipleContracts,
      tabSummary: parsedTab.summaryDescription,
    })
  })

  // Sắp xếp đưa các tab đang visible và có hợp đồng lên đầu cho dễ chọn
  customerSheetsMeta.sort((a, b) => {
    if (a.state !== b.state) return a.state === 'visible' ? -1 : 1
    return b.contracts.length - a.contracts.length
  })

  const vehiclesList = Object.entries(vehicleMap).map(([cust, vehSet]) => ({
    customerName: cust,
    vehicles: Array.from(vehSet),
  }))

  return {
    fileName,
    totalSheets: workbook.worksheets.length,
    mainSheetLastRow: mainLastRow,
    customers: customerList,
    vehicles: vehiclesList,
    customerSheets: customerSheetsMeta,
    existingMainEntries: existingEntries,
  }
}
