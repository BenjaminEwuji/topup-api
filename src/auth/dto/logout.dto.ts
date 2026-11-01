import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class LogoutDto {
  @IsString()
  @IsNotEmpty({ message: 'Refresh token is required' })
  refreshToken: string;

  @IsOptional()
  @IsBoolean()
  allDevices?: boolean;
}