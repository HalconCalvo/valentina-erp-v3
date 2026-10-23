/** Purchase order statuses as the users read them (Gabriel 23/10: in Spanish across the module). */
export const PO_STATUS_LABELS: Record<string, string> = {
    DRAFT: 'Borrador', AUTORIZADA: 'Autorizada', ENVIADA: 'Enviada', EN_ESPERA_ANTICIPO: 'En espera de anticipo',
    RECIBIDA_PARCIAL: 'Recibida parcial', RECIBIDA_TOTAL: 'Recibida total', CANCELADA: 'Cancelada',
};

export const poStatusLabel = (status: string | null | undefined): string => {
    const code = String(status || '').trim().toUpperCase();
    return PO_STATUS_LABELS[code] ?? (status || '');
};
