import axiosClient from './axios-client';

export interface AuditLogRead {
    id: number;
    created_at: string;
    user_id?: number | null;
    user_name: string;
    user_role: string;
    action: string;
    entity_type: string;
    entity_id?: number | null;
    entity_reference?: string | null;
    description: string;
    old_values?: string | null;
    new_values?: string | null;
    ip_address?: string | null;
}

export interface AuditLogListResponse {
    items: AuditLogRead[];
    total: number;
    skip: number;
    limit: number;
}

export interface AuditLogFilters {
    user_id?: number;
    action?: string;
    entity_type?: string;
    date_from?: string;
    date_to?: string;
    skip?: number;
    limit?: number;
}

export const auditService = {
    getAuditLogs: async (filters: AuditLogFilters = {}): Promise<AuditLogListResponse> => {
        const qs = new URLSearchParams();
        if (filters.user_id != null) qs.set('user_id', String(filters.user_id));
        if (filters.action) qs.set('action', filters.action);
        if (filters.entity_type) qs.set('entity_type', filters.entity_type);
        if (filters.date_from) qs.set('date_from', filters.date_from);
        if (filters.date_to) qs.set('date_to', filters.date_to);
        if (filters.skip != null) qs.set('skip', String(filters.skip));
        if (filters.limit != null) qs.set('limit', String(filters.limit));
        const q = qs.toString();
        const response = await axiosClient.get<AuditLogListResponse>(`/audit/logs${q ? `?${q}` : ''}`);
        return response.data;
    },
};
