import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Student } from '../database/schemas/student.schema';
import type { CreateStudentInput, UpdateStudentInput, MarkTransferredInput } from '@so-chu-nhiem/shared';

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
