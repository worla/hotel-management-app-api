import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module'; // ADD THIS

import { CheckinsModule } from './checkins/checkins.module';
import { RoomsModule } from './rooms/rooms.module';
import { ReportsModule } from './reports/reports.module';
import { DashboardModule } from './dashboard/dashboard.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    UsersModule, // ADD THIS
    CheckinsModule,
    RoomsModule,
    ReportsModule,
    DashboardModule,  // ← Add this

  ],
})
export class AppModule {}