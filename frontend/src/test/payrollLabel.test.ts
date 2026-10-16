import { describe, expect, it } from 'vitest';
import { payrollInstallationLabel } from '@/modules/treasury/components/PayrollAuditPanel';

describe('payrollInstallationLabel (H50)', () => {
  it('names the installation of each payment', () => {
    expect(payrollInstallationLabel({ instance_name: 'Piloto 1', lane: 'IM' })).toBe('Piloto 1 · Muebles');
    expect(payrollInstallationLabel({ instance_name: 'Piloto 1', lane: 'IP' })).toBe('Piloto 1 · Piedra');
    expect(payrollInstallationLabel({ instance_name: null, lane: null })).toBe('—');
  });
});
