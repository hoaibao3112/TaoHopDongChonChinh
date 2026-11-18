import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, POST } from '@/app/api/quick-notes/route';

describe('Quick Notes API (Upstash Redis)', () => {
  it('xử lý GET ghi chú trả về định dạng chuẩn', async () => {
    const req = new NextRequest('http://localhost:3000/api/quick-notes?scope=cs1');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty('text');
    expect(data).toHaveProperty('updatedAt');
  });

  it('xử lý POST ghi chú thành công và có thời gian cập nhật', async () => {
    const testText = 'Ghi chú thử nghiệm đồng bộ CS1';
    const req = new NextRequest('http://localhost:3000/api/quick-notes', {
      method: 'POST',
      body: JSON.stringify({ scope: 'cs1_test', text: testText }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.text).toBe(testText);
    expect(data.updatedAt).toBeTruthy();
  });
});
