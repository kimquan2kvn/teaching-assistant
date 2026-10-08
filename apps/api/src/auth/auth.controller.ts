import { Body, Controller, Get, HttpCode, Post, Req, Res, UnauthorizedException, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { registerSchema, loginSchema, changePasswordSchema } from '@so-chu-nhiem/shared';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from './jwt-auth.guard';
import { AuthService } from './auth.service';

const REFRESH_COOKIE = 'refresh_token';
const REFRESH_COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

function setRefreshCookie(res: Response, token: string) {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    // `secure` chỉ bật ở production — trình duyệt BỎ cookie có `secure: true` hoàn toàn khi trang chạy qua
    // http:// (vd http://localhost:3000 lúc dev), khiến cookie không bao giờ được set được trong dev.
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: REFRESH_COOKIE_MAX_AGE_MS,
  });
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  async register(
    @Body(new ZodValidationPipe(registerSchema)) body: { username: string; password: string; fullName: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.register(body);
    setRefreshCookie(res, result.refreshToken);
    return result;
  }

  @Post('login')
  async login(
    @Body(new ZodValidationPipe(loginSchema)) body: { username: string; password: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(body);
    setRefreshCookie(res, result.refreshToken);
    return result;
  }

  @Post('refresh')
  async refresh(
    @Body() body: { refreshToken?: string },
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    // Web dùng cookie (không cần FE tự lưu/gửi token); app di động sau này không có cookie nên gửi qua body —
    // body được ưu tiên khi cả hai cùng có (vd client cố tình truyền tay để refresh 1 phiên khác với cookie).
    const refreshToken = body?.refreshToken ?? (req.cookies?.[REFRESH_COOKIE] as string | undefined);
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token không hợp lệ');
    }
    const result = await this.authService.refresh(refreshToken);
    setRefreshCookie(res, result.refreshToken);
    return result;
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  async logout(@CurrentUser() user: { id: string }, @Res({ passthrough: true }) res: Response) {
    await this.authService.logout(user.id);
    res.clearCookie(REFRESH_COOKIE);
    return { success: true };
  }

  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  async changePassword(
    @CurrentUser() user: { id: string },
    @Body(new ZodValidationPipe(changePasswordSchema)) body: { oldPassword: string; newPassword: string },
  ) {
    await this.authService.changePassword(user.id, body);
    return { success: true };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser() user: { id: string }) {
    return this.authService.getPublicProfile(user.id);
  }
}
