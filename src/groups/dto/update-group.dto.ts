import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { GroupType } from '@prisma/client';

export class UpdateGroupDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string | null;

  @ApiPropertyOptional({ enum: GroupType })
  @IsOptional()
  @IsEnum(GroupType)
  type?: GroupType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(16)
  iconEmoji?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  requireSettlementConfirmation?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  allowMemberInvites?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  allowOverpayment?: boolean;

  @ApiPropertyOptional({
    description: 'Aktifkan/nonaktifkan fitur budget & forecast',
  })
  @IsOptional()
  @IsBoolean()
  budgetEnabled?: boolean;
}
