import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'UniStudy · 大学学习工作台',
  description: '课程资料、知识问答、作业日历和掌握度练习。单用户本地学习平台。',
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
