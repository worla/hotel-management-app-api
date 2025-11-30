import { Controller, Get, Query, UseGuards, Request } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { UserRole } from '@prisma/client';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  /**
   * GET /dashboard/summary
   * Main dashboard summary for mobile app
   * Query params: period (today|week|month|year)
   */
  @Get('summary')
  @Roles(UserRole.ADMIN, UserRole.ATTENDANT)
  async getSummary(
    @Query('period') period: string = 'today',
    @Request() req,
  ) {
    console.log(`📊 Dashboard summary requested for period: ${period} by ${req.user.email}`);
    return this.dashboardService.getSummary(period, req.user);
  }

  /**
   * GET /dashboard/analytics
   * Detailed analytics for owners/managers
   * Query params: period (today|week|month|year)
   */
  @Get('analytics')
  @Roles(UserRole.ADMIN)
  async getDetailedAnalytics(
    @Query('period') period: string = 'month',
  ) {
    console.log(`📈 Detailed analytics requested for period: ${period}`);
    return this.dashboardService.getDetailedAnalytics(period);
  }

  /**
   * GET /dashboard/quick-stats
   * Quick stats for mobile app widgets/notifications
   * Returns minimal data for fast loading
   */
  @Get('quick-stats')
  @Roles(UserRole.ADMIN, UserRole.ATTENDANT)
  async getQuickStats() {
    console.log('⚡ Quick stats requested');
    return this.dashboardService.getQuickStats();
  }
}