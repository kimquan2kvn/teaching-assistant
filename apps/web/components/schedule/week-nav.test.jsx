import { useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WeekNav } from './week-nav';

// Mốc đã kiểm: 2026-01-05 là Thứ Hai, 2026-01-01 là Thứ Năm, 2026-01-18 là Chủ Nhật.

function renderWeekNav({ weekStart = '2026-01-12', today = '2026-01-14' } = {}) {
  const handleChange = jest.fn();
  render(<WeekNav weekStart={weekStart} today={today} onChange={handleChange} />);
  return handleChange;
}

// Bọc state như trang thật: để kiểm cả vòng "chọn tháng/năm → tuần mới → đọc lại tháng/năm".
function StatefulWeekNav({ initialWeekStart, today = '2026-01-14' }) {
  const [weekStart, setWeekStart] = useState(initialWeekStart);
  return <WeekNav weekStart={weekStart} today={today} onChange={setWeekStart} />;
}

describe('nhãn tuần', () => {
  test('hiện khoảng ngày Thứ Hai – Chủ Nhật dạng dd/mm/yyyy', () => {
    renderWeekNav({ weekStart: '2026-01-12' });
    expect(screen.getByText('12/01/2026 – 18/01/2026')).toBeInTheDocument();
  });

  test('tuần vắt qua năm mới hiện đủ cả hai năm', () => {
    renderWeekNav({ weekStart: '2025-12-29' });
    expect(screen.getByText('29/12/2025 – 04/01/2026')).toBeInTheDocument();
  });

  test('weekStart dạng ISO cuối ngày UTC (23:30Z) vẫn ra đúng tuần — getter giờ địa phương UTC+7 sẽ nhảy sang ngày sau', async () => {
    const handleChange = renderWeekNav({ weekStart: '2026-01-12T23:30:00.000Z' });
    expect(screen.getByText('12/01/2026 – 18/01/2026')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Tuần sau' }));
    expect(handleChange).toHaveBeenCalledWith('2026-01-19');
  });

  test('weekStart không phải Thứ Hai (giữa tuần) được chuẩn hóa về Thứ Hai, onChange luôn trả Thứ Hai', async () => {
    const handleChange = renderWeekNav({ weekStart: '2026-01-14' });
    expect(screen.getByText('12/01/2026 – 18/01/2026')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Tuần trước' }));
    expect(handleChange).toHaveBeenCalledWith('2026-01-05');
  });
});

describe('điều hướng tuần', () => {
  test('"Tuần sau" chuyển tới Thứ Hai kế tiếp', async () => {
    const handleChange = renderWeekNav({ weekStart: '2026-01-12' });
    await userEvent.click(screen.getByRole('button', { name: 'Tuần sau' }));
    expect(handleChange).toHaveBeenCalledTimes(1);
    expect(handleChange).toHaveBeenCalledWith('2026-01-19');
  });

  test('"Tuần trước" chuyển về Thứ Hai liền trước', async () => {
    const handleChange = renderWeekNav({ weekStart: '2026-01-12' });
    await userEvent.click(screen.getByRole('button', { name: 'Tuần trước' }));
    expect(handleChange).toHaveBeenCalledTimes(1);
    expect(handleChange).toHaveBeenCalledWith('2026-01-05');
  });

  test('"Tuần sau" qua ranh giới năm: tuần 28/12/2026 → tuần 04/01/2027', async () => {
    const handleChange = renderWeekNav({ weekStart: '2026-12-28' });
    await userEvent.click(screen.getByRole('button', { name: 'Tuần sau' }));
    expect(handleChange).toHaveBeenCalledWith('2027-01-04');
  });

  test('"Tuần này" về tuần chứa hôm nay (hôm nay giữa tuần)', async () => {
    const handleChange = renderWeekNav({ weekStart: '2026-03-02', today: '2026-01-14' });
    await userEvent.click(screen.getByRole('button', { name: 'Tuần này' }));
    expect(handleChange).toHaveBeenCalledTimes(1);
    expect(handleChange).toHaveBeenCalledWith('2026-01-12');
  });

  test('"Tuần này" khi hôm nay là Chủ Nhật vẫn là tuần của Thứ Hai ngay trước nó', async () => {
    const handleChange = renderWeekNav({ weekStart: '2026-03-02', today: '2026-01-18' });
    await userEvent.click(screen.getByRole('button', { name: 'Tuần này' }));
    expect(handleChange).toHaveBeenCalledWith('2026-01-12');
  });

  test('"Tuần này" với today dạng ISO cuối ngày UTC của Chủ Nhật (23:30Z) vẫn ra tuần 12/01 — getter giờ địa phương UTC+7 sẽ nhảy sang tuần sau', async () => {
    const handleChange = renderWeekNav({ weekStart: '2026-03-02', today: '2026-01-18T23:30:00.000Z' });
    await userEvent.click(screen.getByRole('button', { name: 'Tuần này' }));
    expect(handleChange).toHaveBeenCalledWith('2026-01-12');
  });

  test('nút "Tuần này" vẫn bấm được khi đang ở đúng tuần hiện tại (không bị khóa)', async () => {
    const handleChange = renderWeekNav({ weekStart: '2026-01-12', today: '2026-01-14' });
    await userEvent.click(screen.getByRole('button', { name: 'Tuần này' }));
    expect(handleChange).toHaveBeenCalledWith('2026-01-12');
  });
});

describe('bộ lọc tháng/năm', () => {
  test('tuần chứa 01/01 thuộc tháng 1 của năm mới (Thứ Năm của tuần quyết định), không phải tháng 12', () => {
    renderWeekNav({ weekStart: '2025-12-29' });
    expect(screen.getByLabelText('Tháng')).toHaveDisplayValue('Tháng 1');
    expect(screen.getByLabelText('Năm')).toHaveDisplayValue('2026');
  });

  test('ô Tháng có 12 lựa chọn Tháng 1…Tháng 12; ô Năm có đúng 3 năm: năm đang hiển thị −1, 0, +1', () => {
    renderWeekNav({ weekStart: '2025-12-29' });
    const months = within(screen.getByLabelText('Tháng'))
      .getAllByRole('option')
      .map((option) => option.textContent);
    expect(months).toEqual(Array.from({ length: 12 }, (_, index) => `Tháng ${index + 1}`));
    const years = within(screen.getByLabelText('Năm'))
      .getAllByRole('option')
      .map((option) => option.textContent);
    expect(years).toEqual(['2025', '2026', '2027']);
  });

  test('đổi Tháng sang 2 khi đang ở tuần 12/01/2026 → onChange tuần chứa Thứ Năm đầu tiên của tháng 2/2026', async () => {
    const handleChange = renderWeekNav({ weekStart: '2026-01-12' });
    await userEvent.selectOptions(screen.getByLabelText('Tháng'), '2');
    expect(handleChange).toHaveBeenCalledTimes(1);
    expect(handleChange).toHaveBeenCalledWith('2026-02-02');
  });

  test('đổi Năm sang 2027 khi đang ở tuần 12/01/2026 → onChange tuần chứa Thứ Năm đầu tiên của tháng 1/2027', async () => {
    const handleChange = renderWeekNav({ weekStart: '2026-01-12' });
    await userEvent.selectOptions(screen.getByLabelText('Năm'), '2027');
    expect(handleChange).toHaveBeenCalledTimes(1);
    expect(handleChange).toHaveBeenCalledWith('2027-01-04');
  });

  test('chọn Tháng 1 từ tháng 3 rồi đọc lại vẫn là Tháng 1/2026 — không "quay vòng" sang tháng 12', async () => {
    render(<StatefulWeekNav initialWeekStart="2026-03-09" />);
    await userEvent.selectOptions(screen.getByLabelText('Tháng'), '1');
    expect(screen.getByLabelText('Tháng')).toHaveDisplayValue('Tháng 1');
    expect(screen.getByLabelText('Năm')).toHaveDisplayValue('2026');
    expect(screen.getByText('29/12/2025 – 04/01/2026')).toBeInTheDocument();
  });

  test('chọn lần lượt cả 12 tháng: ô Tháng luôn đọc lại đúng tháng vừa chọn và ô Năm giữ nguyên 2026', async () => {
    render(<StatefulWeekNav initialWeekStart="2026-03-09" />);
    for (let month = 1; month <= 12; month += 1) {
      await userEvent.selectOptions(screen.getByLabelText('Tháng'), String(month));
      expect(screen.getByLabelText('Tháng')).toHaveDisplayValue(`Tháng ${month}`);
      expect(screen.getByLabelText('Năm')).toHaveDisplayValue('2026');
    }
  });

  test('chọn Năm 2027 rồi đọc lại: Tháng 1/2027 và 3 năm lựa chọn dịch theo năm mới', async () => {
    render(<StatefulWeekNav initialWeekStart="2026-01-12" />);
    await userEvent.selectOptions(screen.getByLabelText('Năm'), '2027');
    expect(screen.getByLabelText('Tháng')).toHaveDisplayValue('Tháng 1');
    expect(screen.getByLabelText('Năm')).toHaveDisplayValue('2027');
    expect(screen.getByText('04/01/2027 – 10/01/2027')).toBeInTheDocument();
    const years = within(screen.getByLabelText('Năm'))
      .getAllByRole('option')
      .map((option) => option.textContent);
    expect(years).toEqual(['2026', '2027', '2028']);
  });

  test('"Tuần sau" rồi "Tuần trước" qua tháng giữ bộ lọc đồng bộ với nhãn tuần', async () => {
    render(<StatefulWeekNav initialWeekStart="2026-01-26" />);
    await userEvent.click(screen.getByRole('button', { name: 'Tuần sau' }));
    expect(screen.getByText('02/02/2026 – 08/02/2026')).toBeInTheDocument();
    expect(screen.getByLabelText('Tháng')).toHaveDisplayValue('Tháng 2');
    await userEvent.click(screen.getByRole('button', { name: 'Tuần trước' }));
    expect(screen.getByText('26/01/2026 – 01/02/2026')).toBeInTheDocument();
    expect(screen.getByLabelText('Tháng')).toHaveDisplayValue('Tháng 1');
  });
});
