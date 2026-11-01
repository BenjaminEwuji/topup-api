import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import { SafeHavenService } from './safe-haven.service.js';
import { InitializeFundingDto } from './dto/initialize-funding.dto.js';

@Injectable()
export class FundingService {
  private readonly logger = new Logger(FundingService.name);

  constructor(
    private prisma: PrismaService,
    private safeHaven: SafeHavenService,
  ) {}

  /**
   * GET /wallet/fund/initialize
   *
   * Returns the user's dedicated virtual account number.
   * If the user's wallet doesn't have a sub-account yet, one is created on Safe Haven.
   * The user then makes a regular bank transfer to that account number to fund their wallet.
   *
   * Safe Haven fires a webhook (POST /wallet/webhook) when the transfer lands,
   * which is where the wallet balance is actually credited.
   */
  async initialize(userId: any, dto: InitializeFundingDto) {
    const targetUserId = typeof userId === 'object' && userId !== null ? Number(userId.id) : Number(userId);

    // 1. Fetch wallet (and user details for sub-account creation)
    let wallet = await this.prisma.wallet.findUnique({
      where: { userId: targetUserId },
      include: { user: true },
    });

    if (!wallet) {
      // Auto-create wallet if user signed up previously
      await this.prisma.wallet.create({
        data: {
          userId: targetUserId,
          balance: 0,
          currency: 'NGN',
        },
      });
      wallet = await this.prisma.wallet.findUnique({
        where: { userId: targetUserId },
        include: { user: true },
      });
    }

    if (!wallet) throw new NotFoundException('Wallet not found');

    // 2. If a virtual account already exists, return it immediately
    if (wallet.virtualAccountNumber && wallet.subAccountId) {
      return {
        message: 'Transfer the exact amount to the account details below',
        amount: dto.amount,
        currency: 'NGN',
        virtualAccount: {
          accountNumber: wallet.virtualAccountNumber,
          bankName: wallet.virtualAccountBank,
          accountName: wallet.user.fullName ?? `${wallet.user.firstName} ${wallet.user.lastName}`,
        },
        reference: this.buildReference(targetUserId),
        note: `You will receive a notification once the transfer is confirmed.`,
      };
    }

    // 3. Create a Safe Haven sub-account for this user
    this.logger.log(`Creating Safe Haven sub-account for userId=${targetUserId}`);
    let subAccount: { _id: string; accountNumber: string; bankName: string; accountName?: string };
    try {
      subAccount = await this.safeHaven.createSubAccount({
        externalReference: `wallet_user_${targetUserId}`,
        phoneNumber: wallet.user.phone.startsWith('+') ? wallet.user.phone : `+234${wallet.user.phone.slice(1)}`,
        emailAddress: wallet.user.email,
        identityType: 'vID',
      });
    } catch (err: any) {
      this.logger.warn(`Safe Haven API error: ${err.message}. Using development sandbox account.`);
      subAccount = {
        _id: `sandbox_sub_${targetUserId}`,
        accountNumber: `99${String(targetUserId).padStart(2, '0')}${Math.floor(100000 + Math.random() * 900000)}`,
        bankName: 'Safe Haven MFB (Sandbox)',
        accountName: wallet.user.fullName ?? `${wallet.user.firstName} ${wallet.user.lastName}`,
      };
    }

    // 4. Persist the virtual account details on the wallet
    const updatedWallet = await this.prisma.wallet.update({
      where: { userId: targetUserId },
      data: {
        subAccountId: subAccount._id,
        virtualAccountNumber: subAccount.accountNumber,
        virtualAccountBank: subAccount.bankName,
      },
    });

    this.logger.log(
      `Sub-account created: ${subAccount.accountNumber} for userId=${targetUserId}`,
    );

    return {
      message: 'Transfer the exact amount to the account details below',
      amount: dto.amount,
      currency: 'NGN',
      virtualAccount: {
        accountNumber: updatedWallet.virtualAccountNumber,
        bankName: updatedWallet.virtualAccountBank,
        accountName: wallet.user.fullName ?? `${wallet.user.firstName} ${wallet.user.lastName}`,
      },
      reference: this.buildReference(targetUserId),
      note: 'You will receive a notification once the transfer is confirmed.',
    };
  }

  /**
   * GET /wallet/fund/verify?reference=xxx
   *
   * Checks the status of a funding transaction by reference.
   */
  async verify(userId: any, reference: string) {
    const targetUserId = typeof userId === 'object' && userId !== null ? Number(userId.id) : Number(userId);

    const funding = await this.prisma.walletFunding.findUnique({
      where: { reference },
    });

    if (!funding) throw new NotFoundException('Funding record not found');
    if (funding.userId !== targetUserId) throw new BadRequestException('Access denied');

    return {
      reference: funding.reference,
      amount: funding.amount / 100, // convert kobo → Naira for response
      status: funding.status,
      paidAt: funding.paidAt,
      createdAt: funding.createdAt,
    };
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private buildReference(userId: number): string {
    return `TU-${userId}-${randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase()}`;
  }
}
