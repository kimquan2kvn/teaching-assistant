import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

@Schema({ timestamps: true })
export class TimetableSlot extends Document {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Position', required: true })
  positionId: Types.ObjectId;

  // Thứ Hai = 2 … Thứ Bảy = 7 (Chủ Nhật = 1 không bao giờ là ngày học).
  @Prop({ required: true })
  dayOfWeek: number;

  @Prop({ required: true })
  period: number;

  @Prop({ required: true })
  effectiveFrom: Date;

  // `| null` reflects to `Object` (not `Date`) via @nestjs/mongoose's design:type inference — needs an explicit
  // `type:` or it throws CannotDetermineTypeError at runtime. null = không giới hạn ngày kết thúc.
  @Prop({ type: Date, default: null })
  effectiveTo: Date | null;
}

export const TimetableSlotSchema = SchemaFactory.createForClass(TimetableSlot);
TimetableSlotSchema.index({ positionId: 1, dayOfWeek: 1, period: 1 });
