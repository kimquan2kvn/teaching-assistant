import fs from 'fs';
import path from 'path';
import tailwindConfig from '../tailwind.config';

const WEB_ROOT = path.resolve(__dirname, '..');
const colors = tailwindConfig.theme.extend.colors;

// Màu shadcn khai báo lồng nhau ({ DEFAULT, foreground }) — làm phẳng về dạng tên -> giá trị để canh chung.
const flatColors = Object.fromEntries(
  Object.entries(colors).flatMap(([name, value]) =>
    typeof value === 'string'
      ? [[name, value]]
      : Object.entries(value).map(([shade, shadeValue]) => [shade === 'DEFAULT' ? name : `${name}-${shade}`, shadeValue]),
  ),
);

function readCssVars() {
  const globalsCss = fs.readFileSync(path.join(WEB_ROOT, 'app/globals.css'), 'utf8');
  return Object.fromEntries([...globalsCss.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((match) => [match[1], match[2].trim()]));
}

function hexToRgbChannels(hex) {
  const value = hex.replace('#', '');
  return [0, 2, 4].map((offset) => parseInt(value.slice(offset, offset + 2), 16)).join(' ');
}

// Tailwind 3.4 không sinh CSS cho `bg-brand/10` khi `brand` là `var(--brand)` (không parse được thành rgb để pha
// độ mờ) — class nằm trong DOM nhưng không có style. Màu `black` là hex mặc định nên `bg-black/5` vẫn hợp lệ.
const OPACITY_MODIFIER_ON_TOKEN = /\b(bg|text|border|ring)-(brand|success|danger|fg|border|sidebar-[a-z]+)(-[a-z]+)?\/\d+/;

function listSourceFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return listSourceFiles(fullPath);
    const isSource = /\.(js|jsx)$/.test(entry.name) && !/\.test\.(js|jsx)$/.test(entry.name);
    return isSource ? [fullPath] : [];
  });
}

test('mọi màu trong tailwind.config.js trỏ tới biến CSS đã khai báo trong globals.css', () => {
  const declaredVars = new Set(Object.keys(readCssVars()));

  const undeclared = Object.entries(flatColors).flatMap(([name, value]) => {
    const referencedVar = String(value).match(/var\((--[\w-]+)\)/)?.[1];
    return referencedVar && !declaredVars.has(referencedVar) ? [`${name} -> ${referencedVar}`] : [];
  });

  expect(undeclared).toEqual([]);
});

test.each(['brand-soft', 'success-soft', 'danger-soft'])('tailwind.config.js có màu nhạt %s', (name) => {
  expect(colors[name]).toBe(`var(--${name})`);
});

test('không còn modifier độ mờ trên màu token trong app/ và components/', () => {
  const sourceFiles = ['app', 'components'].flatMap((dir) => listSourceFiles(path.join(WEB_ROOT, dir)));

  const offenders = sourceFiles.flatMap((file) =>
    fs
      .readFileSync(file, 'utf8')
      .split('\n')
      .flatMap((line, index) => {
        const match = line.match(OPACITY_MODIFIER_ON_TOKEN);
        return match ? [`${path.relative(WEB_ROOT, file)}:${index + 1} ${match[0]}`] : [];
      }),
  );

  expect(offenders).toEqual([]);
});

test('token shadcn (kênh RGB) khớp bảng màu Binance, không lệch khỏi token hex cũ', () => {
  const vars = readCssVars();
  const expectedPairs = {
    '--primary': '--brand',
    '--ring': '--brand',
    '--accent': '--brand-soft',
    '--destructive': '--danger',
    '--border': null,
    '--foreground': '--fg',
    '--muted-foreground': '--fg-muted',
  };

  const mismatches = Object.entries(expectedPairs).flatMap(([shadcnVar, legacyVar]) => {
    const expected = legacyVar ? hexToRgbChannels(vars[legacyVar]) : hexToRgbChannels('#eaecef');
    return vars[shadcnVar] === expected ? [] : [`${shadcnVar}: ${vars[shadcnVar]} != ${expected}`];
  });

  expect(mismatches).toEqual([]);
  expect(vars['--background']).toBe('255 255 255');
  expect(vars['--primary-foreground']).toBe('0 0 0');
});

test('mọi token shadcn dùng pha độ mờ qua <alpha-value> và trỏ tới biến đã khai báo', () => {
  const vars = readCssVars();
  const shadcnTokens = ['background', 'foreground', 'primary', 'primary-foreground', 'secondary', 'secondary-foreground',
    'muted', 'muted-foreground', 'accent', 'accent-foreground', 'destructive', 'destructive-foreground', 'border', 'input',
    'ring', 'card', 'card-foreground', 'popover', 'popover-foreground'];

  const problems = shadcnTokens.flatMap((name) => {
    const value = flatColors[name];
    if (!value) return [`${name}: thiếu trong tailwind.config.js`];
    if (!value.includes('<alpha-value>')) return [`${name}: thiếu <alpha-value>`];
    const referenced = value.match(/var\((--[\w-]+)\)/)?.[1];
    return vars[referenced] && /^\d+ \d+ \d+$/.test(vars[referenced]) ? [] : [`${name}: ${referenced} không phải kênh RGB`];
  });

  expect(problems).toEqual([]);
  expect(vars['--radius']).toBeDefined();
});
