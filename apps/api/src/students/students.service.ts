import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import ExcelJS from 'exceljs';
import { Student } from '../database/schemas/student.schema';
import type { CreateStudentInput, UpdateStudentInput, MarkTransferredInput } from '@so-chu-nhiem/shared';

export interface ImportPreviewRow {
  rowNumber: number;
  fullName: string;
  dob?: Date;
  errors: string[];
}

// Chấp nhận "dd/mm/yyyy" (định dạng ngày phổ biến trong file Excel tiếng Việt) hoặc ISO "yyyy-mm-dd".
// `new Date(raw)` một mình là không đủ: nó parse "dd/mm/yyyy" theo kiểu Mỹ (mm/dd/yyyy) nên âm thầm đổi
// ngày/tháng cho nhau, và với chuỗi nó không nhận ra sẽ trả về Invalid Date mà KHÔNG throw — nếu không bị
// bắt riêng, Invalid Date đó lọt qua tới tận lúc JSON.stringify ở response (thành `null`) mà preview không
// báo lỗi gì cả.
function parseVietnameseDate(raw: string): Date | undefined {
  const ddmmyyyy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(raw);
  if (ddmmyyyy) {
    const day = Number(ddmmyyyy[1]);
    const month = Number(ddmmyyyy[2]);
    const year = Number(ddmmyyyy[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    // Date.UTC tự "lăn" ngày/tháng vượt giới hạn (vd tháng 13 → tháng 1 năm sau) thay vì báo lỗi — phải so
    // lại xem có đúng là ngày/tháng/năm đã nhập hay không để phát hiện trường hợp đó.
    const rolledOver = date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day;
    return rolledOver ? undefined : date;
  }
  const iso = new Date(raw);
  return Number.isNaN(iso.getTime()) ? undefined : iso;
}

@Injectable()
export class StudentsService {
  constructor(
    @InjectModel(Student.name) private readonly studentModel: Model<Student>,
    @InjectConnection() private readonly connection: Connection,
  ) {}

  async list(classId: string, status: 'ACTIVE' | 'ALL' = 'ACTIVE'): Promise<Student[]> {
    const filter: Record<string, unknown> = { classId };
    if (status === 'ACTIVE') filter.status = 'ACTIVE';
    return this.studentModel.find(filter).exec();
  }

  async create(classId: string, input: CreateStudentInput): Promise<Student> {
    return this.studentModel.create({ classId, fullName: input.fullName, dob: input.dob });
  }

  async update(classId: string, studentId: string, input: UpdateStudentInput): Promise<Student> {
    const student = await this.findInClassOrThrow(classId, studentId);
    if (input.fullName !== undefined) student.fullName = input.fullName;
    if (input.dob !== undefined) student.dob = input.dob;
    await student.save();
    return student;
  }

  async transfer(classId: string, studentId: string, input: MarkTransferredInput): Promise<Student> {
    const student = await this.findInClassOrThrow(classId, studentId);
    student.status = 'TRANSFERRED';
    student.transferDate = input.transferDate;
    student.transferReason = input.transferReason;
    await student.save();
    return student;
  }

  // Dùng bởi các module khác (điểm danh, vi phạm/điểm cộng) để chặn ghi dữ liệu cho học sinh KHÔNG thuộc lớp
  // đang thao tác — cùng lý do với findInClassOrThrow: PositionGuard/PositionOwnerGuard chỉ xác nhận người gọi
  // giữ đúng vị trí của 1 lớp, không xác nhận studentId trong body có THẬT SỰ thuộc lớp đó hay không.
  async verifyAllInClass(classId: string, studentIds: string[]): Promise<void> {
    const validIds = studentIds.filter((id) => Types.ObjectId.isValid(id));
    if (validIds.length !== studentIds.length) {
      throw new NotFoundException('Không tìm thấy học sinh trong lớp này');
    }
    const count = await this.studentModel.countDocuments({ _id: { $in: validIds }, classId }).exec();
    if (count !== studentIds.length) {
      throw new NotFoundException('Không tìm thấy học sinh trong lớp này');
    }
  }

  async parsePreview(buffer: Buffer): Promise<ImportPreviewRow[]> {
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
    const rows: ImportPreviewRow[] = [];
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const fullName = String(row.getCell(1).text ?? '').trim();
      const dobRaw = String(row.getCell(2).text ?? '').trim();
      const errors: string[] = [];
      if (!fullName) errors.push('Họ và tên không được để trống');
      const dob = dobRaw ? parseVietnameseDate(dobRaw) : undefined;
      if (dobRaw && !dob) errors.push('Ngày sinh không hợp lệ (định dạng dd/mm/yyyy)');
      rows.push({ rowNumber, fullName, dob, errors });
    });
    return rows;
  }

  async bulkCreate(classId: string, rows: Array<{ fullName: string; dob?: Date }>): Promise<Student[]> {
    const invalidIndex = rows.findIndex((r) => !r.fullName?.trim());
    if (invalidIndex !== -1) {
      throw new BadRequestException(`Dòng thứ ${invalidIndex + 1} thiếu họ và tên, không lưu được`);
    }
    const docs = rows.map((r) => ({ classId, fullName: r.fullName, dob: r.dob }));
    const session = await this.connection.startSession();
    try {
      let created: Student[] = [];
      await session.withTransaction(async () => {
        created = await this.studentModel.insertMany(docs, { session, ordered: true });
      });
      return created;
    } catch (err) {
      if ((err as { code?: number })?.code === 11000) {
        throw new BadRequestException('Dữ liệu import có dòng trùng lặp, không lưu được dòng nào');
      }
      throw err;
    } finally {
      await session.endSession();
    }
  }

  // GVCN chỉ được đọc/sửa classId của đúng lớp họ đang giữ HOMEROOM (đã kiểm tra ở PositionGuard theo
  // classId trên URL) — nhưng PositionGuard không biết studentId trên URL có THẬT SỰ thuộc classId đó hay
  // không. Phải tự kiểm tra lại ở đây, nếu không 1 GVCN hợp lệ của lớp A có thể sửa học sinh lớp B bằng cách
  // giữ nguyên classId của lớp A trên URL nhưng truyền studentId của lớp B.
  private async findInClassOrThrow(classId: string, studentId: string): Promise<Student> {
    if (!Types.ObjectId.isValid(studentId)) {
      throw new NotFoundException('Không tìm thấy học sinh');
    }
    const student = await this.studentModel.findById(studentId).exec();
    if (!student || String(student.classId) !== classId) {
      throw new NotFoundException('Không tìm thấy học sinh trong lớp này');
    }
    return student;
  }
}
