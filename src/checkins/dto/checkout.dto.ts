import { IsDateString, IsNumber, IsEnum, IsOptional } from 'class-validator';
import { PaymentMethod } from '@prisma/client';

export class CheckoutDto {
  @IsDateString()
  checkOutDate: string;

  // NEW: Optional payment at checkout
  @IsEnum(PaymentMethod)
  @IsOptional()
  paymentMethod?: PaymentMethod;

  @IsNumber()
  @IsOptional()
  additionalPayment?: number;  // Additional payment at checkout
}