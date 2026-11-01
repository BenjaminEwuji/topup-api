import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { DataService } from './data.service.js';
import { BuyDataDto } from './dto/buy-data.dto.js';
import { GetUser } from '../auth/decorator/get.user.decorator.js';

@UseGuards(AuthGuard('jwt'))
@Controller('data')
export class DataController {
  constructor(private dataService: DataService) {}

  /**
   * GET /data/networks
   *
   * Returns all available data network providers (MTN, Airtel, Glo, 9mobile)
   * from Safe Haven's VAS catalogue.
   */
  @Get('networks')
  getNetworks() {
    return this.dataService.getNetworks();
  }

  /**
   * GET /data/plans/:serviceCategoryId
   *
   * Returns all available data plans and bundle codes for a network provider.
   *
   * @param serviceCategoryId Network category _id from GET /data/networks
   */
  @Get('plans/:serviceCategoryId')
  getDataPlans(@Param('serviceCategoryId') serviceCategoryId: string) {
    return this.dataService.getDataPlans(serviceCategoryId);
  }

  /**
   * POST /data/buy
   *
   * Purchases a data bundle for any Nigerian phone number using the authenticated
   * user's wallet balance.
   *
   * @body serviceCategoryId  Network category _id (from GET /data/networks)
   * @body bundleCode         Data plan code (from GET /data/plans/:serviceCategoryId)
   * @body network            Network name (e.g. "MTN")
   * @body phoneNumber        Recipient phone number (e.g. "08012345678")
   * @body amount             Amount in Naira for the selected plan
   */
  @Post('buy')
  buyData(
    @GetUser('id') userId: number,
    @Body() dto: BuyDataDto,
  ) {
    return this.dataService.buyData(userId, dto);
  }

  /**
   * GET /data/history?limit=20&offset=0
   *
   * Returns the authenticated user's data purchase history, newest first.
   */
  @Get('history')
  getHistory(
    @GetUser('id') userId: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
  ) {
    return this.dataService.getHistory(userId, limit, offset);
  }
}
