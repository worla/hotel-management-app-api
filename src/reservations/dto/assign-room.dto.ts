import { IsString, IsNotEmpty } from 'class-validator';

export class AssignRoomDto {
  @IsString()
  @IsNotEmpty()
  roomId: string;
}