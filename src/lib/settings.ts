import { supabase } from '@/integrations/supabase/client';

export interface AttendanceSettings {
  work_start: string;       // "09:00"
  grace_minutes: number;    // e.g., 15
  weekend_days: number[];   // 0=Sun..6=Sat (UAE default Fri/Sat = [5,6])
}

export type EmployeeOverride = Partial<AttendanceSettings>;
export type AttendanceOverrides = Record<string, EmployeeOverride>;

const DEFAULT_ATTENDANCE: AttendanceSettings = {
  work_start: '09:00',
  grace_minutes: 15,
  weekend_days: [5, 6],
};

let baseCache: AttendanceSettings | null = null;
let overridesCache: AttendanceOverrides | null = null;
let cacheTime = 0;
const TTL = 60_000; // 1 minute

async function loadAll() {
  if (baseCache && overridesCache && Date.now() - cacheTime < TTL) return;
  const { data } = await supabase
    .from('app_settings' as any)
    .select('key, value')
    .in('key', ['attendance', 'attendance_overrides']);
  const rows = (data as any[]) || [];
  const baseRow = rows.find(r => r.key === 'attendance');
  const ovRow = rows.find(r => r.key === 'attendance_overrides');
  baseCache = { ...DEFAULT_ATTENDANCE, ...((baseRow?.value as any) || {}) };
  overridesCache = (ovRow?.value as AttendanceOverrides) || {};
  cacheTime = Date.now();
}

/** Returns global settings, or merged with per-employee override when userId given. */
export async function getAttendanceSettings(userId?: string): Promise<AttendanceSettings> {
  await loadAll();
  const base = baseCache!;
  if (!userId) return base;
  const ov = overridesCache?.[userId] || {};
  return { ...base, ...ov };
}

export async function getAttendanceOverrides(): Promise<AttendanceOverrides> {
  await loadAll();
  return overridesCache || {};
}

export async function saveAttendanceSettings(value: AttendanceSettings, userId?: string) {
  const { error } = await supabase
    .from('app_settings' as any)
    .upsert({ key: 'attendance', value, updated_by: userId, updated_at: new Date().toISOString() } as any, { onConflict: 'key' });
  if (!error) {
    baseCache = value;
    cacheTime = Date.now();
  }
  return { error };
}

/** Save the full overrides map (object keyed by user_id). Pass {} to clear all. */
export async function saveAttendanceOverrides(overrides: AttendanceOverrides, updatedBy?: string) {
  const { error } = await supabase
    .from('app_settings' as any)
    .upsert(
      { key: 'attendance_overrides', value: overrides as any, updated_by: updatedBy, updated_at: new Date().toISOString() } as any,
      { onConflict: 'key' }
    );
  if (!error) {
    overridesCache = overrides;
    cacheTime = Date.now();
  }
  return { error };
}

/** Returns 'Present' if before (work_start + grace), else 'Late'. */
export function classifyLogin(now: Date, settings: AttendanceSettings): 'Present' | 'Late' {
  const [h, m] = settings.work_start.split(':').map(Number);
  const cutoff = new Date(now);
  cutoff.setHours(h, m + (settings.grace_minutes || 0), 0, 0);
  return now <= cutoff ? 'Present' : 'Late';
}

export function isWeekend(date: Date, settings: AttendanceSettings): boolean {
  return settings.weekend_days.includes(date.getDay());
}
