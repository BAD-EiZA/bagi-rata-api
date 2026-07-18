import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateSettlementDto {
  @ApiProperty()
  @IsString()
  fromUserId!: string;

  @ApiProperty()
  @IsString()
  toUserId!: string;

  @ApiProperty()
  @IsInt()
  @Min(1)
  amountMinor!: number;

  @ApiProperty({ example: '2026-07-18' })
  @IsDateString()
  settlementDate!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsString({ each: true })
  attachmentIds?: string[];
}
