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
}

export const SchoolConfigSchema = SchemaFactory.createForClass(SchoolConfig);
