import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  async getDashboardStats() {
    const [
      totalRooms,
      availableRooms,
      occupiedRooms,
      currentGuests,
      todayCheckins,
      todayCheckouts,
    ] = await Promise.all([
      this.prisma.room.count(),
      this.prisma.room.count({ where: { status: 'AVAILABLE' } }),
      this.prisma.room.count({ where: { status: 'OCCUPIED' } }),
      this.prisma.checkIn.count({ where: { status: 'CHECKED_IN' } }),
      this.prisma.checkIn.count({
        where: {
          checkInDate: {
            gte: new Date(new Date().setHours(0, 0, 0, 0)),
            lt: new Date(new Date().setHours(23, 59, 59, 999)),
          },
        },
      }),
      this.prisma.checkIn.count({
        where: {
          checkOutDate: {
            gte: new Date(new Date().setHours(0, 0, 0, 0)),
            lt: new Date(new Date().setHours(23, 59, 59, 999)),
          },
          status: 'CHECKED_OUT',
        },
      }),
    ]);

    const occupancyRate = totalRooms > 0 ? (occupiedRooms / totalRooms) * 100 : 0;

    return {
      totalRooms,
      availableRooms,
      occupiedRooms,
      currentGuests,
      todayCheckins,
      todayCheckouts,
      occupancyRate: occupancyRate.toFixed(2),
    };
  }

  async getRevenueStats(startDate?: string, endDate?: string) {
    const where: any = { status: 'CHECKED_OUT' };

    if (startDate && endDate) {
      where.checkOutDate = {
        gte: new Date(startDate),
        lte: new Date(endDate),
      };
    }

    const checkouts = await this.prisma.checkIn.findMany({
      where,
      select: {
        totalAmount: true,
        checkOutDate: true,
        daysStayed: true,
      },
    });

    const totalRevenue = checkouts.reduce(
      (sum, checkout) => sum + Number(checkout.totalAmount || 0),
      0,
    );

    const totalNights = checkouts.reduce(
      (sum, checkout) => sum + (checkout.daysStayed || 0),
      0,
    );

    const averageDailyRate = totalNights > 0 ? totalRevenue / totalNights : 0;

    return {
      totalRevenue: totalRevenue.toFixed(2),
      totalCheckouts: checkouts.length,
      totalNights,
      averageDailyRate: averageDailyRate.toFixed(2),
    };
  }

  async getOccupancyTrend(days: number = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const checkins = await this.prisma.checkIn.findMany({
      where: {
        checkInDate: { gte: startDate },
      },
      select: {
        checkInDate: true,
        checkOutDate: true,
      },
    });

    // Group by date
    const trendData: any = {};
    
    for (let i = 0; i < days; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      trendData[dateStr] = 0;
    }

    checkins.forEach((checkin) => {
      const checkInDate = new Date(checkin.checkInDate);
      const checkOutDate = checkin.checkOutDate ? new Date(checkin.checkOutDate) : new Date();
      
      for (const dateStr in trendData) {
        const currentDate = new Date(dateStr);
        if (currentDate >= checkInDate && currentDate <= checkOutDate) {
          trendData[dateStr]++;
        }
      }
    });

    return Object.keys(trendData)
      .sort()
      .map((date) => ({
        date,
        occupancy: trendData[date],
      }));
  }

  async getRecentActivity(limit: number = 20) {
    return this.prisma.checkIn.findMany({
      take: limit,
      orderBy: { updatedAt: 'desc' },
      include: {
        room: true,
        attendant: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
  }
}