import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateReservationDto } from './dto/create-reservation.dto';
import { AssignRoomDto } from './dto/assign-room.dto';
import { RecordPaymentDto } from '../checkins/dto/record-payment.dto';
import { CancelReservationDto } from './dto/cancel-reservation.dto';
import { UpdateReservationStatusDto } from './dto/update-reservation-status.dto';
import { PaymentStatus, ReservationStatus } from '@prisma/client';

@Injectable()
export class ReservationsService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateReservationDto, attendantId: string) {
    // Calculate number of days
    const checkInDate = new Date(dto.checkInDate);
    const checkOutDate = new Date(dto.checkOutDate);
    const diffTime = checkOutDate.getTime() - checkInDate.getTime();
    const numberOfDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (numberOfDays <= 0) {
      throw new BadRequestException('Check-out date must be after check-in date');
    }

    const pricePerDay = Number(dto.pricePerDay);
    const totalAmount = pricePerDay * numberOfDays;
    const amountPaid = dto.amountPaid || 0;
    const balanceDue = totalAmount - amountPaid;

    // If specific room requested, check availability
    if (dto.roomId) {
      const room = await this.prisma.room.findUnique({
        where: { id: dto.roomId },
      });

      if (!room) {
        throw new NotFoundException('Room not found');
      }

      if (room.roomType !== dto.roomType) {
        throw new BadRequestException('Room type does not match selected room');
      }

      // Check if room is available for the date range
      const isAvailable = await this.checkRoomAvailability(
        dto.roomId,
        checkInDate,
        checkOutDate,
      );

      if (!isAvailable) {
        throw new ConflictException('Room is not available for selected dates');
      }
    } else {
      // Check if any room of this type is available
      const availableRoom = await this.findAvailableRoomByType(
        dto.roomType,
        checkInDate,
        checkOutDate,
      );

      if (!availableRoom) {
        throw new ConflictException(`No ${dto.roomType} rooms available for selected dates`);
      }
    }

    // Determine payment status
    let paymentStatus: PaymentStatus;
    const paymentMethod = dto.paymentMethod || 'CASH';
    
    if (paymentMethod === 'FREE' || amountPaid >= totalAmount) {
      paymentStatus = 'PAID';
    } else if (amountPaid > 0) {
      paymentStatus = 'PARTIAL';
    } else {
      paymentStatus = 'UNPAID';
    }

