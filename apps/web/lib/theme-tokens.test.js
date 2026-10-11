import fs from 'fs';
import path from 'path';
import tailwindConfig from '../tailwind.config';

const WEB_ROOT = path.resolve(__dirname, '..');
const colors = tailwindConfig.theme.extend.colors;

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
  const globalsCss = fs.readFileSync(path.join(WEB_ROOT, 'app/globals.css'), 'utf8');
  const declaredVars = new Set([...globalsCss.matchAll(/(--[\w-]+)\s*:/g)].map((match) => match[1]));

  const undeclared = Object.entries(colors).flatMap(([name, value]) => {
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
