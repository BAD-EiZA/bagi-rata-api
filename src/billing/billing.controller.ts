import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { BillingService } from './billing.service';
import { CheckoutDto } from './dto/checkout.dto';

@ApiTags('billing')
@Controller()
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @ApiBearerAuth()
  @Get('billing/plans')
  listPlans() {
    return this.billing.listPlans();
  }

  @ApiBearerAuth()
  @Get('billing/entitlements')
  entitlements(
    @CurrentUser() auth: AuthUser,
    @Query('groupId') groupId?: string,
  ) {
    return this.billing.getEntitlements(auth.clerkUserId, groupId);
  }

  @ApiBearerAuth()
  @Get('billing/subscriptions')
  subscriptions(@CurrentUser() auth: AuthUser) {
    return this.billing.listSubscriptions(auth.clerkUserId);
  }

  @ApiBearerAuth()
  @Post('billing/checkout')
  checkout(@CurrentUser() auth: AuthUser, @Body() dto: CheckoutDto) {
    return this.billing.checkout(auth.clerkUserId, dto);
  }

  @ApiBearerAuth()
  @Get('billing/orders')
  orders(@CurrentUser() auth: AuthUser) {
    return this.billing.listOrders(auth.clerkUserId);
  }

  @ApiBearerAuth()
  @Get('billing/orders/:orderId')
  order(
    @CurrentUser() auth: AuthUser,
    @Param('orderId') orderId: string,
  ) {
    return this.billing.getOrder(auth.clerkUserId, orderId);
  }

  @ApiBearerAuth()
  @Post('billing/subscriptions/:subscriptionId/cancel')
  cancel(
    @CurrentUser() auth: AuthUser,
    @Param('subscriptionId') subscriptionId: string,
  ) {
    return this.billing.cancelSubscription(auth.clerkUserId, subscriptionId);
  }

  @ApiBearerAuth()
  @Get('groups/:groupId/billing')
  groupBilling(
    @CurrentUser() auth: AuthUser,
    @Param('groupId') groupId: string,
  ) {
    return this.billing.getEntitlements(auth.clerkUserId, groupId);
  }

  @ApiBearerAuth()
  @Post('groups/:groupId/billing/checkout')
  groupCheckout(
    @CurrentUser() auth: AuthUser,
    @Param('groupId') groupId: string,
    @Body() dto: CheckoutDto,
  ) {
    return this.billing.checkout(auth.clerkUserId, {
      ...dto,
      groupId,
    });
  }

  @Public()
  @Post('webhooks/midtrans/payment')
  async midtransPayment(@Req() req: Request) {
    const payload = (req.body ?? {}) as Record<string, unknown>;
    return this.billing.handleMidtransWebhook(payload);
  }

  @Public()
  @Post('webhooks/midtrans/recurring')
  async midtransRecurring(@Req() req: Request) {
    const payload = (req.body ?? {}) as Record<string, unknown>;
    return this.billing.handleMidtransWebhook(payload);
  }
}
