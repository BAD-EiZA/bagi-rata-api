import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SplitMethod } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class ExpensePayerDto {
  @ApiProperty()
  @IsString()
  userId!: string;

  @ApiProperty({ description: 'Nominal dalam satuan terkecil (sen/rupiah)' })
  @IsInt()
  @Min(1)
  amountMinor!: number;
}

export class ExpenseSplitDto {
  @ApiProperty()
  @IsString()
  userId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  amountMinor?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  percentage?: number;
}

export class ItemAllocationDto {
  @ApiProperty()
  @IsString()
  userId!: string;

  @ApiPropertyOptional({ description: 'Kosong = bagi rata antar alokasi item' })
  @IsOptional()
  @IsInt()
  @Min(0)
  amountMinor?: number;
}

export class ExpenseItemDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsNumber()
  @Min(0.0001)
  quantity?: number;

  @ApiProperty()
  @IsInt()
  @Min(0)
  unitPriceMinor!: number;

  @ApiProperty()
  @IsInt()
  @Min(0)
  lineTotalMinor!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  aiConfidence?: number;

  @ApiProperty({ type: [ItemAllocationDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ItemAllocationDto)
  allocations!: ItemAllocationDto[];
}

export class CreateExpenseDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  description!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  merchantName?: string;

  @ApiProperty()
  @IsInt()
  @Min(1)
  amountMinor!: number;

  @ApiProperty({ example: '2026-07-18' })
  @IsDateString()
  expenseDate!: string;

  @ApiProperty({ enum: SplitMethod })
  @IsEnum(SplitMethod)
  splitMethod!: SplitMethod;

  @ApiProperty({ type: [ExpensePayerDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ExpensePayerDto)
  payers!: ExpensePayerDto[];

  @ApiPropertyOptional({ type: [ExpenseSplitDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ExpenseSplitDto)
  splits?: ExpenseSplitDto[];

  @ApiPropertyOptional({
    type: [String],
    description: 'Wajib untuk EQUAL; opsional untuk metode lain',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  participantIds?: string[];

  @ApiPropertyOptional({ type: [ExpenseItemDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ExpenseItemDto)
  items?: ExpenseItemDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  subtotalMinor?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  taxMinor?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  serviceChargeMinor?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  discountMinor?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  tipMinor?: number;

  @ApiPropertyOptional({
    description: 'User IDs untuk alokasi extra charges proporsional default = peserta',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  chargeParticipantIds?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  category?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  attachmentIds?: string[];
}
