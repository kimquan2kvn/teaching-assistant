'use client';

import { useEffect, useRef } from 'react';
import { Provider } from 'react-redux';
import { makeStore } from '@/lib/store/store';
import { apiSlice } from '@/lib/store/api-slice';
import { setCredentials } from '@/lib/store/auth-slice';

export function Providers({ children }) {
  const storeRef = useRef(null);
  if (!storeRef.current) {
    storeRef.current = makeStore();
  }

  useEffect(() => {
    const store = storeRef.current;
    store.dispatch(apiSlice.endpoints.refresh.initiate()).then((refreshResult) => {
      if ('data' in refreshResult && refreshResult.data) {
        store.dispatch(apiSlice.endpoints.me.initiate()).then((meResult) => {
          if ('data' in meResult && meResult.data) {
            store.dispatch(setCredentials({ user: meResult.data, accessToken: refreshResult.data.accessToken }));
          }
        });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <Provider store={storeRef.current}>{children}</Provider>;
}
