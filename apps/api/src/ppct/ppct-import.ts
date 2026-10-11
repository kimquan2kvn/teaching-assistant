import { BadRequestException } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { MAX_PPCT_IMPORT_ROWS, MAX_PPCT_PERIOD_COUNT, MAX_PPCT_WEEK } from '@so-chu-nhiem/shared';

export interface PpctImportPreviewRow {
  rowNumber: number;
  week: number | null;
  title: string;
  periodCount: number | null;
  periodLabel: string;
  requirement: string;
  note: string;
  errors: string[];
}

// Giới hạn độ dài khớp createPpctItemSchema: preview báo "hợp lệ" thì commit phải nhận được dòng đó.
const MAX_TITLE_LENGTH = 300;
const MAX_PERIOD_LABEL_LENGTH = 20;
const MAX_REQUIREMENT_LENGTH = 1000;
const MAX_NOTE_LENGTH = 500;

const COL_WEEK = 1;
const COL_TITLE = 2;
const COL_PERIOD_COUNT = 3;
const COL_PERIOD_LABEL = 4;
const COL_REQUIREMENT = 5;
const COL_NOTE = 6;

// Chỉ nhận chuỗi số nguyên không dấu: Number() sẽ nhận cả '1e1', '0x10', ' ' (thành 0) nên không dùng được.
function parseBoundedInt(text: string, max: number): number | null {
  if (!/^\d+$/.test(text)) return null;
  const value = Number(text);
  return value >= 1 && value <= max ? value : null;
}

function parseRow(row: ExcelJS.Row, rowNumber: number): PpctImportPreviewRow | null {
  const text = (col: number) => String(row.getCell(col).text ?? '').trim();
  const weekText = text(COL_WEEK);
  const title = text(COL_TITLE);
  const periodCountText = text(COL_PERIOD_COUNT);
  const periodLabel = text(COL_PERIOD_LABEL);
  const requirement = text(COL_REQUIREMENT);
  const note = text(COL_NOTE);

  if (![weekText, title, periodCountText, periodLabel, requirement, note].some(Boolean)) return null;

  const week = parseBoundedInt(weekText, MAX_PPCT_WEEK);
  const periodCount = parseBoundedInt(periodCountText, MAX_PPCT_PERIOD_COUNT);
  const errors: string[] = [];
  if (week === null) errors.push(`Tuần phải là số nguyên từ 1 đến ${MAX_PPCT_WEEK}`);
  if (!title) errors.push('Bài học không được để trống');
  else if (title.length > MAX_TITLE_LENGTH) errors.push(`Bài học quá dài (tối đa ${MAX_TITLE_LENGTH} ký tự)`);
  if (periodCount === null) errors.push(`Số tiết phải là số nguyên từ 1 đến ${MAX_PPCT_PERIOD_COUNT}`);
  if (!periodLabel) errors.push('Tiết thứ không được để trống');
  else if (periodLabel.length > MAX_PERIOD_LABEL_LENGTH) {
    errors.push(`Tiết thứ quá dài (tối đa ${MAX_PERIOD_LABEL_LENGTH} ký tự)`);
  }
  if (requirement.length > MAX_REQUIREMENT_LENGTH) {
    errors.push(`Yêu cầu cần đạt quá dài (tối đa ${MAX_REQUIREMENT_LENGTH} ký tự)`);
  }
  if (note.length > MAX_NOTE_LENGTH) errors.push(`Ghi chú quá dài (tối đa ${MAX_NOTE_LENGTH} ký tự)`);

  return { rowNumber, week, title, periodCount, periodLabel, requirement, note, errors };
}

// Parser thuần (không DB) cho file mẫu PPCT: dòng 1 là tiêu đề, cột 1-6 = Tuần, Bài học, Số tiết, Tiết thứ,
// Yêu cầu cần đạt, Ghi chú. Dòng trống hoàn toàn bị bỏ và không tính vào giới hạn số dòng.
export async function parsePpctWorkbook(buffer: Buffer): Promise<PpctImportPreviewRow[]> {
  const workbook = new ExcelJS.Workbook();
  try {
    // exceljs' bundled type defs predate the current @types/node Buffer<ArrayBufferLike> generic.
    await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  } catch {
    throw new BadRequestException('File không đúng định dạng Excel (.xlsx)');
  }
  const sheet = workbook.worksheets[0];
  if (!sheet) {
    throw new BadRequestException('File Excel không có sheet nào');
  }

  const rows: PpctImportPreviewRow[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const parsed = parseRow(row, rowNumber);
    if (parsed) rows.push(parsed);
  });
  if (rows.length > MAX_PPCT_IMPORT_ROWS) {
    throw new BadRequestException(`File có quá nhiều dòng (tối đa ${MAX_PPCT_IMPORT_ROWS})`);
  }
  return rows;
}
