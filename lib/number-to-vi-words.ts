/**
 * Chuyển số tiền nguyên dương sang chữ tiếng Việt chuẩn văn bản hợp đồng.
 * Ví dụ:
 * - 0 -> "Không đồng"
 * - 21 -> "Hai mươi mốt đồng"
 * - 105 -> "Một trăm lẻ năm đồng"
 * - 1015000 -> "Một triệu không trăm mười lăm nghìn đồng"
 * - 1000000000 -> "Một tỷ đồng"
 * - 360000000 -> "Ba trăm sáu mươi triệu đồng"
 */

const DIGITS = [
  'không',
  'một',
  'hai',
  'ba',
  'bốn',
  'năm',
  'sáu',
  'bảy',
  'tám',
  'chín',
] as const;

/**
 * Đọc cụm 3 chữ số
 * @param n Số từ 0-999
 * @param showZeroHundreds Có đọc "không trăm" nếu hàng trăm bằng 0 hay không (khi có số lớn hơn phía trước)
 */
function readThreeDigits(n: number, showZeroHundreds: boolean): string {
  const hundreds = Math.floor(n / 100);
  const remainder = n % 100;
  const tens = Math.floor(remainder / 10);
  const units = remainder % 10;

  if (n === 0) return '';

  const words: string[] = [];

  // Hàng trăm
  if (hundreds > 0) {
    words.push(`${DIGITS[hundreds]} trăm`);
  } else if (showZeroHundreds) {
    words.push('không trăm');
  }

  // Hàng chục & đơn vị
  if (tens === 0) {
    if (units > 0) {
      if (hundreds > 0 || showZeroHundreds) {
        words.push(`lẻ ${DIGITS[units]}`);
      } else {
        words.push(DIGITS[units]);
      }
    }
  } else if (tens === 1) {
    words.push('mười');
    if (units === 1) {
      words.push('một');
    } else if (units === 5) {
      words.push('lăm');
    } else if (units > 0) {
      words.push(DIGITS[units]);
    }
  } else {
    // tens >= 2
    words.push(`${DIGITS[tens]} mươi`);
    if (units === 1) {
      words.push('mốt');
    } else if (units === 4) {
      words.push('bốn'); // hoặc tư
    } else if (units === 5) {
      words.push('lăm');
    } else if (units > 0) {
      words.push(DIGITS[units]);
    }
  }

  return words.join(' ');
}

const SCALE = ['', 'nghìn', 'triệu', 'tỷ'] as const;

export function moneyToVietnameseWords(amount: number): string {
  if (!Number.isFinite(amount) || amount < 0) {
    throw new RangeError('Số tiền phải là số dương hữu hạn');
  }

  const n = Math.round(amount);
  if (n === 0) return 'Không đồng';

  // Chia thành các nhóm 3 chữ số từ phải sang trái
  // Hỗ trợ số lớn tới hàng nghìn tỷ bằng cách chia theo bậc lũy thừa
  const groups: number[] = [];
  let temp = n;
  while (temp > 0) {
    groups.push(temp % 1000);
    temp = Math.floor(temp / 1000);
  }

  const parts: string[] = [];
  for (let i = groups.length - 1; i >= 0; i--) {
    const val = groups[i];
    if (val === 0) continue;

    // Chỉ đọc "không trăm" nếu phía trước đã có nhóm số lớn hơn
    const hasHigherGroup = parts.length > 0;
    const text = readThreeDigits(val, hasHigherGroup);

    // Xác định đơn vị tỷ, triệu, nghìn
    // Nếu > 3 nhóm (tỷ), cứ mỗi 3 nhóm lặp lại tỷ
    const scaleIndex = i % 4;
    const tyCount = Math.floor(i / 4);

    let scaleName = SCALE[scaleIndex] || '';
    if (tyCount > 0 && scaleIndex === 0) {
      scaleName = 'tỷ'.repeat(tyCount);
    } else if (tyCount > 0) {
      scaleName = `${scaleName} ${'tỷ'.repeat(tyCount)}`.trim();
    }

    if (scaleName) {
      parts.push(`${text} ${scaleName}`);
    } else {
      parts.push(text);
    }
  }

  const result = parts.join(' ').replace(/\s+/g, ' ').trim();
  // Viết hoa chữ cái đầu và thêm "đồng chẵn" hoặc "đồng"
  return result.charAt(0).toUpperCase() + result.slice(1) + ' đồng';
}

/**
 * Format số tiền có dấu chấm phân cách hàng nghìn (kiểu Việt Nam: 360.000.000)
 */
export function formatVND(amount: number): string {
  if (!Number.isFinite(amount)) return '0';
  return Math.round(amount)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

