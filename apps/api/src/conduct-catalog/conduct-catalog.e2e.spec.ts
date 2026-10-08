import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import request from 'supertest';
import { Model } from 'mongoose';
import { User, UserSchema } from '../database/schemas/user.schema';
import { ConductCatalogItem, ConductCatalogItemSchema } from '../database/schemas/conduct-catalog-item.schema';
import { AuthController } from '../auth/auth.controller';
import { AuthService } from '../auth/auth.service';
import { JwtStrategy } from '../auth/jwt.strategy';
import { ConductCatalogController } from './conduct-catalog.controller';
import { ConductCatalogService } from './conduct-catalog.service';
import { buildTestMongoUri } from '../../test/build-test-mongo-uri';

describe('ConductCatalog (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        MongooseModule.forRoot(buildTestMongoUri('conduct_catalog_e2e')),
        MongooseModule.forFeature([
          { name: User.name, schema: UserSchema },
          { name: ConductCatalogItem.name, schema: ConductCatalogItemSchema },
        ]),
        JwtModule.register({}),
        PassportModule,
      ],
      controllers: [AuthController, ConductCatalogController],
      providers: [AuthService, JwtStrategy, ConductCatalogService],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  async function registerAndPromote(username: string, role: 'TEACHER' | 'ADMIN') {
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ username, password: 'MatKhau123', fullName: username });
    if (role === 'TEACHER') {
      return { token: res.body.accessToken as string };
    }
    const userModel = app.get(getModelToken(User.name)) as Model<User>;
    await userModel.updateOne({ username }, { role: 'ADMIN' });
    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username, password: 'MatKhau123' });
    return { token: loginRes.body.accessToken as string };
  }

  it('TEACHER không tạo/sửa được danh mục (403), nhưng xem được (200)', async () => {
    const { token } = await registerAndPromote('gv.catalog-a', 'TEACHER');
    await request(app.getHttpServer())
      .post('/conduct-catalog')
      .set('Authorization', `Bearer ${token}`)
      .send({ label: 'Đi học muộn', kind: 'VIOLATION', points: 5 })
      .expect(403);
    await request(app.getHttpServer()).get('/conduct-catalog').set('Authorization', `Bearer ${token}`).expect(200);
  });

  it('ADMIN tạo/sửa được danh mục, item isActive=false không còn trong list()', async () => {
    const { token } = await registerAndPromote('admin.catalog-a', 'ADMIN');
    const createRes = await request(app.getHttpServer())
      .post('/conduct-catalog')
      .set('Authorization', `Bearer ${token}`)
      .send({ label: 'Đi học muộn', kind: 'VIOLATION', points: 5 })
      .expect(201);
    const id = createRes.body._id as string;

    await request(app.getHttpServer())
      .patch(`/conduct-catalog/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ isActive: false })
      .expect(200);

    const listRes = await request(app.getHttpServer())
      .get('/conduct-catalog')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(listRes.body.some((item: { _id: string }) => item._id === id)).toBe(false);
  });
});
