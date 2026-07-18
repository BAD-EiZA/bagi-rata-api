import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  Min,
  ValidateNested,
} from 'class-validator';
import { CreateExpenseDto } from './create-expense.dto';

export class UpdateExpenseDto extends CreateExpenseDto {
  @ApiPropertyOptional({ description: 'Optimistic locking version' })
  @IsOptional()
  @IsInt()
  @Min(1)
  version?: number;
}

// re-export nested for swagger if needed
void Type;
