import { supabase } from '@/integrations/supabase/client';

export interface AttendanceSettings {
  work_start: string;       // "09:00"
  grace_minutes: number;    // e.g., 15
  weekend_days: number[];   // 0=Sun..6=Sat (UAE default Fri/Sat = [5,6])
}

const DEFAULT_ATTENDANCE: AttendanceSettings = {
  work_start: '09:00',
  grace_minutes: 15,
  weekend_days: [5, 6],
};

let cache: AttendanceSettings | null = null;
let cacheTime = 0;
const TTL = 60_000; // 1 minute

export async function getAttendanceSettings(): Promise<AttendanceSettings> {
  if (cache && Date.now() - cacheTime < TTL) return cache;
  const { data } = await supabase
    .from('app_settings' as any)
    .select('value')
    .eq('key', 'attendance')
    .maybeSingle();
  cache = { ...DEFAULT_ATTENDANCE, ...((data as any)?.value || {}) };
  cacheTime = Date.now();
  return cache;
}

export async function saveAttendanceSettings(value: AttendanceSettings, userId?: string) {
  const { error } = await supabase
    .from('app_settings' as any)
    .upsert({ key: 'attendance', value, updated_by: userId, updated_at: new Date().toISOString() } as any, { onConflict: 'key' });
  if (!error) {
    cache = value;
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
