-- AlterTable
ALTER TABLE "Task" ADD COLUMN "firedAt" DATETIME;
ALTER TABLE "Task" ADD COLUMN "hookTokenHash" TEXT;
ALTER TABLE "Task" ADD COLUMN "triggerRefire" TEXT;
