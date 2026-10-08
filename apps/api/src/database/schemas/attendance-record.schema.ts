import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

export type AttendanceStatus = 'PRESENT' | 'EXCUSED' | 'LATE' | 'UNEXCUSED';

@Schema({ timestamps: true })
export class AttendanceRecord extends Document {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Class', required: true })
  classId: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Position', required: true })
  positionId: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Student', required: true })
  studentId: Types.ObjectId;

  @Prop({ required: true })
  date: Date;

  @Prop({ required: true, enum: ['PRESENT', 'EXCUSED', 'LATE', 'UNEXCUSED'], default: 'PRESENT' })
  status: AttendanceStatus;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  recordedBy: Types.ObjectId;
}

export const AttendanceRecordSchema = SchemaFactory.createForClass(AttendanceRecord);
AttendanceRecordSchema.index({ positionId: 1, studentId: 1, date: 1 }, { unique: true });
AttendanceRecordSchema.index({ classId: 1, date: 1 });
