/**
 * @jest-environment node
 */
import { makeStore } from './store';

test('store khởi tạo đúng 2 slice reducer: auth và api', () => {
  const store = makeStore();
  const state = store.getState();
  expect(state.auth).toEqual({ user: null, accessToken: null });
  expect(state).toHaveProperty('api');
});
