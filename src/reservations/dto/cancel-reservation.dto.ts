import { IsString, IsOptional, IsBoolean } from 'class-validator';

export class CancelReservationDto {
  @IsString()
  @IsOptional()
  reason?: string;

  @IsBoolean()
  @IsOptional()
  refund?: boolean;
}