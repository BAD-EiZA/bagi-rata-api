import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class CheckoutDto {
  @ApiProperty({ example: 'PLUS_MONTHLY' })
  @IsString()
  planCode!: string;

  @ApiPropertyOptional({ description: 'Wajib untuk paket GROUP' })
  @IsOptional()
  @IsString()
  groupId?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  autoRenew?: boolean;
}
