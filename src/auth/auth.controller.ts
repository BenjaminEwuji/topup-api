import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { LoginDto, LogoutDto, ResetPasswordDto, SignupDto } from './dto/index.js';


@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  login(@Body() dto: LoginDto){
    console.log({dto});
   return this.authService.login(dto);
    }
    @Post('signup')
    signup(@Body() dto: SignupDto){
      console.log({dto});
      
      return this.authService.signup(dto);
    }
    @HttpCode(HttpStatus.OK)
    @Post('reset-password')
    resetPassword(@Body() dto: ResetPasswordDto){
      return this.authService.resetPassword(dto);
    }
    @HttpCode(HttpStatus.OK)
    @Post('logout')
    logout(@Body() dto: LogoutDto){
      return this.authService.logout(dto);
    }
}
