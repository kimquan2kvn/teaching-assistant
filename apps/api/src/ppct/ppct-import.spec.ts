import { BadRequestException } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { PPCT_IMPORT_HEADERS } from '@so-chu-nhiem/shared';
import { parsePpctWorkbook } from './ppct-import';

type Cell = string | number | null;

async function buildWorkbook(rows: Cell[][], opts: { header?: boolean } = {}): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('PPCT');
  if (opts.header !== false) sheet.addRow([...PPCT_IMPORT_HEADERS]);
  rows.forEach((row) => sheet.addRow(row));
  return (await workbook.xlsx.writeBuffer()) as unknown as Buffer;
}

const validRow = (n: number): Cell[] => [n, `Bài ${n}`, 1, String(n), `Yêu cầu ${n}`, `Ghi chú ${n}`];

async function expectBadRequest(promise: Promise<unknown>, message: string) {
  const error = await promise.then(
    () => null,
    (err: unknown) => err,
  );
  expect(error).toBeInstanceOf(BadRequestException);
  expect((error as BadRequestException).message).toBe(message);
}

describe('parsePpctWorkbook', () => {
  it('3 dòng hợp lệ -> errors rỗng, rowNumber là số dòng Excel (bỏ dòng tiêu đề)', async () => {
    const rows = await parsePpctWorkbook(await buildWorkbook([validRow(1), validRow(2), validRow(3)]));

    expect(rows).toHaveLength(3);
    expect(rows.map((row) => row.rowNumber)).toEqual([2, 3, 4]);
    expect(rows.every((row) => row.errors.length === 0)).toBe(true);
    expect(rows[0]).toEqual({
      rowNumber: 2,
      week: 1,
      title: 'Bài 1',
      periodCount: 1,
      periodLabel: '1',
      requirement: 'Yêu cầu 1',
      note: 'Ghi chú 1',
      errors: [],
    });
  });

  it('ô số và ô chuỗi số đều được nhận; tiết thứ dạng "15-16" và "TC1" giữ nguyên; yêu cầu/ghi chú trống thành chuỗi rỗng', async () => {
    const rows = await parsePpctWorkbook(
      await buildWorkbook([
        [3, 'Bài A', 2, '15-16', null, null],
        ['  7 ', '  Bài B  ', ' 10 ', ' TC1 ', '  Yêu cầu  ', '  Ghi chú  '],
        [60, 'Bài C', 1, 15, '', ''],
      ]),
    );

    expect(rows[0]).toMatchObject({ week: 3, periodCount: 2, periodLabel: '15-16', requirement: '', note: '', errors: [] });
    expect(rows[1]).toMatchObject({
      week: 7,
      title: 'Bài B',
      periodCount: 10,
      periodLabel: 'TC1',
      requirement: 'Yêu cầu',
      note: 'Ghi chú',
      errors: [],
    });
    expect(rows[2]).toMatchObject({ week: 60, periodLabel: '15', errors: [] });
  });

  it('dòng sai Tuần, Bài học, Số tiết, Tiết thứ -> đúng từng message theo thứ tự cột', async () => {
    const rows = await parsePpctWorkbook(await buildWorkbook([['abc', '', 0, '', 'Yêu cầu', '']]));

    expect(rows).toHaveLength(1);
    expect(rows[0].week).toBeNull();
    expect(rows[0].periodCount).toBeNull();
    expect(rows[0].errors).toEqual([
      'Tuần phải là số nguyên từ 1 đến 60',
      'Bài học không được để trống',
      'Số tiết phải là số nguyên từ 1 đến 10',
      'Tiết thứ không được để trống',
    ]);
  });

  it.each<[string, Cell, string]>([
    ['Tuần = 0', 0, 'Tuần phải là số nguyên từ 1 đến 60'],
    ['Tuần = 61', 61, 'Tuần phải là số nguyên từ 1 đến 60'],
    ['Tuần = 1.5', 1.5, 'Tuần phải là số nguyên từ 1 đến 60'],
    ['Tuần = -2', -2, 'Tuần phải là số nguyên từ 1 đến 60'],
    ['Tuần = "1e1"', '1e1', 'Tuần phải là số nguyên từ 1 đến 60'],
    ['Tuần để trống', null, 'Tuần phải là số nguyên từ 1 đến 60'],
  ])('%s -> báo lỗi Tuần và week = null', async (_label, week, message) => {
    const [row] = await parsePpctWorkbook(await buildWorkbook([[week, 'Bài', 1, '1', '', '']]));

    expect(row.errors).toEqual([message]);
    expect(row.week).toBeNull();
  });

  it.each<[string, Cell]>([
    ['Số tiết = 0', 0],
    ['Số tiết = 11', 11],
    ['Số tiết = 2.5', 2.5],
    ['Số tiết = "ba"', 'ba'],
    ['Số tiết để trống', null],
  ])('%s -> báo lỗi Số tiết và periodCount = null', async (_label, periodCount) => {
    const [row] = await parsePpctWorkbook(await buildWorkbook([[1, 'Bài', periodCount, '1', '', '']]));

    expect(row.errors).toEqual(['Số tiết phải là số nguyên từ 1 đến 10']);
    expect(row.periodCount).toBeNull();
  });

  it('Bài học dài đúng 300 ký tự hợp lệ, 301 ký tự -> "Bài học quá dài (tối đa 300 ký tự)"', async () => {
    const rows = await parsePpctWorkbook(
      await buildWorkbook([
        [1, 'a'.repeat(300), 1, '1', '', ''],
        [2, 'a'.repeat(301), 1, '2', '', ''],
      ]),
    );

    expect(rows[0].errors).toEqual([]);
    expect(rows[1].errors).toEqual(['Bài học quá dài (tối đa 300 ký tự)']);
  });

  // Preview báo "hợp lệ" thì commit (createPpctItemSchema) phải nhận được; nếu không người dùng sẽ bị 400 sau khi đã xem trước.
  it('Tiết thứ > 20 ký tự, Yêu cầu > 1000 ký tự, Ghi chú > 500 ký tự (giới hạn của schema commit) -> báo lỗi ở preview', async () => {
    const [row] = await parsePpctWorkbook(
      await buildWorkbook([[1, 'Bài', 1, 'x'.repeat(21), 'y'.repeat(1001), 'z'.repeat(501)]]),
    );

    expect(row.errors).toEqual([
      'Tiết thứ quá dài (tối đa 20 ký tự)',
      'Yêu cầu cần đạt quá dài (tối đa 1000 ký tự)',
      'Ghi chú quá dài (tối đa 500 ký tự)',
    ]);
  });

  it('bỏ dòng trống hoàn toàn (kể cả dòng chỉ có khoảng trắng) nhưng giữ đúng rowNumber của các dòng còn lại', async () => {
    const rows = await parsePpctWorkbook(
      await buildWorkbook([validRow(1), [], ['', '', '', '', '', ''], ['  ', null, ' ', '', '', ''], validRow(2)]),
    );

    expect(rows.map((row) => row.rowNumber)).toEqual([2, 6]);
    expect(rows.map((row) => row.title)).toEqual(['Bài 1', 'Bài 2']);
  });

  it('dòng chỉ có ghi chú (thiếu mọi trường bắt buộc) KHÔNG bị coi là trống: báo đủ 4 lỗi', async () => {
    const [row] = await parsePpctWorkbook(await buildWorkbook([[null, null, null, null, null, 'chỉ có ghi chú']]));

    expect(row.errors).toHaveLength(4);
  });

  it('chỉ có dòng tiêu đề -> mảng rỗng', async () => {
    expect(await parsePpctWorkbook(await buildWorkbook([]))).toEqual([]);
  });

  it('dòng 1 luôn là tiêu đề dù nội dung là gì (dữ liệu bắt đầu từ dòng 2)', async () => {
    const rows = await parsePpctWorkbook(await buildWorkbook([validRow(1)], { header: false }));

    expect(rows).toEqual([]);
  });

  it('file không phải xlsx -> 400 "File không đúng định dạng Excel (.xlsx)"', async () => {
    await expectBadRequest(parsePpctWorkbook(Buffer.from('đây không phải file excel')), 'File không đúng định dạng Excel (.xlsx)');
    await expectBadRequest(parsePpctWorkbook(Buffer.alloc(0)), 'File không đúng định dạng Excel (.xlsx)');
  });

  it('workbook không có sheet nào -> 400 "File Excel không có sheet nào"', async () => {
    const workbook = new ExcelJS.Workbook();
    const buffer = (await workbook.xlsx.writeBuffer()) as unknown as Buffer;

    await expectBadRequest(parsePpctWorkbook(buffer), 'File Excel không có sheet nào');
  });

  it('đúng 500 dòng dữ liệu hợp lệ; thêm dòng trống không bị tính vào giới hạn', async () => {
    const data = Array.from({ length: 500 }, (_, i) => validRow((i % 60) + 1));

    const rows = await parsePpctWorkbook(await buildWorkbook([...data, [], ['', '', '', '', '', '']]));

    expect(rows).toHaveLength(500);
    expect(rows[499].rowNumber).toBe(501);
  });

  it('501 dòng dữ liệu -> 400 "File có quá nhiều dòng (tối đa 500)"', async () => {
    const data = Array.from({ length: 501 }, (_, i) => validRow((i % 60) + 1));

    await expectBadRequest(parsePpctWorkbook(await buildWorkbook(data)), 'File có quá nhiều dòng (tối đa 500)');
  });
});
