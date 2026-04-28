import { CanvasRenderingTarget2D } from 'fancy-canvas';
import {
  Coordinate,
  ISeriesApi,
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesPrimitive,
  SeriesAttachedParameter,
  Time,
} from 'lightweight-charts';
import { VolumeProfileLevel } from '../structures/session';

// ─── Render types ────────────────────────────────────────────────────────────

interface RenderBar {
  /** Canvas logical-pixel y of bar centre */
  y: Coordinate;
  /** Canvas logical-pixel height of bar */
  height: number;
  /** Total bar width in logical pixels */
  totalWidth: number;
  /** Buy (green) portion width in logical pixels */
  buyWidth: number;
}

interface RenderData {
  bars:  RenderBar[];
  pocY:  Coordinate | null;
  vahY:  Coordinate | null;
  valY:  Coordinate | null;
}

// ─── Renderer ────────────────────────────────────────────────────────────────

class VolumeProfileRenderer implements IPrimitivePaneRenderer {
  private _data: RenderData = { bars: [], pocY: null, vahY: null, valY: null };

  update(data: RenderData): void {
    this._data = data;
  }

  draw(): void {}

  drawBackground(target: CanvasRenderingTarget2D): void {
    const { bars, pocY, vahY, valY } = this._data;
    if (bars.length === 0) return;

    target.useBitmapCoordinateSpace(({ context, bitmapSize, horizontalPixelRatio, verticalPixelRatio }) => {
      // Volume bars anchored to the right edge (buy = green, sell = red)
      for (const { y, height, totalWidth, buyWidth } of bars) {
        const yPx  = Math.round(y * verticalPixelRatio);
        const hPx  = Math.max(1, Math.round(height    * verticalPixelRatio));
        const tW   = Math.round(totalWidth * horizontalPixelRatio);
        const bW   = Math.round(buyWidth   * horizontalPixelRatio);
        const xR   = bitmapSize.width; // right edge
        const top  = yPx - Math.floor(hPx / 2);

        // Sell (red) — full bar width from right
        context.fillStyle = '#ef5350';
        context.fillRect(xR - tW, top, tW, hPx);
        // Buy (green) — buy portion from right
        context.fillStyle = '#26a69a';
        context.fillRect(xR - bW, top, bW, hPx);
      }

      context.lineWidth = 1;

      // VAH — white solid
      if (vahY !== null) {
        context.strokeStyle = '#ffffff';
        context.setLineDash([]);
        context.beginPath();
        context.moveTo(0, Math.round(vahY * verticalPixelRatio));
        context.lineTo(bitmapSize.width, Math.round(vahY * verticalPixelRatio));
        context.stroke();
      }

      // VAL — white solid
      if (valY !== null) {
        context.strokeStyle = '#ffffff';
        context.setLineDash([]);
        context.beginPath();
        context.moveTo(0, Math.round(valY * verticalPixelRatio));
        context.lineTo(bitmapSize.width, Math.round(valY * verticalPixelRatio));
        context.stroke();
      }

      // POC — amber solid
      if (pocY !== null) {
        context.strokeStyle = '#f59e0b';
        context.setLineDash([]);
        context.beginPath();
        context.moveTo(0, Math.round(pocY * verticalPixelRatio));
        context.lineTo(bitmapSize.width, Math.round(pocY * verticalPixelRatio));
        context.stroke();
      }

      context.setLineDash([]);
    });
  }
}

// ─── Pane view ───────────────────────────────────────────────────────────────

class VolumeProfilePaneView implements IPrimitivePaneView {
  private readonly _renderer = new VolumeProfileRenderer();

  update(data: RenderData): void {
    this._renderer.update(data);
  }

  renderer(): IPrimitivePaneRenderer {
    return this._renderer;
  }
}

// ─── Pre-computed price-space data (stable across zoom/pan) ──────────────────

interface LevelMeta {
  midPrice:      number;
  fromPrice:     number;
  toPrice:       number;
  volumeFraction: number; // 0–1 relative to session max bucket volume
  buyFraction:   number;  // 0–1 relative to that bucket's volume
}

// ─── Plugin ──────────────────────────────────────────────────────────────────

