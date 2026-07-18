import { Body, Controller, Get, Patch, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../auth/auth.types';
import { UpdateMeDto } from './dto/update-me.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@Controller()
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'Ambil profil pengguna saat ini' })
  @ApiOkResponse({ description: 'Profil pengguna' })
  getMe(@CurrentUser() auth: AuthUser) {
    return this.usersService.getMe(auth.authSubjectId);
  }

  @Post('me/bootstrap')
  @ApiOperation({
    summary: 'Bootstrap/upsert profil internal dari Kinde session',
  })
  bootstrap(@CurrentUser() auth: AuthUser) {
    return this.usersService.bootstrap(auth);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Perbarui preferensi profil' })
  updateMe(@CurrentUser() auth: AuthUser, @Body() dto: UpdateMeDto) {
    return this.usersService.updateMe(auth.authSubjectId, dto);
  }
}
