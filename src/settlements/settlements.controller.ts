import { Body, Controller, Get, Headers, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { IdempotencyService } from '../common/idempotency/idempotency.service';
import { requireInternalUser } from '../common/users/resolve-user';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSettlementDto } from './dto/create-settlement.dto';
import { DisputeSettlementDto } from './dto/dispute-settlement.dto';
import { SettlementsService } from './settlements.service';

@ApiTags('settlements')
@ApiBearerAuth()
@Controller()
export class SettlementsController {
  constructor(
    private readonly settlements: SettlementsService,
    private readonly prisma: PrismaService,
    private readonly idempotency: IdempotencyService,
  ) {}

  @Get('groups/:groupId/settlements')
  list(@CurrentUser() auth: AuthUser, @Param('groupId') groupId: string) {
    return this.settlements.list(auth.authSubjectId, groupId);
  }

  @Post('groups/:groupId/settlements')
  async create(
    @CurrentUser() auth: AuthUser,
    @Param('groupId') groupId: string,
    @Body() dto: CreateSettlementDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const user = await requireInternalUser(this.prisma, auth.authSubjectId);
    const gate = await this.idempotency.begin(user.id, idempotencyKey, dto);
    if (gate?.hit) return gate.response;
    const created = await this.settlements.create(
      auth.authSubjectId,
      groupId,
      dto,
    );
    if (gate && !gate.hit) {
      await this.idempotency.commit(
        user.id,
        idempotencyKey,
        gate.requestHash,
        201,
        created,
      );
    }
    return created;
  }

  @Get('groups/:groupId/settlements/:settlementId')
  get(
    @CurrentUser() auth: AuthUser,
    @Param('groupId') groupId: string,
    @Param('settlementId') settlementId: string,
  ) {
    return this.settlements.get(auth.authSubjectId, groupId, settlementId);
  }

  @Post('groups/:groupId/settlements/:settlementId/confirm')
  confirm(
    @CurrentUser() auth: AuthUser,
    @Param('groupId') groupId: string,
    @Param('settlementId') settlementId: string,
  ) {
    return this.settlements.confirm(auth.authSubjectId, groupId, settlementId);
  }

  @Post('groups/:groupId/settlements/:settlementId/dispute')
  dispute(
    @CurrentUser() auth: AuthUser,
    @Param('groupId') groupId: string,
    @Param('settlementId') settlementId: string,
    @Body() dto: DisputeSettlementDto,
  ) {
    return this.settlements.dispute(
      auth.authSubjectId,
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
    return this.settlements.cancel(auth.authSubjectId, groupId, settlementId);
  }

  @Get('groups/:groupId/settlement-state')
  state(@CurrentUser() auth: AuthUser, @Param('groupId') groupId: string) {
    return this.settlements.getSettlementState(auth.authSubjectId, groupId);
  }
}
