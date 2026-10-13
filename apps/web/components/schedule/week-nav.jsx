'use client';

import { useId } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { getWeekStart, monthYearOfWeek, shiftDateOnly, weekStartForMonth } from '@/lib/schedule';
import { formatDate } from '@/lib/utils';

const MONTHS = Array.from({ length: 12 }, (_, index) => index + 1);

// weekStart được chuẩn hóa về Thứ Hai ngay tại đây (chấp nhận cả ISO của backend) để onChange luôn phát ra Thứ Hai,
// đúng giá trị mà mọi API tuần của Phase 3 nhận. Bộ lọc tháng/năm dùng cùng quy tắc "tuần thuộc tháng chứa Thứ Năm"
// với weekStartForMonth nên chọn tháng rồi đọc lại ra đúng tháng đó.
export function WeekNav({ weekStart, today, onChange }) {
  const filterId = useId();
  const monday = getWeekStart(weekStart);
  const { month, year } = monthYearOfWeek(monday);
  const years = [year - 1, year, year + 1];

  function handlePreviousWeek() {
    onChange(shiftDateOnly(monday, -7));
  }

  function handleNextWeek() {
    onChange(shiftDateOnly(monday, 7));
  }

  function handleThisWeek() {
    onChange(getWeekStart(today));
  }

  function handleMonthChange(event) {
    onChange(weekStartForMonth(year, Number(event.target.value)));
  }

  function handleYearChange(event) {
    onChange(weekStartForMonth(Number(event.target.value), month));
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" size="icon" aria-label="Tuần trước" onClick={handlePreviousWeek}>
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </Button>
        <Button type="button" variant="outline" size="icon" aria-label="Tuần sau" onClick={handleNextWeek}>
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </Button>
        <Button type="button" variant="outline" onClick={handleThisWeek}>
          Tuần này
        </Button>
      </div>

      <p aria-live="polite" className="flex h-10 items-center font-mono text-sm font-medium">
        {`${formatDate(monday)} – ${formatDate(shiftDateOnly(monday, 6))}`}
      </p>

      <div className="w-28">
        <Label htmlFor={`${filterId}-month`}>Tháng</Label>
        <Select id={`${filterId}-month`} value={month} onChange={handleMonthChange}>
          {MONTHS.map((value) => (
            <option key={value} value={value}>
              {`Tháng ${value}`}
            </option>
          ))}
        </Select>
      </div>

      <div className="w-24">
        <Label htmlFor={`${filterId}-year`}>Năm</Label>
        <Select id={`${filterId}-year`} value={year} onChange={handleYearChange}>
          {years.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </Select>
      </div>
    </div>
  );
}
