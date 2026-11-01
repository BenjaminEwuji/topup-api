import { ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { LoginDto, LogoutDto, ResetPasswordDto, SignupDto } from './dto/index.js';
import * as argon from 'argon2'
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { WalletService } from '../wallet/wallet.service.js';

@Injectable()
export class AuthService {
    private revokedTokens = new Set<string>();
    private revokedUsers = new Set<string>();

    constructor(
        private prisma: PrismaService, 
        private jwt: JwtService,
        private config: ConfigService,
        private walletService: WalletService,
    ){}
    
    //Login
    async login(dto: LoginDto){
        const cleanPhone = (val?: string) =>
            val ? val.replace(/\s+/g, '').replace(/^\+234/, '0') : undefined;

        const emailIdentifier = dto.email?.trim().toLowerCase();
        const phoneIdentifier = cleanPhone(dto.phoneNumber) || cleanPhone(dto.email);

        const user = await this.prisma.user.findFirst({
          where: {
            OR: [
              emailIdentifier ? { email: emailIdentifier } : undefined,
              phoneIdentifier ? { phone: phoneIdentifier } : undefined,
            ].filter(Boolean) as any,
          },
        });
        if(!user) throw new UnauthorizedException('User not found');
        const isMatch = await argon.verify(user.password, dto.password);
        if(!isMatch) throw new UnauthorizedException('Invalid password');
        
        return await this.loginToken(user.id.toString(), user.email, user.phone)
    }
    //Signup
    async signup(dto: SignupDto){
      const hash = await argon.hash(dto.password);
      try {
        const user = await this.prisma.user.create({
          data:{
            email: dto.email,
            password: hash,
            fullName: `${dto.firstName} ${dto.lastName}`.trim(),
            firstName: dto.firstName,
            lastName: dto.lastName,
            phone: dto.phoneNumber,
          }
        });
        const { password, ...result } = user;
        const wallet = await this.walletService.createWallet(user);
        return {...result, ...wallet};
      } catch (error: any) {
        if (error.code === 'P2002') {
          throw new ConflictException('Email or phone number already in use');
        }
        throw error;
      }
    }
    //Reset Password
    async resetPassword(dto: ResetPasswordDto){
        const cleanPhone = (val?: string) =>
            val ? val.replace(/\s+/g, '').replace(/^\+234/, '0') : undefined;

        const emailIdentifier = dto.email?.trim().toLowerCase();
        const phoneIdentifier = cleanPhone(dto.phoneNumber) || cleanPhone(dto.email);

        const user = await this.prisma.user.findFirst({
          where: {
            OR: [
              emailIdentifier ? { email: emailIdentifier } : undefined,
              phoneIdentifier ? { phone: phoneIdentifier } : undefined,
            ].filter(Boolean) as any,
          },
        });
        if(!user) throw new NotFoundException('User not found');

        const hash = await argon.hash(dto.password);
        await this.prisma.user.update({
            where: { id: user.id },
            data: { password: hash },
        });

        // Invalidate active sessions so the user must log in with the new password
        this.revokedUsers.add(user.id.toString());

        return {
            message: 'Password reset successfully',
        };
    }
    //Logout
    async logout(dto: LogoutDto){
        this.revokedTokens.add(dto.refreshToken);

        let userId: string | null = null;
        try {
            const decoded: any = this.jwt.decode(dto.refreshToken);
            if (decoded && decoded.sub) {
                userId = String(decoded.sub);
            }
        } catch {
            // Proceed gracefully if token is opaque or unparseable
        }

        if (dto.allDevices && userId) {
            this.revokedUsers.add(userId);
        }

        return {
            message: dto.allDevices
                ? 'Logged out from all devices successfully'
                : 'Logged out successfully',
        };
    }

    isTokenRevoked(token: string): boolean {
        return this.revokedTokens.has(token);
    }

    isUserLoggedOutOfAllDevices(userId: string): boolean {
        return this.revokedUsers.has(userId);
    }
   
    async loginToken(userId: string, email: string, phoneNumber: string): Promise<{access_token: string; refresh_token: string}>{
        const payload = {
            sub: userId,
            email,
            phoneNumber,
        }
        const secret = this.config.get('JWT_SECRET');
        const expiresIn = this.config.get('JWT_EXPIRES_IN') || '7d';
        const [accessToken, refreshToken] = await Promise.all([
            this.jwt.signAsync(payload, { expiresIn, secret }),
            this.jwt.signAsync(payload, { expiresIn: '7d', secret }),
        ]);

        return { 
            access_token: accessToken,
            refresh_token: refreshToken,
        };
    }
    
}