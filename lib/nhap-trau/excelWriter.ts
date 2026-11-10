import ExcelJS from 'exceljs'
import type {
  ShipmentEntry,
  WorkbookMetadata,
  WriteResult,
  ContractInfo,
} from './types'
import {
  SHEET_NAMES,
  PRECONFIGURED_CUSTOMER_SHEETS,
} from './config'
import {
  expandSumFormulaRange,
  shiftFormulaRows,
  updateSubtotalLastRow,
  updateAutoFilterRange,
} from './formulaUpdater'
import { validateBatchEntries, normalizeDate } from './validator'

/**
 * Hàm phân tích ngày sang đối tượng Date chuẩn.
 */
function parseDateValue(dateStr: string): Date {
  const normalized = normalizeDate(dateStr)
  const parts = normalized.split('-')
  if (parts.length === 3) {
    const year = parseInt(parts[0], 10)
    const month = parseInt(parts[1], 10) - 1
    const day = parseInt(parts[2], 10)
    return new Date(Date.UTC(year, month, day))
  }
  return new Date()
}

/**
 * Copy định dạng (font, border, fill, alignment, numFmt) từ ô nguồn sang ô đích.
 */
function copyCellStyle(sourceCell: ExcelJS.Cell, targetCell: ExcelJS.Cell): void {
  if (sourceCell.font) targetCell.font = { ...sourceCell.font }
  if (sourceCell.alignment) targetCell.alignment = { ...sourceCell.alignment }
  if (sourceCell.border) targetCell.border = { ...sourceCell.border }
  if (sourceCell.fill) targetCell.fill = { ...sourceCell.fill }
  if (sourceCell.numFmt) targetCell.numFmt = sourceCell.numFmt
}

/**
 * Giải mã (Flatten) toàn bộ Shared Formula trong workbook thành công thức độc lập.
 * Khắc phục triệt để bug của ExcelJS khi spliceRows làm mất đồng bộ vị trí master/clone.
 */
export function flattenSharedFormulas(workbook: ExcelJS.Workbook): void {
  workbook.eachSheet((ws) => {
    ws.eachRow({ includeEmpty: false }, (row) => {
      row.eachCell({ includeEmpty: false }, (cell) => {
        const val = cell.value
        if (
          val &&
          typeof val === 'object' &&
          ('sharedFormula' in val || 'shareType' in val)
        ) {
          let computedFormula: string | undefined
          try {
            computedFormula = cell.formula
          } catch {
            computedFormula = undefined
          }

          const prevResult =
            'result' in val ? (val as { result?: unknown }).result : undefined

          if (computedFormula) {
            cell.value = (
              prevResult !== undefined
                ? { formula: computedFormula, result: prevResult }
                : { formula: computedFormula }
            ) as ExcelJS.CellValue
          } else {
            cell.value = (prevResult !== undefined ? prevResult : null) as ExcelJS.CellValue
          }
        }
      })
    })
  })
}

/**
 * Ghi danh sách các phiếu xuất trấu vào workbook một cách nguyên tử (Atomic).
 * Nếu có bất kỳ lỗi nào, ném ra Error và không xuất file.
 */
