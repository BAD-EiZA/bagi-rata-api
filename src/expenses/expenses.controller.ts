import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { IdempotencyService } from '../common/idempotency/idempotency.service';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import { ExpensesService } from './expenses.service';
import { LedgerService } from '../ledger/ledger.service';
import { requireInternalUser } from '../common/users/resolve-user';
import { PrismaService } from '../prisma/prisma.service';
import { MembershipService } from '../groups/membership.service';

@ApiTags('expenses')
@ApiBearerAuth()
@Controller()
export class ExpensesController {
  constructor(
    private readonly expenses: ExpensesService,
    private readonly ledger: LedgerService,
    private readonly prisma: PrismaService,
    private readonly membership: MembershipService,
    private readonly idempotency: IdempotencyService,
  ) {}

  @Get('groups/:groupId/expenses')
  @ApiOperation({ summary: 'Daftar pengeluaran grup' })
  list(
    @CurrentUser() auth: AuthUser,
    @Param('groupId') groupId: string,
  ) {
    return this.expenses.list(auth.authSubjectId, groupId);
  }

  @Post('groups/:groupId/expenses')
  @ApiOperation({ summary: 'Buat pengeluaran' })
  async create(
    @CurrentUser() auth: AuthUser,
    @Param('groupId') groupId: string,
    @Body() dto: CreateExpenseDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const user = await requireInternalUser(this.prisma, auth.authSubjectId);
    const gate = await this.idempotency.begin(user.id, idempotencyKey, dto);
    if (gate?.hit) return gate.response;
    const created = await this.expenses.create(auth.authSubjectId, groupId, dto);
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

  @Get('groups/:groupId/expenses/:expenseId')
  get(
    @CurrentUser() auth: AuthUser,
    @Param('groupId') groupId: string,
    @Param('expenseId') expenseId: string,
  ) {
    return this.expenses.get(auth.authSubjectId, groupId, expenseId);
  }

  @Patch('groups/:groupId/expenses/:expenseId')
  update(
    @CurrentUser() auth: AuthUser,
    @Param('groupId') groupId: string,
    @Param('expenseId') expenseId: string,
    @Body() dto: UpdateExpenseDto,
  ) {
    return this.expenses.update(auth.authSubjectId, groupId, expenseId, dto);
  }

  @Delete('groups/:groupId/expenses/:expenseId')
  remove(
    @CurrentUser() auth: AuthUser,
    @Param('groupId') groupId: string,
    @Param('expenseId') expenseId: string,
  ) {
    return this.expenses.remove(auth.authSubjectId, groupId, expenseId);
  }

  @Get('groups/:groupId/balances')
  @ApiOperation({ summary: 'Saldo anggota grup' })
  async balances(
    @CurrentUser() auth: AuthUser,
    @Param('groupId') groupId: string,
  ) {
    const user = await requireInternalUser(this.prisma, auth.authSubjectId);
    await this.membership.requireMember(groupId, user.id);
    return this.ledger.getGroupBalances(groupId);
  }

  @Get('groups/:groupId/balances/me')
  async myBalance(
    @CurrentUser() auth: AuthUser,
    @Param('groupId') groupId: string,
  ) {
    const user = await requireInternalUser(this.prisma, auth.authSubjectId);
    await this.membership.requireMember(groupId, user.id);
    const balanceMinor = await this.ledger.getMemberBalance(groupId, user.id);
    return { userId: user.id, balanceMinor };
  }
}
