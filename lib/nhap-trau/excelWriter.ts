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
import {
  findActualMainLastRow,
  findSummaryBoxStartRow,
  findLastUsedRowInRange,
} from './excelReader'

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

  // Xác định dòng cuối cùng thực sự có dữ liệu (cột A là Ngày) — BỎ QUA hộp bảng thống kê ở dưới
  let mainCurrentRow = findActualMainLastRow(mainSheet)
  const templateRowNumber = mainCurrentRow >= 4 ? mainCurrentRow : 4
  const templateRow = mainSheet.getRow(templateRowNumber)

  // Kiểm tra xem phía dưới dòng dữ liệu thực có hộp bảng thống kê không (ví dụ ở dòng 3682)
  const summaryBoxStartRow = findSummaryBoxStartRow(mainSheet, mainCurrentRow)
  if (summaryBoxStartRow !== null && mainCurrentRow + entries.length >= summaryBoxStartRow) {
    // Đẩy hộp bảng thống kê xuống đủ chỗ để chèn ngay phía trên nó
    const rowsNeeded = mainCurrentRow + entries.length - summaryBoxStartRow + 2
    mainSheet.spliceRows(summaryBoxStartRow, 0, ...new Array(rowsNeeded).fill([]))
  }

  // 3. Ghi vào sheet "Xuat Trấu Cty" (TRƯỚC hộp bảng thống kê)
  for (const entry of entries) {
    mainCurrentRow++
    const targetRow = mainSheet.getRow(mainCurrentRow)

    // Đảm bảo dòng mới được hiển thị (unhide) vì các dòng trống chờ sẵn trong file gốc có thể đang hidden=true
    targetRow.hidden = false

    const dateObj = parseDateValue(entry.date)
    const isXe = entry.type === 'Xe'
    const kgXe = isXe ? entry.weightKg : 0
    const kgGhe = !isXe ? entry.weightKg : 0

    // Lấy tên khách chuẩn cho Sổ tổng
    const preSheetCfg = PRECONFIGURED_CUSTOMER_SHEETS[entry.targetSheetName]
    const cleanCustomerName =
      preSheetCfg?.mainCustomerName ||
      entry.customer?.trim() ||
      entry.targetSheetName.trim()

    // Gán giá trị
    targetRow.getCell('A').value = dateObj
    targetRow.getCell('B').value = entry.team
    targetRow.getCell('C').value = entry.vehicleName
    targetRow.getCell('D').value = kgXe
    targetRow.getCell('E').value = kgGhe

    // Công thức F: Tổng Xuất = E + D
    targetRow.getCell('F').value = { formula: `E${mainCurrentRow}+D${mainCurrentRow}` }

    // Công thức G: Tiền Công = (D*11)+(E*7)
    targetRow.getCell('G').value = { formula: `(D${mainCurrentRow}*11)+(E${mainCurrentRow}*7)` }

    targetRow.getCell('H').value = cleanCustomerName
    targetRow.getCell('I').value = entry.note || ''

    // Copy style từ dòng dữ liệu thực mẫu (dòng 2641), tránh copy viền đỏ từ hộp thống kê
    for (let c = 1; c <= 9; c++) {
      const src = templateRow.getCell(c)
      const dst = targetRow.getCell(c)
      copyCellStyle(src, dst)
    }

    targetRow.getCell('A').numFmt = 'dd/mm/yyyy'
    targetRow.commit()
  }

  // Cập nhật SUBTOTAL trên dòng 2 của sổ tổng nếu vượt vùng cũ
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

  // Cập nhật AutoFilter của sổ tổng nếu vượt vùng cũ
  if (mainSheet.autoFilter) {
    const updatedFilter = updateAutoFilterRange(mainSheet.autoFilter as string, mainCurrentRow)
    if (updatedFilter) {
      mainSheet.autoFilter = updatedFilter
    }
  }

  // 4. Ghi vào các tab con của từng khách hàng
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
    const defaultColXe = preConfig.colXe || 'E'
    const defaultColGhe = preConfig.colGhe || 'F'

    // Nhóm tiếp theo hợp đồng (contractRow)
    const contractGroups: { [contractRow: number]: ShipmentEntry[] } = {}
    for (const entry of sheetEntries) {
      const cRow = entry.contractRow || 0
      if (!contractGroups[cRow]) contractGroups[cRow] = []
      contractGroups[cRow].push(entry)
    }

    // Deep clone danh sách hợp đồng hiện có trong sheet
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

      // Tìm dòng cuối thực tế ĐÃ CÓ DỮ LIỆU bên trong vùng [dataRowStart .. dataRowEnd] của HĐ này
      let lastUsedInRange = findLastUsedRowInRange(
        custSheet,
        contract.dataRowStart,
        contract.dataRowEnd,
        colDate,
        colVehicle,
        contract.colSoLuong
      )

      let nextWriteRow =
        lastUsedInRange >= contract.dataRowStart ? lastUsedInRange + 1 : contract.dataRowStart

      const templateRowIdx =
        lastUsedInRange >= contract.dataRowStart ? lastUsedInRange : contract.dataRowStart
      const templateCustRow = custSheet.getRow(templateRowIdx)

      for (const entry of cEntries) {
        const colKg =
          contract.colSoLuong === 'EF'
            ? entry.type === 'Xe'
              ? defaultColXe
              : defaultColGhe
            : contract.colSoLuong || (entry.type === 'Xe' ? defaultColXe : defaultColGhe)

        const prevRow = custSheet.getRow(nextWriteRow - 1)
        const prevRowA = prevRow.getCell('A').value
        const prevRowD = prevRow.getCell('D').value

        // Nếu vẫn còn dòng trống nằm trong vùng SUM của hợp đồng -> Ghi TRỰC TIẾP vào dòng trống đó
        if (nextWriteRow <= contract.dataRowEnd) {
          const targetRow = custSheet.getRow(nextWriteRow)
          targetRow.hidden = false

          // Ngày & Phương tiện & Số lượng
          targetRow.getCell(colDate).value = parseDateValue(entry.date)
          targetRow.getCell(colDate).numFmt = 'dd/mm/yyyy'
          targetRow.getCell(colVehicle).value = entry.vehicleName
          targetRow.getCell(colKg).value = entry.weightKg

          // Nếu dòng trên có STT (cột A là số nguyên, và colDate != 'A'), điền tiếp STT + 1
          if (colDate !== 'A' && typeof prevRowA === 'number') {
            targetRow.getCell('A').value = prevRowA + 1
          }

          // Nếu dòng trên có chữ "Trấu" ở cột D (Tên Hàng), giữ nguyên ghi "Trấu"
          if (typeof prevRowD === 'string' && /trấu/i.test(prevRowD)) {
            targetRow.getCell('D').value = prevRowD
          }

          // Copy style cho các ô vừa ghi (giữ nguyên các ô công thức cột H tồn HĐ đã kéo sẵn!)
          copyCellStyle(templateCustRow.getCell(colDate), targetRow.getCell(colDate))
          copyCellStyle(templateCustRow.getCell(colVehicle), targetRow.getCell(colVehicle))
          copyCellStyle(templateCustRow.getCell(colKg), targetRow.getCell(colKg))
          targetRow.getCell(colDate).numFmt = 'dd/mm/yyyy'
          targetRow.commit()
        } else {
          // Đã hết chỗ trống trong vùng SUM -> Phải spliceRows để chèn dòng mới & mở rộng SUM
          const insertAt = contract.dataRowEnd + 1
          custSheet.spliceRows(insertAt, 0, [])

          const targetRow = custSheet.getRow(insertAt)
          targetRow.hidden = false
          targetRow.getCell(colDate).value = parseDateValue(entry.date)
          targetRow.getCell(colDate).numFmt = 'dd/mm/yyyy'
          targetRow.getCell(colVehicle).value = entry.vehicleName
          targetRow.getCell(colKg).value = entry.weightKg

          if (colDate !== 'A' && typeof prevRowA === 'number') {
            targetRow.getCell('A').value = prevRowA + 1
          }
          if (typeof prevRowD === 'string' && /trấu/i.test(prevRowD)) {
            targetRow.getCell('D').value = prevRowD
          }

          for (let colIdx = 1; colIdx <= 15; colIdx++) {
            copyCellStyle(templateCustRow.getCell(colIdx), targetRow.getCell(colIdx))
          }
          targetRow.getCell(colDate).numFmt = 'dd/mm/yyyy'
          targetRow.commit()

          // Mở rộng công thức SUM của chính hợp đồng này
          const sumCell = custSheet.getCell(contract.sumCell)
          let oldSumFormula = ''
          if (sumCell.formula) {
            oldSumFormula = sumCell.formula
          } else if (typeof sumCell.value === 'object' && sumCell.value !== null && 'formula' in sumCell.value) {
            oldSumFormula = (sumCell.value as { formula: string }).formula
          }

          if (oldSumFormula) {
            const newSumFormula = expandSumFormulaRange(oldSumFormula, contract.dataRowEnd, 1)
            sumCell.value = { formula: newSumFormula }
          }

          contract.dataRowEnd += 1

          // Dời công thức SUM của các hợp đồng nằm bên dưới
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
                otherSumCell.value = { formula: shiftFormulaRows(formula, insertAt, 1) }
              }

              otherContract.dataRowStart += 1
              otherContract.dataRowEnd += 1
            }
          }
        }

        nextWriteRow++
        totalCustomerInserted++
      }
    }
  }

  // 5. Xuất workbook ra buffer
  const buffer = await workbook.xlsx.writeBuffer()
  const uint8 = new Uint8Array(buffer)

  return {
    success: true,
    updatedBuffer: uint8,
    insertedMainCount: entries.length,
    insertedCustomerCount: totalCustomerInserted,
    message: `Đã ghi thành công ${entries.length} phiếu vào Sổ tổng và ${totalCustomerInserted} dòng vào các tab khách hàng tương ứng.`,
  }
}
