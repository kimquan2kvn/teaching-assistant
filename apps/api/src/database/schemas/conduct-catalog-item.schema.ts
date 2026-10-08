import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ConductKind = 'VIOLATION' | 'MERIT';
export type ConductSpecialRule = 'HOMEWORK_NOT_DONE';

@Schema({ timestamps: true })
export class ConductCatalogItem extends Document {
  @Prop({ required: true })
  label: string;

  @Prop({ required: true, enum: ['VIOLATION', 'MERIT'] })
  kind: ConductKind;

  @Prop({ required: true })
  points: number;

  @Prop({ type: String, enum: ['HOMEWORK_NOT_DONE'], default: null })
  specialRule: ConductSpecialRule | null;

  @Prop({ default: true })
  isActive: boolean;
}

export const ConductCatalogItemSchema = SchemaFactory.createForClass(ConductCatalogItem);
