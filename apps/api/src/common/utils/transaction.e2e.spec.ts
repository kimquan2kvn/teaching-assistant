import { Test } from '@nestjs/testing';
import { MongooseModule, getConnectionToken } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { runInTransaction } from './transaction';
import { buildTestMongoUri } from '../../../test/build-test-mongo-uri';

describe('runInTransaction (e2e)', () => {
  let connection: Connection;
  let close: () => Promise<void>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [MongooseModule.forRoot(buildTestMongoUri('transaction_helper_e2e'))],
    }).compile();
    await moduleRef.init();
    connection = moduleRef.get(getConnectionToken());
    close = () => moduleRef.close();
    // Tạo sẵn collection để test không phụ thuộc việc tạo collection ngầm bên trong transaction.
    await connection.createCollection('tmp').catch(() => undefined);
  });

  afterAll(async () => {
    await close();
  });

  beforeEach(async () => {
    await connection.collection('tmp').deleteMany({});
  });

  it('callback trả giá trị thì runInTransaction trả đúng giá trị và dữ liệu được commit', async () => {
    const result = await runInTransaction(connection, async (session) => {
      await connection.collection('tmp').insertOne({ name: 'a' }, { session });
      return 42;
    });

    expect(result).toBe(42);
    expect(await connection.collection('tmp').countDocuments()).toBe(1);
  });

  it('callback throw sau khi insert thì lỗi được ném lại và collection rỗng (rollback)', async () => {
    await expect(
      runInTransaction(connection, async (session) => {
        await connection.collection('tmp').insertOne({ name: 'a' }, { session });
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    expect(await connection.collection('tmp').countDocuments()).toBe(0);
  });
});
