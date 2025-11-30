import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateStockDto, StockAction } from './dto/update-stock.dto';

@Injectable()
export class ProductsService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateProductDto) {
    // Verify category exists
    const category = await this.prisma.category.findUnique({
      where: { id: dto.categoryId },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    return this.prisma.product.create({
      data: dto,
      include: {
        category: true,
      },
    });
  }

  async findAll(categoryId?: string, status?: string) {
    const where: any = {};

    if (categoryId) {
      where.categoryId = categoryId;
    }

    if (status) {
      where.status = status;
    }

    return this.prisma.product.findMany({
      where,
      include: {
        category: true,
      },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: {
        category: true,
      },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    return product;
  }

  async update(id: string, dto: Partial<CreateProductDto>) {
    const product = await this.prisma.product.findUnique({
      where: { id },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    // If changing category, verify it exists
    if (dto.categoryId) {
      const category = await this.prisma.category.findUnique({
        where: { id: dto.categoryId },
      });

      if (!category) {
        throw new NotFoundException('Category not found');
      }
    }

    return this.prisma.product.update({
      where: { id },
      data: dto,
      include: {
        category: true,
      },
    });
  }

  async updateStock(id: string, dto: UpdateStockDto) {
    const product = await this.prisma.product.findUnique({
      where: { id },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    let newStock: number;

    switch (dto.action) {
      case StockAction.ADD:
        newStock = product.stock + dto.quantity;
        break;
      case StockAction.REMOVE:
        newStock = product.stock - dto.quantity;
        if (newStock < 0) {
          throw new BadRequestException('Insufficient stock');
        }
        break;
      case StockAction.SET:
        newStock = dto.quantity;
        break;
      default:
        throw new BadRequestException('Invalid stock action');
    }

    // Auto-update status based on stock
    let status = product.status;
    if (newStock === 0) {
      status = 'OUT_OF_STOCK';
    } else if (status === 'OUT_OF_STOCK' && newStock > 0) {
      status = 'ACTIVE';
    }

    return this.prisma.product.update({
      where: { id },
      data: {
        stock: newStock,
        status,
      },
      include: {
        category: true,
      },
    });
  }

  async getLowStock() {
    return this.prisma.product.findMany({
      where: {
        OR: [
          { stock: { lte: this.prisma.product.fields.minStock } },
          { status: 'OUT_OF_STOCK' },
        ],
      },
      include: {
        category: true,
      },
      orderBy: { stock: 'asc' },
    });
  }

  async remove(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    return this.prisma.product.delete({
      where: { id },
    });
  }
}