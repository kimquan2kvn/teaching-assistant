import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

@Schema({ timestamps: true })
export class PpctItem extends Document {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Position', required: true })
  positionId: Types.ObjectId;

  // Thứ tự rải vào TKB, do hệ thống gán. `week` chỉ để hiển thị, KHÔNG dùng để rải.
  @Prop({ required: true })
  order: number;

  @Prop({ required: true })
  week: number;

  // Chuỗi hiển thị ("15", "15-16", "TC3", "CĐ2"), không ép định dạng.
  @Prop({ required: true })
  periodLabel: string;

  @Prop({ required: true })
  title: string;

  @Prop({ required: true, default: 1 })
  periodCount: number;

  @Prop({ default: '' })
  requirement: string;

  @Prop()
  note?: string;
}

export const PpctItemSchema = SchemaFactory.createForClass(PpctItem);
PpctItemSchema.index({ positionId: 1, order: 1 }, { unique: true });
