import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  // ==================== DASHBOARD STATS ====================
  async getDashboardStats() {
    console.log('📊 Fetching comprehensive dashboard stats...');

    const [
      // Room stats
      totalRooms,
      availableRooms,
      occupiedRooms,
      reservedRooms,
      maintenanceRooms,
      
      // Guest stats
      currentGuests,
      todayCheckins,
      todayCheckouts,
      
      // Reservation stats
      upcomingReservations,
      todayArrivals,
      pendingReservations,
      
      // POS stats
      todaySales,
      lowStockProducts,
      
      // Payment stats
      outstandingCheckinPayments,
      outstandingReservationPayments,
    ] = await Promise.all([
      // Rooms
      this.prisma.room.count(),
      this.prisma.room.count({ where: { status: 'AVAILABLE' } }),
      this.prisma.room.count({ where: { status: 'OCCUPIED' } }),
      this.prisma.room.count({ where: { status: 'RESERVED' } }),
      this.prisma.room.count({ where: { status: 'MAINTENANCE' } }),
      
      // Guests
      this.prisma.checkIn.count({ where: { status: 'CHECKED_IN' } }),
      this.getTodayCheckIns(),
      this.getTodayCheckOuts(),
      
      // Reservations
      this.getUpcomingReservationsCount(),
      this.getTodayArrivalsCount(),
      this.prisma.reservation.count({ 
        where: { status: { in: ['PENDING', 'CONFIRMED'] } } 
      }),
      
      // POS
      this.getTodaySalesCount(),
      this.getLowStockCount(),
      
      // Payments
      this.getOutstandingCheckInPayments(),
      this.getOutstandingReservationPayments(),
    ]);

    const occupancyRate = totalRooms > 0 ? (occupiedRooms / totalRooms) * 100 : 0;

    return {
      // Room metrics
      rooms: {
        total: totalRooms,
        available: availableRooms,
        occupied: occupiedRooms,
        reserved: reservedRooms,
        maintenance: maintenanceRooms,
        occupancyRate: parseFloat(occupancyRate.toFixed(2)),
      },
      
      // Guest metrics
      guests: {
        current: currentGuests,
        todayCheckins,
        todayCheckouts,
      },
      
      // Reservation metrics
      reservations: {
        upcoming: upcomingReservations,
        todayArrivals,
        pending: pendingReservations,
      },
      
      // POS metrics
      pos: {
        todaySales,
        lowStockProducts,
      },
      
      // Payment metrics
      payments: {
        outstandingCheckins: outstandingCheckinPayments,
        outstandingReservations: outstandingReservationPayments,
        totalOutstanding: outstandingCheckinPayments + outstandingReservationPayments,
      },
    };
  }

  // ==================== REVENUE ANALYTICS ====================
  async getRevenueStats(startDate?: string, endDate?: string) {
    console.log(`💰 Fetching revenue stats: ${startDate} to ${endDate}`);

    const start = startDate ? new Date(startDate) : new Date(new Date().setHours(0, 0, 0, 0));
    const end = endDate ? new Date(endDate) : new Date();

    const [roomRevenue, posRevenue, paymentBreakdown] = await Promise.all([
      this.getRoomRevenue(start, end),
      this.getPOSRevenue(start, end),
      this.getPaymentBreakdown(start, end),
    ]);

    const totalRevenue = roomRevenue.total + posRevenue.total;
    const totalProfit = roomRevenue.profit + posRevenue.profit;

    return {
      summary: {
        totalRevenue: parseFloat(totalRevenue.toFixed(2)),
        totalProfit: parseFloat(totalProfit.toFixed(2)),
        profitMargin: totalRevenue > 0 
          ? parseFloat(((totalProfit / totalRevenue) * 100).toFixed(2))
          : 0,
      },
      
      roomRevenue: {
        total: parseFloat(roomRevenue.total.toFixed(2)),
        transactions: roomRevenue.transactions,
        averagePerNight: parseFloat(roomRevenue.averagePerNight.toFixed(2)),
        totalNights: roomRevenue.totalNights,
      },
      
      posRevenue: {
        total: parseFloat(posRevenue.total.toFixed(2)),
        profit: parseFloat(posRevenue.profit.toFixed(2)),
        transactions: posRevenue.transactions,
        averagePerSale: parseFloat(posRevenue.averagePerSale.toFixed(2)),
      },
      
      paymentMethods: paymentBreakdown,
    };
  }

  // ==================== POS ANALYTICS ====================
  async getPOSAnalytics(startDate?: string, endDate?: string) {
    const start = startDate ? new Date(startDate) : new Date(new Date().setHours(0, 0, 0, 0));
    const end = endDate ? new Date(endDate) : new Date();

    const [
      topProducts,
      categoryPerformance,
      salesByAttendant,
      lowStockProducts,
    ] = await Promise.all([
      this.getTopProducts(start, end, 10),
      this.getCategoryPerformance(start, end),
      this.getSalesByAttendant(start, end),
      this.getLowStockProducts(),
    ]);

    return {
      topProducts,
      categoryPerformance,
      salesByAttendant,
      lowStockProducts,
    };
  }

  // ==================== RESERVATION ANALYTICS ====================
  async getReservationAnalytics() {
    const [
      upcoming,
      todayArrivals,
      weekArrivals,
      monthlyTrend,
      outstandingPayments,
    ] = await Promise.all([
      this.getUpcomingReservations(),
      this.getTodayArrivals(),
      this.getWeekArrivals(),
      this.getReservationMonthlyTrend(),
      this.getReservationOutstandingPayments(),
    ]);

    return {
      upcoming: {
        total: upcoming.length,
        list: upcoming.slice(0, 10), // Top 10 upcoming
      },
      arrivals: {
        today: todayArrivals,
        thisWeek: weekArrivals,
      },
      monthlyTrend,
      outstandingPayments,
    };
  }

  // ==================== PAYMENT ANALYTICS ====================
  async getPaymentAnalytics() {
    const [
      outstandingCheckins,
      outstandingReservations,
      paymentMethodBreakdown,
      recentPayments,
    ] = await Promise.all([
      this.getOutstandingCheckInPaymentDetails(),
      this.getOutstandingReservationPaymentDetails(),
      this.getPaymentMethodBreakdown(),
      this.getRecentPayments(10),
    ]);

    const totalOutstanding = 
      outstandingCheckins.reduce((sum, c) => sum + Number(c.balanceDue), 0) +
      outstandingReservations.reduce((sum, r) => sum + Number(r.balanceDue), 0);

    return {
      summary: {
        totalOutstanding: parseFloat(totalOutstanding.toFixed(2)),
        checkinOutstanding: outstandingCheckins.length,
        reservationOutstanding: outstandingReservations.length,
      },
      outstandingCheckins: outstandingCheckins.slice(0, 10),
      outstandingReservations: outstandingReservations.slice(0, 10),
      paymentMethods: paymentMethodBreakdown,
      recentPayments,
    };
  }

  // ==================== OCCUPANCY TRENDS ====================
  async getOccupancyTrend(days: number = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const checkins = await this.prisma.checkIn.findMany({
      where: {
        OR: [
          {
            checkInDate: { gte: startDate },
          },
          {
            status: 'CHECKED_IN',
          },
        ],
      },
      select: {
        checkInDate: true,
        checkOutDate: true,
      },
    });

    const totalRooms = await this.prisma.room.count();
    const trendData: { [key: string]: number } = {};

    // Initialize all dates
    for (let i = 0; i < days; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      trendData[dateStr] = 0;
    }

    // Calculate occupancy for each day
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
        occupiedRooms: trendData[date],
        occupancyRate: totalRooms > 0 
          ? parseFloat(((trendData[date] / totalRooms) * 100).toFixed(2))
          : 0,
      }));
  }

  // ==================== RECENT ACTIVITY ====================
  async getRecentActivity(limit: number = 20) {
    const [checkins, sales, reservations] = await Promise.all([
      this.prisma.checkIn.findMany({
        take: limit,
        orderBy: { updatedAt: 'desc' },
        include: {
          room: true,
          attendant: { select: { id: true, name: true } },
        },
      }),
      this.prisma.sale.findMany({
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          attendant: { select: { id: true, name: true } },
          checkIn: { select: { clientName: true, roomNumber: true } },
        },
      }),
      this.prisma.reservation.findMany({
        take: limit,
        orderBy: { updatedAt: 'desc' },
        include: {
          room: true,
          attendant: { select: { id: true, name: true } },
        },
      }),
    ]);

    // Combine and sort all activities
    const activities: any[] = [];

    checkins.forEach(c => {
      activities.push({
        type: c.status === 'CHECKED_IN' ? 'check_in' : 'check_out',
        timestamp: c.updatedAt,
        description: `${c.clientName} - Room ${c.roomNumber}`,
        attendant: c.attendant.name,
        amount: c.totalAmount,
      });
    });

    sales.forEach(s => {
      activities.push({
        type: 'sale',
        timestamp: s.createdAt,
        description: `Sale #${s.saleNumber}${s.checkIn ? ` - ${s.checkIn.clientName}` : ''}`,
        attendant: s.attendant.name,
        amount: s.total,
      });
    });

    reservations.forEach(r => {
      activities.push({
        type: 'reservation',
        timestamp: r.updatedAt,
        description: `${r.clientName} - ${r.roomType}`,
        attendant: r.attendant.name,
        amount: r.totalAmount,
        status: r.status,
      });
    });

    return activities
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  // ==================== STAFF PERFORMANCE ====================
  async getStaffPerformance(startDate?: string, endDate?: string) {
    const start = startDate ? new Date(startDate) : new Date(new Date().setHours(0, 0, 0, 0));
    const end = endDate ? new Date(endDate) : new Date();

    const attendants = await this.prisma.user.findMany({
      where: { status: 'ACTIVE' },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
      },
    });

    const performance = await Promise.all(
      attendants.map(async (attendant) => {
        const [checkins, sales, reservations] = await Promise.all([
          this.prisma.checkIn.count({
            where: {
              attendantId: attendant.id,
              createdAt: { gte: start, lte: end },
            },
          }),
          this.prisma.sale.aggregate({
            where: {
              attendantId: attendant.id,
              createdAt: { gte: start, lte: end },
            },
            _sum: { total: true },
            _count: true,
          }),
          this.prisma.reservation.count({
            where: {
              attendantId: attendant.id,
              createdAt: { gte: start, lte: end },
            },
          }),
        ]);

        return {
          attendant: {
            id: attendant.id,
            name: attendant.name,
            role: attendant.role,
          },
          metrics: {
            checkins,
            sales: sales._count,
            salesRevenue: parseFloat((sales._sum.total || 0).toString()),
            reservations,
          },
        };
      })
    );

    return performance.sort((a, b) => b.metrics.salesRevenue - a.metrics.salesRevenue);
  }

  // ==================== HELPER METHODS ====================

  private async getTodayCheckIns() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    return this.prisma.checkIn.count({
      where: {
        checkInDate: { gte: today, lt: tomorrow },
      },
    });
  }

  private async getTodayCheckOuts() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    return this.prisma.checkIn.count({
      where: {
        checkOutDate: { gte: today, lt: tomorrow },
        status: 'CHECKED_OUT',
      },
    });
  }

  private async getUpcomingReservationsCount() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return this.prisma.reservation.count({
      where: {
        checkInDate: { gte: today },
        status: { in: ['PENDING', 'CONFIRMED'] },
      },
    });
  }

  private async getTodayArrivalsCount() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    return this.prisma.reservation.count({
      where: {
        checkInDate: { gte: today, lt: tomorrow },
        status: { in: ['PENDING', 'CONFIRMED'] },
      },
    });
  }

  private async getTodaySalesCount() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    return this.prisma.sale.count({
      where: {
        createdAt: { gte: today, lt: tomorrow },
      },
    });
  }

  private async getOutstandingCheckInPayments() {
    const result = await this.prisma.checkIn.aggregate({
      where: {
        paymentStatus: { in: ['UNPAID', 'PARTIAL'] },
      },
      _sum: {
        totalAmount: true,
        amountPaid: true,
      },
    });

    const total = Number(result._sum.totalAmount || 0);
    const paid = Number(result._sum.amountPaid || 0);
    return total - paid;
  }

  private async getOutstandingReservationPayments() {
    const result = await this.prisma.reservation.aggregate({
      where: {
        paymentStatus: { in: ['UNPAID', 'PARTIAL'] },
        status: { in: ['PENDING', 'CONFIRMED'] },
      },
      _sum: {
        balanceDue: true,
      },
    });

    return Number(result._sum.balanceDue || 0);
  }

  private async getRoomRevenue(start: Date, end: Date) {
    const checkouts = await this.prisma.checkIn.findMany({
      where: {
        status: 'CHECKED_OUT',
        checkOutDate: { gte: start, lte: end },
      },
      select: {
        totalAmount: true,
        daysStayed: true,
      },
    });

    const total = checkouts.reduce((sum, c) => sum + Number(c.totalAmount || 0), 0);
    const totalNights = checkouts.reduce((sum, c) => sum + (c.daysStayed || 0), 0);
    const averagePerNight = totalNights > 0 ? total / totalNights : 0;

    return {
      total,
      profit: total, // For rooms, revenue = profit (no cost tracking)
      transactions: checkouts.length,
      totalNights,
      averagePerNight,
    };
  }

  private async getPOSRevenue(start: Date, end: Date) {
    const sales = await this.prisma.sale.findMany({
      where: {
        createdAt: { gte: start, lte: end },
      },
      include: {
        items: {
          include: {
            product: {
              select: { cost: true },
            },
          },
        },
      },
    });

    let total = 0;
    let profit = 0;

    sales.forEach(sale => {
      total += Number(sale.total);
      
      sale.items.forEach(item => {
        const itemRevenue = Number(item.total);
        const itemCost = item.product.cost 
          ? Number(item.product.cost) * item.quantity
          : 0;
        profit += (itemRevenue - itemCost);
      });
    });

    const averagePerSale = sales.length > 0 ? total / sales.length : 0;

    return {
      total,
      profit,
      transactions: sales.length,
      averagePerSale,
    };
  }

  private async getPaymentBreakdown(start: Date, end: Date) {
    const [checkIns, reservations, sales] = await Promise.all([
      this.prisma.checkIn.groupBy({
        by: ['paymentMethod'],
        where: {
          createdAt: { gte: start, lte: end },
        },
        _sum: {
          amountPaid: true,
        },
        _count: true,
      }),
      this.prisma.reservation.groupBy({
        by: ['paymentMethod'],
        where: {
          createdAt: { gte: start, lte: end },
        },
        _sum: {
          amountPaid: true,
        },
        _count: true,
      }),
      this.prisma.sale.groupBy({
        by: ['paymentMethod'],
        where: {
          createdAt: { gte: start, lte: end },
        },
        _sum: {
          amountPaid: true,
        },
        _count: true,
      }),
    ]);

    const breakdown: { [key: string]: { amount: number; count: number } } = {};

    [...checkIns, ...reservations, ...sales].forEach(group => {
      const method = group.paymentMethod;
      if (!breakdown[method]) {
        breakdown[method] = { amount: 0, count: 0 };
      }
      breakdown[method].amount += Number(group._sum.amountPaid || 0);
      breakdown[method].count += group._count;
    });

    return Object.entries(breakdown).map(([method, data]) => ({
      method,
      amount: parseFloat(data.amount.toFixed(2)),
      transactions: data.count,
    }));
  }

  private async getTopProducts(start: Date, end: Date, limit: number) {
    const sales = await this.prisma.saleItem.groupBy({
      by: ['productId'],
      where: {
        sale: {
          createdAt: { gte: start, lte: end },
        },
      },
      _sum: {
        quantity: true,
        total: true,
      },
      orderBy: {
        _sum: {
          total: 'desc',
        },
      },
      take: limit,
    });

    const productsWithDetails = await Promise.all(
      sales.map(async (item) => {
        const product = await this.prisma.product.findUnique({
          where: { id: item.productId },
          select: {
            name: true,
            category: { select: { name: true } },
          },
        });

        return {
          productId: item.productId,
          name: product?.name || 'Unknown',
          category: product?.category.name || 'Unknown',
          quantitySold: item._sum.quantity || 0,
          revenue: parseFloat((item._sum.total || 0).toString()),
        };
      })
    );

    return productsWithDetails;
  }

  private async getCategoryPerformance(start: Date, end: Date) {
    const sales = await this.prisma.saleItem.findMany({
      where: {
        sale: {
          createdAt: { gte: start, lte: end },
        },
      },
      include: {
        product: {
          select: {
            category: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    const categoryData: { [key: string]: { name: string; revenue: number; items: number } } = {};

    sales.forEach(item => {
      const categoryId = item.product.category.id;
      const categoryName = item.product.category.name;

      if (!categoryData[categoryId]) {
        categoryData[categoryId] = { name: categoryName, revenue: 0, items: 0 };
      }

      categoryData[categoryId].revenue += Number(item.total);
      categoryData[categoryId].items += item.quantity;
    });

    return Object.values(categoryData)
      .map(cat => ({
        ...cat,
        revenue: parseFloat(cat.revenue.toFixed(2)),
      }))
      .sort((a, b) => b.revenue - a.revenue);
  }

  private async getSalesByAttendant(start: Date, end: Date) {
    const sales = await this.prisma.sale.groupBy({
      by: ['attendantId'],
      where: {
        createdAt: { gte: start, lte: end },
      },
      _sum: {
        total: true,
      },
      _count: true,
    });

    const attendantsWithDetails = await Promise.all(
      sales.map(async (item) => {
        const attendant = await this.prisma.user.findUnique({
          where: { id: item.attendantId },
          select: { name: true },
        });

        return {
          attendantId: item.attendantId,
          name: attendant?.name || 'Unknown',
          totalSales: item._count,
          revenue: parseFloat((item._sum.total || 0).toString()),
        };
      })
    );

    return attendantsWithDetails.sort((a, b) => b.revenue - a.revenue);
  }

  private async getLowStockProducts() {
    // Fetch all products and filter in code since Prisma doesn't support column comparison
    const products = await this.prisma.product.findMany({
      where: {
        status: { not: 'INACTIVE' },
      },
      include: {
        category: {
          select: { name: true },
        },
      },
      orderBy: { stock: 'asc' },
    });

    // Filter products where stock <= minStock or status is OUT_OF_STOCK
    return products
      .filter(p => p.stock <= p.minStock || p.status === 'OUT_OF_STOCK')
      .slice(0, 20);
  }

  private async getLowStockCount(): Promise<number> {
    const products = await this.prisma.product.findMany({
      where: {
        status: { not: 'INACTIVE' },
      },
      select: {
        stock: true,
        minStock: true,
        status: true,
      },
    });

    return products.filter(p => p.stock <= p.minStock || p.status === 'OUT_OF_STOCK').length;
  }

  private async getUpcomingReservations() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return this.prisma.reservation.findMany({
      where: {
        checkInDate: { gte: today },
        status: { in: ['PENDING', 'CONFIRMED'] },
      },
      include: {
        room: true,
      },
      orderBy: { checkInDate: 'asc' },
    });
  }

  private async getTodayArrivals() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    return this.prisma.reservation.findMany({
      where: {
        checkInDate: { gte: today, lt: tomorrow },
        status: { in: ['PENDING', 'CONFIRMED'] },
      },
      include: {
        room: true,
      },
    });
  }

  private async getWeekArrivals() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const weekEnd = new Date(today);
    weekEnd.setDate(weekEnd.getDate() + 7);

    return this.prisma.reservation.findMany({
      where: {
        checkInDate: { gte: today, lt: weekEnd },
        status: { in: ['PENDING', 'CONFIRMED'] },
      },
      include: {
        room: true,
      },
      orderBy: { checkInDate: 'asc' },
    });
  }

  private async getReservationMonthlyTrend() {
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - 6);

    const reservations = await this.prisma.reservation.findMany({
      where: {
        createdAt: { gte: startDate },
      },
      select: {
        createdAt: true,
        status: true,
      },
    });

    const monthlyData: { [key: string]: { total: number; confirmed: number; cancelled: number } } = {};

    reservations.forEach(res => {
      const monthKey = `${res.createdAt.getFullYear()}-${String(res.createdAt.getMonth() + 1).padStart(2, '0')}`;
      
      if (!monthlyData[monthKey]) {
        monthlyData[monthKey] = { total: 0, confirmed: 0, cancelled: 0 };
      }

      monthlyData[monthKey].total++;
      if (res.status === 'CONFIRMED' || res.status === 'CHECKED_IN' || res.status === 'COMPLETED') {
        monthlyData[monthKey].confirmed++;
      } else if (res.status === 'CANCELLED') {
        monthlyData[monthKey].cancelled++;
      }
    });

    return Object.entries(monthlyData)
      .map(([month, data]) => ({ month, ...data }))
      .sort((a, b) => a.month.localeCompare(b.month));
  }

  private async getReservationOutstandingPayments() {
    return this.prisma.reservation.findMany({
      where: {
        paymentStatus: { in: ['UNPAID', 'PARTIAL'] },
        status: { in: ['PENDING', 'CONFIRMED'] },
      },
      select: {
        id: true,
        clientName: true,
        roomType: true,
        checkInDate: true,
        totalAmount: true,
        amountPaid: true,
        balanceDue: true,
        paymentStatus: true,
      },
      orderBy: { balanceDue: 'desc' },
      take: 10,
    });
  }

  private async getOutstandingCheckInPaymentDetails() {
    const checkins = await this.prisma.checkIn.findMany({
      where: {
        paymentStatus: { in: ['UNPAID', 'PARTIAL'] },
      },
      select: {
        id: true,
        clientName: true,
        roomNumber: true,
        checkInDate: true,
        totalAmount: true,
        amountPaid: true,
        paymentStatus: true,
      },
    });

    return checkins.map(c => ({
      ...c,
      balanceDue: Number(c.totalAmount || 0) - Number(c.amountPaid),
    })).sort((a, b) => b.balanceDue - a.balanceDue);
  }

  private async getOutstandingReservationPaymentDetails() {
    return this.prisma.reservation.findMany({
      where: {
        paymentStatus: { in: ['UNPAID', 'PARTIAL'] },
        status: { in: ['PENDING', 'CONFIRMED'] },
      },
      select: {
        id: true,
        clientName: true,
        roomType: true,
        checkInDate: true,
        totalAmount: true,
        amountPaid: true,
        balanceDue: true,
        paymentStatus: true,
      },
      orderBy: { balanceDue: 'desc' },
    });
  }

  private async getPaymentMethodBreakdown() {
    const [checkIns, reservations, sales] = await Promise.all([
      this.prisma.checkIn.groupBy({
        by: ['paymentMethod'],
        _sum: { amountPaid: true },
        _count: true,
      }),
      this.prisma.reservation.groupBy({
        by: ['paymentMethod'],
        _sum: { amountPaid: true },
        _count: true,
      }),
      this.prisma.sale.groupBy({
        by: ['paymentMethod'],
        _sum: { amountPaid: true },
        _count: true,
      }),
    ]);

    const breakdown: { [key: string]: { amount: number; count: number } } = {};

    [...checkIns, ...reservations, ...sales].forEach(group => {
      const method = group.paymentMethod;
      if (!breakdown[method]) {
        breakdown[method] = { amount: 0, count: 0 };
      }
      breakdown[method].amount += Number(group._sum.amountPaid || 0);
      breakdown[method].count += group._count;
    });

    return Object.entries(breakdown).map(([method, data]) => ({
      method,
      amount: parseFloat(data.amount.toFixed(2)),
      transactions: data.count,
      percentage: 0, // Will be calculated by frontend
    }));
  }

  private async getRecentPayments(limit: number) {
    const [checkinPayments, reservationPayments] = await Promise.all([
      this.prisma.checkIn.findMany({
        where: {
          amountPaid: { gt: 0 },
        },
        select: {
          id: true,
          clientName: true,
          roomNumber: true,
          amountPaid: true,
          paymentMethod: true,
          updatedAt: true,
        },
        orderBy: { updatedAt: 'desc' },
        take: limit,
      }),
      this.prisma.reservation.findMany({
        where: {
          amountPaid: { gt: 0 },
        },
        select: {
          id: true,
          clientName: true,
          roomType: true,
          amountPaid: true,
          paymentMethod: true,
          updatedAt: true,
        },
        orderBy: { updatedAt: 'desc' },
        take: limit,
      }),
    ]);

    const payments: any[] = [
      ...checkinPayments.map(p => ({
        type: 'check_in',
        ...p,
        description: `${p.clientName} - Room ${p.roomNumber}`,
      })),
      ...reservationPayments.map(p => ({
        type: 'reservation',
        ...p,
        description: `${p.clientName} - ${p.roomType}`,
      })),
    ];

    return payments
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
      .slice(0, limit);
  }
}