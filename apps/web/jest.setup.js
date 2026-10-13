import '@testing-library/jest-dom';

// jsdom implements `Headers` but not `Request`/`Response`/`fetch` — RTK Query's `fetchBaseQuery` constructs a
// real `new Request(url, config)` internally even when `global.fetch` itself is mocked in tests, so without this
// polyfill any test that dispatches a real `apiSlice` endpoint crashes with "Request is not defined" regardless
// of mocking. Minimal: only the `.url` property is ever read by this project's tests/code.
if (typeof global.Request === 'undefined') {
  global.Request = class Request {
    constructor(input, init = {}) {
      this._url = typeof input === 'string' ? input : input.url;
      this.method = init.method || 'GET';
      this.headers = init.headers instanceof Headers ? init.headers : new Headers(init.headers);
      this.body = init.body;
    }
    // A getter, not a plain property: Next's `NextRequest extends Request` declares its own read-only `url`
    // getter on the subclass prototype, so assigning `this.url = ...` here (when `this` is a `NextRequest`
    // instance) would hit that accessor and throw "Cannot set property url which has only a getter".
    get url() {
      return this._url;
    }
  };
}

// Same gap for `Response` — needed by `next/server`'s `NextResponse` (`class NextResponse extends Response`),
// which throws a bare `ReferenceError` at import time in jsdom without this. Keeps `headers` as the exact
// instance passed in (not a copy): Next's `NextResponse` constructor captures `this.headers` and mutates it
// afterwards (e.g. setting `Location`/cookie headers), so a copy would silently decouple the two.
if (typeof global.Response === 'undefined') {
  global.Response = class Response {
    constructor(body, init = {}) {
      this.body = body;
      this.status = init.status ?? 200;
      this.statusText = init.statusText ?? '';
      this.headers = init.headers instanceof Headers ? init.headers : new Headers(init.headers);
      this.ok = this.status >= 200 && this.status < 300;
    }
  };
}

// jsdom không có `ResizeObserver`, mà Radix (Checkbox trong <form>, Select, Popper...) dựng nó khi mount. Bản rỗng
// là đủ: test không đo kích thước thật.
if (typeof global.ResizeObserver === 'undefined') {
  global.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
