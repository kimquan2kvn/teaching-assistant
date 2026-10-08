import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { getModelToken } from '@nestjs/mongoose';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { AuthService } from './auth.service';
import { User } from '../database/schemas/user.schema';

type FakeUser = Record<string, unknown> & { _id: string; username: string };

function buildModuleWithUserStore(initialUsers: FakeUser[] = []) {
  const users = [...initialUsers];
  const modelMock = {
    findOne: jest.fn((filter: { username: string }) => ({
      exec: async () => users.find((u) => u.username === filter.username) ?? null,
    })),
    findById: jest.fn((id: string) => ({
      exec: async () => users.find((u) => u._id === id) ?? null,
    })),
    create: jest.fn(async (doc: Partial<FakeUser>) => {
      const created: FakeUser = {
        _id: `user-${users.length + 1}`,
        isActive: true,
        mustChangePassword: false,
        ...doc,
        username: doc.username as string,
        save: async function (this: FakeUser) {
          return this;
        },
      };
      users.push(created);
      return created;
    }),
  };
  return { users, modelMock };
}

describe('AuthService', () => {
  it('register: tạo user mới với role TEACHER, trả về accessToken/refreshToken', async () => {
    const { modelMock } = buildModuleWithUserStore();
    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        JwtService,
        { provide: getModelToken(User.name), useValue: modelMock },
      ],
    }).compile();
    const service = moduleRef.get(AuthService);

    const result = await service.register({ username: 'gv.a', password: 'MatKhau123', fullName: 'Giáo viên A' });

    expect(result.user.username).toBe('gv.a');
    expect(result.user.role).toBe('TEACHER');
    expect(typeof result.accessToken).toBe('string');
    expect(typeof result.refreshToken).toBe('string');
  });

  it('register: throw ConflictException nếu username đã tồn tại', async () => {
    const { modelMock } = buildModuleWithUserStore([{ _id: 'u1', username: 'gv.a' }]);
    const moduleRef = await Test.createTestingModule({
      providers: [AuthService, JwtService, { provide: getModelToken(User.name), useValue: modelMock }],
    }).compile();
    const service = moduleRef.get(AuthService);

    await expect(
      service.register({ username: 'gv.a', password: 'MatKhau123', fullName: 'X' }),
    ).rejects.toThrow(ConflictException);
  });

  it('login: throw UnauthorizedException nếu sai mật khẩu', async () => {
    const hash = await argon2.hash('MatKhauDung');
    const { modelMock } = buildModuleWithUserStore([
      { _id: 'u1', username: 'gv.a', passwordHash: hash, isActive: true, role: 'TEACHER', fullName: 'A', mustChangePassword: false },
    ]);
    const moduleRef = await Test.createTestingModule({
      providers: [AuthService, JwtService, { provide: getModelToken(User.name), useValue: modelMock }],
    }).compile();
    const service = moduleRef.get(AuthService);

    await expect(service.login({ username: 'gv.a', password: 'SaiRoi' })).rejects.toThrow(UnauthorizedException);
  });

  it('login: throw UnauthorizedException nếu tài khoản bị khóa (isActive=false) dù đúng mật khẩu', async () => {
    const hash = await argon2.hash('MatKhauDung');
    const { modelMock } = buildModuleWithUserStore([
      { _id: 'u1', username: 'gv.a', passwordHash: hash, isActive: false, role: 'TEACHER', fullName: 'A', mustChangePassword: false, save: async function () { return this; } },
    ]);
    const moduleRef = await Test.createTestingModule({
      providers: [AuthService, JwtService, { provide: getModelToken(User.name), useValue: modelMock }],
    }).compile();
    const service = moduleRef.get(AuthService);

    await expect(service.login({ username: 'gv.a', password: 'MatKhauDung' })).rejects.toThrow(UnauthorizedException);
  });
});
