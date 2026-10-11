import { ClientSession, Connection } from 'mongoose';

// withTransaction tự chạy lại callback khi gặp TransientTransactionError, nên callback phải chạy lại được và
// giá trị trả về được gán lại MỖI lần chạy. Mọi query bên trong phải truyền `session` và chạy tuần tự.
export async function runInTransaction<T>(
  connection: Connection,
  fn: (session: ClientSession) => Promise<T>,
): Promise<T> {
  const session = await connection.startSession();
  try {
    let result!: T;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}
