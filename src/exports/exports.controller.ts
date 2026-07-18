import {
  Controller,
  Get,
  Header,
  Param,
  Query,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ExpenseSearchQuery, ExportsService } from './exports.service';

@ApiTags('exports')
@ApiBearerAuth()
@Controller()
export class ExportsController {
  constructor(private readonly exports: ExportsService) {}

  @Get('groups/:groupId/expenses/search')
  @ApiOperation({ summary: 'Search & filter pengeluaran grup' })
  search(
    @CurrentUser() auth: AuthUser,
    @Param('groupId') groupId: string,
    @Query('q') q?: string,
    @Query('category') category?: string,
    @Query('merchant') merchant?: string,
    @Query('splitMethod') splitMethod?: string,
    @Query('payerId') payerId?: string,
    @Query('participantId') participantId?: string,
    @Query('minAmountMinor') minAmountMinor?: string,
    @Query('maxAmountMinor') maxAmountMinor?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const query: ExpenseSearchQuery = {
      q,
      category,
      merchant,
      splitMethod,
      payerId,
      participantId,
      minAmountMinor: minAmountMinor
        ? Number.parseInt(minAmountMinor, 10)
        : undefined,
      maxAmountMinor: maxAmountMinor
        ? Number.parseInt(maxAmountMinor, 10)
        : undefined,
      dateFrom,
      dateTo,
      limit: limit ? Number.parseInt(limit, 10) : undefined,
      offset: offset ? Number.parseInt(offset, 10) : undefined,
    };
    return this.exports.searchGroupExpenses(
      auth.clerkUserId,
      groupId,
      query,
    );
  }

  @Get('groups/:groupId/exports/pdf')
  @ApiOperation({ summary: 'Export PDF laporan grup' })
  async groupPdf(
    @CurrentUser() auth: AuthUser,
    @Param('groupId') groupId: string,
    @Query('q') q?: string,
    @Query('category') category?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Res({ passthrough: true }) res?: Response,
  ) {
    const { filename, buffer } = await this.exports.exportGroupPdf(
      auth.clerkUserId,
      groupId,
      { q, category, dateFrom, dateTo },
    );
    res?.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
    });
    return new StreamableFile(buffer);
  }

  @Get('me/exports/pdf')
  @ApiOperation({ summary: 'Export PDF laporan pribadi' })
  async personalPdf(
    @CurrentUser() auth: AuthUser,
    @Query('q') q?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Res({ passthrough: true }) res?: Response,
  ) {
    const { filename, buffer } = await this.exports.exportPersonalPdf(
      auth.clerkUserId,
      { q, dateFrom, dateTo },
    );
    res?.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
    });
    return new StreamableFile(buffer);
  }

  @Get('billing/orders/:orderId/invoice.pdf')
  @ApiOperation({ summary: 'Invoice PDF bermerek Bagi Rata' })
  @Header('Content-Type', 'application/pdf')
  async invoicePdf(
    @CurrentUser() auth: AuthUser,
    @Param('orderId') orderId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { filename, buffer } = await this.exports.exportInvoicePdf(
      auth.clerkUserId,
      orderId,
    );
    res.set({
      'Content-Disposition': `attachment; filename="${filename}"`,
    });
    return new StreamableFile(buffer);
  }
}
