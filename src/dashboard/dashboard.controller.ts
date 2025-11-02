import { Controller, Get, Query, UseGuards, Request } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
@UseGuards(AuthGuard('jwt'))
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('summary')
  async getSummary(
    @Query('period') period: string = 'today',
    @Request() req,
  ) {
    console.log(`📊 Dashboard summary requested for period: ${period}`);
    return this.dashboardService.getSummary(period, req.user);
  }
}