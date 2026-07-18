import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { CreateGroupDto } from './dto/create-group.dto';
import { CreateInvitationDto } from './dto/create-invitation.dto';
import { UpdateGroupDto } from './dto/update-group.dto';
import { UpdateMemberDto } from './dto/update-member.dto';
import { GroupsService } from './groups.service';

@ApiTags('groups')
@ApiBearerAuth()
@Controller()
export class GroupsController {
  constructor(private readonly groups: GroupsService) {}

  @Get('groups')
  @ApiOperation({ summary: 'Daftar grup saya' })
  list(@CurrentUser() auth: AuthUser) {
    return this.groups.list(auth.clerkUserId);
  }

  @Post('groups')
  @ApiOperation({ summary: 'Buat grup' })
  create(@CurrentUser() auth: AuthUser, @Body() dto: CreateGroupDto) {
    return this.groups.create(auth.clerkUserId, dto);
  }

  @Get('groups/:groupId')
  get(@CurrentUser() auth: AuthUser, @Param('groupId') groupId: string) {
    return this.groups.get(auth.clerkUserId, groupId);
  }

  @Patch('groups/:groupId')
  update(
    @CurrentUser() auth: AuthUser,
    @Param('groupId') groupId: string,
    @Body() dto: UpdateGroupDto,
  ) {
    return this.groups.update(auth.clerkUserId, groupId, dto);
  }

  @Post('groups/:groupId/archive')
  archive(@CurrentUser() auth: AuthUser, @Param('groupId') groupId: string) {
    return this.groups.archive(auth.clerkUserId, groupId);
  }

  @Post('groups/:groupId/restore')
  restore(@CurrentUser() auth: AuthUser, @Param('groupId') groupId: string) {
    return this.groups.restore(auth.clerkUserId, groupId);
  }

  @Get('groups/:groupId/members')
  members(@CurrentUser() auth: AuthUser, @Param('groupId') groupId: string) {
    return this.groups.listMembers(auth.clerkUserId, groupId);
  }

  @Patch('groups/:groupId/members/:memberId')
  updateMember(
    @CurrentUser() auth: AuthUser,
    @Param('groupId') groupId: string,
    @Param('memberId') memberId: string,
    @Body() dto: UpdateMemberDto,
  ) {
    return this.groups.updateMember(
      auth.clerkUserId,
      groupId,
      memberId,
      dto,
    );
  }

  @Delete('groups/:groupId/members/:memberId')
  removeMember(
    @CurrentUser() auth: AuthUser,
    @Param('groupId') groupId: string,
    @Param('memberId') memberId: string,
  ) {
    return this.groups.removeMember(auth.clerkUserId, groupId, memberId);
  }

  @Post('groups/:groupId/invitations')
  createInvitation(
    @CurrentUser() auth: AuthUser,
    @Param('groupId') groupId: string,
    @Body() dto: CreateInvitationDto,
  ) {
    return this.groups.createInvitation(auth.clerkUserId, groupId, dto);
  }

  @Get('groups/:groupId/invitations')
  listInvitations(
    @CurrentUser() auth: AuthUser,
    @Param('groupId') groupId: string,
  ) {
    return this.groups.listInvitations(auth.clerkUserId, groupId);
  }

  @Delete('groups/:groupId/invitations/:invitationId')
  revokeInvitation(
    @CurrentUser() auth: AuthUser,
    @Param('groupId') groupId: string,
    @Param('invitationId') invitationId: string,
  ) {
    return this.groups.revokeInvitation(
      auth.clerkUserId,
      groupId,
      invitationId,
    );
  }

  @Public()
  @Get('invitations/:token')
  getInvitation(@Param('token') token: string) {
    return this.groups.getInvitationPublic(token);
  }

  @Post('invitations/:token/accept')
  acceptInvitation(
    @CurrentUser() auth: AuthUser,
    @Param('token') token: string,
  ) {
    return this.groups.acceptInvitation(auth.clerkUserId, token);
  }
}
