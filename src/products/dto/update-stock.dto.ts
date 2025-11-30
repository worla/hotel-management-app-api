import { IsInt, IsEnum } from 'class-validator';

export enum StockAction {
  ADD = 'ADD',
  REMOVE = 'REMOVE',
  SET = 'SET',
}

export class UpdateStockDto {
  @IsInt()
  quantity: number;

  @IsEnum(StockAction)
  action: StockAction;
}