import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { BudgetsService } from './budgets.service';
import { CreateBudgetDto } from './dto/create-budget.dto';

@ApiTags('budgets')
@ApiBearerAuth()
@Controller()
export class BudgetsController {
  constructor(private readonly budgets: BudgetsService) {}

  @Get('groups/:groupId/budgets')
  @ApiOperation({ summary: 'Daftar budget grup' })
  list(@CurrentUser() auth: AuthUser, @Param('groupId') groupId: string) {
    return this.budgets.list(auth.clerkUserId, groupId);
  }

  @Post('groups/:groupId/budgets')
  @ApiOperation({ summary: 'Buat budget grup' })
  create(
    @CurrentUser() auth: AuthUser,
    @Param('groupId') groupId: string,
    @Body() dto: CreateBudgetDto,
  ) {
    return this.budgets.create(auth.clerkUserId, groupId, dto);
  }

  @Delete('groups/:groupId/budgets/:budgetId')
  remove(
    @CurrentUser() auth: AuthUser,
    @Param('groupId') groupId: string,
    @Param('budgetId') budgetId: string,
  ) {
    return this.budgets.remove(auth.clerkUserId, groupId, budgetId);
  }

  @Get('groups/:groupId/forecast')
  @ApiOperation({ summary: 'Forecast pengeluaran grup' })
  forecast(
    @CurrentUser() auth: AuthUser,
    @Param('groupId') groupId: string,
  ) {
    return this.budgets.forecast(auth.clerkUserId, groupId);
  }
}
