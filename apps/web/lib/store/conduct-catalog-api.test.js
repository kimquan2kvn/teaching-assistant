import { makeStore } from './store';
import { conductCatalogApi } from './conduct-catalog-api';

function jsonResponse(status, body) {
  const text = JSON.stringify(body);
  return Promise.resolve({
    status,
    text: () => Promise.resolve(text),
    clone() {
      return { text: () => Promise.resolve(text) };
    },
  });
}

beforeEach(() => {
  global.fetch = jest.fn();
});

test('getConductCatalog gọi đúng GET /conduct-catalog', async () => {
  global.fetch.mockReturnValueOnce(jsonResponse(200, []));
  const store = makeStore();
  await store.dispatch(conductCatalogApi.endpoints.getConductCatalog.initiate());
  const request = global.fetch.mock.calls[0][0];
  expect(request.method).toBe('GET');
  expect(request.url).toContain('/conduct-catalog');
});

test('createConductCatalogItem gọi đúng POST /conduct-catalog kèm body', async () => {
  global.fetch.mockReturnValueOnce(jsonResponse(201, { _id: 'ci1', label: 'Đi học muộn' }));
  const store = makeStore();
  await store.dispatch(
    conductCatalogApi.endpoints.createConductCatalogItem.initiate({
      label: 'Đi học muộn',
      kind: 'VIOLATION',
      points: 5,
    }),
  );
  const request = global.fetch.mock.calls[0][0];
  expect(request.method).toBe('POST');
  expect(request.url).toContain('/conduct-catalog');
  expect(JSON.parse(request.body)).toEqual({ label: 'Đi học muộn', kind: 'VIOLATION', points: 5 });
});

test('updateConductCatalogItem gọi đúng PATCH /conduct-catalog/:id kèm body (không gửi id trong body)', async () => {
  global.fetch.mockReturnValueOnce(jsonResponse(200, { _id: 'ci1', isActive: false }));
  const store = makeStore();
  await store.dispatch(
    conductCatalogApi.endpoints.updateConductCatalogItem.initiate({ id: 'ci1', isActive: false }),
  );
  const request = global.fetch.mock.calls[0][0];
  expect(request.method).toBe('PATCH');
  expect(request.url).toContain('/conduct-catalog/ci1');
  expect(JSON.parse(request.body)).toEqual({ isActive: false });
});

test('createConductCatalogItem thành công invalidate ConductCatalog, làm getConductCatalog tự refetch', async () => {
  const store = makeStore();

  global.fetch.mockReturnValueOnce(jsonResponse(200, []));
  await store.dispatch(conductCatalogApi.endpoints.getConductCatalog.initiate());

  global.fetch.mockReturnValueOnce(jsonResponse(201, { _id: 'ci1', label: 'Đi học muộn' }));
  global.fetch.mockReturnValueOnce(jsonResponse(200, [{ _id: 'ci1', label: 'Đi học muộn' }]));

  await store.dispatch(
    conductCatalogApi.endpoints.createConductCatalogItem.initiate({
      label: 'Đi học muộn',
      kind: 'VIOLATION',
      points: 5,
    }),
  );

  const catalogCalls = global.fetch.mock.calls.filter(
    (c) => c[0].url.includes('/conduct-catalog') && c[0].method === 'GET',
  );
  expect(catalogCalls).toHaveLength(2);
});

test('updateConductCatalogItem thất bại không bị nuốt lỗi, error.data.message giữ nguyên', async () => {
  global.fetch.mockReturnValueOnce(
    jsonResponse(400, {
      message:
        'Dữ liệu gửi lên không hợp lệ: Điểm vượt quá giới hạn cho phép theo loại (vi phạm tối đa 50, điểm cộng tối đa 30)',
    }),
  );
  const store = makeStore();
  const result = await store.dispatch(
    conductCatalogApi.endpoints.createConductCatalogItem.initiate({
      label: 'Đi học muộn',
      kind: 'VIOLATION',
      points: 60,
    }),
  );
  expect(result.error.status).toBe(400);
  expect(result.error.data.message).toContain('tối đa 50');
});
