-- AlterTable users: notification prefs
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "notify_mentions" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "notify_settlements" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "notify_reminders" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "notify_email" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable settlements: expires_at
ALTER TABLE "settlements" ADD COLUMN IF NOT EXISTS "expires_at" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "settlements_status_expires_at_idx" ON "settlements"("status", "expires_at");

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "RecurringFrequency" AS ENUM ('WEEKLY', 'MONTHLY');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- CreateTable group_categories
CREATE TABLE IF NOT EXISTS "group_categories" (
    "id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "group_categories_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "group_categories_group_id_name_key" ON "group_categories"("group_id", "name");

DO $$ BEGIN
  ALTER TABLE "group_categories" ADD CONSTRAINT "group_categories_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- CreateTable expense_templates
CREATE TABLE IF NOT EXISTS "expense_templates" (
    "id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount_minor" INTEGER NOT NULL,
    "split_method" "SplitMethod" NOT NULL DEFAULT 'EQUAL',
    "category" TEXT,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "expense_templates_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "expense_templates_group_id_idx" ON "expense_templates"("group_id");

DO $$ BEGIN
  ALTER TABLE "expense_templates" ADD CONSTRAINT "expense_templates_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "expense_templates" ADD CONSTRAINT "expense_templates_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- CreateTable recurring_expenses
CREATE TABLE IF NOT EXISTS "recurring_expenses" (
    "id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount_minor" INTEGER NOT NULL,
    "split_method" "SplitMethod" NOT NULL DEFAULT 'EQUAL',
    "category" TEXT,
    "frequency" "RecurringFrequency" NOT NULL DEFAULT 'MONTHLY',
    "next_run_at" TIMESTAMP(3) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "payload" JSONB NOT NULL,
    "last_expense_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "recurring_expenses_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "recurring_expenses_active_next_run_at_idx" ON "recurring_expenses"("active", "next_run_at");
CREATE INDEX IF NOT EXISTS "recurring_expenses_group_id_idx" ON "recurring_expenses"("group_id");

DO $$ BEGIN
  ALTER TABLE "recurring_expenses" ADD CONSTRAINT "recurring_expenses_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "recurring_expenses" ADD CONSTRAINT "recurring_expenses_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- CreateTable promo_codes
CREATE TABLE IF NOT EXISTS "promo_codes" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "plan_code" TEXT NOT NULL,
    "percent_off" INTEGER NOT NULL DEFAULT 100,
    "trial_days" INTEGER NOT NULL DEFAULT 0,
    "max_redemptions" INTEGER,
    "redemption_count" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "promo_codes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "promo_codes_code_key" ON "promo_codes"("code");

-- CreateTable promo_redemptions
CREATE TABLE IF NOT EXISTS "promo_redemptions" (
    "id" TEXT NOT NULL,
    "promo_code_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "promo_redemptions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "promo_redemptions_promo_code_id_user_id_key" ON "promo_redemptions"("promo_code_id", "user_id");

DO $$ BEGIN
  ALTER TABLE "promo_redemptions" ADD CONSTRAINT "promo_redemptions_promo_code_id_fkey" FOREIGN KEY ("promo_code_id") REFERENCES "promo_codes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "promo_redemptions" ADD CONSTRAINT "promo_redemptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
