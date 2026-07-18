import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateSettlementDto } from './dto/create-settlement.dto';
import { DisputeSettlementDto } from './dto/dispute-settlement.dto';
import { SettlementsService } from './settlements.service';

@ApiTags('settlements')
@ApiBearerAuth()
@Controller()
export class SettlementsController {
  constructor(private readonly settlements: SettlementsService) {}

  @Get('groups/:groupId/settlements')
  list(@CurrentUser() auth: AuthUser, @Param('groupId') groupId: string) {
    return this.settlements.list(auth.clerkUserId, groupId);
  }

  @Post('groups/:groupId/settlements')
  create(
    @CurrentUser() auth: AuthUser,
    @Param('groupId') groupId: string,
    @Body() dto: CreateSettlementDto,
  ) {
    return this.settlements.create(auth.clerkUserId, groupId, dto);
  }

  @Get('groups/:groupId/settlements/:settlementId')
  get(
    @CurrentUser() auth: AuthUser,
    @Param('groupId') groupId: string,
    @Param('settlementId') settlementId: string,
  ) {
    return this.settlements.get(auth.clerkUserId, groupId, settlementId);
  }

  @Post('groups/:groupId/settlements/:settlementId/confirm')
  confirm(
    @CurrentUser() auth: AuthUser,
    @Param('groupId') groupId: string,
    @Param('settlementId') settlementId: string,
  ) {
    return this.settlements.confirm(auth.clerkUserId, groupId, settlementId);
  }

  @Post('groups/:groupId/settlements/:settlementId/dispute')
  dispute(
    @CurrentUser() auth: AuthUser,
    @Param('groupId') groupId: string,
    @Param('settlementId') settlementId: string,
    @Body() dto: DisputeSettlementDto,
  ) {
    return this.settlements.dispute(
      auth.clerkUserId,
      groupId,
      settlementId,
      dto.reason,
    );
  }

  @Post('groups/:groupId/settlements/:settlementId/cancel')
  cancel(
    @CurrentUser() auth: AuthUser,
    @Param('groupId') groupId: string,
    @Param('settlementId') settlementId: string,
  ) {
    return this.settlements.cancel(auth.clerkUserId, groupId, settlementId);
  }

  @Get('groups/:groupId/settlement-state')
  state(@CurrentUser() auth: AuthUser, @Param('groupId') groupId: string) {
    return this.settlements.getSettlementState(auth.clerkUserId, groupId);
  }
}
