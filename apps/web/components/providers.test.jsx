import { render, waitFor } from '@testing-library/react';
import { useStore } from 'react-redux';
import { Providers } from './providers';

function StoreProbe({ onStore }) {
  const store = useStore();
  onStore(store);
  return null;
}

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
  global.fetch = jest.fn().mockReturnValue(jsonResponse(401, {}));
});

test('mỗi lần Providers được dựng (mount) tạo store riêng, không dùng chung 1 instance giữa các request SSR', () => {
  const stores = [];

  render(
    <Providers>
      <StoreProbe onStore={(s) => stores.push(s)} />
    </Providers>,
  );
  render(
    <Providers>
      <StoreProbe onStore={(s) => stores.push(s)} />
    </Providers>,
  );

  expect(stores).toHaveLength(2);
  expect(stores[0]).not.toBe(stores[1]);
});

test('lúc mount, gọi /auth/refresh rồi /auth/me để khôi phục phiên nếu cookie còn hạn', async () => {
  global.fetch = jest
    .fn()
    .mockReturnValueOnce(jsonResponse(200, { accessToken: 'restored-token' }))
    .mockReturnValueOnce(jsonResponse(200, { id: '1', username: 'gv1', role: 'TEACHER' }));

  let capturedStore;
  render(
    <Providers>
      <StoreProbe onStore={(s) => (capturedStore = s)} />
    </Providers>,
  );

  await waitFor(() => {
    expect(capturedStore.getState().auth.user).toEqual({ id: '1', username: 'gv1', role: 'TEACHER' });
  });
  expect(capturedStore.getState().auth.accessToken).toBe('restored-token');
});

test('refresh thất bại lúc mount thì auth vẫn giữ null, không gọi /auth/me', async () => {
  global.fetch = jest.fn().mockReturnValueOnce(jsonResponse(401, {}));

  let capturedStore;
  render(
    <Providers>
      <StoreProbe onStore={(s) => (capturedStore = s)} />
    </Providers>,
  );

  await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
  expect(capturedStore.getState().auth).toEqual({ user: null, accessToken: null });
});
