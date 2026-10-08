import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import { Model } from 'mongoose';
import { randomUUID } from 'crypto';
import * as argon2 from 'argon2';
import { User } from '../database/schemas/user.schema';
import { getJwtAccessSecret, getJwtRefreshSecret } from '../common/config/jwt-secrets';
import type { RegisterInput, LoginInput, ChangePasswordInput } from '@so-chu-nhiem/shared';

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  user: { id: string; username: string; fullName: string; role: string; mustChangePassword: boolean };
}

const ACCESS_TOKEN_TTL = '15m';
const REFRESH_TOKEN_TTL = '30d';

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<User>,
    private readonly jwtService: JwtService,
  ) {}

  async register(input: RegisterInput): Promise<AuthResult> {
    const existing = await this.userModel.findOne({ username: input.username }).exec();
    if (existing) {
      throw new ConflictException('Tên đăng nhập đã tồn tại');
    }

    const passwordHash = await argon2.hash(input.password);
    const user = await this.userModel.create({
      username: input.username,
      passwordHash,
      fullName: input.fullName,
      role: 'TEACHER',
      mustChangePassword: false,
    });

    const tokens = await this.issueTokens(user);
    user.refreshTokenHash = await argon2.hash(tokens.refreshToken);
    await user.save();

    return { ...tokens, user: this.toPublicUser(user) };
  }

  async login(input: LoginInput): Promise<AuthResult> {
    const user = await this.userModel.findOne({ username: input.username }).exec();
    if (!user || !(await argon2.verify(user.passwordHash, input.password))) {
      throw new UnauthorizedException('Sai tên đăng nhập hoặc mật khẩu');
    }
    if (!user.isActive) {
      throw new UnauthorizedException('Tài khoản đã bị khóa');
    }

    const tokens = await this.issueTokens(user);
    user.refreshTokenHash = await argon2.hash(tokens.refreshToken);
    await user.save();

    return { ...tokens, user: this.toPublicUser(user) };
  }

  async refresh(refreshToken: string): Promise<Omit<AuthResult, 'user'>> {
    let payload: { sub: string };
    try {
      payload = this.jwtService.verify(refreshToken, {
        secret: getJwtRefreshSecret(),
      });
    } catch {
      throw new UnauthorizedException('Refresh token không hợp lệ');
    }

    const user = await this.userModel.findById(payload.sub).exec();
    if (!user || !user.refreshTokenHash || !(await argon2.verify(user.refreshTokenHash, refreshToken))) {
      throw new UnauthorizedException('Refresh token không hợp lệ');
    }

    const tokens = await this.issueTokens(user);
    user.refreshTokenHash = await argon2.hash(tokens.refreshToken);
    await user.save();

    return tokens;
  }

  async logout(userId: string): Promise<void> {
    const user = await this.userModel.findById(userId).exec();
    if (!user) return;
    user.refreshTokenHash = undefined;
    await user.save();
  }

  async changePassword(userId: string, input: ChangePasswordInput): Promise<void> {
    const user = await this.userModel.findById(userId).exec();
    if (!user || !(await argon2.verify(user.passwordHash, input.oldPassword))) {
      throw new UnauthorizedException('Mật khẩu cũ không đúng');
    }
    user.passwordHash = await argon2.hash(input.newPassword);
    user.mustChangePassword = false;
    // Đổi mật khẩu phải thu hồi mọi phiên refresh token hiện có — nếu không, 1 refresh token bị lộ
    // trước đó vẫn tiếp tục xoay vòng được sau khi người dùng đã chủ động đổi mật khẩu.
    user.refreshTokenHash = undefined;
    await user.save();
  }

  async validateUserById(userId: string) {
    return this.userModel.findById(userId).exec();
  }

  async getPublicProfile(userId: string) {
    const user = await this.userModel.findById(userId).exec();
    if (!user) {
      throw new UnauthorizedException('Người dùng không tồn tại');
    }
    return this.toPublicUser(user);
  }

  private toPublicUser(user: User) {
    return {
      id: String(user._id),
      username: user.username,
      fullName: user.fullName,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
    };
  }

  private async issueTokens(user: User): Promise<{ accessToken: string; refreshToken: string }> {
    const accessToken = this.jwtService.sign(
      { sub: String(user._id), role: user.role },
      { secret: getJwtAccessSecret(), expiresIn: ACCESS_TOKEN_TTL },
    );
    const refreshToken = this.jwtService.sign(
      // `jti` ngẫu nhiên đảm bảo 2 lần cấp refresh token liên tiếp trong cùng 1 giây (cùng `iat`) vẫn ra
      // 2 chuỗi token khác nhau — nếu không, token cũ và token mới xoay vòng có thể trùng y hệt, khiến
      // việc chặn refresh token cũ đã xoay vòng trở nên vô tác dụng.
      { sub: String(user._id), jti: randomUUID() },
      { secret: getJwtRefreshSecret(), expiresIn: REFRESH_TOKEN_TTL },
    );
    return { accessToken, refreshToken };
  }
}
