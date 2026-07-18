import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ReactionType } from '@prisma/client';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { SocialService } from './social.service';

@ApiTags('social')
@ApiBearerAuth()
@Controller()
export class SocialController {
  constructor(private readonly social: SocialService) {}

  @Get('groups/:groupId/:entityType/:entityId/comments')
  listComments(
    @CurrentUser() auth: AuthUser,
    @Param('groupId') groupId: string,
    @Param('entityType') entityType: string,
    @Param('entityId') entityId: string,
  ) {
    return this.social.listComments(
      auth.clerkUserId,
      groupId,
      entityType,
      entityId,
    );
  }

  @Post('groups/:groupId/:entityType/:entityId/comments')
  createComment(
    @CurrentUser() auth: AuthUser,
    @Param('groupId') groupId: string,
    @Param('entityType') entityType: string,
    @Param('entityId') entityId: string,
    @Body() body: { body: string },
  ) {
    return this.social.createComment(
      auth.clerkUserId,
      groupId,
      entityType,
      entityId,
      body.body,
    );
  }

  @Delete('groups/:groupId/comments/:commentId')
  deleteComment(
    @CurrentUser() auth: AuthUser,
    @Param('groupId') groupId: string,
    @Param('commentId') commentId: string,
  ) {
    return this.social.deleteComment(auth.clerkUserId, groupId, commentId);
  }

  @Put('groups/:groupId/:entityType/:entityId/reaction')
  setReaction(
    @CurrentUser() auth: AuthUser,
    @Param('groupId') groupId: string,
    @Param('entityType') entityType: string,
    @Param('entityId') entityId: string,
    @Body() body: { reactionType: ReactionType },
  ) {
    return this.social.setReaction(
      auth.clerkUserId,
      groupId,
      entityType,
      entityId,
      body.reactionType,
    );
  }

  @Delete('groups/:groupId/:entityType/:entityId/reaction')
  removeReaction(
    @CurrentUser() auth: AuthUser,
    @Param('groupId') groupId: string,
    @Param('entityType') entityType: string,
    @Param('entityId') entityId: string,
  ) {
    return this.social.removeReaction(
      auth.clerkUserId,
      groupId,
      entityType,
      entityId,
    );
  }

  @Get('groups/:groupId/:entityType/:entityId/reactions')
  listReactions(
    @CurrentUser() auth: AuthUser,
    @Param('groupId') groupId: string,
    @Param('entityType') entityType: string,
    @Param('entityId') entityId: string,
  ) {
    return this.social.listReactions(
      auth.clerkUserId,
      groupId,
      entityType,
      entityId,
    );
  }

  @Post('groups/:groupId/reminders')
  reminder(
    @CurrentUser() auth: AuthUser,
    @Param('groupId') groupId: string,
    @Body() body: { recipientUserId: string },
  ) {
    return this.social.createReminder(
      auth.clerkUserId,
      groupId,
      body.recipientUserId,
    );
  }

  @Post('groups/:groupId/reminders/whatsapp-link')
  whatsapp(
    @CurrentUser() auth: AuthUser,
    @Param('groupId') groupId: string,
    @Body() body: { recipientUserId: string },
  ) {
    return this.social.createWhatsappLink(
      auth.clerkUserId,
      groupId,
      body.recipientUserId,
    );
  }

  @Get('groups/:groupId/activity')
  activity(
    @CurrentUser() auth: AuthUser,
    @Param('groupId') groupId: string,
  ) {
    return this.social.listActivity(auth.clerkUserId, groupId);
  }
}
