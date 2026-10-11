import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class SchoolConfig extends Document {
  @Prop({ required: true, default: 2 })
  weeklyViolationThreshold: number;

  @Prop({ required: true, default: 2 })
  defaultPunishmentDueDays: number;

  @Prop({ required: true, default: 20 })
  defaultWeeklyPunishmentLines: number;

  // Chỉ dùng cho thẻ thống kê ngày dạy còn lại; engine khớp tiết không đọc cờ này.
  @Prop({ default: false })
  saturdayIsSchoolDay: boolean;
}

export const SchoolConfigSchema = SchemaFactory.createForClass(SchoolConfig);
