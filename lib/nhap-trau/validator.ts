import type {
  ShipmentEntry,
  ValidationResult,
  ValidationErrorItem,
  ValidationWarningItem,
  BatchValidationResult,
  WorkbookMetadata,
} from './types'

/**
 * Chuẩn hóa biển số xe hoặc tên ghe để so sánh trùng lặp.
 * Loại bỏ khoảng trắng, dấu gạch nối, chuyển về chữ hoa.
 */
export function normalizeVehicleName(name: string): string {
  if (!name) return ''
  return name.trim().toUpperCase().replace(/[\s\-_.]/g, '')
}

/**
 * Chuẩn hóa chuỗi ngày tháng về format chuẩn YYYY-MM-DD để so sánh.
 */
export function normalizeDate(dateStr: string): string {
  if (!dateStr) return ''
  const trimmed = dateStr.trim()

  // Trường hợp YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed
  }

  // Trường hợp DD/MM/YYYY
  const dmyMatch = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/)
  if (dmyMatch) {
    const day = dmyMatch[1].padStart(2, '0')
    const month = dmyMatch[2].padStart(2, '0')
    const year = dmyMatch[3]
    return `${year}-${month}-${day}`
  }

  return trimmed
}

/**
 * Validate một dòng phiếu nhập.
 */
