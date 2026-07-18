-- CreateEnum
CREATE TYPE "PlanScope" AS ENUM ('USER', 'GROUP');

-- CreateEnum
CREATE TYPE "BillingType" AS ENUM ('FREE', 'RECURRING', 'ONE_TIME');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('INCOMPLETE', 'PENDING_PAYMENT', 'ACTIVE', 'PAST_DUE', 'GRACE_PERIOD', 'CANCELED', 'EXPIRED', 'REFUNDED', 'REVOKED');

-- CreateEnum
CREATE TYPE "BillingOrderStatus" AS ENUM ('CREATED', 'PENDING', 'PAID', 'EXPIRED', 'FAILED', 'CANCELED', 'REFUNDED', 'REVIEW');

-- CreateEnum
CREATE TYPE "BillingOrderType" AS ENUM ('INITIAL', 'RENEWAL', 'PLAN_CHANGE', 'PASS_PURCHASE');

-- CreateEnum
CREATE TYPE "SubjectType" AS ENUM ('USER', 'GROUP');

-- CreateTable
CREATE TABLE "subscription_plans" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "scope_type" "PlanScope" NOT NULL,
    "billing_type" "BillingType" NOT NULL,
    "amount_minor" INTEGER NOT NULL,
    "currency_code" TEXT NOT NULL DEFAULT 'IDR',
    "duration_unit" TEXT,
    "duration_value" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "entitlement_config" JSONB NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscription_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "subject_type" "SubjectType" NOT NULL,
    "subject_user_id" TEXT,
    "subject_group_id" TEXT,
    "payer_user_id" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "auto_renew" BOOLEAN NOT NULL DEFAULT false,
    "midtrans_subscription_id" TEXT,
    "current_period_start" TIMESTAMP(3),
    "current_period_end" TIMESTAMP(3),
    "grace_ends_at" TIMESTAMP(3),
    "cancel_at_period_end" BOOLEAN NOT NULL DEFAULT false,
    "canceled_at" TIMESTAMP(3),
    "expired_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_entitlements" (
    "id" TEXT NOT NULL,
    "subscription_id" TEXT NOT NULL,
    "feature_key" TEXT NOT NULL,
    "value_type" TEXT NOT NULL,
    "boolean_value" BOOLEAN,
    "integer_value" INTEGER,
    "string_value" TEXT,
    "effective_from" TIMESTAMP(3) NOT NULL,
    "effective_until" TIMESTAMP(3),

    CONSTRAINT "subscription_entitlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_orders" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "subscription_id" TEXT,
    "plan_id" TEXT NOT NULL,
    "payer_user_id" TEXT NOT NULL,
    "subject_type" "SubjectType" NOT NULL,
    "subject_user_id" TEXT,
    "subject_group_id" TEXT,
    "order_type" "BillingOrderType" NOT NULL,
    "amount_minor" INTEGER NOT NULL,
    "currency_code" TEXT NOT NULL DEFAULT 'IDR',
    "status" "BillingOrderStatus" NOT NULL DEFAULT 'CREATED',
    "snap_token" TEXT,
    "snap_redirect_url" TEXT,
    "expires_at" TIMESTAMP(3),
    "paid_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "billing_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_transactions" (
    "id" TEXT NOT NULL,
    "billing_order_id" TEXT NOT NULL,
    "midtrans_transaction_id" TEXT,
    "midtrans_subscription_id" TEXT,
    "transaction_status" TEXT NOT NULL,
    "fraud_status" TEXT,
    "status_code" TEXT,
    "payment_type" TEXT,
    "gross_amount_minor" INTEGER NOT NULL,
    "currency_code" TEXT NOT NULL DEFAULT 'IDR',
    "transaction_time" TIMESTAMP(3),
    "settlement_time" TIMESTAMP(3),
    "raw_reference" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "billing_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_webhook_events" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'MIDTRANS',
    "event_type" TEXT NOT NULL,
    "event_hash" TEXT NOT NULL,
    "order_id" TEXT,
    "midtrans_transaction_id" TEXT,
    "signature_valid" BOOLEAN NOT NULL,
    "processing_status" TEXT NOT NULL DEFAULT 'RECEIVED',
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),
    "payload" JSONB,

    CONSTRAINT "billing_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_counters" (
    "id" TEXT NOT NULL,
    "subject_type" "SubjectType" NOT NULL,
    "subject_id" TEXT NOT NULL,
    "metric_key" TEXT NOT NULL,
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "used_count" INTEGER NOT NULL DEFAULT 0,
    "reserved_count" INTEGER NOT NULL DEFAULT 0,
    "limit_snapshot" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usage_counters_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "subscription_plans_code_key" ON "subscription_plans"("code");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_midtrans_subscription_id_key" ON "subscriptions"("midtrans_subscription_id");

-- CreateIndex
CREATE INDEX "subscriptions_subject_type_subject_user_id_status_idx" ON "subscriptions"("subject_type", "subject_user_id", "status");

-- CreateIndex
CREATE INDEX "subscriptions_subject_type_subject_group_id_status_idx" ON "subscriptions"("subject_type", "subject_group_id", "status");

-- CreateIndex
CREATE INDEX "subscription_entitlements_subscription_id_feature_key_idx" ON "subscription_entitlements"("subscription_id", "feature_key");

-- CreateIndex
CREATE UNIQUE INDEX "billing_orders_order_id_key" ON "billing_orders"("order_id");

-- CreateIndex
CREATE INDEX "billing_orders_payer_user_id_status_idx" ON "billing_orders"("payer_user_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "billing_transactions_midtrans_transaction_id_key" ON "billing_transactions"("midtrans_transaction_id");

-- CreateIndex
CREATE INDEX "billing_transactions_billing_order_id_idx" ON "billing_transactions"("billing_order_id");

-- CreateIndex
CREATE UNIQUE INDEX "billing_webhook_events_event_hash_key" ON "billing_webhook_events"("event_hash");

-- CreateIndex
CREATE INDEX "billing_webhook_events_order_id_idx" ON "billing_webhook_events"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "usage_counters_subject_type_subject_id_metric_key_period_st_key" ON "usage_counters"("subject_type", "subject_id", "metric_key", "period_start");

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "subscription_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_payer_user_id_fkey" FOREIGN KEY ("payer_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_subject_user_id_fkey" FOREIGN KEY ("subject_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_subject_group_id_fkey" FOREIGN KEY ("subject_group_id") REFERENCES "groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_entitlements" ADD CONSTRAINT "subscription_entitlements_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_orders" ADD CONSTRAINT "billing_orders_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "subscription_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_orders" ADD CONSTRAINT "billing_orders_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_orders" ADD CONSTRAINT "billing_orders_payer_user_id_fkey" FOREIGN KEY ("payer_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_orders" ADD CONSTRAINT "billing_orders_subject_group_id_fkey" FOREIGN KEY ("subject_group_id") REFERENCES "groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_transactions" ADD CONSTRAINT "billing_transactions_billing_order_id_fkey" FOREIGN KEY ("billing_order_id") REFERENCES "billing_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
