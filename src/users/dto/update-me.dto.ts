import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpdateMeDto {
  @ApiPropertyOptional({ example: 'Budi Santoso' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  displayName?: string;

  @ApiPropertyOptional({ example: 'id-ID' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  locale?: string;

  @ApiPropertyOptional({ example: 'Asia/Jakarta' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;

  @ApiPropertyOptional({ description: 'Notifikasi mention' })
  @IsOptional()
  @IsBoolean()
  notifyMentions?: boolean;

  @ApiPropertyOptional({ description: 'Notifikasi settlement' })
  @IsOptional()
  @IsBoolean()
  notifySettlements?: boolean;

  @ApiPropertyOptional({ description: 'Notifikasi reminder' })
  @IsOptional()
  @IsBoolean()
  notifyReminders?: boolean;

  @ApiPropertyOptional({ description: 'Notifikasi email (jika SMTP aktif)' })
  @IsOptional()
  @IsBoolean()
  notifyEmail?: boolean;
}
