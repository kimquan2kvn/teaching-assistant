import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

// 1 mục PPCT = 1 LessonLog dù periodCount > 1: `date` là ngày của ô đầu tiên.
@Schema({ timestamps: true })
export class LessonLog extends Document {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Position', required: true })
  positionId: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'PpctItem', required: true })
  ppctItemId: Types.ObjectId;

  @Prop({ required: true })
  date: Date;

  @Prop({ default: false })
  isManuallyAdjusted: boolean;

  @Prop({ default: false })
  done: boolean;
}

export const LessonLogSchema = SchemaFactory.createForClass(LessonLog);
LessonLogSchema.index({ positionId: 1, ppctItemId: 1 }, { unique: true });
LessonLogSchema.index({ positionId: 1, date: 1 });
