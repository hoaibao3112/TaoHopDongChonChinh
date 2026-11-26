'use client';

import { RiceMonthlyStatsResult } from './types';
import { buildAllChartSvgSpecs } from './chart-svg-builders';

function renderSvgToPngBase64(svg: string, width: number, height: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const scale = 2; // 2x HiDPI để chữ tiếng Việt sắc nét khi phóng to trong Excel
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = width * scale;
        canvas.height = height * scale;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas 2D unavailable'));
          return;
        }
        ctx.scale(scale, scale);
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/png');
        resolve(dataUrl.replace(/^data:image\/png;base64,/, ''));
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = () => reject(new Error('Failed to load SVG into Image'));
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

export async function renderAllStatsChartsClient(
  stats: RiceMonthlyStatsResult
): Promise<Record<string, string>> {
  const specs = buildAllChartSvgSpecs(stats);
  const entries = await Promise.all(
    Object.entries(specs).map(async ([key, spec]) => {
      const b64 = await renderSvgToPngBase64(spec.svg, spec.width, spec.height);
      return [key, b64] as const;
    })
  );
  return Object.fromEntries(entries);
}