export async function writeShipments(
  workbook: ExcelJS.Workbook,
  entries: ShipmentEntry[],
  metadata?: WorkbookMetadata
): Promise<WriteResult> {
  // 1. Kiểm tra tính nguyên tử: Validate toàn bộ entries
  const validation = validateBatchEntries(entries, metadata)
  if (!validation.isValid) {
    const firstError = validation.entriesValidation.find((ev) => !ev.result.isValid)
    const errorMsg = firstError
      ? `Phiếu số ${firstError.index + 1} lỗi: ${firstError.result.errors[0].message}`
      : 'Dữ liệu phiếu nhập không hợp lệ.'
    throw new Error(errorMsg)
  }

  // 1.5. Giải mã toàn bộ Shared Formulas trước khi chèn/sửa dòng để tránh lỗi master/clone của ExcelJS
  flattenSharedFormulas(workbook)

  // 2. Kiểm tra các sheet bắt buộc
  const mainSheet = workbook.getWorksheet(SHEET_NAMES.MAIN)
  if (!mainSheet) {
    throw new Error(`Không tìm thấy sổ tổng "${SHEET_NAMES.MAIN}" trong file Excel.`)
  }

  // Xác định dòng cuối cùng hiện có của sổ tổng
  let mainCurrentRow = 3
  for (let r = mainSheet.rowCount; r >= 4; r--) {
    const row = mainSheet.getRow(r)
    const dateVal = row.getCell('A').value
    const vehVal = row.getCell('C').value
    if (dateVal !== null && dateVal !== undefined && dateVal !== '') {
      mainCurrentRow = Math.max(mainCurrentRow, r)
      break
    } else if (vehVal !== null && vehVal !== undefined && vehVal !== '') {
      mainCurrentRow = Math.max(mainCurrentRow, r)
      break
    }
  }

  // 3. Ghi vào sheet "Xuat Trấu Cty"
  const templateRowNumber = mainCurrentRow >= 4 ? mainCurrentRow : 4
  const templateRow = mainSheet.getRow(templateRowNumber)

  for (const entry of entries) {
    mainCurrentRow++
    const targetRow = mainSheet.getRow(mainCurrentRow)

    const dateObj = parseDateValue(entry.date)
    const isXe = entry.type === 'Xe'
    const kgXe = isXe ? entry.weightKg : 0
    const kgGhe = !isXe ? entry.weightKg : 0

    // Gán giá trị
    targetRow.getCell('A').value = dateObj
    targetRow.getCell('A').numFmt = 'dd/mm/yyyy'

    targetRow.getCell('B').value = entry.team
    targetRow.getCell('C').value = entry.vehicleName
    targetRow.getCell('D').value = kgXe
    targetRow.getCell('E').value = kgGhe

    // Công thức F: Tổng Xuất = E + D
    targetRow.getCell('F').value = { formula: `E${mainCurrentRow}+D${mainCurrentRow}` }

    // Công thức G: Tiền Công = (D*11)+(E*7)
    targetRow.getCell('G').value = { formula: `(D${mainCurrentRow}*11)+(E${mainCurrentRow}*7)` }

    targetRow.getCell('H').value = entry.customer
    targetRow.getCell('I').value = entry.note || ''

    // Copy style từ template row
    for (let c = 1; c <= 9; c++) {
      const src = templateRow.getCell(c)
      const dst = targetRow.getCell(c)
      copyCellStyle(src, dst)
    }

    targetRow.commit()
  }

  // Cập nhật SUBTOTAL trên dòng 2 của sổ tổng
  const subtotalCols = ['D', 'E', 'F', 'G']
  for (const col of subtotalCols) {
    const cell = mainSheet.getCell(`${col}2`)
    let curFormula = ''
    if (cell.formula) {
      curFormula = cell.formula
    } else if (typeof cell.value === 'object' && cell.value !== null && 'formula' in cell.value) {
      curFormula = (cell.value as { formula: string }).formula
    }

    if (curFormula) {
      const updated = updateSubtotalLastRow(curFormula, mainCurrentRow)
      if (updated !== curFormula) {
        cell.value = { formula: updated }
      }
    }
  }

  // Cập nhật AutoFilter của sổ tổng nếu có
  if (mainSheet.autoFilter) {
    const updatedFilter = updateAutoFilterRange(mainSheet.autoFilter as string, mainCurrentRow)
    if (updatedFilter) {
      mainSheet.autoFilter = updatedFilter
    }
  }

  // 4. Ghi vào các sheet khách hàng
  // Nhóm entries theo sheet đích
  const sheetGroups: { [sheetName: string]: ShipmentEntry[] } = {}
  for (const entry of entries) {
    if (!sheetGroups[entry.targetSheetName]) {
      sheetGroups[entry.targetSheetName] = []
    }
    sheetGroups[entry.targetSheetName].push(entry)
  }

  let totalCustomerInserted = 0

  for (const [sheetName, sheetEntries] of Object.entries(sheetGroups)) {
    const custSheet = workbook.getWorksheet(sheetName)
    if (!custSheet) {
      throw new Error(`Không tìm thấy tab khách hàng "${sheetName}" trong workbook.`)
    }

    const preConfig = PRECONFIGURED_CUSTOMER_SHEETS[sheetName] || {}
    const colDate = preConfig.colDate || 'B'
    const colVehicle = preConfig.colVehicle || 'C'
    const colNote = preConfig.colNote || 'D'
    const defaultColXe = preConfig.colXe || 'E'
    const defaultColGhe = preConfig.colGhe || 'F'

    // Nhóm tiếp theo hợp đồng (contractRow)
    const contractGroups: { [contractRow: number]: ShipmentEntry[] } = {}
    for (const entry of sheetEntries) {
      const cRow = entry.contractRow || 0
      if (!contractGroups[cRow]) contractGroups[cRow] = []
      contractGroups[cRow].push(entry)
    }

    // Lấy danh sách hợp đồng hiện có trong sheet (deep clone để tránh mutate metadata gốc)
    const sheetMeta = metadata?.customerSheets.find((s) => s.sheetName === sheetName)
    const contractsList: ContractInfo[] = sheetMeta ? sheetMeta.contracts.map((c) => ({ ...c })) : []

    // Xử lý từng nhóm hợp đồng
    for (const [cRowStr, cEntries] of Object.entries(contractGroups)) {
      const contractRow = parseInt(cRowStr, 10)
      const contract = contractsList.find((c) => c.row === contractRow)

      if (!contract) {
        throw new Error(
          `Không tìm thấy cấu hình hợp đồng tại dòng ${contractRow} trong sheet "${sheetName}".`
        )
      }

      // Vị trí chèn dòng mới: chèn ngay sau dataRowEnd hiện tại của HĐ
      const insertAt = contract.dataRowEnd + 1
      const countToInsert = cEntries.length

      // Lấy template row từ dòng cuối của HĐ
      const templateCustRow = custSheet.getRow(contract.dataRowEnd)

      // Chèn các dòng trống bằng spliceRows
      custSheet.spliceRows(insertAt, 0, ...new Array(countToInsert).fill([]))

      // Ghi dữ liệu vào từng dòng vừa chèn
      cEntries.forEach((entry, idx) => {
        const rowNum = insertAt + idx
        const r = custSheet.getRow(rowNum)

        const dateObj = parseDateValue(entry.date)
        r.getCell(colDate).value = dateObj
        r.getCell(colDate).numFmt = 'dd/mm/yyyy'

        r.getCell(colVehicle).value = entry.vehicleName
        if (colNote) {
          r.getCell(colNote).value = entry.note || ''
        }

        // Cột số lượng
        const colKg =
          contract.colSoLuong && contract.colSoLuong !== 'EF'
            ? contract.colSoLuong
            : entry.type === 'Xe'
            ? defaultColXe
            : defaultColGhe

        r.getCell(colKg).value = entry.weightKg

        // Copy style từ template row
        for (let colIdx = 1; colIdx <= 15; colIdx++) {
          const src = templateCustRow.getCell(colIdx)
          const dst = r.getCell(colIdx)
          copyCellStyle(src, dst)
        }

        r.commit()
      })

      totalCustomerInserted += countToInsert

      // 5. CẬP NHẬT CÔNG THỨC SUM CỦA CHÍNH HỢP ĐỒNG ĐÓ
      const sumCell = custSheet.getCell(contract.sumCell)
      let oldSumFormula = ''
      if (sumCell.formula) {
        oldSumFormula = sumCell.formula
      } else if (typeof sumCell.value === 'object' && sumCell.value !== null && 'formula' in sumCell.value) {
        oldSumFormula = (sumCell.value as { formula: string }).formula
      }

      if (oldSumFormula) {
        const newSumFormula = expandSumFormulaRange(oldSumFormula, contract.dataRowEnd, countToInsert)
        sumCell.value = { formula: newSumFormula }
      }

      // Cập nhật lại dataRowEnd của contract này trong metadata runtime
      contract.dataRowEnd += countToInsert

      // 6. DỜI (SHIFT) CÔNG THỨC SUM CỦA CÁC HỢP ĐỒNG NẰM PHÍA DƯỚI VỊ TRÍ CHÈN
      for (const otherContract of contractsList) {
        if (otherContract.row !== contract.row && otherContract.dataRowStart >= insertAt) {
          const otherSumCell = custSheet.getCell(otherContract.sumCell)
          let formula = ''
          if (otherSumCell.formula) {
            formula = otherSumCell.formula
          } else if (typeof otherSumCell.value === 'object' && otherSumCell.value !== null && 'formula' in otherSumCell.value) {
            formula = (otherSumCell.value as { formula: string }).formula
          }

          if (formula) {
            const shifted = shiftFormulaRows(formula, insertAt, countToInsert)
            otherSumCell.value = { formula: shifted }
          }

          // Cập nhật metadata runtime
          otherContract.dataRowStart += countToInsert
          otherContract.dataRowEnd += countToInsert
        }
      }
    }
  }

  // 7. Xuất workbook ra buffer
  const buffer = await workbook.xlsx.writeBuffer()
  const uint8 = new Uint8Array(buffer)

  return {
    success: true,
    updatedBuffer: uint8,
    insertedMainCount: entries.length,
    insertedCustomerCount: totalCustomerInserted,
    message: `Đã ghi thành công ${entries.length} phiếu vào sổ tổng và các tab khách hàng tương ứng.`,
  }
}
