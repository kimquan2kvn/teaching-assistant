import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

@Schema({ timestamps: true })
export class Semester extends Document {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'SchoolYear', required: true })
  schoolYearId: Types.ObjectId;

  @Prop({ required: true, enum: [1, 2] })
  term: number;

  @Prop({ required: true })
  startDate: Date;

  @Prop({ required: true })
  endDate: Date;
}

export const SemesterSchema = SchemaFactory.createForClass(Semester);
SemesterSchema.index({ schoolYearId: 1, term: 1 }, { unique: true });
