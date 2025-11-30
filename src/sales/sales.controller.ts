import { Controller, Get, Post, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SalesService } from './sales.service';
import { CreateSaleDto } from './dto/create-sale.dto';

@Controller('sales')
@UseGuards(AuthGuard('jwt'))
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @Post()
  create(@Body() dto: CreateSaleDto, @Request() req) {
    return this.salesService.create(dto, req.user.userId);
  }

  @Get()
  findAll(
    @Query('page') page: string,
    @Query('limit') limit: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('checkInId') checkInId?: string,
  ) {
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;

    return this.salesService.findAll(
      Number(page) || 1,
      Number(limit) || 50,
      start,
      end,
      checkInId,
    );
  }

  @Get('today')
  getTodaySales() {
    return this.salesService.getTodaySales();
  }

  @Get('report')
  getSalesReport(@Query('startDate') startDate: string, @Query('endDate') endDate: string) {
    if (!startDate || !endDate) {
      throw new Error('startDate and endDate are required');
    }

    return this.salesService.getSalesReport(new Date(startDate), new Date(endDate));
  }

  @Get('guest/:checkInId')
  getSalesByGuest(@Param('checkInId') checkInId: string) {
    return this.salesService.getSalesByGuest(checkInId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.salesService.findOne(id);
  }
}