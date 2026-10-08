import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import authReducer from '@/lib/store/auth-slice';
import { apiSlice } from '@/lib/store/api-slice';
import AppLayout from './layout';

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }), usePathname: () => '/' }));

function renderAppLayout() {
  const store = configureStore({
    reducer: { auth: authReducer, [apiSlice.reducerPath]: apiSlice.reducer },
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(apiSlice.middleware),
  });
  return render(
    <Provider store={store}>
      <AppLayout>
        <p>Nội dung trang</p>
      </AppLayout>
    </Provider>,
  );
}

test('render khung dashboard (sidebar + header) bao quanh nội dung trang', () => {
  renderAppLayout();
  expect(screen.getByText('Bảng điều khiển')).toBeInTheDocument();
  expect(screen.getByText('Nội dung trang')).toBeInTheDocument();
});
