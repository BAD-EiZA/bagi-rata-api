import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { MemberRole } from '@prisma/client';

export class UpdateMemberDto {
  @ApiProperty({ enum: [MemberRole.ADMIN, MemberRole.MEMBER] })
  @IsEnum(MemberRole)
  role!: MemberRole;
}
