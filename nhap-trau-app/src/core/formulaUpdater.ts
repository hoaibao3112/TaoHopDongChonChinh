/**
 * Utility cập nhật địa chỉ ô và vùng trong công thức Excel sau khi chèn/thêm dòng.
 * ExcelJS spliceRows KHÔNG tự động cập nhật formula tham chiếu, nên module này
 * đảm bảo mọi công thức SUM, SUBTOTAL, và AutoFilter luôn chính xác.
 */

export interface ParsedRange {
  sheetPrefix?: string
  colStart: string
  rowStart: number
  colEnd: string
  rowEnd: number
}

/**
 * Trích xuất các dải ô (ví dụ: E450:E471 hoặc 'GIANG THANH BÌNH '!F102:F112) từ công thức.
 */
export function extractRangesFromFormula(formula: string): { original: string; parsed: ParsedRange }[] {
  // Regex bắt pattern như [SheetName!]?[A-Z]+[0-9]+:[A-Z]+[0-9]+
  const regex = /(?:('?[^'!]+'?)!)?([A-Z]+)(\d+):([A-Z]+)(\d+)/g
  const results: { original: string; parsed: ParsedRange }[] = []

  let match: RegExpExecArray | null
  while ((match = regex.exec(formula)) !== null) {
    results.push({
      original: match[0],
      parsed: {
        sheetPrefix: match[1] || undefined,
        colStart: match[2],
        rowStart: parseInt(match[3], 10),
        colEnd: match[4],
        rowEnd: parseInt(match[5], 10),
      },
    })
  }

  return results
}

/**
 * Mở rộng biên dưới của một dải ô trong công thức SUM khi chèn thêm dòng mới vào hợp đồng.
 * Ví dụ: formula = "SUM(E450:E471)", targetRange = "E450:E471", thêm 1 dòng -> "SUM(E450:E472)"
 * Hỗ trợ cả công thức kép như "SUM(E23:E41)+SUM(F23:F41)" -> "SUM(E23:E42)+SUM(F23:F42)"
 */
export function expandSumFormulaRange(
  formula: string,
  targetOldEndRow: number,
  addedRowCount: number = 1
): string {
  if (!formula || typeof formula !== 'string') return formula

  // Tìm tất cả các range có rowEnd khớp với targetOldEndRow
  return formula.replace(
    /(?:('?[^'!]+'?)!)?([A-Z]+)(\d+):([A-Z]+)(\d+)/g,
    (match, sheetPrefix, col1, r1, col2, r2) => {
      const endRow = parseInt(r2, 10)
      if (endRow === targetOldEndRow) {
        const newEndRow = endRow + addedRowCount
        const prefix = sheetPrefix ? `${sheetPrefix}!` : ''
        return `${prefix}${col1}${r1}:${col2}${newEndRow}`
      }
      return match
    }
  )
}

/**
 * Dời (shift) tất cả các số hàng trong công thức nếu chúng >= insertedRow.
 * Dùng khi spliceRows chèn dòng vào sheet khách, làm các hợp đồng phía dưới bị đẩy xuống.
 * Ví dụ: insertedRow = 302, count = 1:
 * "SUM(E302:E449)" -> "SUM(E303:E450)"
 */
export function shiftFormulaRows(
  formula: string,
  insertedRow: number,
  count: number = 1
): string {
  if (!formula || typeof formula !== 'string') return formula

  // Regex bắt mọi ô hoặc range có chữ cái + số dòng
  return formula.replace(
    /([A-Z]+)(\d+)/g,
    (match, col, rowStr) => {
      const row = parseInt(rowStr, 10)
      if (row >= insertedRow) {
        return `${col}${row + count}`
      }
      return match
    }
  )
}

/**
 * Mở rộng vùng SUBTOTAL(109, D4:D3679) trong sheet "Xuat Trấu Cty" khi dữ liệu vượt dòng cuối cũ.
 * Ví dụ: "SUBTOTAL(109,D4:D3679)", newLastRow = 3697 -> "SUBTOTAL(109,D4:D3697)"
 */
export function updateSubtotalLastRow(formula: string, newLastRow: number): string {
  if (!formula || typeof formula !== 'string') return formula

  return formula.replace(
    /(SUBTOTAL\(\s*\d+\s*,\s*([A-Z]+)(\d+):([A-Z]+))(\d+)(\s*\))/gi,
    (_match, prefix, _col1, _r1, _col2, oldEndRow, suffix) => {
      const oldEnd = parseInt(oldEndRow, 10)
      if (newLastRow > oldEnd) {
        return `${prefix}${newLastRow}${suffix}`
      }
      return _match
    }
  )
}

/**
 * Cập nhật vùng AutoFilter (ví dụ: "A3:K3680") nếu dòng dữ liệu mới vượt qua dòng cuối của filter.
 */
export function updateAutoFilterRange(currentRef: string | undefined, newLastRow: number): string | undefined {
  if (!currentRef) return undefined

  const match = currentRef.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/i)
  if (!match) return currentRef

  const startCol = match[1]
  const startRow = match[2]
  const endCol = match[3]
  const endRow = parseInt(match[4], 10)

  if (newLastRow > endRow) {
    return `${startCol}${startRow}:${endCol}${newLastRow}`
  }

  return currentRef
}

