import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class CreateInvitationDto {
  @ApiPropertyOptional({ description: 'Masa berlaku dalam jam', default: 168 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(24 * 90)
  expiresInHours?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  maxUses?: number;
}
