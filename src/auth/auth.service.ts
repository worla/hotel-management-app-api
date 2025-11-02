import { Injectable, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { UserStatus } from '@prisma/client';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const hashedPassword = await bcrypt.hash(dto.password, 10);
    
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        password: hashedPassword,
        name: dto.name,
        role: dto.role,
        phoneNumber: dto.phoneNumber,
        address: dto.address,
        status: UserStatus.ACTIVE,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        phoneNumber: true,
        address: true,
        status: true,
      },
    });

    // IMPORTANT: Pass name to signToken
    const tokenResponse = await this.signToken(
      user.id,
      user.email,
      user.name,  // ← Make sure name is passed here
      user.role,
    );

    return tokenResponse;
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: {
        id: true,
        email: true,
        name: true,  // ← Make sure to select name from database
        password: true,
        role: true,
        status: true,
      },
    });

    if (!user) throw new UnauthorizedException('Invalid credentials');

    const passwordMatch = await bcrypt.compare(dto.password, user.password);
    if (!passwordMatch) throw new UnauthorizedException('Invalid credentials');

    // Check if account is active
    if (user.status !== UserStatus.ACTIVE) {
      throw new ForbiddenException(
        'Your account has been deactivated. Please contact an administrator.',
      );
    }

    // IMPORTANT: Pass name to signToken
    const tokenResponse = await this.signToken(
      user.id,
      user.email,
      user.name,  // ← Make sure name is passed here
      user.role,
    );

    return tokenResponse;
  }

  async signToken(
    userId: string,
    email: string,
    name: string,  // ← Add name parameter
    role: string,
  ) {
    // Include name in JWT payload
    const payload = {
      sub: userId,
      email,
      name,  // ← Include in JWT payload
      role,
    };
    
    const token = await this.jwt.signAsync(payload);

    // Return name in response
    return {
      access_token: token,
      userId,
      email,
      name,  // ← Include in response
      role,
    };
  }
}