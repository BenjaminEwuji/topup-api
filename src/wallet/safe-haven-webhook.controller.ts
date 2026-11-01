import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

interface SafeHavenCreditPayload {
  eventType: string;
  type?: string;
  data: {
    _id: string;
    sessionId: string;
    paymentReference: string;
    creditAccountNumber: string;
    debitAccountName: string;
    debitAccountNumber: string;
    narration: string;
    amount: number; // Naira
    fees: number;
    status: string;
    responseCode: string;
    createdAt: string;
  };
}

@Controller('wallet')
export class SafeHavenWebhookController {
  private readonly logger = new Logger(SafeHavenWebhookController.name);

  constructor(private prisma: PrismaService) {}

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async handleSafeHavenWebhook(@Body() payload: any) {
    const eventType = payload.eventType || payload.type;
    this.logger.log(`Received Safe Haven Webhook Event: ${eventType}`);

    switch (eventType) {
      case 'account.credit':
        await this.handleAccountCredit(payload as SafeHavenCreditPayload);
        break;

      case 'account.debit':
        await this.handleAccountDebit(payload.data);
        break;

      default:
        this.logger.warn(`Unhandled event type: ${eventType}`);
    }

    return { status: 'success' };
  }

  // ─── Credit ──────────────────────────────────────────────────────────────────

  /**
   * Called when a bank transfer lands on a user's virtual account.
   *
   * Flow:
   *  1. Verify responseCode === "00" and status === "Completed"
   *  2. Find the wallet whose virtualAccountNumber matches creditAccountNumber
   *  3. Deduplicate using sessionId (safe to replay — idempotent)
   *  4. Credit the wallet balance and record the WalletFunding row in a transaction
   */
  private async handleAccountCredit(payload: SafeHavenCreditPayload) {
    const { data } = payload;

    // 1. Only process successful, completed transfers
    if (data.responseCode !== '00' || data.status !== 'Completed') {
      this.logger.warn(
        `Skipping non-completed credit: responseCode=${data.responseCode} status=${data.status}`,
      );
      return;
    }

    // 2. Find the wallet by virtual account number
    const wallet = await this.prisma.wallet.findFirst({
      where: { virtualAccountNumber: data.creditAccountNumber },
    });

    if (!wallet) {
      this.logger.warn(
        `No wallet found for virtualAccountNumber=${data.creditAccountNumber}`,
      );
      return;
    }

    // 3. Deduplicate — if we've already processed this sessionId, skip
    const existing = await this.prisma.walletFunding.findUnique({
      where: { sessionId: data.sessionId },
    });

    if (existing) {
      this.logger.warn(
        `Duplicate webhook ignored — sessionId=${data.sessionId} already processed`,
      );
      return;
    }

    // 4. Convert Naira → kobo (Safe Haven sends amounts in Naira)
    const amountInKobo = Math.round(data.amount * 100);
    const reference = data.paymentReference ?? data.sessionId;

    this.logger.log(
      `Crediting wallet ${wallet.id} with ${amountInKobo} kobo (₦${data.amount}) — sessionId=${data.sessionId}`,
    );

    // 5. Atomic transaction: record the funding + update wallet balance
    await this.prisma.$transaction([
      this.prisma.walletFunding.create({
        data: {
          reference,
          sessionId: data.sessionId,
          amount: amountInKobo,
          status: 'SUCCESS',
          paidAt: new Date(data.createdAt),
          userId: wallet.userId,
        },
      }),
      this.prisma.wallet.update({
        where: { id: wallet.id },
        data: { balance: { increment: amountInKobo } },
      }),
    ]);

    this.logger.log(
      `✅ Wallet ${wallet.id} (userId=${wallet.userId}) credited ₦${data.amount} successfully`,
    );
  }

  // ─── Debit ───────────────────────────────────────────────────────────────────

  private async handleAccountDebit(data: any) {
    this.logger.log(
      `Processing debit of ₦${data.amount} from account ${data.debitAccountNumber}`,
    );
    // Debit handling (e.g. withdrawals) can be implemented here when needed
  }
}