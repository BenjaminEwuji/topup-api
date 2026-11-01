import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { WalletService } from './wallet.service.js';
import { GetUser } from '../auth/decorator/get.user.decorator.js';

@UseGuards(AuthGuard('jwt'))
@Controller('wallet')
export class WalletController {
  constructor(private walletService: WalletService) {}

  @Get()
  getWallet(@GetUser('id') userId: number) {
    return this.walletService.getWallet(userId);
  }
}
