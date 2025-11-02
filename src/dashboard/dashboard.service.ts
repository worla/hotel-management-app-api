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
      // Get basic stats from your existing reports service
      const stats = await this.reportsService.getDashboardStats();

      // Get revenue for the period
      const { startDate, endDate } = this.getPeriodDates(period);
      const revenueStats = await this.reportsService.getRevenueStats(
        startDate.toISOString(),
        endDate.toISOString(),
      );

      // Get revenue trend data
      const revenueData = await this.getRevenueTrendData(period);

      // Get recent activities
      const recentActivities = await this.getRecentActivitiesFormatted();

      // Calculate revenue change (compare with previous period)
      const revenueChange = await this.calculateRevenueChange(period, startDate);

      const summary = {
        // Current metrics
        totalRevenue: parseFloat(revenueStats.totalRevenue),
        revenueChange,
        currentGuests: stats.currentGuests,
        guestChange: 0, // You can calculate this if needed
        checkInsToday: stats.todayCheckins,
        checkOutsToday: stats.todayCheckouts,
        
        // Occupancy
        occupancyRate: parseFloat(stats.occupancyRate),
        totalRooms: stats.totalRooms,
        occupiedRooms: stats.occupiedRooms,
        availableRooms: stats.availableRooms,
        
        // Chart data
        revenueData,
        recentActivities,
      };

      console.log(`✅ Dashboard summary generated:`, {
        revenue: summary.totalRevenue,
        guests: summary.currentGuests,
        occupancy: summary.occupancyRate,
      });

      return summary;
    } catch (error) {
      console.error('❌ Error generating dashboard summary:', error);
      throw error;
    }
  }

  private async getRevenueTrendData(period: string) {
    const { startDate, endDate } = this.getPeriodDates(period);
    const dataPoints = this.getDataPointsForPeriod(period);

    // Get checkouts with revenue for the period
    const checkouts = await this.prisma.checkIn.findMany({
      where: {
        status: 'CHECKED_OUT',
        checkOutDate: {
          gte: startDate,
          lte: endDate,
        },
      },
      select: {
        checkOutDate: true,
        totalAmount: true,
      },
      orderBy: {
        checkOutDate: 'asc',
      },
    });

    // Group revenue by date intervals
    const revenueByInterval: { [key: string]: number } = {};
    
    // Initialize intervals
    for (let i = 0; i < dataPoints; i++) {
      const date = this.getDateForInterval(period, i, startDate);
      const key = this.formatDateKey(date, period);
      revenueByInterval[key] = 0;
    }

    // Sum revenue for each interval
    checkouts.forEach((checkout) => {
      if (checkout.checkOutDate) {
        const key = this.formatDateKey(new Date(checkout.checkOutDate), period);
        if (revenueByInterval[key] !== undefined) {
          revenueByInterval[key] += Number(checkout.totalAmount || 0);
        }
      }
    });

    // Convert to array format for mobile app
    return Object.entries(revenueByInterval).map(([date, amount]) => ({
      date: new Date(date).toISOString(),
      amount: Math.round(amount * 100) / 100, // Round to 2 decimals
    }));
  }

  private async getRecentActivitiesFormatted() {
    const activities = await this.reportsService.getRecentActivity(5);

    return activities.map((activity) => {
      let type = 'check_in';
      let title = 'Activity';
      let description = '';

      if (activity.status === 'CHECKED_IN') {
        type = 'check_in';
        title = 'New Check-in';
        description = `Guest checked into Room ${activity.room.roomNumber}`;
      } else if (activity.status === 'CHECKED_OUT') {
        type = 'check_out';
        title = 'Check-out';
        description = `Guest checked out from Room ${activity.room.roomNumber}`;
      } else if (activity.totalAmount) {
        type = 'payment';
        title = 'Payment Received';
        description = `$${activity.totalAmount} from Room ${activity.room.roomNumber}`;
      }

      return {
        type,
        title,
        description,
        timestamp: activity.updatedAt.toISOString(),
      };
    });
  }

  private async calculateRevenueChange(period: string, currentStartDate: Date): Promise<number> {
    try {
      // Get current period revenue
      const { startDate: currentStart, endDate: currentEnd } = this.getPeriodDates(period);
      const currentRevenue = await this.getTotalRevenue(currentStart, currentEnd);

      // Get previous period revenue
      const previousStart = new Date(currentStart);
      const previousEnd = new Date(currentStart);
      const periodDuration = currentEnd.getTime() - currentStart.getTime();
      previousStart.setTime(previousStart.getTime() - periodDuration);

      const previousRevenue = await this.getTotalRevenue(previousStart, previousEnd);

      // Calculate percentage change
      if (previousRevenue === 0) return 0;
      return ((currentRevenue - previousRevenue) / previousRevenue) * 100;
    } catch (error) {
      console.error('Error calculating revenue change:', error);
      return 0;
    }
  }

  private async getTotalRevenue(startDate: Date, endDate: Date): Promise<number> {
    const result = await this.prisma.checkIn.aggregate({
      where: {
        status: 'CHECKED_OUT',
        checkOutDate: {
          gte: startDate,
          lte: endDate,
        },
      },
      _sum: {
        totalAmount: true,
      },
    });

    return Number(result._sum.totalAmount || 0);
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
        return 8; // 8 data points (every 3 hours)
      case 'week':
        return 7; // 7 days
      case 'month':
        return 12; // 12 points (every 2-3 days)
      case 'year':
        return 12; // 12 months
      default:
        return 8;
    }
  }

  private getDateForInterval(period: string, index: number, startDate: Date): Date {
    const date = new Date(startDate);

    switch (period.toLowerCase()) {
      case 'today':
        date.setHours(date.getHours() + index * 3); // Every 3 hours
        break;
      case 'week':
        date.setDate(date.getDate() + index); // Daily
        break;
      case 'month':
        date.setDate(date.getDate() + index * 3); // Every 3 days
        break;
      case 'year':
        date.setMonth(date.getMonth() + index); // Monthly
        break;
    }

    return date;
  }

  private formatDateKey(date: Date, period: string): string {
    switch (period.toLowerCase()) {
      case 'today':
        // Round to nearest 3-hour block
        const hours = Math.floor(date.getHours() / 3) * 3;
        date.setHours(hours, 0, 0, 0);
        return date.toISOString();
      case 'week':
      case 'month':
        // Daily
        return date.toISOString().split('T')[0];
      case 'year':
        // Monthly
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
      default:
        return date.toISOString();
    }
  }
}