// App chỉ dùng tại Việt Nam và các test "hôm nay"/ngày mặc định giả định giờ VN (UTC+7). CI chạy ubuntu (UTC)
// nên phải ghim múi giờ ở đây — đặt trước khi jest sinh worker để worker thừa hưởng (canh bởi lib/timezone.test.js).
process.env.TZ = 'Asia/Ho_Chi_Minh';

const nextJest = require('next/jest');

const createJestConfig = nextJest({ dir: './' });

module.exports = createJestConfig({
  testEnvironment: 'jest-environment-jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
});
