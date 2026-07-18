import { Controller, Get, Param } from '@nestjs/common';
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
  personal(@CurrentUser() auth: AuthUser) {
    return this.insights.personalInsights(auth.clerkUserId);
  }

  @Get('groups/:groupId/insights')
  group(
    @CurrentUser() auth: AuthUser,
    @Param('groupId') groupId: string,
  ) {
    return this.insights.groupInsights(auth.clerkUserId, groupId);
  }
}
