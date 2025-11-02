import { IsDateString } from 'class-validator';

export class CheckoutDto {
  @IsDateString()
  checkOutDate: string;
}