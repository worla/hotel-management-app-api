import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ReportsService } from '../reports/reports.service';

@Injectable()
export class DashboardService {
  constructor(
    private prisma: PrismaService,
    private reportsService: ReportsService,
  ) {}

  async getSummary(period: string, user: any) {
    console.log(`📊 Generating ${period} dashboard summary for user: ${user.email}`);

    try {
      const [
        stats,
        revenueStats,
        revenueData,
        recentActivities,
        alerts,
      ] = await Promise.all([
        this.reportsService.getDashboardStats(),
        this.getRevenueForPeriod(period),
        this.getRevenueTrendData(period),
        this.getRecentActivitiesFormatted(10),
        this.getAlerts(),
      ]);

      const revenueChange = await this.calculateRevenueChange(period);

      const summary = {
        // Time period
        period,
        generatedAt: new Date().toISOString(),
        
        // Revenue metrics
        revenue: {
          total: revenueStats.total,
          change: revenueChange,
          roomRevenue: revenueStats.rooms,
          posRevenue: revenueStats.pos,
          trend: revenueData,
        },
        
        // Guest metrics
        guests: {
          current: stats.guests.current,
          todayCheckins: stats.guests.todayCheckins,
          todayCheckouts: stats.guests.todayCheckouts,
        },
        
        // Room metrics
        rooms: {
          total: stats.rooms.total,
          available: stats.rooms.available,
          occupied: stats.rooms.occupied,
          reserved: stats.rooms.reserved,
          maintenance: stats.rooms.maintenance,
          occupancyRate: stats.rooms.occupancyRate,
        },
        
        // Reservations
        reservations: {
          upcoming: stats.reservations.upcoming,
          todayArrivals: stats.reservations.todayArrivals,
          pending: stats.reservations.pending,
        },
        
        // POS
        pos: {
          todaySales: stats.pos.todaySales,
          lowStockAlerts: stats.pos.lowStockProducts,
        },
        
        // Payments
        payments: {
          outstanding: stats.payments.totalOutstanding,
          checkins: stats.payments.outstandingCheckins,
          reservations: stats.payments.outstandingReservations,
        },
        
        // Recent activity
        recentActivities,
        
        // Alerts
        alerts,
      };

      console.log(`✅ Dashboard summary generated successfully`);
      return summary;
    } catch (error) {
      console.error('❌ Error generating dashboard summary:', error);
      throw error;
    }
  }

  async getDetailedAnalytics(period: string = 'month') {
    console.log(`📊 Generating detailed analytics for period: ${period}`);

    const { startDate, endDate } = this.getPeriodDates(period);

    const [
      revenue,
      posAnalytics,
      reservationAnalytics,
      paymentAnalytics,
      staffPerformance,
      occupancyTrend,
    ] = await Promise.all([
      this.reportsService.getRevenueStats(startDate.toISOString(), endDate.toISOString()),
      this.reportsService.getPOSAnalytics(startDate.toISOString(), endDate.toISOString()),
      this.reportsService.getReservationAnalytics(),
      this.reportsService.getPaymentAnalytics(),
      this.reportsService.getStaffPerformance(startDate.toISOString(), endDate.toISOString()),
      this.reportsService.getOccupancyTrend(this.getDaysForPeriod(period)),
    ]);

    return {
      period,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      generatedAt: new Date().toISOString(),
      
      revenue,
      posAnalytics,
      reservationAnalytics,
      paymentAnalytics,
      staffPerformance,
      occupancyTrend,
    };
  }

  async getQuickStats() {
    console.log('⚡ Generating quick stats for mobile app');

    const [stats, todayRevenue] = await Promise.all([
      this.reportsService.getDashboardStats(),
      this.getTodayRevenue(),
    ]);

    return {
      // Key metrics for quick view
      todayRevenue: todayRevenue.total,
      currentGuests: stats.guests.current,
      occupancyRate: stats.rooms.occupancyRate,
      outstandingPayments: stats.payments.totalOutstanding,
      
      // Quick counts
      availableRooms: stats.rooms.available,
      todayCheckins: stats.guests.todayCheckins,
      todayCheckouts: stats.guests.todayCheckouts,
      upcomingReservations: stats.reservations.upcoming,
      lowStockItems: stats.pos.lowStockProducts,
      
      // Status indicators
      alerts: await this.getQuickAlerts(),
    };
  }

  // ==================== PRIVATE HELPER METHODS ====================

  private async getRevenueForPeriod(period: string): Promise<{ total: number; rooms: number; pos: number }> {
    const { startDate, endDate } = this.getPeriodDates(period);

    const [roomRevenue, posRevenue] = await Promise.all([
      this.getRoomRevenueForPeriod(startDate, endDate),
      this.getPOSRevenueForPeriod(startDate, endDate),
    ]);

    const total = Number(roomRevenue) + Number(posRevenue);

    return {
      total: total,
      rooms: Number(roomRevenue),
      pos: Number(posRevenue),
    };
  }

