import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSaleDto } from './dto/create-sale.dto';

@Injectable()
export class SalesService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateSaleDto, attendantId: string) {
    // Verify guest check-in if provided
    if (dto.checkInId) {
      const checkIn = await this.prisma.checkIn.findUnique({
        where: { id: dto.checkInId },
      });

      if (!checkIn) {
        throw new NotFoundException('Check-in not found');
      }

      if (checkIn.status !== 'CHECKED_IN') {
        throw new BadRequestException('Guest is not currently checked in');
      }
    }

    // Validate products and check stock
    const productIds = dto.items.map((item) => item.productId);
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds } },
    });

    if (products.length !== productIds.length) {
      throw new NotFoundException('One or more products not found');
    }

    // Check stock availability and calculate totals
    let subtotal = 0;
    const saleItems: Array<{
      productId: string;
      quantity: number;
      unitPrice: any;
      total: number;
    }> = [];

    for (const item of dto.items) {
      const product = products.find((p) => p.id === item.productId);

      if (!product) {
        throw new NotFoundException(`Product ${item.productId} not found`);
      }

      if (product.status !== 'ACTIVE') {
        throw new BadRequestException(`Product ${product.name} is not available`);
      }

      if (product.stock < item.quantity) {
        throw new BadRequestException(
          `Insufficient stock for ${product.name}. Available: ${product.stock}`,
        );
      }

      const itemTotal = Number(product.price) * item.quantity;
      subtotal += itemTotal;

      saleItems.push({
        productId: product.id,
        quantity: item.quantity,
        unitPrice: product.price,
        total: itemTotal,
      });
    }

    const tax = dto.tax || 0;
    const discount = dto.discount || 0;
    const total = subtotal + tax - discount;
    const change = dto.amountPaid - total;

    if (change < 0) {
      throw new BadRequestException('Insufficient payment amount');
    }

    // Generate sale number
    const saleNumber = await this.generateSaleNumber();

    // Determine payment status
    const paymentStatus = dto.paymentMethod === 'FREE' || dto.amountPaid >= total ? 'PAID' : 'UNPAID';

    // Create sale with items in a transaction
    const sale = await this.prisma.$transaction(async (prisma) => {
      // Create the sale
      const newSale = await prisma.sale.create({
        data: {
          saleNumber,
          customerName: dto.customerName,
          customerPhone: dto.customerPhone,
          checkInId: dto.checkInId,
          subtotal,
          tax,
          discount,
          total,
          paymentMethod: dto.paymentMethod,
          amountPaid: dto.amountPaid,
          change,
          paymentStatus,
          attendantId,
          notes: dto.notes,
        },
      });

      // Create sale items and update stock
      for (const item of saleItems) {
        await prisma.saleItem.create({
          data: {
            saleId: newSale.id,
            productId: item.productId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            total: item.total,
          },
        });

        // Update product stock
        const product = products.find((p) => p.id === item.productId);
        if (!product) continue;
        
        const dtoItem = dto.items.find((i) => i.productId === item.productId);
        if (!dtoItem) continue;
        
        const newStock = product.stock - dtoItem.quantity;

        await prisma.product.update({
          where: { id: item.productId },
          data: {
            stock: newStock,
            status: newStock === 0 ? 'OUT_OF_STOCK' : product.status,
          },
        });
      }

      return newSale;
    });

    // Return sale with items
    return this.findOne(sale.id);
  }

  async findAll(
    page: number = 1,
    limit: number = 50,
    startDate?: Date,
    endDate?: Date,
    checkInId?: string,
  ) {
    const skip = (page - 1) * limit;
    const where: any = {};

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = startDate;
      if (endDate) where.createdAt.lte = endDate;
    }

    if (checkInId) {
      where.checkInId = checkInId;
    }

    const [sales, total] = await Promise.all([
      this.prisma.sale.findMany({
        where,
        skip,
        take: limit,
        include: {
          attendant: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          checkIn: {
            select: {
              id: true,
              clientName: true,
              roomNumber: true,
            },
          },
          items: {
            include: {
              product: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.sale.count({ where }),
    ]);

    return {
      data: sales,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string) {
    const sale = await this.prisma.sale.findUnique({
      where: { id },
      include: {
        attendant: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        checkIn: {
          select: {
            id: true,
            clientName: true,
            phoneNumber: true,
            roomNumber: true,
          },
        },
        items: {
          include: {
            product: true,
          },
        },
      },
    });

    if (!sale) {
      throw new NotFoundException('Sale not found');
    }

    return sale;
  }

  async getTodaySales() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    return this.prisma.sale.findMany({
      where: {
        createdAt: {
          gte: today,
          lt: tomorrow,
        },
      },
      include: {
        attendant: {
          select: {
            id: true,
            name: true,
          },
        },
        items: {
          include: {
            product: {
              select: {
                name: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getSalesByGuest(checkInId: string) {
    return this.prisma.sale.findMany({
      where: { checkInId },
      include: {
        items: {
          include: {
            product: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getSalesReport(startDate: Date, endDate: Date) {
    const sales = await this.prisma.sale.findMany({
      where: {
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      include: {
        items: {
          include: {
            product: true,
          },
        },
      },
    });

    const totalRevenue = sales.reduce((sum, sale) => sum + Number(sale.total), 0);
    const totalSales = sales.length;
    const totalTax = sales.reduce((sum, sale) => sum + Number(sale.tax), 0);
    const totalDiscount = sales.reduce((sum, sale) => sum + Number(sale.discount), 0);

    // Calculate profit if cost is available
    let totalProfit = 0;
    for (const sale of sales) {
      for (const item of sale.items) {
        if (item.product.cost) {
          const profit = (Number(item.unitPrice) - Number(item.product.cost)) * item.quantity;
          totalProfit += profit;
        }
      }
    }

    // Top selling products
    const productSales = new Map();
    for (const sale of sales) {
      for (const item of sale.items) {
        const existing = productSales.get(item.productId) || {
          name: item.product.name,
          quantity: 0,
          revenue: 0,
        };
        existing.quantity += item.quantity;
        existing.revenue += Number(item.total);
        productSales.set(item.productId, existing);
      }
    }

    const topProducts = Array.from(productSales.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    return {
      period: {
        startDate,
        endDate,
      },
      summary: {
        totalRevenue,
        totalSales,
        totalTax,
        totalDiscount,
        totalProfit,
        averageSale: totalSales > 0 ? totalRevenue / totalSales : 0,
      },
      topProducts,
    };
  }

  private async generateSaleNumber(): Promise<string> {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');

    // Count today's sales
    const startOfDay = new Date(today.setHours(0, 0, 0, 0));
    const endOfDay = new Date(today.setHours(23, 59, 59, 999));

    const count = await this.prisma.sale.count({
      where: {
        createdAt: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
    });

    const sequence = String(count + 1).padStart(4, '0');
    return `SALE-${year}${month}${day}-${sequence}`;
  }
}