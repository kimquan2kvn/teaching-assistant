import { MAX_PPCT_PERIOD_COUNT, MAX_PPCT_WEEK } from '@so-chu-nhiem/shared';

// Giới hạn độ dài từng ô: bản sao của createPpctItemSchema (packages/shared) vì shared chưa export các hằng số này.
// Chỉ để tiền kiểm — import là "tất cả hoặc không gì" nên phải chỉ ra đúng dòng sai; backend vẫn là nguồn đúng.
export const PPCT_TITLE_MAX_LENGTH = 300;
export const PPCT_PERIOD_LABEL_MAX_LENGTH = 20;
export const PPCT_REQUIREMENT_MAX_LENGTH = 1000;
export const PPCT_NOTE_MAX_LENGTH = 500;

// Chỉ để hiển thị nhãn loại tiết (CK: 1, 2, 3...; TC: TC1...; CĐ: CĐ1...) — engine khớp tiết ở backend bỏ qua nhãn.
export function getPeriodKind(periodLabel) {
  const label = String(periodLabel ?? '')
    .trim()
    .toUpperCase();
  if (!label) return null;
  if (label.startsWith('TC')) return 'TC';
  if (label.startsWith('CĐ') || label.startsWith('CD')) return 'CĐ';
  return 'CK';
}

// Chỉ nhận số nguyên thật hoặc chuỗi toàn chữ số (như parser Excel ở backend): Number() sẽ nhận cả '1e1', '0x10'.
function toInteger(value) {
  if (typeof value === 'number') return Number.isInteger(value) ? value : null;
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) return Number(value.trim());
  return null;
}

function isIntegerBetween(value, min, max) {
  const integer = toInteger(value);
  return integer !== null && integer >= min && integer <= max;
}

// Backend trim chuỗi trước khi đếm độ dài, nên tiền kiểm cũng đếm sau khi cắt khoảng trắng hai đầu.
function trimmed(value) {
  return String(value ?? '').trim();
}

// Thông điệp khớp từng chữ với preview import ở backend (ppct-import.ts), cùng thứ tự các ô.
export function validatePpctRow(row) {
  const errors = [];

  if (!isIntegerBetween(row.week, 1, MAX_PPCT_WEEK)) {
    errors.push(`Tuần phải là số nguyên từ 1 đến ${MAX_PPCT_WEEK}`);
  }

  const title = trimmed(row.title);
  if (!title) errors.push('Bài học không được để trống');
  else if (title.length > PPCT_TITLE_MAX_LENGTH) {
    errors.push(`Bài học quá dài (tối đa ${PPCT_TITLE_MAX_LENGTH} ký tự)`);
  }

  if (!isIntegerBetween(row.periodCount, 1, MAX_PPCT_PERIOD_COUNT)) {
    errors.push(`Số tiết phải là số nguyên từ 1 đến ${MAX_PPCT_PERIOD_COUNT}`);
  }

  const periodLabel = trimmed(row.periodLabel);
  if (!periodLabel) errors.push('Tiết thứ không được để trống');
  else if (periodLabel.length > PPCT_PERIOD_LABEL_MAX_LENGTH) {
    errors.push(`Tiết thứ quá dài (tối đa ${PPCT_PERIOD_LABEL_MAX_LENGTH} ký tự)`);
  }

  if (trimmed(row.requirement).length > PPCT_REQUIREMENT_MAX_LENGTH) {
    errors.push(`Yêu cầu cần đạt quá dài (tối đa ${PPCT_REQUIREMENT_MAX_LENGTH} ký tự)`);
  }
  if (trimmed(row.note).length > PPCT_NOTE_MAX_LENGTH) {
    errors.push(`Ghi chú quá dài (tối đa ${PPCT_NOTE_MAX_LENGTH} ký tự)`);
  }

  return errors;
}

// Chỉ gọi cho dòng đã qua validatePpctRow. Dùng cho thêm mới và import commit: note trống thì BỎ khóa (backend
// coi note là tùy chọn). KHÔNG dùng nguyên cho PATCH — muốn xóa ghi chú đã lưu phải gửi `note: ''` tường minh.
export function toCommitRow(row) {
  const note = trimmed(row.note);
  return {
    week: toInteger(row.week),
    periodLabel: trimmed(row.periodLabel),
    title: trimmed(row.title),
    periodCount: toInteger(row.periodCount),
    requirement: trimmed(row.requirement),
    ...(note ? { note } : {}),
  };
}
