import { Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { GetUser } from '../auth/decorator/get.user.decorator.js';
import * as client from '../generated/prisma/client.js';
import { WalletService } from '../wallet/wallet.service.js';

@UseGuards(AuthGuard('jwt'))
@Controller('users')
export class UsersController {
    constructor(private walletService: WalletService) {}

    @Get('me')
    getMe(@GetUser() user: client.User) {
        console.log({ user });
        return user;
    }

    @Get('me/wallet')
    getMyWallet(@GetUser() user: client.User) {
        return this.walletService.getWallet(user.id);
    }

    @Patch()
    editUser() {}
}