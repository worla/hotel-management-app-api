import { IsString, IsDecimal, IsEnum } from 'class-validator';
import { RoomStatus } from '@prisma/client';

export class CreateRoomDto {
  @IsString()
  roomNumber: string;

  @IsString()
  roomType: string;

  @IsDecimal()
  pricePerDay: number;

  @IsEnum(RoomStatus)
  status?: RoomStatus;
}