import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { InsightsService } from './insights.service';

@ApiTags('insights')
@ApiBearerAuth()
@Controller()
export class InsightsController {
  constructor(private readonly insights: InsightsService) {}

  @Get('me/insights')
  personal(
    @CurrentUser() auth: AuthUser,
    @Query('period') period?: string,
  ) {
    const p =
      period === 'week' || period === 'month' || period === 'all'
        ? period
        : 'all';
    return this.insights.personalInsights(auth.authSubjectId, p);
  }

  @Get('groups/:groupId/insights')
  group(
    @CurrentUser() auth: AuthUser,
    @Param('groupId') groupId: string,
    @Query('period') period?: string,
  ) {
    const p =
      period === 'week' || period === 'month' || period === 'all'
        ? period
        : 'all';
    return this.insights.groupInsights(auth.authSubjectId, groupId, p);
  }
}
