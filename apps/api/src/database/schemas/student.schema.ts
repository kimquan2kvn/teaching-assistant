import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type StudentStatus = 'ACTIVE' | 'TRANSFERRED';

@Schema({ timestamps: true })
export class Student extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Class', required: true })
  classId: Types.ObjectId;

  @Prop({ required: true })
  fullName: string;

  @Prop()
  dob?: Date;

  @Prop({ required: true, enum: ['ACTIVE', 'TRANSFERRED'], default: 'ACTIVE' })
  status: StudentStatus;

  @Prop()
  transferDate?: Date;

  @Prop()
  transferReason?: string;
}

export const StudentSchema = SchemaFactory.createForClass(Student);
StudentSchema.index({ classId: 1, status: 1 });
