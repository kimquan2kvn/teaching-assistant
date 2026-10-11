import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

export type HolidayKind = 'LE' | 'DOT_XUAT' | 'KHAC';

// Ngày nghỉ áp dụng toàn trường (không gắn lớp/position) — đổi ngày nghỉ phải tính lại sổ báo giảng mọi position.
@Schema({ timestamps: true })
export class Holiday extends Document {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'SchoolYear', required: true })
  schoolYearId: Types.ObjectId;

  @Prop({ required: true })
  startDate: Date;

  @Prop({ required: true })
  endDate: Date;

  @Prop({ required: true, enum: ['LE', 'DOT_XUAT', 'KHAC'] })
  type: HolidayKind;

  @Prop({ required: true })
  name: string;
}

export const HolidaySchema = SchemaFactory.createForClass(Holiday);
HolidaySchema.index({ schoolYearId: 1, startDate: 1 });
