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

class ActiveCandleRenderer implements IPrimitivePaneRenderer {
  private _x: number | null = null;

  update(x: number | null): void { this._x = x; }

  draw(): void {}

  drawBackground(target: CanvasRenderingTarget2D): void {
    if (this._x === null) return;
    target.useBitmapCoordinateSpace(({ context, bitmapSize, horizontalPixelRatio }) => {
      const xPx = Math.round(this._x! * horizontalPixelRatio);
      context.save();
      context.strokeStyle = '#2962ff';
      context.lineWidth = Math.ceil(horizontalPixelRatio);
      context.beginPath();
      context.moveTo(xPx, 0);
      context.lineTo(xPx, bitmapSize.height);
      context.stroke();
      context.restore();
    });
  }
}

class ActiveCandlePaneView implements IPrimitivePaneView {
  private readonly _renderer = new ActiveCandleRenderer();
  update(x: number | null): void { this._renderer.update(x); }
  renderer(): IPrimitivePaneRenderer { return this._renderer; }
}

export class ActiveCandlePlugin implements ISeriesPrimitive<Time> {
  private _chart?: IChartApiBase<Time>;
  private _time: UTCTimestamp | null = null;
  private readonly _paneView = new ActiveCandlePaneView();

  attached(params: SeriesAttachedParameter<Time>): void { this._chart = params.chart; }
  detached(): void { this._chart = undefined; }
  paneViews(): readonly IPrimitivePaneView[] { return [this._paneView]; }

  setTime(time: UTCTimestamp | null): void { this._time = time; }

  updateAllViews(): void {
    const x = this._time !== null ? (this._chart?.timeScale().timeToCoordinate(this._time) ?? null) : null;
    this._paneView.update(x);
  }
}
