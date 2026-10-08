import { configureStore } from '@reduxjs/toolkit';
import authReducer from './auth-slice';
import { apiSlice } from './api-slice';

export function makeStore() {
  return configureStore({
    reducer: { auth: authReducer, [apiSlice.reducerPath]: apiSlice.reducer },
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(apiSlice.middleware),
  });
}

export const store = makeStore();
