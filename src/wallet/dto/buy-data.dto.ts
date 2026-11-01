import {
  IsString,
  IsInt,
  IsPhoneNumber,
  IsNotEmpty,
  Min,
} from 'class-validator';

export class BuyDataDto {
  /**
   * Safe Haven serviceCategoryId for the network provider.
   * Get valid IDs from GET /data/networks.
   */
  @IsString()
  @IsNotEmpty({ message: 'serviceCategoryId is required' })
  serviceCategoryId: string;

  /**
   * Bundle code representing the selected data plan (e.g., 'MTN-1GB-30D').
   * Get valid codes from GET /data/plans/:serviceCategoryId.
   */
  @IsString()
  @IsNotEmpty({ message: 'bundleCode is required' })
  bundleCode: string;

  /**
   * Human-readable network name for display/audit (e.g. "MTN", "Airtel").
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
   * Amount in Naira for the selected plan.
   */
  @IsInt({ message: 'amount must be a whole number of Naira' })
  @Min(50, { message: 'Minimum amount is ₦50' })
  amount: number;
}
