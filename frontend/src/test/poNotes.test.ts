import { describe, expect, it } from 'vitest';
import { poAuthorizedNote, poCreatedNote } from '@/modules/foundations/utils/poNotes';

describe('OC dates', () => {
    it('says when and by whom an OC was created', () => {
        expect(poCreatedNote({ created_at: '2026-10-12T22:50:00', created_by_name: 'Delmy Barrera' }))
            .toBe('Creada el 12/10/2026 por Delmy Barrera');
        expect(poCreatedNote({ created_at: '2026-10-12T22:50:00' })).toBe('Creada el 12/10/2026');
        expect(poCreatedNote({})).toBeUndefined();
    });

    it('says who authorized it and when in Mérida time; only the name without a date', () => {
        expect(poAuthorizedNote({ authorized_by_name: 'Ing.Gabriel Frías', authorized_at: '2026-10-14T18:23:34' }))
            .toBe('Autorizada por Ing.Gabriel Frías el 14/10/2026 12:23');
        expect(poAuthorizedNote({ authorized_by: 'Dirección' })).toBe('Autorizada por Dirección');
        expect(poAuthorizedNote({})).toBeUndefined();
    });
});
