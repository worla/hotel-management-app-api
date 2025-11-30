import { IsString, IsNotEmpty, IsOptional, IsNumber } from 'class-validator';

export class ChangeRoomDto {  // ← Must have "export"
  @IsString()
  @IsNotEmpty()
  newRoomId: string;

  @IsNumber()
  @IsOptional()
  newRoomPrice?: number;

  @IsString()
  @IsOptional()
  reason?: string;
}