import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ReceiptScanService } from './receipt-scan.service';

@ApiTags('ai')
@ApiBearerAuth()
@Controller()
export class AiController {
  constructor(private readonly scans: ReceiptScanService) {}

  @Post('groups/:groupId/receipt-scans')
  @ApiOperation({ summary: 'Scan struk dengan AI' })
  create(
    @CurrentUser() auth: AuthUser,
    @Param('groupId') groupId: string,
    @Body() body: { attachmentId: string },
  ) {
    return this.scans.createScan(
      auth.clerkUserId,
      groupId,
      body.attachmentId,
    );
  }

  @Get('groups/:groupId/receipt-scans/:scanId')
  get(
    @CurrentUser() auth: AuthUser,
    @Param('groupId') groupId: string,
    @Param('scanId') scanId: string,
  ) {
    return this.scans.getScan(auth.clerkUserId, groupId, scanId);
  }

  @Post('groups/:groupId/receipt-scans/:scanId/retry')
  retry(
    @CurrentUser() auth: AuthUser,
    @Param('groupId') groupId: string,
    @Param('scanId') scanId: string,
  ) {
    return this.scans.retry(auth.clerkUserId, groupId, scanId);
  }

  @Post('groups/:groupId/receipt-scans/:scanId/confirm')
  confirm(
    @CurrentUser() auth: AuthUser,
    @Param('groupId') groupId: string,
    @Param('scanId') scanId: string,
  ) {
    return this.scans.confirmScan(auth.clerkUserId, groupId, scanId);
  }
}
