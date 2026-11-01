import {
  IsEmail,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { Match } from '../../common/decorators/index.js';

export class SignupDto {
  @IsString()
  @IsNotEmpty({ message: 'First name is required' })
  @MaxLength(100)
  @Transform(({ value }) => value?.trim())
  firstName: string;

   @IsString()
  @IsNotEmpty({ message: 'surname is required' })
  @MaxLength(100)
  @Transform(({ value }) => value?.trim())
  lastName: string;

  @IsEmail({}, { message: 'Enter a valid email address' })
  @Transform(({ value }) => value?.trim().toLowerCase())
  email: string;

  @Matches(/^0[789][01]\d{8}$/, {
    message: 'Enter a valid 11-digit Nigerian phone number',
  })
  @Transform(({ value }) => value?.replace(/\s+/g, ''))
  phoneNumber: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @MaxLength(64)
  @Matches(/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
    message: 'Password must contain an uppercase letter, a lowercase letter and a number',
  })
  password: string;

  @IsNotEmpty({ message: 'Please confirm your password' })
  @Match('password', { message: 'Passwords do not match' })
  confirmPassword: string;

  
}