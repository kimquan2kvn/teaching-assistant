import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type UserRole = 'TEACHER' | 'STUDENT' | 'ADMIN';

@Schema({ timestamps: true })
export class User extends Document {
  @Prop({ required: true, enum: ['TEACHER', 'STUDENT', 'ADMIN'] })
  role: UserRole;

  @Prop({ required: true, unique: true })
  username: string;

  @Prop()
  email?: string;

  @Prop({ required: true })
  passwordHash: string;

  @Prop({ default: false })
  mustChangePassword: boolean;

  @Prop({ type: Types.ObjectId, ref: 'Student' })
  studentId?: Types.ObjectId;
}

export const UserSchema = SchemaFactory.createForClass(User);
