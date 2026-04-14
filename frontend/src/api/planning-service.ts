import client from './axios-client';
import { API_ROUTES } from './endpoints';

export interface ScheduleMap {
  PM: string | null;  // Prod. MDF
  PP: string | null;  // Prod. Piedra
  IM: string | null;  // Inst. MDF
  IP: string | null;  // Inst. Piedra
}

export interface InstanceSchedule {
  id: number;
  custom_name: string;
  product_name: string | null;
  order_folio: string | null;
  production_status: string;
  semaphore: string;
  semaphore_label: string;
  schedule: ScheduleMap;
  sales_order_item_id: number;
  delivery_deadline: string | null;
  signed_received_at: string | null;
  warranty_started_at: string | null;
  is_warranty_reopened: boolean;
  warranty_reopened_at: string | null;
  original_signed_at: string | null;
  is_cancelled: boolean;
}

export interface CalendarPill {
  instance_id: number;
  custom_name: string;
  lane: 'PM' | 'PP' | 'IM' | 'IP';
  lane_label: string;
  datetime: string;
  semaphore: string;
  semaphore_label: string;
  production_status: string;
  sales_order_item_id: number;
  is_warranty_reopened: boolean;
}

export interface CalendarFeed {
  year: number;
  month: number;
  total_pills: number;
  calendar: Record<string, CalendarPill[]>; // key: "YYYY-MM-DD"
}

export interface HealthPanel {
  timestamp: string;
  counts: Record<string, number>;
  critical: InstanceSchedule[];
  alerts: InstanceSchedule[];
  planned: InstanceSchedule[];
  in_process: InstanceSchedule[];
  ready_to_install: InstanceSchedule[];
  in_transit: InstanceSchedule[];
  installed: InstanceSchedule[];
  warranty: InstanceSchedule[];
}

export interface BaptismEntry {
  instance_id: number;
  custom_name: string;
}

export const planningService = {
  getCalendar: (year: number, month: number) =>
    client.get<CalendarFeed>(API_ROUTES.PLANNING.CALENDAR, { params: { year, month } }),

  getHealth: () =>
    client.get<HealthPanel>(API_ROUTES.PLANNING.HEALTH),

  updateInstance: (id: number, data: Partial<{
    custom_name: string;
    scheduled_prod_mdf: string | null;
    scheduled_prod_stone: string | null;
    scheduled_inst_mdf: string | null;
    scheduled_inst_stone: string | null;
  }>) =>
    client.patch<InstanceSchedule>(API_ROUTES.PLANNING.INSTANCE(id), data),

  reschedule: (id: number, field: string, newDate: string, proportional: boolean) =>
    client.patch<{ updated_fields: string[]; instance: InstanceSchedule }>(
      API_ROUTES.PLANNING.RESCHEDULE(id),
      { field, new_date: newDate, proportional }
    ),

  closeInstance: (id: number, signedAt?: string) =>
    client.post(API_ROUTES.PLANNING.CLOSE(id), { signed_at: signedAt ?? null }),

  reopenWarranty: (id: number) =>
    client.post(API_ROUTES.PLANNING.REOPEN_WARRANTY(id)),

  baptizeInstances: (orderId: number, instances: BaptismEntry[]) =>
    client.patch(API_ROUTES.PLANNING.BAPTIZE(orderId), { instances }),
};
