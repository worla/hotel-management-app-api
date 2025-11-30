import { IsString, IsDateString, IsNumber, IsNotEmpty, IsEmail, IsEnum, IsOptional } from 'class-validator';
import { PaymentMethod } from '@prisma/client';

export class CreateReservationDto {
  @IsString()
  @IsNotEmpty()
  clientName: string;

  @IsString()
  @IsNotEmpty()
  phoneNumber: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  roomId?: string;  // Specific room (optional)

  @IsString()
  @IsNotEmpty()
  roomType: string;  // Room type (required)

  @IsDateString()
  checkInDate: string;

  @IsDateString()
  checkOutDate: string;

  @IsNumber()
  pricePerDay: number;

  @IsEnum(PaymentMethod)
  @IsOptional()
  paymentMethod?: PaymentMethod;

  @IsNumber()
  @IsOptional()
  amountPaid?: number;  // Initial payment

  @IsString()
  @IsOptional()
  notes?: string;
}