import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, POST } from '@/app/api/quick-notes/route';
import { SESSION_COOKIE_NAME } from '@/lib/auth';

describe('Quick Notes API (Upstash Redis)', () => {
  it('từ chối truy cập 401 khi chưa đăng nhập (Bảo mật H1)', async () => {
    const reqGet = new NextRequest('http://localhost:3000/api/quick-notes?scope=cs1');
    const resGet = await GET(reqGet);
    expect(resGet.status).toBe(401);

    const reqPost = new NextRequest('http://localhost:3000/api/quick-notes', {
      method: 'POST',
      body: JSON.stringify({ scope: 'cs1', text: 'test' }),
    });
    const resPost = await POST(reqPost);
    expect(resPost.status).toBe(401);
  });

  it('xử lý GET ghi chú trả về định dạng chuẩn khi đã đăng nhập', async () => {
    const req = new NextRequest('http://localhost:3000/api/quick-notes?scope=cs1', {
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=authenticated`,
      },
    });
    const res = await GET(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty('text');
    expect(data).toHaveProperty('updatedAt');
  });

  it('xử lý POST ghi chú thành công và có thời gian cập nhật khi đã đăng nhập', async () => {
    const testText = 'Ghi chú thử nghiệm đồng bộ CS1';
    const req = new NextRequest('http://localhost:3000/api/quick-notes', {
      method: 'POST',
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=authenticated`,
      },
      body: JSON.stringify({ scope: 'cs1', text: testText }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.text).toBe(testText);
    expect(data.updatedAt).toBeTruthy();
  });
});
