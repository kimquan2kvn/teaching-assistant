import '@testing-library/jest-dom';

// jsdom implements `Headers` but not `Request`/`Response`/`fetch` — RTK Query's `fetchBaseQuery` constructs a
// real `new Request(url, config)` internally even when `global.fetch` itself is mocked in tests, so without this
// polyfill any test that dispatches a real `apiSlice` endpoint crashes with "Request is not defined" regardless
// of mocking. Minimal: only the `.url` property is ever read by this project's tests/code.
if (typeof global.Request === 'undefined') {
  global.Request = class Request {
    constructor(input, init = {}) {
      this.url = typeof input === 'string' ? input : input.url;
      Object.assign(this, init);
    }
  };
}
