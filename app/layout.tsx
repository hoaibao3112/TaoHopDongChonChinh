import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Hệ Thống Nội Bộ - Công ty TNHH XNK Chơn Chính',
  description: 'Hệ thống quản lý và điều hành nội bộ - Công ty TNHH XNK Chơn Chính',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/icon.png', type: 'image/png', sizes: '192x192' },
      { url: '/logo.png', type: 'image/png' },
    ],
    shortcut: '/favicon.ico',
    apple: '/icon.png',
  },
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
