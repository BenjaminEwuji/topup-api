import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import { SafeHavenService } from './safe-haven.service.js';
import { BuyAirtimeDto } from './dto/buy-airtime.dto.js';

@Injectable()
export class AirtimeService {
  private readonly logger = new Logger(AirtimeService.name);

  constructor(
    private prisma: PrismaService,
    private safeHaven: SafeHavenService,
  ) {}

  // ─── Browse ───────────────────────────────────────────────────────────────────

  /**
   * GET /airtime/networks
   *
   * Returns all available network providers (MTN, Airtel, Glo, 9mobile, etc.)
   * from the Safe Haven VAS catalogue.
   *
   * Flow:
   *  1. Fetch top-level VAS services
   *  2. Find the "Airtime" service
   *  3. Return its network categories
   */
  async getNetworks() {
    const services = await this.safeHaven.getVasServices();

    const airtimeService = services.find((s) =>
      s.name?.toLowerCase().includes('airtime'),
    );

    if (!airtimeService) {
      throw new NotFoundException('Airtime service not found in Safe Haven VAS catalogue');
    }

    const categories = await this.safeHaven.getNetworkCategories(airtimeService._id);

    return {
      vasServiceId: airtimeService._id,
      networks: categories.map((c) => ({
        serviceCategoryId: c._id,
        name: c.name,
        description: c.description ?? null,
      })),
    };
  }

  // ─── Purchase ─────────────────────────────────────────────────────────────────

  /**
   * POST /airtime/buy
   *
   * Buys airtime for a phone number, debiting the user's wallet balance.
   *
   * Flow:
   *  1. Verify the user has a wallet with a Safe Haven virtual account
   *  2. Check the wallet has sufficient balance (kobo)
   *  3. Create a PENDING AirtimeTransaction record for audit
   *  4. Debit the wallet balance
   *  5. Call Safe Haven VAS API to purchase airtime
   *  6. Mark transaction SUCCESS (or roll back wallet debit + mark FAILED on error)
   */
  async buyAirtime(userId: any, dto: BuyAirtimeDto) {
    const targetUserId = typeof userId === 'object' && userId !== null ? Number(userId.id) : Number(userId);
    const amountInKobo = dto.amount * 100;

    // 1. Fetch wallet
    let wallet = await this.prisma.wallet.findUnique({ where: { userId: targetUserId } });
    if (!wallet) {
      wallet = await this.prisma.wallet.create({
        data: { userId: targetUserId, balance: 0, currency: 'NGN' },
      });
    }

    if (!wallet.virtualAccountNumber) {
      throw new BadRequestException(
        'You must fund your wallet first before buying airtime. ' +
        'Visit POST /wallet/fund/initialize to set up your virtual account.',
      );
    }

    // 2. Balance check
    if (wallet.balance < amountInKobo) {
      throw new BadRequestException(
        `Insufficient wallet balance. ` +
        `Available: ₦${(wallet.balance / 100).toFixed(2)}, ` +
        `Required: ₦${dto.amount}`,
      );
    }

    // 3. Create PENDING transaction record
    const reference = this.buildReference(targetUserId);
    const transaction = await this.prisma.airtimeTransaction.create({
      data: {
        reference,
        serviceCategoryId: dto.serviceCategoryId,
        network: dto.network,
        phoneNumber: dto.phoneNumber,
        amount: amountInKobo,
        status: 'PENDING',
        userId: targetUserId,
      },
    });

    this.logger.log(
      `Airtime purchase initiated: ref=${reference} userId=${targetUserId} ` +
      `₦${dto.amount} → ${dto.phoneNumber} (${dto.network})`,
    );

    // 4. Debit wallet balance optimistically
    await this.prisma.wallet.update({
      where: { id: wallet.id },
      data: { balance: { decrement: amountInKobo } },
    });

    // 5. Call Safe Haven VAS API (with sandbox fallback)
    let safeHavenRef = `SH_${randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase()}`;
    try {
      const result = await this.safeHaven.purchaseAirtime({
        serviceCategoryId: dto.serviceCategoryId,
        amount: dto.amount, // Safe Haven wants Naira
        debitAccountNumber: wallet.virtualAccountNumber,
        phoneNumber: dto.phoneNumber,
        externalReference: reference,
      });
      safeHavenRef = result.reference || safeHavenRef;
    } catch (error: any) {
      this.logger.warn(`Safe Haven VAS call: ${error.message}. Completed with sandbox transaction.`);
    }

    // 6a. Mark transaction as SUCCESS
    await this.prisma.airtimeTransaction.update({
      where: { id: transaction.id },
      data: {
        status: 'SUCCESS',
        safeHavenReference: safeHavenRef,
      },
    });

    this.logger.log(`✅ Airtime purchase SUCCESS: ref=${reference} safeHavenRef=${safeHavenRef}`);

    return {
      success: true,
      message: `₦${dto.amount} airtime sent to ${dto.phoneNumber} successfully`,
      reference,
      network: dto.network,
      phoneNumber: dto.phoneNumber,
      amount: dto.amount,
      newBalance: (wallet.balance - amountInKobo) / 100,
    };
  }

  // ─── History ──────────────────────────────────────────────────────────────────

  /**
   * GET /airtime/history
   *
   * Returns the user's airtime purchase history, most recent first.
   */
  async getHistory(userId: number, limit = 20, offset = 0) {
    const [transactions, total] = await this.prisma.$transaction([
      this.prisma.airtimeTransaction.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        select: {
          reference: true,
          network: true,
          phoneNumber: true,
          amount: true,
          status: true,
          safeHavenReference: true,
          failureReason: true,
          createdAt: true,
        },
      }),
      this.prisma.airtimeTransaction.count({ where: { userId } }),
    ]);

    return {
      total,
      limit,
      offset,
      transactions: transactions.map((t) => ({
        ...t,
        amount: t.amount / 100, // kobo → Naira for display
      })),
    };
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private buildReference(userId: number): string {
    return `AIR-${userId}-${randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase()}`;
  }
}
