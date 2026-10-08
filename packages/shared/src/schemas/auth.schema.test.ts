import { registerSchema, loginSchema, changePasswordSchema } from './auth.schema';

describe('registerSchema', () => {
  it('chấp nhận input hợp lệ', () => {
    const result = registerSchema.safeParse({
      username: 'gv.nguyenvana',
      password: 'MatKhau123',
      fullName: 'Nguyễn Văn A',
    });
    expect(result.success).toBe(true);
  });

  it('từ chối mật khẩu dưới 8 ký tự', () => {
    const result = registerSchema.safeParse({
      username: 'gv.a',
      password: '123',
      fullName: 'A',
    });
    expect(result.success).toBe(false);
  });
});

describe('loginSchema', () => {
  it('yêu cầu username và password', () => {
    expect(loginSchema.safeParse({ username: 'x', password: 'y' }).success).toBe(true);
    expect(loginSchema.safeParse({ username: 'x' }).success).toBe(false);
  });
});

describe('changePasswordSchema', () => {
  it('yêu cầu oldPassword và newPassword tối thiểu 8 ký tự', () => {
    expect(
      changePasswordSchema.safeParse({ oldPassword: 'abcdefgh', newPassword: 'abcdefgh' }).success,
    ).toBe(true);
    expect(
      changePasswordSchema.safeParse({ oldPassword: 'abcdefgh', newPassword: '123' }).success,
    ).toBe(false);
  });
});