export function validateShipmentEntry(
  entry: ShipmentEntry,
  index: number,
  allEntries: ShipmentEntry[],
  metadata?: WorkbookMetadata
): ValidationResult {
  const errors: ValidationErrorItem[] = []
  const warnings: ValidationWarningItem[] = []

  // 1. Kiểm tra Ngày (Bắt buộc)
  if (!entry.date || !entry.date.trim()) {
    errors.push({ field: 'date', message: 'Vui lòng nhập ngày xuất hàng.' })
  } else {
    const normalized = normalizeDate(entry.date)
    const d = new Date(normalized)
    if (isNaN(d.getTime())) {
      errors.push({ field: 'date', message: 'Định dạng ngày không hợp lệ (hỗ trợ DD/MM/YYYY hoặc YYYY-MM-DD).' })
    }
  }

  // 2. Kiểm tra Loại phương tiện (Bắt buộc)
  if (!entry.type || (entry.type !== 'Xe' && entry.type !== 'Ghe')) {
    errors.push({ field: 'type', message: 'Loại phương tiện phải là "Xe" hoặc "Ghe".' })
  }

  // 3. Kiểm tra Tên phương tiện (Bắt buộc)
  if (!entry.vehicleName || !entry.vehicleName.trim()) {
    errors.push({ field: 'vehicleName', message: 'Vui lòng nhập biển số xe hoặc tên ghe.' })
  }

  // 4. Kiểm tra Đội xuất (Bắt buộc)
  if (!entry.team || !entry.team.trim()) {
    errors.push({ field: 'team', message: 'Vui lòng nhập đội xuất (ví dụ: ĐỨC).' })
  }

  // 5. Kiểm tra Số lượng kg (Bắt buộc)
  if (entry.weightKg === undefined || entry.weightKg === null || isNaN(entry.weightKg) || entry.weightKg <= 0) {
    errors.push({ field: 'weightKg', message: 'Số lượng kg phải là số nguyên dương lớn hơn 0.' })
  } else {
    // Cảnh báo số kg bất thường
    if (entry.weightKg < 500) {
      warnings.push({
        field: 'weightKg',
        message: `Số lượng ${entry.weightKg.toLocaleString('vi-VN')} kg nhỏ bất thường đối với chuyến trấu (< 500 kg).`,
      })
    } else if (entry.weightKg > 60000) {
      warnings.push({
        field: 'weightKg',
        message: `Số lượng ${entry.weightKg.toLocaleString('vi-VN')} kg lớn bất thường đối với một xe/ghe (> 60.000 kg).`,
      })
    }
  }

  // 6. Kiểm tra Khách hàng & Tab đích (Bắt buộc)
  if (!entry.customer || !entry.customer.trim()) {
    errors.push({ field: 'customer', message: 'Vui lòng chọn hoặc nhập tên khách hàng.' })
  }

  if (!entry.targetSheetName || !entry.targetSheetName.trim()) {
    errors.push({ field: 'targetSheetName', message: 'Vui lòng chọn tab khách hàng cần ghi vào.' })
  } else if (metadata) {
    const sheetMeta = metadata.customerSheets.find(
      (s) => s.sheetName.trim().toLowerCase() === entry.targetSheetName.trim().toLowerCase()
    )
    if (!sheetMeta) {
      errors.push({
        field: 'targetSheetName',
        message: `Không tìm thấy tab "${entry.targetSheetName}" trong file Excel.`,
      })
    } else {
      // Nếu tab có hợp đồng, bắt buộc phải chọn HĐ
      if (sheetMeta.contracts && sheetMeta.contracts.length > 0) {
        if (!entry.contractRow) {
          errors.push({
            field: 'contractRow',
            message: `Tab "${entry.targetSheetName}" yêu cầu chọn hợp đồng cụ thể.`,
          })
        } else {
          const selectedContract = sheetMeta.contracts.find((c) => c.row === entry.contractRow)
          if (!selectedContract) {
            errors.push({
              field: 'contractRow',
              message: `Hợp đồng tại dòng ${entry.contractRow} không tồn tại trong tab "${entry.targetSheetName}".`,
            })
          } else {
            // Cảnh báo nếu số kg vượt tồn của HĐ
            if (
              selectedContract.remainingKg !== undefined &&
              selectedContract.remainingKg > 0 &&
              entry.weightKg > selectedContract.remainingKg
            ) {
              warnings.push({
                field: 'weightKg',
                message: `Số lượng ${entry.weightKg.toLocaleString('vi-VN')} kg vượt quá lượng tồn còn lại của HĐ (${selectedContract.remainingKg.toLocaleString('vi-VN')} kg).`,
              })
            }
          }
        }
      }

      // Đưa thêm cảnh báo riêng của sheet nếu có
      if (sheetMeta.warnings && sheetMeta.warnings.length > 0) {
        for (const w of sheetMeta.warnings) {
          warnings.push({ field: 'targetSheetName', message: `[${entry.targetSheetName}] ${w}` })
        }
      }
    }
  }

  // 7. Cảnh báo trùng biển số / tên phương tiện trong cùng một ngày
  if (entry.date && entry.vehicleName) {
    const entryDateNorm = normalizeDate(entry.date)
    const entryVehNorm = normalizeVehicleName(entry.vehicleName)

    // Kiểm tra trùng trong danh sách đang nhập
    const duplicateInBatch = allEntries.some((other, oIdx) => {
      if (oIdx === index) return false
      return (
        normalizeDate(other.date) === entryDateNorm &&
        normalizeVehicleName(other.vehicleName) === entryVehNorm
      )
    })

    if (duplicateInBatch) {
      warnings.push({
        field: 'vehicleName',
        message: `Phương tiện "${entry.vehicleName}" xuất hiện nhiều lần trong danh sách nhập ngày ${entry.date}.`,
      })
    }

    // Kiểm tra trùng với dữ liệu đã có trong sổ tổng (nếu có metadata)
    if (metadata && metadata.existingMainEntries) {
      const duplicateInExisting = metadata.existingMainEntries.some(
        (exist) =>
          normalizeDate(exist.date) === entryDateNorm &&
          normalizeVehicleName(exist.vehicleName) === entryVehNorm
      )
      if (duplicateInExisting) {
        warnings.push({
          field: 'vehicleName',
          message: `Phương tiện "${entry.vehicleName}" đã có chuyến trong sổ tổng ngày ${entry.date}.`,
        })
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  }
}

/**
 * Validate toàn bộ danh sách phiếu nhập trước khi tiến hành ghi vào Excel.
 */
export function validateBatchEntries(
  entries: ShipmentEntry[],
  metadata?: WorkbookMetadata
): BatchValidationResult {
  if (entries.length === 0) {
    return {
      isValid: false,
      entriesValidation: [],
      hasErrors: true,
      totalWarnings: 0,
    }
  }

  let hasErrors = false
  let totalWarnings = 0

  const entriesValidation = entries.map((entry, index) => {
    const result = validateShipmentEntry(entry, index, entries, metadata)
    if (!result.isValid) {
      hasErrors = true
    }
    totalWarnings += result.warnings.length
    return { index, result }
  })

  return {
    isValid: !hasErrors,
    entriesValidation,
    hasErrors,
    totalWarnings,
  }
}

