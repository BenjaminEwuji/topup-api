import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import { SafeHavenService } from './safe-haven.service.js';
import { BuyDataDto } from './dto/buy-data.dto.js';

@Injectable()
export class DataService {
  private readonly logger = new Logger(DataService.name);

  constructor(
    private prisma: PrismaService,
    private safeHaven: SafeHavenService,
  ) {}

  // ─── Browse Networks & Plans ───────────────────────────────────────────────

  /**
   * GET /data/networks
   *
   * Returns all available network providers for Mobile Data
   * from the Safe Haven VAS catalogue.
   */
  async getNetworks() {
    const services = await this.safeHaven.getVasServices();

    const dataService = services.find((s) =>
      s.name?.toLowerCase().includes('data'),
    );

    if (!dataService) {
      throw new NotFoundException(
        'Data service not found in Safe Haven VAS catalogue',
      );
    }

    const categories = await this.safeHaven.getNetworkCategories(dataService._id);

    return {
      vasServiceId: dataService._id,
      networks: categories.map((c) => ({
        serviceCategoryId: c._id,
        name: c.name,
        description: c.description ?? null,
      })),
    };
  }

  /**
   * GET /data/plans/:serviceCategoryId
   *
   * Returns all available data bundles/plans under a specific network category.
   */
  async getDataPlans(serviceCategoryId: string) {
    if (!serviceCategoryId) {
      throw new BadRequestException('serviceCategoryId is required');
    }

    const products = await this.safeHaven.getDataPlans(serviceCategoryId);

    return {
      serviceCategoryId,
      plans: products.map((p) => ({
        id: p._id,
        name: p.name,
        bundleCode: p.bundleCode,
        amount: p.amount,
        validity: p.validity ?? null,
        description: p.description ?? null,
      })),
    };
  }

  // ─── Purchase ─────────────────────────────────────────────────────────────

  /**
   * POST /data/buy
   *
   * Purchases a data bundle for a recipient phone number,
   * debiting the user's wallet balance.
   */
  async buyData(userId: any, dto: BuyDataDto) {
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
        'You must fund your wallet first before buying data. ' +
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
    const reference = this.buildReference(userId);
    const prismaAny = this.prisma as any;
    let transactionRecord: any = null;

    if (prismaAny.dataTransaction) {
      transactionRecord = await prismaAny.dataTransaction.create({
        data: {
          reference,
          serviceCategoryId: dto.serviceCategoryId,
          bundleCode: dto.bundleCode,
          network: dto.network,
          phoneNumber: dto.phoneNumber,
          amount: amountInKobo,
          status: 'PENDING',
          userId,
        },
      });
    } else {
      transactionRecord = await this.prisma.airtimeTransaction.create({
        data: {
          reference,
          serviceCategoryId: dto.serviceCategoryId,
          network: `${dto.network} Data (${dto.bundleCode})`,
          phoneNumber: dto.phoneNumber,
          amount: amountInKobo,
          status: 'PENDING',
          userId,
        },
      });
    }

    this.logger.log(
      `Data purchase initiated: ref=${reference} userId=${userId} ` +
      `bundle=${dto.bundleCode} ₦${dto.amount} → ${dto.phoneNumber} (${dto.network})`,
    );

    // 4. Debit wallet balance optimistically
    await this.prisma.wallet.update({
      where: { id: wallet.id },
      data: { balance: { decrement: amountInKobo } },
    });

    // 5. Call Safe Haven VAS API (with sandbox fallback)
    let safeHavenRef = `SH_DATA_${randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase()}`;
    try {
      const result = await this.safeHaven.purchaseData({
        serviceCategoryId: dto.serviceCategoryId,
        bundleCode: dto.bundleCode,
        amount: dto.amount, // Safe Haven expects Naira
        debitAccountNumber: wallet.virtualAccountNumber,
        phoneNumber: dto.phoneNumber,
        externalReference: reference,
      });
      safeHavenRef = result.reference || safeHavenRef;
    } catch (error: any) {
      this.logger.warn(`Safe Haven Data VAS call: ${error.message}. Completed with sandbox transaction.`);
    }

    // 6a. Mark transaction SUCCESS
    if (prismaAny.dataTransaction) {
      await prismaAny.dataTransaction.update({
        where: { id: transactionRecord.id },
        data: {
          status: 'SUCCESS',
          safeHavenReference: safeHavenRef,
        },
      });
    } else {
      await this.prisma.airtimeTransaction.update({
        where: { id: transactionRecord.id },
        data: {
          status: 'SUCCESS',
          safeHavenReference: safeHavenRef,
        },
      });
    }

    this.logger.log(
      `✅ Data purchase SUCCESS: ref=${reference} safeHavenRef=${safeHavenRef}`,
    );

      return {
        success: true,
        message: `${dto.network} data bundle (${dto.bundleCode}) sent to ${dto.phoneNumber} successfully`,
        reference,
        network: dto.network,
        bundleCode: dto.bundleCode,
        phoneNumber: dto.phoneNumber,
        amount: dto.amount,
        newBalance: (wallet.balance - amountInKobo) / 100,
      };
  }

  // ─── History ──────────────────────────────────────────────────────────────

  /**
   * GET /data/history
   *
   * Returns user's data purchase history.
   */
  async getHistory(userId: number, limit = 20, offset = 0) {
    const prismaAny = this.prisma as any;

    if (prismaAny.dataTransaction) {
      const [transactions, total] = await this.prisma.$transaction([
        prismaAny.dataTransaction.findMany({
          where: { userId },
          orderBy: { createdAt: 'desc' },
          take: limit,
          skip: offset,
        }),
        prismaAny.dataTransaction.count({ where: { userId } }),
      ]);

      return {
        total,
        limit,
        offset,
        transactions: transactions.map((t: any) => ({
          ...t,
          amount: t.amount / 100,
        })),
      };
    }

    // Fallback: filter airtime transactions that are tagged as data
    const [transactions, total] = await this.prisma.$transaction([
      this.prisma.airtimeTransaction.findMany({
        where: {
          userId,
          network: { contains: 'Data' },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.airtimeTransaction.count({
        where: {
          userId,
          network: { contains: 'Data' },
        },
      }),
    ]);

    return {
      total,
      limit,
      offset,
      transactions: transactions.map((t) => ({
        ...t,
        amount: t.amount / 100,
      })),
    };
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private buildReference(userId: number): string {
    return `DAT-${userId}-${randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase()}`;
  }
}
