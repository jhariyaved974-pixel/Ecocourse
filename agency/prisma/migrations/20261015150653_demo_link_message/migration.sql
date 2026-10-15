/*
  Warnings:

  - You are about to drop the column `deliveredAt` on the `DemoProject` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "DemoProject" DROP COLUMN "deliveredAt",
ADD COLUMN     "linkMessageId" TEXT,
ADD COLUMN     "linkQueuedAt" TIMESTAMP(3);
