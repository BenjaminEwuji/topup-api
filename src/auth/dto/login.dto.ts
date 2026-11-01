import { IsNotEmpty, IsString, MinLength, MaxLength, Matches, ValidateIf } from "class-validator";
import { Transform } from "class-transformer";

export class LoginDto {
    @ValidateIf((o) => !o.phoneNumber || o.email)
    @IsNotEmpty({ message: 'Email or phone number is required' })
    @IsString()
    @Transform(({ value }) => value?.trim().toLowerCase())
    email?: string;

    @ValidateIf((o) => !o.email || o.phoneNumber)
    @IsNotEmpty({ message: 'Email or phone number is required' })
    @IsString()
    @Transform(({ value }) => value?.replace(/\s+/g, ''))
    phoneNumber?: string;

    @IsString()
    @IsNotEmpty({ message: 'Password is required' })
    @MinLength(8, { message: 'Password must be at least 8 characters' })
    @MaxLength(64)
    @Matches(/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
        message: 'Password must contain an uppercase letter, a lowercase letter and a number',
    })
    password: string;
}
