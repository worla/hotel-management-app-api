import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCheckinDto } from './dto/create-checkin.dto';
import { CheckoutDto } from './dto/checkout.dto';

@Injectable()
export class CheckinsService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateCheckinDto, attendantId: string) {
    // Check if room exists and is available
    const room = await this.prisma.room.findUnique({
      where: { id: dto.roomId },
    });

    if (!room) {
      throw new NotFoundException('Room not found');
    }

    if (room.status !== 'AVAILABLE') {
      throw new BadRequestException('Room is not available');
    }

    // Create check-in
    const checkin = await this.prisma.checkIn.create({
      data: {
        clientName: dto.clientName,
        phoneNumber: dto.phoneNumber,
        roomId: dto.roomId,
        roomNumber: room.roomNumber,
        checkInDate: new Date(dto.checkInDate),
        roomPrice: dto.roomPrice,
        attendantId,
        status: 'CHECKED_IN',
      },
      include: {
        room: true,
        attendant: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    // Update room status
    await this.prisma.room.update({
      where: { id: dto.roomId },
      data: { status: 'OCCUPIED' },
    });

    return checkin;
  }

  async checkout(id: string, dto: CheckoutDto) {
    const checkin = await this.prisma.checkIn.findUnique({
      where: { id },
      include: { room: true },
    });

    if (!checkin) {
      throw new NotFoundException('Check-in not found');
    }

    if (checkin.status === 'CHECKED_OUT') {
      throw new BadRequestException('Already checked out');
    }

    const checkOutDate = new Date(dto.checkOutDate);
    const checkInDate = new Date(checkin.checkInDate);
    
    // Calculate days stayed
    const diffTime = Math.abs(checkOutDate.getTime() - checkInDate.getTime());
    const daysStayed = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) || 1;
    
    const totalAmount = Number(checkin.roomPrice) * daysStayed;

    // Update check-in record
    const updatedCheckin = await this.prisma.checkIn.update({
      where: { id },
      data: {
        checkOutDate,
        daysStayed,
        totalAmount,
        status: 'CHECKED_OUT',
      },
      include: {
        room: true,
        attendant: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    // Update room status
    await this.prisma.room.update({
      where: { id: checkin.roomId },
      data: { status: 'AVAILABLE' },
    });

    return updatedCheckin;
  }

  async findAll(page: number = 1, limit: number = 50) {
    const skip = (page - 1) * limit;

    const [checkins, total] = await Promise.all([
      this.prisma.checkIn.findMany({
        skip,
        take: limit,
        orderBy: { checkInDate: 'desc' },
        include: {
          room: true,
          attendant: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      }),
      this.prisma.checkIn.count(),
    ]);

    return {
      data: checkins,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string) {
    const checkin = await this.prisma.checkIn.findUnique({
      where: { id },
      include: {
        room: true,
        attendant: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    if (!checkin) {
      throw new NotFoundException('Check-in not found');
    }

    return checkin;
  }

  async getCurrentGuests() {
    return this.prisma.checkIn.findMany({
      where: { status: 'CHECKED_IN' },
      include: {
        room: true,
        attendant: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: { checkInDate: 'desc' },
    });
  }
}