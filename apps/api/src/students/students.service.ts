import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import ExcelJS from 'exceljs';
import { Student } from '../database/schemas/student.schema';
import type { CreateStudentInput, UpdateStudentInput, MarkTransferredInput } from '@so-chu-nhiem/shared';

export interface ImportPreviewRow {
  rowNumber: number;
  fullName: string;
  dob?: Date;
  errors: string[];
}

@Injectable()
export class StudentsService {
  constructor(@InjectModel(Student.name) private readonly studentModel: Model<Student>) {}

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

  async parsePreview(buffer: Buffer): Promise<ImportPreviewRow[]> {
    const workbook = new ExcelJS.Workbook();
    // exceljs' bundled type defs predate the current @types/node Buffer<ArrayBufferLike> generic.
    await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
    const sheet = workbook.worksheets[0];
    const rows: ImportPreviewRow[] = [];
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const fullName = String(row.getCell(1).text ?? '').trim();
      const dobRaw = String(row.getCell(2).text ?? '').trim();
      const errors: string[] = [];
      if (!fullName) errors.push('Họ và tên không được để trống');
      rows.push({ rowNumber, fullName, dob: dobRaw ? new Date(dobRaw) : undefined, errors });
    });
    return rows;
  }

  async bulkCreate(classId: string, rows: Array<{ fullName: string; dob?: Date }>): Promise<Student[]> {
    const invalidIndex = rows.findIndex((r) => !r.fullName?.trim());
    if (invalidIndex !== -1) {
      throw new BadRequestException(`Dòng thứ ${invalidIndex + 1} thiếu họ và tên, không lưu được`);
    }
    const docs = rows.map((r) => ({ classId, fullName: r.fullName, dob: r.dob }));
    return this.studentModel.insertMany(docs, { ordered: true });
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
