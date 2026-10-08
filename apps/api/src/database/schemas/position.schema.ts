import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

export type PositionType = 'HOMEROOM' | 'SUBJECT';

@Schema({ timestamps: true })
export class Position extends Document {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Class', required: true })
  classId: Types.ObjectId;

  @Prop({ required: true, enum: ['HOMEROOM', 'SUBJECT'] })
  type: PositionType;

  @Prop()
  subject?: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', default: null })
  holderId: Types.ObjectId | null;
}

export const PositionSchema = SchemaFactory.createForClass(Position);

PositionSchema.index(
  { classId: 1, subject: 1 },
  { unique: true, partialFilterExpression: { type: 'SUBJECT' } },
);
PositionSchema.index(
  { classId: 1, type: 1 },
  { unique: true, partialFilterExpression: { type: 'HOMEROOM' } },
);
