import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ReportsService } from './reports.service';

@Controller('reports')
@UseGuards(AuthGuard('jwt'))
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('dashboard')
  getDashboardStats() {
    return this.reportsService.getDashboardStats();
  }

  @Get('revenue')
  getRevenueStats(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.reportsService.getRevenueStats(startDate, endDate);
  }

  @Get('occupancy-trend')
  getOccupancyTrend(@Query('days') days?: string) {
    return this.reportsService.getOccupancyTrend(Number(days) || 30);
  }

  @Get('recent-activity')
  getRecentActivity(@Query('limit') limit?: string) {
    return this.reportsService.getRecentActivity(Number(limit) || 20);
  }
}