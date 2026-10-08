describe('DatabaseModule', () => {
  afterEach(() => {
    jest.resetModules();
    jest.restoreAllMocks();
  });

  it('gọi MongooseModule.forRoot với lazyConnection: true để app không crash khi Mongo chưa sẵn sàng lúc khởi động', () => {
    jest.resetModules();
    jest.doMock('@nestjs/mongoose', () => {
      const actual = jest.requireActual('@nestjs/mongoose');
      jest.spyOn(actual.MongooseModule, 'forRoot');
      return actual;
    });

    // eslint-disable-next-line @typescript-eslint/no-require-imports -- must re-require after jest.doMock, which needs a fresh CommonJS load, not a static import
    require('./database.module');
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- same reason
    const { MongooseModule } = require('@nestjs/mongoose');

    expect(MongooseModule.forRoot).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ lazyConnection: true }),
    );
  });
});
