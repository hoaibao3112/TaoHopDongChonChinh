import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Phần Mềm Tạo Hợp Đồng Mua Bán Hàng Hóa - Công ty TNHH XNK Chơn Chính',
  description: 'Hệ thống tạo và xuất file hợp đồng mua bán hàng hóa (.docx) tự động',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi">
      <body className="antialiased min-h-screen bg-gray-50 text-gray-900 font-sans">
        {children}
      </body>
    </html>
  );
}
