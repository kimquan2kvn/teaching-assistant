import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';
import { PunishmentStatus } from '@so-chu-nhiem/shared';

export type PunishmentKind = 'WEEKLY_THRESHOLD' | 'HOMEWORK_REPEAT';

@Schema({ timestamps: true })
export class Punishment extends Document {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Student', required: true })
  studentId: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Class', required: true })
  classId: Types.ObjectId;

  @Prop({ required: true, enum: ['WEEKLY_THRESHOLD', 'HOMEWORK_REPEAT'] })
  kind: PunishmentKind;

  @Prop({ required: true })
  reason: string;

  @Prop({ required: true })
  lines: number;

  @Prop({ required: true })
  dueDate: Date;

  @Prop({ required: true, enum: ['PENDING', 'SUBMITTED', 'LATE'], default: 'PENDING' })
  status: PunishmentStatus;

  @Prop({ default: false })
  notifyParent: boolean;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'ConductLog', required: true })
  triggerConductLogId: Types.ObjectId;

  // `| null` reflects to `Object` (not `Date`) via @nestjs/mongoose's design:type inference — same class of
  // bug as ConductCatalogItem.specialRule in Phase 2A — needs an explicit `type:` or it throws
  // CannotDetermineTypeError at runtime.
  @Prop({ type: Date, default: null })
  weekStart: Date | null;
}

export const PunishmentSchema = SchemaFactory.createForClass(Punishment);
PunishmentSchema.index(
  { studentId: 1, weekStart: 1 },
  { unique: true, partialFilterExpression: { kind: 'WEEKLY_THRESHOLD' } },
);
