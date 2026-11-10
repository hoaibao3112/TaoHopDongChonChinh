import { describe, it, expect } from 'vitest'
import { validateShipmentEntry, validateBatchEntries, normalizeVehicleName } from '../validator'
import type { ShipmentEntry, WorkbookMetadata } from '../types'

describe('validator', () => {
  const mockMetadata: WorkbookMetadata = {
    fileName: 'test.xlsx',
    totalSheets: 5,
    mainSheetLastRow: 100,
    customers: ['CHỊ BÉ BẢY', 'TIẾN CÁI BÈ'],
    vehicles: [],
    customerSheets: [
      {
        sheetName: 'CHỊ 7 (CTC)',
        customerName: 'CHỊ BÉ BẢY',
        state: 'visible',
        headerRow: 7,
        dataStartRow: 8,
        colDate: 'B',
        colVehicle: 'C',
        colXe: 'E',
        colGhe: 'F',
        contracts: [
          {
            row: 6,
            label: 'HĐ Nhận xe 15/09/2026',
            slKg: 500000,
            colSoLuong: 'E',
            sumCell: 'F6',
            sumRange: 'E450:E471',
            dataRowStart: 450,
            dataRowEnd: 471,
            remainingKg: 20000,
          },
        ],
      },
    ],
    existingMainEntries: [
      {
        date: '2026-11-09',
        vehicleName: '63H-02309',
        customer: 'CHỊ BÉ BẢY',
      },
    ],
  }

  const validEntry: ShipmentEntry = {
    id: 'entry-1',
    date: '2026-11-10',
    team: 'ĐỨC',
    vehicleName: '63C-12345',
    type: 'Xe',
    weightKg: 6500,
    customer: 'CHỊ BÉ BẢY',
    targetSheetName: 'CHỊ 7 (CTC)',
    contractRow: 6,
    note: 'HĐ',
  }

  it('hợp lệ khi đầy đủ thông tin hợp lệ', () => {
    const res = validateShipmentEntry(validEntry, 0, [validEntry], mockMetadata)
    expect(res.isValid).toBe(true)
    expect(res.errors).toHaveLength(0)
  })

  it('chặn khi thiếu ngày hoặc ngày không hợp lệ', () => {
    const invalid = { ...validEntry, date: '' }
    const res = validateShipmentEntry(invalid, 0, [invalid], mockMetadata)
    expect(res.isValid).toBe(false)
    expect(res.errors.some((e) => e.field === 'date')).toBe(true)
  })

  it('chặn khi số kg <= 0 hoặc không phải số', () => {
    const invalid = { ...validEntry, weightKg: 0 }
    const res = validateShipmentEntry(invalid, 0, [invalid], mockMetadata)
    expect(res.isValid).toBe(false)
    expect(res.errors.some((e) => e.field === 'weightKg')).toBe(true)
  })

  it('chặn khi tab khách không tồn tại', () => {
    const invalid = { ...validEntry, targetSheetName: 'TAB_KHONG_TON_TAI' }
    const res = validateShipmentEntry(invalid, 0, [invalid], mockMetadata)
    expect(res.isValid).toBe(false)
    expect(res.errors.some((e) => e.field === 'targetSheetName')).toBe(true)
  })

  it('chặn khi tab có hợp đồng nhưng chưa chọn HĐ', () => {
    const invalid = { ...validEntry, contractRow: undefined }
    const res = validateShipmentEntry(invalid, 0, [invalid], mockMetadata)
    expect(res.isValid).toBe(false)
    expect(res.errors.some((e) => e.field === 'contractRow')).toBe(true)
  })

  it('cảnh báo khi trùng phương tiện trong cùng một ngày', () => {
    // Trùng với sổ tổng ngày 2026-11-09 có xe 63H-02309
    const dupEntry: ShipmentEntry = {
      ...validEntry,
      date: '2026-11-09',
      vehicleName: '63H 02309', // khác dấu gạch nhưng cùng xe
    }
    const res = validateShipmentEntry(dupEntry, 0, [dupEntry], mockMetadata)
    expect(res.isValid).toBe(true) // Vẫn hợp lệ (không chặn)
    expect(res.warnings.some((w) => w.field === 'vehicleName')).toBe(true)
  })

  it('cảnh báo khi số kg vượt lượng tồn HĐ', () => {
    const overWeightEntry = { ...validEntry, weightKg: 25000 } // tồn chỉ còn 20000
    const res = validateShipmentEntry(overWeightEntry, 0, [overWeightEntry], mockMetadata)
    expect(res.isValid).toBe(true)
    expect(res.warnings.some((w) => w.field === 'weightKg')).toBe(true)
  })

  it('validateBatchEntries trả về isValid=false nếu có 1 phiếu lỗi', () => {
    const batch = [
      validEntry,
      { ...validEntry, id: 'entry-2', weightKg: -100 }, // lỗi
    ]
    const batchRes = validateBatchEntries(batch, mockMetadata)
    expect(batchRes.isValid).toBe(false)
    expect(batchRes.hasErrors).toBe(true)
  })

  it('normalizeVehicleName chuẩn hóa đúng', () => {
    expect(normalizeVehicleName('63H-023.09 ')).toBe('63H02309')
    expect(normalizeVehicleName(' Ghe Được Phường ')).toBe('GHEĐƯỢCPHƯỜNG')
  })
})
