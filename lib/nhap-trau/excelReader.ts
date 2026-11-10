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
} from './config'
import { extractRangesFromFormula } from './formulaUpdater'

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

  const metadata = extractWorkbookMetadata(workbook, input instanceof File ? input.name : 'workbook.xlsx')

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
    // Tìm dòng dữ liệu cuối cùng có giá trị
    for (let r = mainSheet.rowCount; r >= 4; r--) {
      const row = mainSheet.getRow(r)
      const dateVal = row.getCell('A').value
      const vehVal = row.getCell('C').value
      if (dateVal !== null && dateVal !== undefined && dateVal !== '') {
        mainLastRow = Math.max(mainLastRow, r)
      } else if (vehVal !== null && vehVal !== undefined && vehVal !== '') {
        mainLastRow = Math.max(mainLastRow, r)
      }
    }

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
        // Xe: C=Khách, E=Số phương tiện
        const custNameXe = row.getCell('C').value ? String(row.getCell('C').value).trim() : ''
        const xeListStr = row.getCell('E').value ? String(row.getCell('E').value).trim() : ''
        if (custNameXe && xeListStr) {
          if (!vehicleMap[custNameXe]) vehicleMap[custNameXe] = new Set()
          xeListStr.split('\n').forEach((v) => {
            const clean = v.trim()
            if (clean) vehicleMap[custNameXe].add(clean)
          })
        }

        // Ghe: J=Khách, K=Tên ghe/tài xế
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
    // Bỏ qua các sheet được bảo vệ
    if (PROTECTED_SHEETS.includes(sheetName)) return

    const isVisible = ws.state === 'visible'
    const preConfig = PRECONFIGURED_CUSTOMER_SHEETS[sheetName] || {}
    const contracts: ContractInfo[] = []
    const warnings: string[] = []

    // Quét các dòng 2 đến 15 để phát hiện bảng hợp đồng & công thức SUM
    const maxHeaderScan = Math.min(ws.rowCount, 25)
    for (let r = 2; r <= maxHeaderScan; r++) {
      const row = ws.getRow(r)

      // Tìm cell chứa công thức SUM
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

            // Tìm label hợp đồng: thường ở cột B hoặc C cùng dòng
            const labelCellVal = row.getCell('B').value || row.getCell('C').value || row.getCell('A').value
            const labelStr = labelCellVal ? String(labelCellVal).trim() : `Hợp đồng dòng ${r}`

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

            contracts.push({
              row: r,
              label: labelStr,
              slKg,
              colSoLuong: primaryRange.colStart,
              sumCell: sumCellAddr,
              sumRange: ranges[0].original,
              dataRowStart: primaryRange.rowStart,
              dataRowEnd: primaryRange.rowEnd,
              currentReceivedKg: currentReceived,
              remainingKg: slKg > 0 ? Math.max(0, slKg - currentReceived) : undefined,
            })
          }
        }
      }
    }

    // Kiểm tra các đặc điểm riêng của sheet
    if (sheetName.includes('CẨM')) {
      warnings.push('Hợp đồng có thể sử dụng SUM gộp cả 2 cột Xe và Ghe.')
    }
    if (sheetName.includes('TRANG BẾN TRE')) {
      warnings.push('Bố cục sheet phức tạp với nhiều hợp đồng có cột khác nhau.')
    }

    customerSheetsMeta.push({
      sheetName,
      customerName: sheetName.replace(/\(.*?\)/g, '').trim(),
      state: isVisible ? 'visible' : 'hidden',
      headerRow: preConfig.headerRow || 7,
      dataStartRow: preConfig.dataStartRow || 8,
      colDate: preConfig.colDate || 'B',
      colVehicle: preConfig.colVehicle || 'C',
      colNote: preConfig.colNote || 'D',
      colXe: preConfig.colXe || 'E',
      colGhe: preConfig.colGhe || 'F',
      contracts,
      warnings,
    })
  })

  // Format vehicles map
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
