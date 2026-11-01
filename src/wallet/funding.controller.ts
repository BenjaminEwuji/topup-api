import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { FundingService } from './funding.service.js';
import { InitializeFundingDto } from './dto/initialize-funding.dto.js';
import { VerifyFundingDto } from './dto/verify-funding.dto.js';
import { AuthGuard } from '@nestjs/passport';
import { GetUser } from '../auth/decorator/get.user.decorator.js';

@UseGuards(AuthGuard('jwt'))
@Controller('wallet/fund')
export class FundingController {
  constructor(private funding: FundingService) {}

  @Post('initialize')
  initialize(@GetUser('id') userId: number, @Body() dto: InitializeFundingDto) {
    return this.funding.initialize(userId, dto);
  }

  @Get('verify')
  verify(@GetUser('id') userId: number, @Query() query: VerifyFundingDto) {
    return this.funding.verify(userId, query.reference);
  }
}