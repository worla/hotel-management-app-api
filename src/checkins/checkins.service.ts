import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCheckinDto } from './dto/create-checkin.dto';
import { CheckoutDto } from './dto/checkout.dto';
import { RecordPaymentDto } from './dto/record-payment.dto';
import { ChangeRoomDto } from './dto/change-room.dto';
import { PaymentStatus } from '@prisma/client';

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

    // Calculate initial payment status
    const amountPaid = dto.amountPaid || 0;
    const roomPrice = Number(dto.roomPrice);
    
    let paymentStatus: PaymentStatus;
    if (dto.paymentMethod === 'FREE' || amountPaid >= roomPrice) {
      paymentStatus = 'PAID';
    } else if (amountPaid > 0) {
      paymentStatus = 'PARTIAL';
    } else {
      paymentStatus = 'UNPAID';
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
        paymentMethod: dto.paymentMethod,
        amountPaid: amountPaid,
        paymentStatus: paymentStatus,
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

  async changeRoom(id: string, dto: ChangeRoomDto) {
    // Get current check-in
    const checkin = await this.prisma.checkIn.findUnique({
      where: { id },
      include: { room: true },
    });

    if (!checkin) {
      throw new NotFoundException('Check-in not found');
    }

    if (checkin.status !== 'CHECKED_IN') {
      throw new BadRequestException('Can only change room for active check-ins');
    }

    // Check if new room exists and is available
    const newRoom = await this.prisma.room.findUnique({
      where: { id: dto.newRoomId },
    });

    if (!newRoom) {
      throw new NotFoundException('New room not found');
    }

    if (newRoom.status !== 'AVAILABLE') {
      throw new BadRequestException('New room is not available');
    }

    const oldRoomId = checkin.roomId;
    const newRoomPrice = dto.newRoomPrice !== undefined 
      ? dto.newRoomPrice 
      : Number(newRoom.pricePerDay);

    // Update check-in with new room
    const updatedCheckin = await this.prisma.checkIn.update({
      where: { id },
      data: {
        roomId: dto.newRoomId,
        roomNumber: newRoom.roomNumber,
        roomPrice: newRoomPrice,
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

    // Update room statuses
    await Promise.all([
      // Free up old room
      this.prisma.room.update({
        where: { id: oldRoomId },
        data: { status: 'AVAILABLE' },
      }),
      // Occupy new room
      this.prisma.room.update({
        where: { id: dto.newRoomId },
        data: { status: 'OCCUPIED' },
      }),
    ]);

    return updatedCheckin;
  }

  async recordPayment(id: string, dto: RecordPaymentDto) {
    const checkin = await this.prisma.checkIn.findUnique({
      where: { id },
    });

    if (!checkin) {
      throw new NotFoundException('Check-in not found');
    }

    if (checkin.status === 'CHECKED_OUT') {
      throw new BadRequestException('Cannot record payment for checked-out guest');
    }

    // Calculate new payment total
    const currentPaid = Number(checkin.amountPaid);
    const newPayment = Number(dto.amount);
    const totalPaid = currentPaid + newPayment;
    const roomPrice = Number(checkin.roomPrice);

    // Calculate total amount if checkout date exists
    let amountDue = roomPrice;
    if (checkin.checkOutDate) {
      const checkOutDate = new Date(checkin.checkOutDate);
      const checkInDate = new Date(checkin.checkInDate);
      const diffTime = Math.abs(checkOutDate.getTime() - checkInDate.getTime());
      const daysStayed = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) || 1;
      amountDue = roomPrice * daysStayed;
    }

    // Determine payment status
    let paymentStatus: PaymentStatus;
    if (totalPaid >= amountDue) {
      paymentStatus = 'PAID';
    } else if (totalPaid > 0) {
      paymentStatus = 'PARTIAL';
    } else {
      paymentStatus = 'UNPAID';
    }

    return this.prisma.checkIn.update({
      where: { id },
      data: {
        amountPaid: totalPaid,
        paymentMethod: dto.paymentMethod,
        paymentStatus: paymentStatus,
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

    // Handle additional payment at checkout
    let finalAmountPaid = Number(checkin.amountPaid);
    let finalPaymentMethod = checkin.paymentMethod;
    
    if (dto.additionalPayment && dto.additionalPayment > 0) {
      finalAmountPaid += Number(dto.additionalPayment);
      finalPaymentMethod = dto.paymentMethod || checkin.paymentMethod;
    }

    // Determine final payment status
    let paymentStatus: PaymentStatus;
    if (checkin.paymentMethod === 'FREE' || finalAmountPaid >= totalAmount) {
      paymentStatus = 'PAID';
    } else if (finalAmountPaid > 0) {
      paymentStatus = 'PARTIAL';
    } else {
      paymentStatus = 'UNPAID';
    }

    // Update check-in record
    const updatedCheckin = await this.prisma.checkIn.update({
      where: { id },
      data: {
        checkOutDate,
        daysStayed,
        totalAmount,
        amountPaid: finalAmountPaid,
        paymentMethod: finalPaymentMethod,
        paymentStatus: paymentStatus,
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
        reservation: true,
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

  async getOutstandingPayments() {
    return this.prisma.checkIn.findMany({
      where: {
        paymentStatus: {
          in: ['UNPAID', 'PARTIAL'],
        },
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
      orderBy: { checkInDate: 'desc' },
    });
  }
}