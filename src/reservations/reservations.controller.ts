import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Patch,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ReservationsService } from './reservations.service';
import { CreateReservationDto } from './dto/create-reservation.dto';
import { AssignRoomDto } from './dto/assign-room.dto';
import { RecordPaymentDto } from '../checkins/dto/record-payment.dto';
import { CancelReservationDto } from './dto/cancel-reservation.dto';
import { UpdateReservationStatusDto } from './dto/update-reservation-status.dto';
import { ReservationStatus } from '@prisma/client';

@Controller('reservations')
@UseGuards(AuthGuard('jwt'))
export class ReservationsController {
  constructor(private readonly reservationsService: ReservationsService) {}

  @Post()
  create(@Body() dto: CreateReservationDto, @Request() req) {
    return this.reservationsService.create(dto, req.user.userId);
  }

  @Get()
  findAll(
    @Query('page') page: string,
    @Query('limit') limit: string,
    @Query('status') status?: ReservationStatus,
  ) {
    return this.reservationsService.findAll(
      Number(page) || 1,
      Number(limit) || 50,
      status,
    );
  }

  @Get('upcoming')
  getUpcoming() {
    return this.reservationsService.getUpcoming();
  }

  @Get('today-arrivals')
  getTodayArrivals() {
    return this.reservationsService.getTodayArrivals();
  }

  @Get('outstanding-payments')
  getOutstandingPayments() {
    return this.reservationsService.getOutstandingPayments();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.reservationsService.findOne(id);
  }

  @Patch(':id/assign-room')
  assignRoom(@Param('id') id: string, @Body() dto: AssignRoomDto) {
    return this.reservationsService.assignRoom(id, dto);
  }

  @Patch(':id/payment')
  recordPayment(@Param('id') id: string, @Body() dto: RecordPaymentDto) {
    return this.reservationsService.recordPayment(id, dto);
  }

  @Post(':id/check-in')
  convertToCheckIn(@Param('id') id: string) {
    return this.reservationsService.convertToCheckIn(id);
  }

  @Patch(':id/cancel')
  cancel(@Param('id') id: string, @Body() dto: CancelReservationDto) {
    return this.reservationsService.cancel(id, dto);
  }

  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Body() dto: UpdateReservationStatusDto) {
    return this.reservationsService.updateStatus(id, dto);
  }
}