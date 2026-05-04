import { CanvasRenderingTarget2D } from 'fancy-canvas';
import {
  IChartApiBase,
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesPrimitive,
  SeriesAttachedParameter,
  Time,
  UTCTimestamp,
} from 'lightweight-charts';

interface VerticalLine {
  x: number;
  color: string;
}

class SessionMarkersRenderer implements IPrimitivePaneRenderer {
  private _lines: VerticalLine[] = [];

  update(lines: VerticalLine[]): void {
    this._lines = lines;
  }

  draw(): void {}

  drawBackground(target: CanvasRenderingTarget2D): void {
    if (this._lines.length === 0) return;
    target.useBitmapCoordinateSpace(({ context, bitmapSize, horizontalPixelRatio }) => {
      context.lineWidth = 1;
      for (const { x, color } of this._lines) {
        context.strokeStyle = color;
        context.beginPath();
        context.moveTo(Math.round(x * horizontalPixelRatio), 0);
        context.lineTo(Math.round(x * horizontalPixelRatio), bitmapSize.height);
        context.stroke();
      }
    });
  }
}

class SessionMarkersPaneView implements IPrimitivePaneView {
  private readonly _renderer = new SessionMarkersRenderer();

  update(lines: VerticalLine[]): void {
    this._renderer.update(lines);
  }

  renderer(): IPrimitivePaneRenderer {
    return this._renderer;
  }
}

export class SessionMarkersPlugin implements ISeriesPrimitive<Time> {
  private _chart?: IChartApiBase<Time>;
  private readonly _paneView = new SessionMarkersPaneView();
  private readonly _opens:  UTCTimestamp[];
  private readonly _closes: UTCTimestamp[];

  constructor(
    fromMs?: number,
    toMs?: number,
    private readonly _openColor  = 'rgba(38, 166, 154, 0.5)',
    private readonly _closeColor = 'rgba(239, 83, 80, 0.5)',
  ) {
    const { opens, closes } = generateNyseMarkers(fromMs, toMs);
    this._opens  = opens;
    this._closes = closes;
  }

  attached(params: SeriesAttachedParameter<Time>): void {
    this._chart = params.chart;
  }

  detached(): void {
    this._chart = undefined;
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return [this._paneView];
  }

  updateAllViews(): void {
    if (!this._chart) return;
    const timeScale = this._chart.timeScale();
    const lines: VerticalLine[] = [];

    for (const t of this._opens) {
      const x = timeScale.timeToCoordinate(t);
      if (x !== null) lines.push({ x, color: this._openColor });
    }
    for (const t of this._closes) {
      const x = timeScale.timeToCoordinate(t);
      if (x !== null) lines.push({ x, color: this._closeColor });
    }

    this._paneView.update(lines);
  }
}

function generateNyseMarkers(
  fromMs?: number,
  toMs?: number,
): { opens: UTCTimestamp[]; closes: UTCTimestamp[] } {
  const opens:  UTCTimestamp[] = [];
  const closes: UTCTimestamp[] = [];
  const msPerDay = 86_400_000;
  const startMs = fromMs ?? (Date.now() - 90 * msPerDay);
  const endMs   = toMs   ?? (Date.now() + 10 * msPerDay);
  const weekdayFmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short' });
  const dateFmt    = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' });

  for (let ms = startMs; ms <= endMs; ms += msPerDay) {
    const d = new Date(ms);
    if (weekdayFmt.format(d) === 'Sat' || weekdayFmt.format(d) === 'Sun') continue;
    const nyDate = dateFmt.format(d);
    opens.push(toUtcTimestamp(nyTimeToUtcMs(nyDate, 9, 30)));
    closes.push(toUtcTimestamp(nyTimeToUtcMs(nyDate, 16, 0)));
  }
  return { opens, closes };
}

function nyTimeToUtcMs(nyDateStr: string, hours: number, minutes: number): number {
  const [y, m, d] = nyDateStr.split('-').map(Number);
  const approxUtcMs = Date.UTC(y, m - 1, d, hours + 5, minutes);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  }).formatToParts(new Date(approxUtcMs));
  const actualHour = parseInt(parts.find(p => p.type === 'hour')!.value) % 24;
  const actualMin  = parseInt(parts.find(p => p.type === 'minute')!.value);
  return approxUtcMs + ((hours - actualHour) * 60 + (minutes - actualMin)) * 60_000;
}

function toUtcTimestamp(ms: number): UTCTimestamp {
  return Math.floor(ms / 1000) as UTCTimestamp;
}
