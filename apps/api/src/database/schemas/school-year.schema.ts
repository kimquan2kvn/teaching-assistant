import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class SchoolYear extends Document {
  @Prop({ required: true, unique: true })
  name: string;

  @Prop({ required: true })
  startDate: Date;

  @Prop({ required: true })
  endDate: Date;

  @Prop({ default: false })
  isCurrent: boolean;
}

export const SchoolYearSchema = SchemaFactory.createForClass(SchoolYear);
SchoolYearSchema.index({ isCurrent: 1 }, { unique: true, partialFilterExpression: { isCurrent: true } });
