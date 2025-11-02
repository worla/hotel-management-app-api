import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRoomDto } from './dto/create-room.dto';

@Injectable()
export class RoomsService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateRoomDto) {
    // Check if room number already exists
    const existing = await this.prisma.room.findUnique({
      where: { roomNumber: dto.roomNumber },
    });

    if (existing) {
      throw new ConflictException('Room number already exists');
    }

    return this.prisma.room.create({
      data: {
        roomNumber: dto.roomNumber,
        roomType: dto.roomType,
        pricePerDay: dto.pricePerDay,
        status: dto.status || 'AVAILABLE',
      },
    });
  }

  async findAll() {
    return this.prisma.room.findMany({
      orderBy: { roomNumber: 'asc' },
    });
  }

  async findAvailable() {
    return this.prisma.room.findMany({
      where: { status: 'AVAILABLE' },
      orderBy: { roomNumber: 'asc' },
    });
  }

  async findOne(id: string) {
    const room = await this.prisma.room.findUnique({
      where: { id },
      include: {
        checkIns: {
          take: 10,
          orderBy: { checkInDate: 'desc' },
        },
      },
    });

    if (!room) {
      throw new NotFoundException('Room not found');
    }

    return room;
  }

  async update(id: string, dto: Partial<CreateRoomDto>) {
    return this.prisma.room.update({
      where: { id },
      data: dto,
    });
  }

  async updateStatus(id: string, status: string) {
    return this.prisma.room.update({
      where: { id },
      data: { status: status as any },
    });
  }
}