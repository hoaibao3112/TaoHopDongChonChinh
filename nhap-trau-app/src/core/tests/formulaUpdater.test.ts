import { describe, it, expect } from 'vitest'
import {
  expandSumFormulaRange,
  shiftFormulaRows,
  updateSubtotalLastRow,
  updateAutoFilterRange,
  extractRangesFromFormula,
} from '../formulaUpdater'

describe('formulaUpdater', () => {
  describe('extractRangesFromFormula', () => {
    it('trích xuất đúng dải ô đơn giản', () => {
      const ranges = extractRangesFromFormula('SUM(E450:E471)')
      expect(ranges).toHaveLength(1)
      expect(ranges[0].parsed).toEqual({
        sheetPrefix: undefined,
        colStart: 'E',
        rowStart: 450,
        colEnd: 'E',
        rowEnd: 471,
      })
    })

    it('trích xuất đúng dải ô có sheet prefix', () => {
      const ranges = extractRangesFromFormula("SUM('GIANG THANH BÌNH '!F102:F112)")
      expect(ranges).toHaveLength(1)
      expect(ranges[0].parsed.colStart).toBe('F')
      expect(ranges[0].parsed.rowStart).toBe(102)
      expect(ranges[0].parsed.rowEnd).toBe(112)
    })

    it('trích xuất đúng công thức kép có 2 dải', () => {
      const ranges = extractRangesFromFormula('SUM(E23:E41)+SUM(F23:F41)')
      expect(ranges).toHaveLength(2)
      expect(ranges[0].parsed.rowEnd).toBe(41)
      expect(ranges[1].parsed.rowEnd).toBe(41)
    })
  })

  describe('expandSumFormulaRange', () => {
    it('mở rộng biên dưới khi thêm 1 dòng', () => {
      const formula = 'SUM(E450:E471)'
      const updated = expandSumFormulaRange(formula, 471, 1)
      expect(updated).toBe('SUM(E450:E472)')
    })

    it('mở rộng biên dưới khi thêm 3 dòng', () => {
      const formula = 'SUM(E450:E471)'
      const updated = expandSumFormulaRange(formula, 471, 3)
      expect(updated).toBe('SUM(E450:E474)')
    })

    it('mở rộng cả hai vế trong công thức kép (vd CẨM THANH XUÂN)', () => {
      const formula = 'SUM(E23:E41)+SUM(F23:F41)'
      const updated = expandSumFormulaRange(formula, 41, 1)
      expect(updated).toBe('SUM(E23:E42)+SUM(F23:F42)')
    })

    it('không thay đổi nếu không khớp targetOldEndRow', () => {
      const formula = 'SUM(E10:E20)'
      const updated = expandSumFormulaRange(formula, 471, 1)
      expect(updated).toBe('SUM(E10:E20)')
    })
  })

  describe('shiftFormulaRows', () => {
    it('dời địa chỉ các ô có số dòng >= insertedRow', () => {
      const formula = 'SUM(E302:E449)'
      // Giả sử có 2 dòng chèn vào dòng 250 -> formula phải dời thành E304:E451
      const shifted = shiftFormulaRows(formula, 250, 2)
      expect(shifted).toBe('SUM(E304:E451)')
    })

    it('không dời địa chỉ các ô có số dòng < insertedRow', () => {
      const formula = 'SUM(E50:E80)'
      // Chèn vào dòng 100 -> formula không đổi
      const shifted = shiftFormulaRows(formula, 100, 2)
      expect(shifted).toBe('SUM(E50:E80)')
    })
  })

  describe('updateSubtotalLastRow', () => {
    it('mở rộng phạm vi SUBTOTAL trong Xuat Trấu Cty', () => {
      const formula = 'SUBTOTAL(109,D4:D3679)'
      const updated = updateSubtotalLastRow(formula, 3698)
      expect(updated).toBe('SUBTOTAL(109,D4:D3698)')
    })

    it('không thu hẹp nếu newLastRow nhỏ hơn endRow cũ', () => {
      const formula = 'SUBTOTAL(109,D4:D3679)'
      const updated = updateSubtotalLastRow(formula, 3000)
      expect(updated).toBe('SUBTOTAL(109,D4:D3679)')
    })
  })

  describe('updateAutoFilterRange', () => {
    it('mở rộng filter ref khi dữ liệu vượt quá dòng cũ', () => {
      const currentRef = 'A3:K3680'
      const updated = updateAutoFilterRange(currentRef, 3698)
      expect(updated).toBe('A3:K3698')
    })

    it('không đổi filter ref nếu newLastRow không vượt quá', () => {
      const currentRef = 'A3:K3680'
      const updated = updateAutoFilterRange(currentRef, 3600)
      expect(updated).toBe('A3:K3680')
    })
  })
})

