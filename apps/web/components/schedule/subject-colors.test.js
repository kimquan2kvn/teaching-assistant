import colors from 'tailwindcss/colors';
import { SUBJECTS } from '@so-chu-nhiem/shared';
import { getSubjectColor } from './subject-colors';

// Màu có ngữ nghĩa riêng trong app: đỏ = vi phạm/vắng, xanh lá = có mặt/điểm cộng, vàng = nút chính/mục đang chọn.
const FORBIDDEN_HUES = ['red', 'rose', 'green', 'emerald', 'lime', 'yellow', 'amber'];
const CLASS_TOKEN = /^(bg|border|text)-([a-z]+)-(\d{2,3})$/;

const NEUTRAL = getSubjectColor(undefined);

function parseTokens(classString) {
  return classString.split(/\s+/).map((token) => {
    const match = CLASS_TOKEN.exec(token);
    return match ? { token, prefix: match[1], hue: match[2], shade: match[3] } : { token };
  });
}

const ALL_COLORS = [...SUBJECTS.map((subject) => getSubjectColor(subject)), NEUTRAL];

describe('getSubjectColor', () => {
  test('13 môn trong SUBJECTS có 13 chuỗi cell khác nhau', () => {
    expect(SUBJECTS).toHaveLength(13);
    const cells = SUBJECTS.map((subject) => getSubjectColor(subject).cell);
    expect(new Set(cells).size).toBe(13);
  });

  test('mọi môn trong SUBJECTS có màu riêng, không rơi về màu trung tính (bắt trường hợp thêm môn mới mà quên thêm màu)', () => {
    SUBJECTS.forEach((subject) => {
      expect(getSubjectColor(subject)).not.toEqual(NEUTRAL);
    });
  });

  test('mỗi cell chứa đủ đúng 3 class bg-, border-, text-', () => {
    ALL_COLORS.forEach(({ cell }) => {
      const prefixes = parseTokens(cell).map((entry) => entry.prefix);
      expect(prefixes).toEqual(['bg', 'border', 'text']);
    });
  });

  test('môn lạ, undefined, rỗng, null và tên trùng thuộc tính của Object đều trả CÙNG 1 màu trung tính, không ném lỗi', () => {
    ['Môn lạ', undefined, '', null, 'constructor', 'toString', '__proto__'].forEach((subject) => {
      expect(() => getSubjectColor(subject)).not.toThrow();
      expect(getSubjectColor(subject)).toEqual(NEUTRAL);
    });
    expect(typeof NEUTRAL.cell).toBe('string');
    expect(typeof NEUTRAL.dot).toBe('string');
  });

  test('màu trung tính khác cell của cả 13 môn (môn lạ phải nhìn ra được là chưa có màu)', () => {
    const subjectCells = SUBJECTS.map((subject) => getSubjectColor(subject).cell);
    expect(subjectCells).not.toContain(NEUTRAL.cell);
  });

  test('không màu nào dùng hue đỏ/xanh lá/vàng — trùng ngữ nghĩa vi phạm/có mặt/nút chính', () => {
    ALL_COLORS.forEach(({ cell, dot }) => {
      [...parseTokens(cell), ...parseTokens(dot)].forEach(({ token, hue }) => {
        expect({ token, isForbidden: FORBIDDEN_HUES.includes(hue) }).toEqual({ token, isForbidden: false });
      });
    });
  });

  test('mọi class là class Tailwind có thật (hue + độ đậm nằm trong bảng màu mặc định) và cell/dot cùng hue — tránh gõ sai làm ô mất màu âm thầm', () => {
    ALL_COLORS.forEach(({ cell, dot }) => {
      const cellTokens = parseTokens(cell);
      const dotTokens = parseTokens(dot);
      expect(dotTokens.map((entry) => entry.prefix)).toEqual(['bg']);
      [...cellTokens, ...dotTokens].forEach(({ token, hue, shade }) => {
        expect({ token, exists: Boolean(colors[hue]?.[shade]) }).toEqual({ token, exists: true });
      });
      const hues = new Set([...cellTokens, ...dotTokens].map((entry) => entry.hue));
      expect(hues.size).toBe(1);
    });
  });
});
