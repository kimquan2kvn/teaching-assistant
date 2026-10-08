import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ConductCatalogItem } from '../database/schemas/conduct-catalog-item.schema';
import type { CreateConductCatalogItemInput, UpdateConductCatalogItemInput } from '@so-chu-nhiem/shared';

@Injectable()
export class ConductCatalogService {
  constructor(
    @InjectModel(ConductCatalogItem.name) private readonly catalogModel: Model<ConductCatalogItem>,
  ) {}

  async list(): Promise<ConductCatalogItem[]> {
    return this.catalogModel.find({ isActive: true }).exec();
  }

  async create(input: CreateConductCatalogItemInput): Promise<ConductCatalogItem> {
    return this.catalogModel.create(input);
  }

  async update(id: string, input: UpdateConductCatalogItemInput): Promise<ConductCatalogItem> {
    const item = await this.findByIdOrThrow(id);
    if (input.label !== undefined) item.label = input.label;
    if (input.isActive !== undefined) item.isActive = input.isActive;
    await item.save();
    return item;
  }

  async findByIdOrThrow(id: string): Promise<ConductCatalogItem> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Không tìm thấy mục danh mục này');
    }
    const item = await this.catalogModel.findById(id).exec();
    if (!item) {
      throw new NotFoundException('Không tìm thấy mục danh mục này');
    }
    return item;
  }
}