const MAX_BAR_WIDTH_PX = 120; // logical pixels for the widest bar

export class VolumeProfilePlugin implements ISeriesPrimitive<Time> {
  private _series?: ISeriesApi<'Candlestick', Time>;
  private readonly _paneView = new VolumeProfilePaneView();

  // Price-space data (recomputed on setData)
  private _levelMeta: LevelMeta[] = [];
  private _pocPrice:  number | null = null;
  private _vahPrice:  number | null = null;
  private _valPrice:  number | null = null;

  // ─── ISeriesPrimitive ───────────────────────────────────────────────────

  attached(params: SeriesAttachedParameter<Time>): void {
    this._series = params.series as ISeriesApi<'Candlestick', Time>;
  }

  detached(): void {
    this._series = undefined;
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return [this._paneView];
  }

  updateAllViews(): void {
    if (!this._series || this._levelMeta.length === 0) {
      this._paneView.update({ bars: [], pocY: null, vahY: null, valY: null });
      return;
    }

    const bars: RenderBar[] = [];

    for (const { midPrice, fromPrice, toPrice, volumeFraction, buyFraction } of this._levelMeta) {
      const y    = this._series.priceToCoordinate(midPrice);
      const yTop = this._series.priceToCoordinate(toPrice);
      const yBot = this._series.priceToCoordinate(fromPrice);
      if (y === null || yTop === null || yBot === null) continue;

      const height     = Math.abs(yBot - yTop);
      const totalWidth = volumeFraction * MAX_BAR_WIDTH_PX;
      const buyWidth   = totalWidth * buyFraction;

      bars.push({ y, height, totalWidth, buyWidth });
    }

    this._paneView.update({
      bars,
      pocY: this._pocPrice !== null ? this._series.priceToCoordinate(this._pocPrice) : null,
      vahY: this._vahPrice !== null ? this._series.priceToCoordinate(this._vahPrice) : null,
      valY: this._valPrice !== null ? this._series.priceToCoordinate(this._valPrice) : null,
    });
  }

  // ─── Public API ─────────────────────────────────────────────────────────

  setData(levels: VolumeProfileLevel[]): void {
    if (levels.length === 0) {
      this._levelMeta = [];
      this._pocPrice  = null;
      this._vahPrice  = null;
      this._valPrice  = null;
      return;
    }

    // Volumes arrive as decimals from the backend — normalise to JS numbers
    const nums = levels.map(l => ({
      from:   Number(l.priceFrom),
      to:     Number(l.priceTo),
      mid:    (Number(l.priceFrom) + Number(l.priceTo)) / 2,
      vol:    Number(l.volume),
      buyVol: Number(l.buyVolume),
    }));

    const maxVol   = Math.max(...nums.map(l => l.vol));
    const totalVol = nums.reduce((s, l) => s + l.vol, 0);

    this._levelMeta = nums.map(l => ({
      midPrice:       l.mid,
      fromPrice:      l.from,
      toPrice:        l.to,
      volumeFraction: maxVol > 0 ? l.vol / maxVol : 0,
      buyFraction:    l.vol  > 0 ? l.buyVol / l.vol : 0,
    }));

    // ── Value area (70 % of total volume, expanding from POC) ─────────────
    // levels[] is sorted by price ascending from the backend
    const pocIdx = nums.reduce(
      (best, l, i) => (l.vol > nums[best].vol ? i : best),
      0,
    );
    this._pocPrice = nums[pocIdx].mid;

    const target = totalVol * 0.70;
    let lower = pocIdx;
    let upper = pocIdx;
    let vaVol = nums[pocIdx].vol;

    while (vaVol < target) {
      const lowerVol = lower > 0                ? nums[lower - 1].vol : 0;
      const upperVol = upper < nums.length - 1  ? nums[upper + 1].vol : 0;

      if (lowerVol === 0 && upperVol === 0) break;

      if (upperVol >= lowerVol) {
        upper++;
        vaVol += upperVol;
      } else {
        lower--;
        vaVol += lowerVol;
      }
    }

    this._vahPrice = nums[upper].mid;
    this._valPrice = nums[lower].mid;
  }
}
