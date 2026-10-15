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
