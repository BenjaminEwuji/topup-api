-- CreateEnum
CREATE TYPE "FundingStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED');

-- CreateTable
CREATE TABLE "WalletFunding" (
    "id" SERIAL NOT NULL,
    "reference" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" "FundingStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" TIMESTAMP(3),
    "userId" INTEGER NOT NULL,

    CONSTRAINT "WalletFunding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WalletFunding_reference_key" ON "WalletFunding"("reference");

-- CreateIndex
CREATE INDEX "WalletFunding_userId_createdAt_idx" ON "WalletFunding"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "WalletFunding" ADD CONSTRAINT "WalletFunding_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
