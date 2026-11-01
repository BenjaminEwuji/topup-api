import { IsInt, Max, Min } from 'class-validator';

export class InitializeFundingDto {
  // Naira
  @IsInt({ message: 'Amount must be a whole number of Naira' })
  @Min(50, { message: 'Minimum funding amount is ₦50' })
  @Max(50000000, { message: 'Maximum funding amount is ₦50,000,000' })
  amount: number;
}