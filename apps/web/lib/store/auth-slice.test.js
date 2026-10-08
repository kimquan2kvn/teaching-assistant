import authReducer, { setCredentials, clearCredentials, selectCurrentUser } from './auth-slice';

const initialState = { user: null, accessToken: null };

test('setCredentials lưu đúng user và accessToken', () => {
  const user = { id: '1', username: 'gv1', fullName: 'Giáo viên 1', role: 'TEACHER' };
  const state = authReducer(initialState, setCredentials({ user, accessToken: 'abc' }));
  expect(state).toEqual({ user, accessToken: 'abc' });
});

test('clearCredentials reset về initial state', () => {
  const dirty = { user: { id: '1' }, accessToken: 'abc' };
  expect(authReducer(dirty, clearCredentials())).toEqual(initialState);
});

test('selectCurrentUser đọc đúng state.auth.user', () => {
  const user = { id: '1', role: 'ADMIN' };
  expect(selectCurrentUser({ auth: { user, accessToken: 'x' } })).toBe(user);
});
