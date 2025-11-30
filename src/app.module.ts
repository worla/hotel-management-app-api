import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module'; // ADD THIS

import { CheckinsModule } from './checkins/checkins.module';
import { RoomsModule } from './rooms/rooms.module';
import { ReservationsModule } from './reservations/reservations.module'; // ADD THIS

import { ReportsModule } from './reports/reports.module';
import { DashboardModule } from './dashboard/dashboard.module';

// POS Modules
import { CategoriesModule } from './categories/categories.module';
import { ProductsModule } from './products/products.module';
import { SalesModule } from './sales/sales.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    UsersModule, // ADD THIS
    CheckinsModule,
    RoomsModule,
    ReservationsModule,  // ADD THIS
    ReportsModule,
    DashboardModule,  // ← Add this

    // POS Modules
    CategoriesModule,
    ProductsModule,
    SalesModule,

  ],
})
export class AppModule {}