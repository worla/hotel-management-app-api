import { IsString, IsDateString, IsNumber, IsNotEmpty, IsEnum, IsOptional } from 'class-validator';
import { PaymentMethod } from '@prisma/client';

export class CreateCheckinDto {
  @IsString()
  @IsNotEmpty()
  clientName: string;

  @IsString()
  @IsNotEmpty()
  phoneNumber: string;

  @IsString()
  @IsNotEmpty()
  roomId: string;

  @IsDateString()
  checkInDate: string;

  @IsNumber()
  roomPrice: number;

  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod;  // THIS MUST BE HERE

  @IsNumber()
  @IsOptional()
  amountPaid?: number;  // THIS MUST BE HERE
}