import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {PassportStrategy} from '@nestjs/passport'
import { Strategy, ExtractJwt } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service.js';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy){
    constructor(config: ConfigService , private prisma: PrismaService){
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get('JWT_SECRET')!,
    });
    };
   async validate(payload: { sub: number | string; email: string; phoneNumber: string }) {
    const user = await this.prisma.user.findUnique({ where: { id: Number(payload.sub) } });
    if (!user) throw new UnauthorizedException('User not found');
    const { password: _password, ...result } = user;
    return result;
    }
}