import {
  IsString,
  IsInt,
  IsPhoneNumber,
  IsNotEmpty,
  Min,
  Max,
} from 'class-validator';

export class BuyAirtimeDto {
  /**
   * Safe Haven serviceCategoryId for the network provider.
   * Get valid IDs from GET /airtime/networks.
   */
  @IsString()
  @IsNotEmpty({ message: 'serviceCategoryId is required' })
  serviceCategoryId: string;

  /**
   * Human-readable network name for display (e.g. "MTN", "Airtel").
   * Should match the name returned by GET /airtime/networks.
   */
  @IsString()
  @IsNotEmpty({ message: 'network name is required' })
  network: string;

  /**
   * Recipient phone number. Must be a valid Nigerian number.
   * Accepts formats: 08012345678 or +2348012345678
   */
  @IsPhoneNumber('NG', { message: 'phoneNumber must be a valid Nigerian phone number' })
  phoneNumber: string;

  /**
   * Amount in Naira (whole numbers only). Min ₦50, Max ₦50,000.
   */
  @IsInt({ message: 'amount must be a whole number of Naira' })
  @Min(50, { message: 'Minimum airtime amount is ₦50' })
  @Max(50000, { message: 'Maximum airtime amount is ₦50,000' })
  amount: number;
}
