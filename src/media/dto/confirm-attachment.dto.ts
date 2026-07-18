import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class ConfirmAttachmentDto {
  @ApiProperty()
  @IsString()
  uploadSessionId!: string;

  @ApiProperty()
  @IsString()
  publicId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  assetId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  format?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  resourceType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  width?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  height?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  bytes?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  version?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  etag?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  signature?: string;
}
