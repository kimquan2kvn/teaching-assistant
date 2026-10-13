// Màu ô theo môn cho lưới TKB và sổ báo giảng.
//
// Tailwind chỉ quét ./app/** và ./components/** (xem tailwind.config.js) và chỉ nhận class viết NGUYÊN VĂN, không
// ghép chuỗi: bản đồ này phải nằm ở đây và mỗi class phải là một literal đầy đủ.
//
// Tránh hue đỏ/xanh lá/vàng vì đã mang nghĩa riêng (vi phạm/vắng, có mặt/điểm cộng, nút chính). 13 môn nhưng chỉ có
// 11 hue nên 2 hue (sky, orange) dùng lần hai ở độ đậm 300 cho Thể dục và GDQP-AN; màu xám (gray) dành riêng cho
// môn chưa có trong bảng. Màu chỉ là gợi nhớ, tên môn luôn hiện kèm trong ô nên không phải kênh thông tin duy nhất.
const NEUTRAL_COLOR = { cell: 'bg-gray-100 border-gray-300 text-gray-700', dot: 'bg-gray-400' };

// Map thay vì object literal: tra 'constructor' hay '__proto__' phải ra màu trung tính, không ra thuộc tính của Object.
const SUBJECT_COLORS = new Map([
  ['Toán', { cell: 'bg-blue-100 border-blue-300 text-blue-900', dot: 'bg-blue-500' }],
  ['Ngữ văn', { cell: 'bg-violet-100 border-violet-300 text-violet-900', dot: 'bg-violet-500' }],
  ['Tiếng Anh', { cell: 'bg-sky-100 border-sky-300 text-sky-900', dot: 'bg-sky-500' }],
  ['Vật lý', { cell: 'bg-indigo-100 border-indigo-300 text-indigo-900', dot: 'bg-indigo-500' }],
  ['Hóa học', { cell: 'bg-teal-100 border-teal-300 text-teal-900', dot: 'bg-teal-500' }],
  ['Sinh học', { cell: 'bg-orange-100 border-orange-300 text-orange-900', dot: 'bg-orange-500' }],
  ['Lịch sử', { cell: 'bg-stone-100 border-stone-300 text-stone-800', dot: 'bg-stone-500' }],
  ['Địa lý', { cell: 'bg-cyan-100 border-cyan-300 text-cyan-900', dot: 'bg-cyan-500' }],
  ['GDCD', { cell: 'bg-purple-100 border-purple-300 text-purple-900', dot: 'bg-purple-500' }],
  ['Tin học', { cell: 'bg-fuchsia-100 border-fuchsia-300 text-fuchsia-900', dot: 'bg-fuchsia-500' }],
  ['Công nghệ', { cell: 'bg-slate-100 border-slate-300 text-slate-800', dot: 'bg-slate-500' }],
  ['Thể dục', { cell: 'bg-sky-300 border-sky-500 text-sky-950', dot: 'bg-sky-700' }],
  ['GDQP-AN', { cell: 'bg-orange-300 border-orange-500 text-orange-950', dot: 'bg-orange-700' }],
]);

// cell: nền nhạt + viền + chữ đậm cho khối tiết/buổi học; dot: chấm màu đặc nhận diện môn.
export function getSubjectColor(subject) {
  return SUBJECT_COLORS.get(subject) ?? NEUTRAL_COLOR;
}
