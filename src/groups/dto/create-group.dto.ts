import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { GroupType } from '@prisma/client';

export class CreateGroupDto {
  @ApiProperty({ example: 'Liburan Bandung' })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ enum: GroupType })
  @IsOptional()
  @IsEnum(GroupType)
  type?: GroupType;

  @ApiPropertyOptional({ example: 'IDR' })
  @IsOptional()
  @IsString()
  @MaxLength(3)
  currencyCode?: string;

  @ApiPropertyOptional({ example: 'Asia/Jakarta' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;

  @ApiPropertyOptional({ example: '🏝️' })
  @IsOptional()
  @IsString()
  @MaxLength(16)
  iconEmoji?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  requireSettlementConfirmation?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  allowMemberInvites?: boolean;

  @ApiPropertyOptional({
    description: 'Aktifkan fitur budget & forecast di grup ini',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  budgetEnabled?: boolean;
}
