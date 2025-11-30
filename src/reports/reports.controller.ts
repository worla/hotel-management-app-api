import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { UserRole } from '@prisma/client';
import { ReportsService } from './reports.service';

@Controller('reports')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  // ==================== DASHBOARD ====================
  
  @Get('dashboard')
  @Roles(UserRole.ADMIN, UserRole.ATTENDANT)
  getDashboardStats() {
    console.log('📊 Dashboard stats requested');
    return this.reportsService.getDashboardStats();
  }

  // ==================== REVENUE ====================
  
  @Get('revenue')
  @Roles(UserRole.ADMIN)
  getRevenueStats(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    console.log(`💰 Revenue stats requested: ${startDate} to ${endDate}`);
    return this.reportsService.getRevenueStats(startDate, endDate);
  }

  // ==================== POS ANALYTICS ====================
  
  @Get('pos-analytics')
  @Roles(UserRole.ADMIN)
  getPOSAnalytics(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    console.log(`🛒 POS analytics requested: ${startDate} to ${endDate}`);
    return this.reportsService.getPOSAnalytics(startDate, endDate);
  }

  // ==================== RESERVATIONS ====================
  
  @Get('reservations-analytics')
  @Roles(UserRole.ADMIN, UserRole.ATTENDANT)
  getReservationAnalytics() {
    console.log('📅 Reservation analytics requested');
    return this.reportsService.getReservationAnalytics();
  }

  // ==================== PAYMENTS ====================
  
  @Get('payment-analytics')
  @Roles(UserRole.ADMIN)
  getPaymentAnalytics() {
    console.log('💳 Payment analytics requested');
    return this.reportsService.getPaymentAnalytics();
  }

  // ==================== OCCUPANCY ====================
  
  @Get('occupancy-trend')
  @Roles(UserRole.ADMIN, UserRole.ATTENDANT)
  getOccupancyTrend(@Query('days') days?: string) {
    const numDays = Number(days) || 30;
    console.log(`📈 Occupancy trend requested: ${numDays} days`);
    return this.reportsService.getOccupancyTrend(numDays);
  }

  // ==================== ACTIVITY ====================
  
  @Get('recent-activity')
  @Roles(UserRole.ADMIN, UserRole.ATTENDANT)
  getRecentActivity(@Query('limit') limit?: string) {
    const numLimit = Number(limit) || 20;
    console.log(`🔔 Recent activity requested: ${numLimit} items`);
    return this.reportsService.getRecentActivity(numLimit);
  }

  // ==================== STAFF PERFORMANCE ====================
  
  @Get('staff-performance')
  @Roles(UserRole.ADMIN)
  getStaffPerformance(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    console.log(`👥 Staff performance requested: ${startDate} to ${endDate}`);
    return this.reportsService.getStaffPerformance(startDate, endDate);
  }
}