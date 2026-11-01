import { IsNotEmpty, IsString } from 'class-validator';

export class VerifyFundingDto {
  @IsString()
  @IsNotEmpty()
  reference: string;
}