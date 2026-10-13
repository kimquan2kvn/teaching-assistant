import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './tabs';

function renderTabs() {
  return render(
    <Tabs defaultValue="week">
      <TabsList>
        <TabsTrigger value="week">Theo tuần</TabsTrigger>
        <TabsTrigger value="class">Theo lớp</TabsTrigger>
      </TabsList>
      <TabsContent value="week">Nội dung tuần</TabsContent>
      <TabsContent value="class">Nội dung lớp</TabsContent>
    </Tabs>,
  );
}

test('chỉ hiện nội dung của tab đang chọn và đánh dấu aria-selected', () => {
  renderTabs();
  expect(screen.getByRole('tab', { name: 'Theo tuần' })).toHaveAttribute('aria-selected', 'true');
  expect(screen.getByText('Nội dung tuần')).toBeInTheDocument();
  expect(screen.queryByText('Nội dung lớp')).not.toBeInTheDocument();
});

test('bấm tab khác chuyển nội dung', async () => {
  renderTabs();
  await userEvent.click(screen.getByRole('tab', { name: 'Theo lớp' }));
  expect(screen.getByText('Nội dung lớp')).toBeInTheDocument();
  expect(screen.queryByText('Nội dung tuần')).not.toBeInTheDocument();
});
