import { spawn } from 'child_process';
import http from 'http';

console.log('--- KHỞI ĐỘNG SERVER VÀ CHẠY E2E HTTP TEST ---');

const server = spawn('pnpm', ['start'], {
  cwd: process.cwd(),
  shell: true,
  env: { ...process.env, PORT: '3005' },
});

server.stdout.on('data', (d) => process.stdout.write(`[SERVER] ${d}`));
server.stderr.on('data', (d) => process.stderr.write(`[SERVER-ERR] ${d}`));

// Chờ server sẵn sàng
await new Promise((resolve) => setTimeout(resolve, 3500));

try {
  // 1. Test unauthenticated request
  const unauthRes = await fetch('http://localhost:3005/api/contracts/export', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  console.log('1. Chưa đăng nhập gọi /api/contracts/export: Status =', unauthRes.status);
  if (unauthRes.status !== 401) throw new Error('Yêu cầu chưa đăng nhập phải trả 401');

  // 2. Test login với mật khẩu sai
  const badLoginRes = await fetch('http://localhost:3005/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'matkhausai' }),
  });
  console.log('2. Đăng nhập sai mật khẩu: Status =', badLoginRes.status);
  if (badLoginRes.status !== 401) throw new Error('Mật khẩu sai phải trả 401');

  // 3. Test login với mật khẩu đúng (trong .env.local: matkhau123)
  const goodLoginRes = await fetch('http://localhost:3005/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'matkhau123' }),
  });
  console.log('3. Đăng nhập đúng mật khẩu: Status =', goodLoginRes.status);
  if (goodLoginRes.status !== 200) throw new Error('Đăng nhập đúng phải trả 200');

  const setCookie = goodLoginRes.headers.get('set-cookie');
  console.log('   Set-Cookie nhận được:', setCookie?.split(';')[0]);

  // 4. Test xuất hợp đồng 2 mặt hàng với Cookie phiên
  const exportPayload = {
    contractNo: '250926/CC-TP',
    signDate: '2026-09-25',
    deliveryDate: '2026-10-25',
    bName: 'CÔNG TY TNHH SẢN XUẤT - THƯƠNG MẠI - DỊCH VỤ THÀNH PHÁT TG',
    bAddress: '135 Trần Ngọc Giải, Phường Thới Sơn, Tỉnh Đồng Tháp',
    bPhone: '0902589705',
    bMst: '1201695642',
    bRepresentative: 'MAI TRẦN ĐĂNG GIANG',
    bTitle: 'Phó Giám đốc',
    deliveryLocation: 'Giao hàng tại kho Bên A.',
    paymentMethod: 'Chuyển khoản 100% giá trị đơn hàng.',
    items: [
      { name: 'Trấu xay', quantity: 200000, unit: 'kg', unitPrice: 1800 },
      { name: 'Cám mịn', quantity: 50000, unit: 'kg', unitPrice: 3200 },
    ],
  };

  const exportRes = await fetch('http://localhost:3005/api/contracts/export', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: setCookie ? setCookie.split(';')[0] : '',
    },
    body: JSON.stringify(exportPayload),
  });

  console.log('4. Xuất hợp đồng: Status =', exportRes.status);
  console.log('   Content-Type:', exportRes.headers.get('content-type'));
  console.log('   Content-Disposition:', exportRes.headers.get('content-disposition'));

  if (exportRes.status !== 200) {
    const errorText = await exportRes.text();
    throw new Error(`Xuất hợp đồng thất bại: ${errorText}`);
  }

  const arrayBuffer = await exportRes.arrayBuffer();
  console.log('   Kích thước file tải về:', arrayBuffer.byteLength, 'bytes');

  console.log('\n🎉 E2E TEST HOÀN TOÀN THÀNH CÔNG VÀ CHÍNH XÁC!');
} finally {
  server.kill('SIGINT');
}

