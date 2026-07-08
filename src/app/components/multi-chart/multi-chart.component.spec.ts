import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { MultiChartComponent } from './multi-chart.component';
import { TraderAlgoApiService } from '../../services/trader-algo-api.service';
import { SymbolResponse } from '../../structures/symbol';
import { IntervalResponse } from '../../structures/interval';

function symbol(code: string, isActive: boolean, isDefault = false): SymbolResponse {
  return { id: code.length, code, isActive, isDefault } as SymbolResponse;
}

function interval(code: string, isActive: boolean, isDefault = false): IntervalResponse {
  return { id: code.length, code, isActive, isDefault } as IntervalResponse;
}

describe('MultiChartComponent (config loading)', () => {
  function createWith(symbols: SymbolResponse[], intervals: IntervalResponse[]): MultiChartComponent {
    const api = jasmine.createSpyObj<TraderAlgoApiService>('TraderAlgoApiService', ['getSymbols', 'getIntervals']);
    api.getSymbols.and.returnValue(of(symbols));
    api.getIntervals.and.returnValue(of(intervals));

    TestBed.configureTestingModule({
      imports: [MultiChartComponent],
      providers: [{ provide: TraderAlgoApiService, useValue: api }],
    });

    // Run ngOnInit directly (the observables resolve synchronously) so we never
    // render the heavy lightweight-charts children.
    const component = TestBed.createComponent(MultiChartComponent).componentInstance;
    component.ngOnInit();
    return component;
  }

  it('shows an empty state and builds no panes when there are no active intervals', () => {
    const component = createWith([symbol('BTC', true, true)], [interval('1m', false)]);
    expect(component.configError).toContain('No active symbols or intervals');
    expect(component.panes).toEqual([]);
  });

  it('shows an empty state when there are no active symbols', () => {
    const component = createWith([symbol('BTC', false)], [interval('1m', true, true)]);
    expect(component.configError).toContain('No active symbols or intervals');
    expect(component.panes).toEqual([]);
  });

  it('builds four panes and selects defaults when config is present', () => {
    const component = createWith(
      [symbol('BTC', true), symbol('ETH', true, true)],
      [interval('1m', true), interval('5m', true, true)],
    );

    expect(component.configError).toBeNull();
    expect(component.panes.length).toBe(4);
    // First two panes take the active intervals in order; the rest fall back to the default.
    expect(component.panes[0].interval).toBe('1m');
    expect(component.panes[1].interval).toBe('5m');
    expect(component.panes[2].interval).toBe('5m');
    expect(component.selectedSymbol).toBe('ETH');
  });
});
