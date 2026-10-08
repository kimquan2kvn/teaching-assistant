import { createSlice } from '@reduxjs/toolkit';

const initialState = { user: null, accessToken: null };

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {},
});

export default authSlice.reducer;
