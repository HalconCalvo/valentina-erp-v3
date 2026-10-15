import { describe, expect, it } from 'vitest';
import type { CalendarPill } from '../api/planning-service';
import { isPlanningPillProductionLocked } from '../modules/planning/hooks/usePlanning';

const pill = (lane: string, extra: Partial<CalendarPill> = {}): CalendarPill =>
  ({ lane, production_status: 'IN_PRODUCTION', ...extra }) as CalendarPill;

describe('H39 each calendar lane has its own state', () => {
  it('uses the lane state from the server', () => {
    expect(isPlanningPillProductionLocked(pill('PM', { lane_done: false }))).toBe(false);
    expect(isPlanningPillProductionLocked(pill('PP', { lane_done: true }))).toBe(true);
  });

  it('falls back to the house status without lane state', () => {
    expect(isPlanningPillProductionLocked(pill('PM'))).toBe(true);
    expect(isPlanningPillProductionLocked(pill('IM'))).toBe(false);
  });
});

describe('H39 a saved date change keeps the lane state', () => {
  it('rebuilt pills keep lane_done from the server', async () => {
    const { applyInstanceToCalendarFeed } = await import('../modules/planning/hooks/usePlanning');
    const feed = {
      year: 2026, month: 10, total_pills: 1,
      calendar: { '2026-10-20': [pill('PM', { instance_id: 7, lane_done: false })] },
    };
    const updated = {
      id: 7, custom_name: 'Piloto, 2', production_status: 'IN_PRODUCTION',
      schedule: { PM: '2026-10-21T15:00:00', PP: null, IM: null, IP: null },
    };
    const next = applyInstanceToCalendarFeed(feed as never, updated as never, 2026, 10);
    const moved = next?.calendar['2026-10-21']?.[0];
    expect(moved?.lane_done).toBe(false);
    expect(isPlanningPillProductionLocked(moved as CalendarPill)).toBe(false);
  });
});
