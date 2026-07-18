import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ConfirmAttachmentDto } from './dto/confirm-attachment.dto';
import { MediaService } from './media.service';

@ApiTags('media')
@ApiBearerAuth()
@Controller()
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Post('groups/:groupId/upload-sessions')
  @ApiOperation({ summary: 'Buat sesi upload' })
  createSession(
    @CurrentUser() auth: AuthUser,
    @Param('groupId') groupId: string,
  ) {
    return this.media.createUploadSession(auth.authSubjectId, groupId);
  }

  @Post('groups/:groupId/uploads/signature')
  @ApiOperation({ summary: 'Signed params Cloudinary' })
  signature(
    @CurrentUser() auth: AuthUser,
    @Param('groupId') groupId: string,
    @Body() body: { uploadSessionId: string },
  ) {
    return this.media.getSignature(
      auth.authSubjectId,
      groupId,
      body.uploadSessionId,
    );
  }

  @Post('groups/:groupId/attachments')
  @ApiOperation({ summary: 'Konfirmasi attachment setelah upload' })
  confirm(
    @CurrentUser() auth: AuthUser,
    @Param('groupId') groupId: string,
    @Body() dto: ConfirmAttachmentDto,
  ) {
    return this.media.confirmAttachment(auth.authSubjectId, groupId, dto);
  }

  @Get('groups/:groupId/attachments/:attachmentId')
  get(
    @CurrentUser() auth: AuthUser,
    @Param('groupId') groupId: string,
    @Param('attachmentId') attachmentId: string,
  ) {
    return this.media.getAttachment(auth.authSubjectId, groupId, attachmentId);
  }

  @Get('groups/:groupId/attachments/:attachmentId/delivery-url')
  deliveryUrl(
    @CurrentUser() auth: AuthUser,
    @Param('groupId') groupId: string,
    @Param('attachmentId') attachmentId: string,
  ) {
    return this.media.getDeliveryUrl(
      auth.authSubjectId,
      groupId,
      attachmentId,
    );
  }

  @Delete('groups/:groupId/attachments/:attachmentId')
  remove(
    @CurrentUser() auth: AuthUser,
    @Param('groupId') groupId: string,
    @Param('attachmentId') attachmentId: string,
  ) {
    return this.media.deleteAttachment(
      auth.authSubjectId,
      groupId,
      attachmentId,
    );
  }
}
