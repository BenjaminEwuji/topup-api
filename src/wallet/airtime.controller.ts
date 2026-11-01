import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AirtimeService } from './airtime.service.js';
import { BuyAirtimeDto } from './dto/buy-airtime.dto.js';
import { GetUser } from '../auth/decorator/get.user.decorator.js';

@UseGuards(AuthGuard('jwt'))
@Controller('airtime')
export class AirtimeController {
  constructor(private airtimeService: AirtimeService) {}

  /**
   * GET /airtime/networks
   *
   * Returns all available network providers from Safe Haven's VAS catalogue.
   * Use the returned serviceCategoryId when calling POST /airtime/buy.
   *
   * @example response
   * {
   *   vasServiceId: "64a3b...",
   *   networks: [
   *     { serviceCategoryId: "64b1c...", name: "MTN", description: "MTN Airtime" },
   *     { serviceCategoryId: "64b1d...", name: "Airtel", description: "Airtel Airtime" },
   *     ...
   *   ]
   * }
   */
  @Get('networks')
  getNetworks() {
    return this.airtimeService.getNetworks();
  }

  /**
   * POST /airtime/buy
   *
   * Purchases airtime for any Nigerian phone number using the authenticated
   * user's wallet balance.
   *
   * @body serviceCategoryId  Network _id from GET /airtime/networks
   * @body network            Network name (e.g. "MTN") — for display/audit
   * @body phoneNumber        Recipient phone number (e.g. "+2348012345678")
   * @body amount             Amount in Naira (₦50 – ₦50,000)
   */
  @Post('buy')
  buyAirtime(
    @GetUser('id') userId: number,
    @Body() dto: BuyAirtimeDto,
  ) {
    return this.airtimeService.buyAirtime(userId, dto);
  }

  /**
   * GET /airtime/history?limit=20&offset=0
   *
   * Returns the authenticated user's airtime purchase history, newest first.
   */
  @Get('history')
  getHistory(
    @GetUser('id') userId: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
  ) {
    return this.airtimeService.getHistory(userId, limit, offset);
  }
}