    // Create reservation
    const reservation = await this.prisma.reservation.create({
      data: {
        clientName: dto.clientName,
        phoneNumber: dto.phoneNumber,
        email: dto.email,
        roomId: dto.roomId,
        roomType: dto.roomType,
        checkInDate,
        checkOutDate,
        numberOfDays,
        pricePerDay: dto.pricePerDay,
        totalAmount,
        paymentMethod,
        amountPaid,
        balanceDue,
        paymentStatus,
        status: amountPaid > 0 ? 'CONFIRMED' : 'PENDING',
        attendantId,
        notes: dto.notes,
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

    // If specific room assigned, update room status
    if (dto.roomId) {
      await this.prisma.room.update({
        where: { id: dto.roomId },
        data: { status: 'RESERVED' },
      });
    }

    return reservation;
  }

  async assignRoom(reservationId: string, dto: AssignRoomDto) {
    const reservation = await this.prisma.reservation.findUnique({
      where: { id: reservationId },
      include: { room: true },
    });

    if (!reservation) {
      throw new NotFoundException('Reservation not found');
    }

    if (reservation.status === 'CHECKED_IN' || reservation.status === 'CANCELLED') {
      throw new BadRequestException('Cannot assign room to this reservation');
    }

    // Check if new room exists and matches room type
    const newRoom = await this.prisma.room.findUnique({
      where: { id: dto.roomId },
    });

    if (!newRoom) {
      throw new NotFoundException('Room not found');
    }

    if (newRoom.roomType !== reservation.roomType) {
      throw new BadRequestException('Room type does not match reservation');
    }

    // Check availability
    const isAvailable = await this.checkRoomAvailability(
      dto.roomId,
      reservation.checkInDate,
      reservation.checkOutDate,
    );

    if (!isAvailable) {
      throw new ConflictException('Room is not available for selected dates');
    }

    // If there was a previous room assigned, free it
    if (reservation.roomId) {
      await this.prisma.room.update({
        where: { id: reservation.roomId },
        data: { status: 'AVAILABLE' },
      });
    }

    // Update reservation and reserve new room
    const [updatedReservation] = await Promise.all([
      this.prisma.reservation.update({
        where: { id: reservationId },
        data: { roomId: dto.roomId },
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
      this.prisma.room.update({
        where: { id: dto.roomId },
        data: { status: 'RESERVED' },
      }),
    ]);

    return updatedReservation;
  }

  async recordPayment(reservationId: string, dto: RecordPaymentDto) {
    const reservation = await this.prisma.reservation.findUnique({
      where: { id: reservationId },
    });

    if (!reservation) {
      throw new NotFoundException('Reservation not found');
    }

    if (reservation.status === 'CANCELLED' || reservation.status === 'CHECKED_IN') {
      throw new BadRequestException('Cannot record payment for this reservation');
    }

    const currentPaid = Number(reservation.amountPaid);
    const newPayment = Number(dto.amount);
    const totalPaid = currentPaid + newPayment;
    const totalAmount = Number(reservation.totalAmount);
    const newBalanceDue = totalAmount - totalPaid;

    // Determine payment status
    let paymentStatus: PaymentStatus;
    if (reservation.paymentMethod === 'FREE' || totalPaid >= totalAmount) {
      paymentStatus = 'PAID';
    } else if (totalPaid > 0) {
      paymentStatus = 'PARTIAL';
    } else {
      paymentStatus = 'UNPAID';
    }

    // Update to CONFIRMED if payment received
    const newStatus = totalPaid > 0 && reservation.status === 'PENDING' 
      ? 'CONFIRMED' 
      : reservation.status;

    return this.prisma.reservation.update({
      where: { id: reservationId },
      data: {
        amountPaid: totalPaid,
        balanceDue: newBalanceDue,
        paymentMethod: dto.paymentMethod,
        paymentStatus,
        status: newStatus,
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

  async convertToCheckIn(reservationId: string) {
    const reservation = await this.prisma.reservation.findUnique({
      where: { id: reservationId },
      include: { room: true },
    });

    if (!reservation) {
      throw new NotFoundException('Reservation not found');
    }

    if (reservation.status !== 'CONFIRMED' && reservation.status !== 'PENDING') {
      throw new BadRequestException('Only confirmed or pending reservations can be checked in');
    }

    // If no specific room assigned, find an available one
    let roomToAssign = reservation.room;
    if (!roomToAssign) {
      roomToAssign = await this.findAvailableRoomByType(
        reservation.roomType,
        reservation.checkInDate,
        reservation.checkOutDate,
      );

      if (!roomToAssign) {
        throw new ConflictException('No available rooms of this type');
      }
    }

    // Create check-in
    const checkIn = await this.prisma.checkIn.create({
      data: {
        clientName: reservation.clientName,
        phoneNumber: reservation.phoneNumber,
        roomId: roomToAssign.id,
        roomNumber: roomToAssign.roomNumber,
        checkInDate: new Date(),
        roomPrice: reservation.pricePerDay,
        paymentMethod: reservation.paymentMethod,
        amountPaid: reservation.amountPaid,
        paymentStatus: reservation.paymentStatus,
        status: 'CHECKED_IN',
        attendantId: reservation.attendantId,
        reservationId: reservation.id,
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

    // Update reservation status
    await this.prisma.reservation.update({
      where: { id: reservationId },
      data: { status: 'CHECKED_IN' },
    });

    // Update room status to OCCUPIED
    await this.prisma.room.update({
      where: { id: roomToAssign.id },
      data: { status: 'OCCUPIED' },
    });

    return checkIn;
  }

  async cancel(reservationId: string, dto: CancelReservationDto) {
    const reservation = await this.prisma.reservation.findUnique({
      where: { id: reservationId },
    });

    if (!reservation) {
      throw new NotFoundException('Reservation not found');
    }

    if (reservation.status === 'CHECKED_IN' || reservation.status === 'CANCELLED') {
      throw new BadRequestException('Cannot cancel this reservation');
    }

    // If room was assigned, free it
    if (reservation.roomId) {
      await this.prisma.room.update({
        where: { id: reservation.roomId },
        data: { status: 'AVAILABLE' },
      });
    }

    // Update reservation
    const updatedReservation = await this.prisma.reservation.update({
      where: { id: reservationId },
      data: {
        status: 'CANCELLED',
        notes: dto.reason
          ? `${reservation.notes ? reservation.notes + '\n' : ''}Cancelled: ${dto.reason}`
          : reservation.notes,
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

    return updatedReservation;
  }

  async updateStatus(reservationId: string, dto: UpdateReservationStatusDto) {
    return this.prisma.reservation.update({
      where: { id: reservationId },
      data: { status: dto.status },
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

  async findAll(page: number = 1, limit: number = 50, status?: ReservationStatus) {
    const skip = (page - 1) * limit;

    const where = status ? { status } : {};

    const [reservations, total] = await Promise.all([
      this.prisma.reservation.findMany({
        where,
        skip,
        take: limit,
        orderBy: { checkInDate: 'asc' },
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
      this.prisma.reservation.count({ where }),
    ]);

    return {
      data: reservations,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string) {
    const reservation = await this.prisma.reservation.findUnique({
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
        checkIn: true,
      },
    });

    if (!reservation) {
      throw new NotFoundException('Reservation not found');
    }

    return reservation;
  }

  async getUpcoming() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return this.prisma.reservation.findMany({
      where: {
        checkInDate: { gte: today },
        status: { in: ['PENDING', 'CONFIRMED'] },
      },
      orderBy: { checkInDate: 'asc' },
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

  async getTodayArrivals() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    return this.prisma.reservation.findMany({
      where: {
        checkInDate: {
          gte: today,
          lt: tomorrow,
        },
        status: { in: ['PENDING', 'CONFIRMED'] },
      },
      orderBy: { checkInDate: 'asc' },
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

  async getOutstandingPayments() {
    return this.prisma.reservation.findMany({
      where: {
        paymentStatus: { in: ['UNPAID', 'PARTIAL'] },
        status: { in: ['PENDING', 'CONFIRMED'] },
      },
      orderBy: { checkInDate: 'asc' },
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

  // Helper: Check if a specific room is available for date range
  private async checkRoomAvailability(
    roomId: string,
    checkIn: Date,
    checkOut: Date,
  ): Promise<boolean> {
    // Check for overlapping reservations
    const overlappingReservations = await this.prisma.reservation.count({
      where: {
        roomId,
        status: { in: ['PENDING', 'CONFIRMED', 'CHECKED_IN'] },
        OR: [
          {
            checkInDate: { lte: checkIn },
            checkOutDate: { gt: checkIn },
          },
          {
            checkInDate: { lt: checkOut },
            checkOutDate: { gte: checkOut },
          },
          {
            checkInDate: { gte: checkIn },
            checkOutDate: { lte: checkOut },
          },
        ],
      },
    });

    if (overlappingReservations > 0) {
      return false;
    }

    // Check for overlapping check-ins
    const overlappingCheckIns = await this.prisma.checkIn.count({
      where: {
        roomId,
        status: 'CHECKED_IN',
        OR: [
          {
            checkInDate: { lte: checkIn },
            checkOutDate: { gt: checkIn },
          },
          {
            checkInDate: { lt: checkOut },
            checkOutDate: { gte: checkOut },
          },
          {
            checkInDate: { gte: checkIn },
            checkOutDate: { lte: checkOut },
          },
        ],
      },
    });

    return overlappingCheckIns === 0;
  }

  // Helper: Find available room by type for date range
  private async findAvailableRoomByType(
    roomType: string,
    checkIn: Date,
    checkOut: Date,
  ) {
    const rooms = await this.prisma.room.findMany({
      where: { roomType },
    });

    for (const room of rooms) {
      const isAvailable = await this.checkRoomAvailability(
        room.id,
        checkIn,
        checkOut,
      );
      if (isAvailable) {
        return room;
      }
    }

    return null;
  }
}