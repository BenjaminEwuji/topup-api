import { Injectable } from '@nestjs/common';
import { PrismaClient } from '../generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class PrismaService extends PrismaClient {
  constructor(config:ConfigService) {
    const connectionString =
      process.env.DATABASE_URL ||
      'postgresql://postgres:12345@localhost:5433/topupng_db';
    const adapter = new PrismaPg({ connectionString });
    super({ adapter });
  }
}

