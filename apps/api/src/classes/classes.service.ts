import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import { randomInt } from 'crypto';
import { SUBJECTS } from '@so-chu-nhiem/shared';
import type { CreateClassInput } from '@so-chu-nhiem/shared';
import { Class } from '../database/schemas/class.schema';
import { Position } from '../database/schemas/position.schema';
import { User } from '../database/schemas/user.schema';
import { SchoolYearsService } from '../school-years/school-years.service';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_SUFFIX_LENGTH = 5;
const MAX_CODE_ATTEMPTS = 3;

// Mã lớp là "capability": ai có mã là nhận được vị trí SUBJECT còn trống của lớp đó (POST /positions/join).
// Phải dùng CSPRNG (crypto.randomInt), không dùng Math.random() — trạng thái của Math.random có thể bị suy ra
// ngược từ vài kết quả đã biết, nghĩa là 1 giáo viên tạo 2 lớp có thể đoán được mã lớp tiếp theo.
export function generateClassCode(name: string): string {
  let suffix = '';
  for (let i = 0; i < CODE_SUFFIX_LENGTH; i++) {
    suffix += CODE_ALPHABET[randomInt(0, CODE_ALPHABET.length)];
  }
  return `${name}-${suffix}`;
}

export interface PositionPublicView {
  type: 'HOMEROOM' | 'SUBJECT';
  subject?: string;
  holderId: string | null;
}

export interface PositionAvailabilityView {
  type: 'HOMEROOM' | 'SUBJECT';
  subject?: string;
  taken: boolean;
}

export interface PositionHolderView {
  id: string;
  type: 'HOMEROOM' | 'SUBJECT';
  subject?: string;
  holder: { id: string; fullName: string } | null;
}

export interface ClassDetailView {
  class: { id: string; code: string; name: string };
  positions: PositionHolderView[];
}

@Injectable()
export class ClassesService {
  constructor(
    @InjectModel(Class.name) private readonly classModel: Model<Class>,
    @InjectModel(Position.name) private readonly positionModel: Model<Position>,
    @InjectConnection() private readonly connection: Connection,
    private readonly schoolYearsService: SchoolYearsService,
  ) {}

  async create(
    teacherId: string,
    input: CreateClassInput,
  ): Promise<{ class: Class; positions: PositionPublicView[] }> {
    const schoolYear = await this.schoolYearsService.getCurrent();

    const session = await this.connection.startSession();
    try {
      let createdClass!: Class;
      let createdPositions!: Position[];

      for (let attempt = 1; attempt <= MAX_CODE_ATTEMPTS; attempt++) {
        const code = generateClassCode(input.name);
        try {
          await session.withTransaction(async () => {
            const [klass] = await this.classModel.create(
              [{ code, name: input.name, schoolYearId: schoolYear._id }],
              { session },
            );
            createdClass = klass;

            const positionsToInsert = [
              {
                classId: klass._id,
                type: 'HOMEROOM' as const,
                holderId: input.claimHomeroom ? teacherId : null,
              },
              ...SUBJECTS.map((subject) => ({
                classId: klass._id,
                type: 'SUBJECT' as const,
                subject,
                holderId: null,
              })),
            ];
            createdPositions = await this.positionModel.insertMany(positionsToInsert, { session });
          });
          break;
        } catch (err) {
          const isDuplicateKey = (err as { code?: number })?.code === 11000;
          if (isDuplicateKey && attempt < MAX_CODE_ATTEMPTS) {
            continue;
          }
          throw err;
        }
      }

      return {
        class: createdClass,
        positions: createdPositions.map((p) => ({
          type: p.type,
          subject: p.subject,
          holderId: p.holderId ? String(p.holderId) : null,
        })),
      };
    } finally {
      await session.endSession();
    }
  }

  async findByCode(code: string): Promise<{ class: Class; positions: PositionAvailabilityView[] }> {
    const klass = await this.classModel.findOne({ code }).exec();
    if (!klass) {
      throw new NotFoundException('Không tìm thấy lớp với mã này');
    }
    const positions = await this.positionModel.find({ classId: klass._id }).exec();
    return {
      class: klass,
      positions: positions.map((p) => ({
        type: p.type,
        subject: p.subject,
        taken: p.holderId !== null,
      })),
    };
  }

  async findDetail(classId: string): Promise<ClassDetailView> {
    // classId không hợp lệ hoặc không tồn tại đều phải trả 404 rõ ràng cho client (ADMIN vượt qua PositionGuard
    // nên có thể gọi tới đây với classId bất kỳ — không được để lọt CastError của Mongoose ra ngoài thành 500).
    if (!Types.ObjectId.isValid(classId)) {
      throw new NotFoundException('Không tìm thấy lớp');
    }
    const klass = await this.classModel.findById(classId).exec();
    if (!klass) {
      throw new NotFoundException('Không tìm thấy lớp');
    }

    const positions = await this.positionModel
      .find({ classId: klass._id })
      .populate<{ holderId: Pick<User, 'fullName'> & { _id: Types.ObjectId } }>('holderId', 'fullName')
      .exec();

    return {
      class: { id: String(klass._id), code: klass.code, name: klass.name },
      positions: positions.map((p) => ({
        id: String(p._id),
        type: p.type,
        subject: p.subject,
        holder: p.holderId ? { id: String(p.holderId._id), fullName: p.holderId.fullName } : null,
      })),
    };
  }
}
