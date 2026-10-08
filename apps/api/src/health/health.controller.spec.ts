import { Test } from '@nestjs/testing';
import { getConnectionToken } from '@nestjs/mongoose';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  async function buildController(readyState: number) {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: getConnectionToken(), useValue: { readyState } }],
    }).compile();
    return moduleRef.get(HealthController);
  }

  it('trả status ok và db connected khi readyState = 1', async () => {
    const controller = await buildController(1);
    expect(controller.check()).toEqual({ status: 'ok', db: 'connected', app: 'So Chu Nhiem' });
  });

  it('trả status ok và db disconnected khi readyState != 1 (không throw)', async () => {
    const controller = await buildController(0);
    expect(controller.check()).toEqual({ status: 'ok', db: 'disconnected', app: 'So Chu Nhiem' });
  });
});
