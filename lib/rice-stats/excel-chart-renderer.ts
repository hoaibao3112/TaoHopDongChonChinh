import sharp from 'sharp';
import { buildAllChartSvgSpecs } from './chart-svg-builders';
import { RiceMonthlyStatsResult } from './types';

async function svgToPng(svg: string): Promise<Buffer> {
  return sharp(Buffer.from(svg, 'utf8')).png().toBuffer();
}

export interface RenderedStatsCharts {
  daily: Buffer;
  variety: Buffer;
  buyer: Buffer;
  region: Buffer;
  cost: Buffer;
  facility: Buffer;
  milling: Buffer;
  financial: Buffer;
  contract?: Buffer;
}

export async function renderAllChartsServerFallback(
  stats: RiceMonthlyStatsResult,
  clientChartImages?: Record<string, string>
): Promise<RenderedStatsCharts> {
  const specs = buildAllChartSvgSpecs(stats);
  const keys = Object.keys(specs) as (keyof typeof specs)[];

  const entries = await Promise.all(
    keys
      .filter((k) => Boolean(specs[k]))
      .map(async (k) => {
        const b64 = clientChartImages?.[k];
        if (b64 && typeof b64 === 'string' && b64.length > 50) {
          return [k, Buffer.from(b64, 'base64')] as const;
        }
        return [k, await svgToPng(specs[k]!.svg)] as const;
      })
  );

  return Object.fromEntries(entries) as unknown as RenderedStatsCharts;
}
