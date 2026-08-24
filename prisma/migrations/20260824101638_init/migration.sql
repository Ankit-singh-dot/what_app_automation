/*
  Warnings:

  - You are about to drop the column `error` on the `Message` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "Contact_campaignId_idx";

-- DropIndex
DROP INDEX "Message_campaignId_idx";

-- DropIndex
DROP INDEX "Message_status_idx";

-- AlterTable
ALTER TABLE "Message" DROP COLUMN "error",
ADD COLUMN     "deliveredAt" TIMESTAMP(3),
ADD COLUMN     "readAt" TIMESTAMP(3);
