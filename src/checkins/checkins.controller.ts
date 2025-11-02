import { Controller, Get, Post, Body, Param, Patch, Query, UseGuards, Request } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CheckinsService } from './checkins.service';
import { CreateCheckinDto } from './dto/create-checkin.dto';
import { CheckoutDto } from './dto/checkout.dto';

@Controller('checkins')
@UseGuards(AuthGuard('jwt'))
export class CheckinsController {
  constructor(private readonly checkinsService: CheckinsService) {}

  @Post()
  create(@Body() dto: CreateCheckinDto, @Request() req) {
    return this.checkinsService.create(dto, req.user.userId);
  }

  @Patch(':id/checkout')
  checkout(@Param('id') id: string, @Body() dto: CheckoutDto) {
    return this.checkinsService.checkout(id, dto);
  }

  @Get()
  findAll(@Query('page') page: string, @Query('limit') limit: string) {
    return this.checkinsService.findAll(Number(page) || 1, Number(limit) || 50);
  }

  @Get('current')
  getCurrentGuests() {
    return this.checkinsService.getCurrentGuests();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.checkinsService.findOne(id);
  }
}