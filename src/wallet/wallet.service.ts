import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class WalletService {
    constructor(private prisma: PrismaService) {}

    async createWallet(user: { id: number }) {
        //check if wallet already exists
        const existingWallet = await this.prisma.wallet.findUnique({
            where: { userId: user.id },
        });
        //if wallet exists, return it
        if (existingWallet) {
            return existingWallet;
        }

        return this.prisma.wallet.create({
            data: {
                userId: user.id,
                balance: 0,
                currency: 'NGN',
            },
        });
    }

    async getWallet(userId: any) {
        const targetUserId = typeof userId === 'object' && userId !== null ? Number(userId.id) : Number(userId);
        let wallet = await this.prisma.wallet.findUnique({
            where: { userId: targetUserId },
        });
        if (!wallet) {
            wallet = await this.createWallet({ id: targetUserId });
        }
        return {
            ...wallet,
            balanceNaira: wallet.balance / 100,
        };
    }
}
