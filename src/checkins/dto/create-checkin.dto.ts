import { IsString, IsDateString, IsNumber, IsNotEmpty } from 'class-validator';

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

  @IsNumber()  // ✅ Should accept number
  roomPrice: number;
}