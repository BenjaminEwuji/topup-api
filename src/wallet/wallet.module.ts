import { Module } from '@nestjs/common';
import { WalletService } from './wallet.service.js';
import { WalletController } from './wallet.controller.js';
import { FundingService } from './funding.service.js';
import { FundingController } from './funding.controller.js';
import { AirtimeService } from './airtime.service.js';
import { AirtimeController } from './airtime.controller.js';
import { DataService } from './data.service.js';
import { DataController } from './data.controller.js';
import { SafeHavenService } from './safe-haven.service.js';
import { SafeHavenWebhookController } from './safe-haven-webhook.controller.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { HttpModule } from '@nestjs/axios';

@Module({
  imports: [PrismaModule, HttpModule],
  providers: [
    WalletService,
    FundingService,
    AirtimeService,
    DataService,
    SafeHavenService,
  ],
  controllers: [
    WalletController,
    FundingController,
    AirtimeController,
    DataController,
    SafeHavenWebhookController,
  ],
  exports: [WalletService, FundingService, AirtimeService, DataService],
})
export class WalletModule {}