  private async getRoomRevenueForPeriod(start: Date, end: Date): Promise<number> {
    const result = await this.prisma.checkIn.aggregate({
      where: {
        status: 'CHECKED_OUT',
        checkOutDate: { gte: start, lte: end },
      },
      _sum: { totalAmount: true },
    });

    return Number(result._sum.totalAmount || 0);
  }

  private async getPOSRevenueForPeriod(start: Date, end: Date): Promise<number> {
    const result = await this.prisma.sale.aggregate({
      where: {
        createdAt: { gte: start, lte: end },
      },
      _sum: { total: true },
    });

    return Number(result._sum.total || 0);
  }

  private async getTodayRevenue(): Promise<{ total: number; rooms: number; pos: number }> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const [roomRevenue, posRevenue] = await Promise.all([
      this.getRoomRevenueForPeriod(today, tomorrow),
      this.getPOSRevenueForPeriod(today, tomorrow),
    ]);

    const total = Number(roomRevenue) + Number(posRevenue);

    return {
      total: total,
      rooms: Number(roomRevenue),
      pos: Number(posRevenue),
    };
  }

  private async getRevenueTrendData(period: string) {
    const { startDate, endDate } = this.getPeriodDates(period);
    const dataPoints = this.getDataPointsForPeriod(period);

    // Initialize intervals
    const revenueByInterval: { [key: string]: { rooms: number; pos: number } } = {};
    for (let i = 0; i < dataPoints; i++) {
      const date = this.getDateForInterval(period, i, startDate);
      const key = this.formatDateKey(date, period);
      revenueByInterval[key] = { rooms: 0, pos: 0 };
    }

    // Get room revenue
    const checkouts = await this.prisma.checkIn.findMany({
      where: {
        status: 'CHECKED_OUT',
        checkOutDate: { gte: startDate, lte: endDate },
      },
      select: { checkOutDate: true, totalAmount: true },
    });

    checkouts.forEach((checkout) => {
      if (checkout.checkOutDate) {
        const key = this.formatDateKey(new Date(checkout.checkOutDate), period);
        if (revenueByInterval[key]) {
          revenueByInterval[key].rooms += Number(checkout.totalAmount || 0);
        }
      }
    });

    // Get POS revenue
    const sales = await this.prisma.sale.findMany({
      where: {
        createdAt: { gte: startDate, lte: endDate },
      },
      select: { createdAt: true, total: true },
    });

    sales.forEach((sale) => {
      const key = this.formatDateKey(new Date(sale.createdAt), period);
      if (revenueByInterval[key]) {
        revenueByInterval[key].pos += Number(sale.total);
      }
    });

    // Convert to array
    return Object.entries(revenueByInterval).map(([date, amounts]) => ({
      date,
      rooms: Math.round(amounts.rooms * 100) / 100,
      pos: Math.round(amounts.pos * 100) / 100,
      total: Math.round((amounts.rooms + amounts.pos) * 100) / 100,
    }));
  }

  private async getRecentActivitiesFormatted(limit: number = 10) {
    const activities = await this.reportsService.getRecentActivity(limit);

    return activities.map((activity) => ({
      type: activity.type,
      title: this.getActivityTitle(activity),
      description: activity.description,
      amount: activity.amount ? Number(activity.amount) : null,
      timestamp: activity.timestamp,
      attendant: activity.attendant,
      status: activity.status,
    }));
  }

  private getActivityTitle(activity: any): string {
    switch (activity.type) {
      case 'check_in':
        return 'New Check-in';
      case 'check_out':
        return 'Check-out';
      case 'sale':
        return 'POS Sale';
      case 'reservation':
        return activity.status === 'CONFIRMED' ? 'Reservation Confirmed' : 'New Reservation';
      default:
        return 'Activity';
    }
  }

  private async getAlerts() {
    // First get all products to check stock levels properly
    const allProducts = await this.prisma.product.findMany({
      where: {
        status: { not: 'INACTIVE' },
      },
      select: {
        stock: true,
        minStock: true,
        status: true,
      },
    });

    // Count low stock products by filtering in code
    const lowStockProducts = allProducts.filter(
      p => p.stock <= p.minStock || p.status === 'OUT_OF_STOCK'
    ).length;

    const [
      outstandingCheckinPayments,
      outstandingReservationPayments,
      todayArrivals,
      maintenanceRooms,
    ] = await Promise.all([
      this.prisma.checkIn.count({
        where: { paymentStatus: { in: ['UNPAID', 'PARTIAL'] } },
      }),
      this.prisma.reservation.count({
        where: {
          paymentStatus: { in: ['UNPAID', 'PARTIAL'] },
          status: { in: ['PENDING', 'CONFIRMED'] },
        },
      }),
      this.prisma.reservation.count({
        where: {
          checkInDate: {
            gte: new Date(new Date().setHours(0, 0, 0, 0)),
            lt: new Date(new Date().setHours(23, 59, 59, 999)),
          },
          status: { in: ['PENDING', 'CONFIRMED'] },
        },
      }),
      this.prisma.room.count({ where: { status: 'MAINTENANCE' } }),
    ]);

    // Add the two payment counts together
    const outstandingPayments = outstandingCheckinPayments + outstandingReservationPayments;

    const alerts: any[] = [];

    if (lowStockProducts > 0) {
      alerts.push({
        type: 'warning',
        category: 'inventory',
        title: 'Low Stock Alert',
        message: `${lowStockProducts} product${lowStockProducts > 1 ? 's' : ''} running low`,
        count: lowStockProducts,
      });
    }

    if (outstandingPayments > 0) {
      alerts.push({
        type: 'warning',
        category: 'payments',
        title: 'Outstanding Payments',
        message: `${outstandingPayments} payment${outstandingPayments > 1 ? 's' : ''} pending`,
        count: outstandingPayments,
      });
    }

    if (todayArrivals > 0) {
      alerts.push({
        type: 'info',
        category: 'reservations',
        title: 'Arrivals Today',
        message: `${todayArrivals} guest${todayArrivals > 1 ? 's' : ''} arriving today`,
        count: todayArrivals,
      });
    }

    if (maintenanceRooms > 0) {
      alerts.push({
        type: 'info',
        category: 'maintenance',
        title: 'Rooms Under Maintenance',
        message: `${maintenanceRooms} room${maintenanceRooms > 1 ? 's' : ''} in maintenance`,
        count: maintenanceRooms,
      });
    }

    return alerts;
  }

  private async getQuickAlerts() {
    const alerts = await this.getAlerts();
    return {
      count: alerts.length,
      critical: alerts.filter(a => a.type === 'critical').length,
      warnings: alerts.filter(a => a.type === 'warning').length,
      info: alerts.filter(a => a.type === 'info').length,
    };
  }

  private async calculateRevenueChange(period: string): Promise<number> {
    try {
      const { startDate: currentStart, endDate: currentEnd } = this.getPeriodDates(period);
      const currentRevenue = await this.getRevenueForPeriod(period);

      // Calculate previous period
      const periodDuration = currentEnd.getTime() - currentStart.getTime();
      const previousStart = new Date(currentStart.getTime() - periodDuration);
      const previousEnd = new Date(currentStart);

      const [prevRoomRevenue, prevPOSRevenue] = await Promise.all([
        this.getRoomRevenueForPeriod(previousStart, previousEnd),
        this.getPOSRevenueForPeriod(previousStart, previousEnd),
      ]);

      const previousRevenue = Number(prevRoomRevenue) + Number(prevPOSRevenue);
      const currentTotal = Number(currentRevenue.total);

      if (previousRevenue === 0) return 0;
      return ((currentTotal - previousRevenue) / previousRevenue) * 100;
    } catch (error) {
      console.error('Error calculating revenue change:', error);
      return 0;
    }
  }

  private getPeriodDates(period: string): { startDate: Date; endDate: Date } {
    const endDate = new Date();
    const startDate = new Date();

    switch (period.toLowerCase()) {
      case 'today':
        startDate.setHours(0, 0, 0, 0);
        endDate.setHours(23, 59, 59, 999);
        break;
      case 'week':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case 'month':
        startDate.setMonth(startDate.getMonth() - 1);
        break;
      case 'year':
        startDate.setFullYear(startDate.getFullYear() - 1);
        break;
      default:
        startDate.setHours(0, 0, 0, 0);
        endDate.setHours(23, 59, 59, 999);
    }

    return { startDate, endDate };
  }

  private getDataPointsForPeriod(period: string): number {
    switch (period.toLowerCase()) {
      case 'today':
        return 8; // Every 3 hours
      case 'week':
        return 7; // Daily
      case 'month':
        return 12; // Every 2-3 days
      case 'year':
        return 12; // Monthly
      default:
        return 8;
    }
  }

  private getDaysForPeriod(period: string): number {
    switch (period.toLowerCase()) {
      case 'today':
        return 1;
      case 'week':
        return 7;
      case 'month':
        return 30;
      case 'year':
        return 365;
      default:
        return 30;
    }
  }

  private getDateForInterval(period: string, index: number, startDate: Date): Date {
    const date = new Date(startDate);

    switch (period.toLowerCase()) {
      case 'today':
        date.setHours(date.getHours() + index * 3);
        break;
      case 'week':
        date.setDate(date.getDate() + index);
        break;
      case 'month':
        date.setDate(date.getDate() + index * 3);
        break;
      case 'year':
        date.setMonth(date.getMonth() + index);
        break;
    }

    return date;
  }

  private formatDateKey(date: Date, period: string): string {
    switch (period.toLowerCase()) {
      case 'today':
        const hours = Math.floor(date.getHours() / 3) * 3;
        date.setHours(hours, 0, 0, 0);
        return date.toISOString();
      case 'week':
      case 'month':
        return date.toISOString().split('T')[0];
      case 'year':
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
      default:
        return date.toISOString();
    }
  }
}