import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model } from 'mongoose';
import { SUBJECTS } from '@so-chu-nhiem/shared';
import type { CreateClassInput } from '@so-chu-nhiem/shared';
import { Class } from '../database/schemas/class.schema';
import { Position } from '../database/schemas/position.schema';
import { SchoolYearsService } from '../school-years/school-years.service';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_SUFFIX_LENGTH = 5;
const MAX_CODE_ATTEMPTS = 3;

function generateClassCode(name: string): string {
  let suffix = '';
  for (let i = 0; i < CODE_SUFFIX_LENGTH; i++) {
    suffix += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
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
}
