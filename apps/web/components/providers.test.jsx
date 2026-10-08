import { render } from '@testing-library/react';
import { useStore } from 'react-redux';
import { Providers } from './providers';

function StoreProbe({ onStore }) {
  const store = useStore();
  onStore(store);
  return null;
}

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
