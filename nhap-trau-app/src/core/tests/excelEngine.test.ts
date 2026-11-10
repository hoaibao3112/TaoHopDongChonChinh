import { describe, it, expect } from 'vitest'
import ExcelJS from 'exceljs'
import { writeShipments } from '../excelWriter'
import { extractWorkbookMetadata } from '../excelReader'
import type { ShipmentEntry } from '../types'

describe('excelEngine writeShipments end-to-end', () => {
  async function createMockWorkbook(): Promise<ExcelJS.Workbook> {
    const wb = new ExcelJS.Workbook()

    // 1. Sheet Xuat Trấu Cty
    const mainWs = wb.addWorksheet('Xuat Trấu Cty')
    mainWs.getCell('D2').value = { formula: 'SUBTOTAL(109,D4:D10)' }
    mainWs.getCell('E2').value = { formula: 'SUBTOTAL(109,E4:E10)' }
    mainWs.getCell('F2').value = { formula: 'SUBTOTAL(109,F4:F10)' }
    mainWs.getCell('G2').value = { formula: 'SUBTOTAL(109,G4:G10)' }

    // Header row 3
    mainWs.getRow(3).values = [
      null,
      'Ngày',
      'Đội',
      'Phương tiện',
      'Xuất Xe',
      'Xuất Ghe',
      'Tổng',
      'Tiền công',
      'Khách hàng',
      'Ghi chú',
    ]

    // Dòng dữ liệu mẫu row 4
    const r4 = mainWs.getRow(4)
    r4.getCell('A').value = new Date('2026-11-08')
    r4.getCell('B').value = 'ĐỨC'
    r4.getCell('C').value = '63C-11111'
    r4.getCell('D').value = 5000
    r4.getCell('E').value = 0
    r4.getCell('F').value = { formula: 'E4+D4' }
    r4.getCell('G').value = { formula: '(D4*11)+(E4*7)' }
    r4.getCell('H').value = 'CHỊ BÉ BẢY'
    r4.getCell('I').value = 'HĐ'
    r4.commit()

    // 2. Sheet khách "CHỊ 7 (CTC)"
    const custWs = wb.addWorksheet('CHỊ 7 (CTC)')
    // Bảng hợp đồng
    // Row 3: HĐ 1 - data từ row 10 đến 15
    custWs.getCell('B3').value = 'HĐ Nhận xe 01/10/2026'
    custWs.getCell('D3').value = 500000
    custWs.getCell('F3').value = { formula: 'SUM(E10:E15)' }

    // Row 4: HĐ 2 - data từ row 16 đến 20
    custWs.getCell('B4').value = 'HĐ Nhận xe 15/10/2026'
    custWs.getCell('D4').value = 300000
    custWs.getCell('F4').value = { formula: 'SUM(E16:E20)' }

    // Dữ liệu mẫu HĐ 1 (row 10 đến 15)
    for (let r = 10; r <= 15; r++) {
      const row = custWs.getRow(r)
      row.getCell('A').value = r - 9
      row.getCell('B').value = new Date('2026-10-01')
      row.getCell('C').value = `63C-0000${r}`
      row.getCell('D').value = 'HĐ'
      row.getCell('E').value = 5000
      row.commit()
    }

    // Dữ liệu mẫu HĐ 2 (row 16 đến 20)
    for (let r = 16; r <= 20; r++) {
      const row = custWs.getRow(r)
      row.getCell('A').value = r - 15
      row.getCell('B').value = new Date('2026-10-15')
      row.getCell('C').value = `63C-000${r}`
      row.getCell('D').value = 'HĐ'
      row.getCell('E').value = 6000
      row.commit()
    }

    return wb
  }

  it('ghi thành công vào sổ tổng và cập nhật đúng công thức F, G', async () => {
    const wb = await createMockWorkbook()
    const metadata = extractWorkbookMetadata(wb)

    const entries: ShipmentEntry[] = [
      {
        id: '1',
        date: '2026-11-10',
        team: 'ĐỨC',
        vehicleName: '63H-02309',
        type: 'Xe',
        weightKg: 6510,
        customer: 'CHỊ BÉ BẢY',
        targetSheetName: 'CHỊ 7 (CTC)',
        contractRow: 3,
        note: 'HĐ',
      },
      {
        id: '2',
        date: '2026-11-10',
        team: 'ĐỨC',
        vehicleName: 'Ghe Được Phường',
        type: 'Ghe',
        weightKg: 15000,
        customer: 'CHỊ BÉ BẢY',
        targetSheetName: 'CHỊ 7 (CTC)',
        contractRow: 3,
        note: 'Cơ Sở 1',
      },
    ]

    const result = await writeShipments(wb, entries, metadata)
    expect(result.success).toBe(true)
    expect(result.insertedMainCount).toBe(2)

    const mainWs = wb.getWorksheet('Xuat Trấu Cty')!

    // Dòng 5 (entry 1)
    const row5 = mainWs.getRow(5)
    expect(row5.getCell('C').value).toBe('63H-02309')
    expect(row5.getCell('D').value).toBe(6510) // Xe
    expect(row5.getCell('E').value).toBe(0)
    expect((row5.getCell('F').value as { formula: string }).formula).toBe('E5+D5')
    expect((row5.getCell('G').value as { formula: string }).formula).toBe('(D5*11)+(E5*7)')
    expect(row5.getCell('H').value).toBe('CHỊ BÉ BẢY')

    // Dòng 6 (entry 2)
    const row6 = mainWs.getRow(6)
    expect(row6.getCell('C').value).toBe('Ghe Được Phường')
    expect(row6.getCell('D').value).toBe(0)
    expect(row6.getCell('E').value).toBe(15000) // Ghe
    expect((row6.getCell('F').value as { formula: string }).formula).toBe('E6+D6')
    expect((row6.getCell('G').value as { formula: string }).formula).toBe('(D6*11)+(E6*7)')
    expect(row6.getCell('I').value).toBe('Cơ Sở 1')
  })

  it('ghi vào tab khách, mở rộng SUM HĐ đó và dời SUM HĐ bên dưới', async () => {
    const wb = await createMockWorkbook()
    const metadata = extractWorkbookMetadata(wb)

    // Thêm 2 phiếu vào HĐ 1 (row 3, dải gốc E10:E15)
    const entries: ShipmentEntry[] = [
      {
        id: '1',
        date: '2026-11-10',
        team: 'ĐỨC',
        vehicleName: '63H-02309',
        type: 'Xe',
        weightKg: 6510,
        customer: 'CHỊ BÉ BẢY',
        targetSheetName: 'CHỊ 7 (CTC)',
        contractRow: 3,
        note: 'HĐ',
      },
      {
        id: '2',
        date: '2026-11-10',
        team: 'ĐỨC',
        vehicleName: '63C-99999',
        type: 'Xe',
        weightKg: 7000,
        customer: 'CHỊ BÉ BẢY',
        targetSheetName: 'CHỊ 7 (CTC)',
        contractRow: 3,
        note: 'HĐ',
      },
    ]

    await writeShipments(wb, entries, metadata)

    const custWs = wb.getWorksheet('CHỊ 7 (CTC)')!

    // Công thức HĐ 1 (F3) ban đầu là SUM(E10:E15), thêm 2 dòng -> phải mở rộng thành SUM(E10:E17)
    const f3Cell = custWs.getCell('F3')
    const f3Formula = (f3Cell.value as { formula: string }).formula
    expect(f3Formula).toBe('SUM(E10:E17)')

    // Công thức HĐ 2 (F4) ban đầu là SUM(E16:E20), nằm dưới vị trí chèn (chèn tại 16),
    // nên bị đẩy xuống 2 dòng -> phải thành SUM(E18:E22)
    const f4Cell = custWs.getCell('F4')
    const f4Formula = (f4Cell.value as { formula: string }).formula
    expect(f4Formula).toBe('SUM(E18:E22)')
  })

  it('tính nguyên tử: ném error và không ghi gì nếu có 1 phiếu lỗi', async () => {
    const wb = await createMockWorkbook()
    const metadata = extractWorkbookMetadata(wb)

    const entries: ShipmentEntry[] = [
      {
        id: '1',
        date: '2026-11-10',
        team: 'ĐỨC',
        vehicleName: '63H-02309',
        type: 'Xe',
        weightKg: 6510,
        customer: 'CHỊ BÉ BẢY',
        targetSheetName: 'CHỊ 7 (CTC)',
        contractRow: 3,
        note: 'HĐ',
      },
      {
        id: '2',
        date: '2026-11-10',
        team: 'ĐỨC',
        vehicleName: 'Xe Sai',
        type: 'Xe',
        weightKg: -100, // Lỗi kg âm
        customer: 'CHỊ BÉ BẢY',
        targetSheetName: 'CHỊ 7 (CTC)',
        contractRow: 3,
        note: 'HĐ',
      },
    ]

    await expect(writeShipments(wb, entries, metadata)).rejects.toThrow(/Phiếu số 2 lỗi/)
  })
})

