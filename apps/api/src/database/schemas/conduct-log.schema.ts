import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

@Schema({ timestamps: true })
export class ConductLog extends Document {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Class', required: true })
  classId: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Position', required: true })
  positionId: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Student', required: true })
  studentId: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'ConductCatalogItem', default: null })
  catalogItemId: Types.ObjectId | null;

  @Prop({ required: true })
  points: number;

  @Prop()
  note?: string;

  @Prop({ required: true })
  date: Date;

  @Prop({ required: true })
  weekStart: Date;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  recordedBy: Types.ObjectId;
}

export const ConductLogSchema = SchemaFactory.createForClass(ConductLog);
ConductLogSchema.index({ studentId: 1, weekStart: 1 });
ConductLogSchema.index({ classId: 1, date: 1 });
