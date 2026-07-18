-- CreateEnum
CREATE TYPE "BudgetPeriod" AS ENUM ('MONTHLY', 'WEEKLY', 'CUSTOM');

-- CreateTable
CREATE TABLE "group_budgets" (
    "id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "period" "BudgetPeriod" NOT NULL DEFAULT 'MONTHLY',
    "amount_minor" INTEGER NOT NULL,
    "currency_code" TEXT NOT NULL DEFAULT 'IDR',
    "category" TEXT,
    "period_start" DATE NOT NULL,
    "period_end" DATE,
    "alert_threshold" INTEGER NOT NULL DEFAULT 80,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "group_budgets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "group_budgets_group_id_period_start_idx" ON "group_budgets"("group_id", "period_start");

-- AddForeignKey
ALTER TABLE "group_budgets" ADD CONSTRAINT "group_budgets_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
