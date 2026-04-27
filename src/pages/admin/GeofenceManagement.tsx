import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth-context';
import { MapPin, Users, Activity, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { getAttendanceSettings, getAttendanceOverrides, saveAttendanceOverrides, DEFAULT_ATTENDANCE, type AttendanceSettings, type EmployeeOverride } from '@/lib/settings';

interface Zone {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radius: number;
  zone_type: string;
  is_active: boolean;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function GeofenceManagement() {
  const { user } = useAuth();
  const [zones, setZones] = useState<Zone[]>([]);
  const [loading, setLoading] = useState(true);
  const [showZoneForm, setShowZoneForm] = useState(false);
  const [editingZoneId, setEditingZoneId] = useState<string | null>(null);
  const [zoneForm, setZoneForm] = useState({ name: '', latitude: '', longitude: '', radius: '100', zone_type: 'office' });
  const [employees, setEmployees] = useState<any[]>([]);
  const [todayAtt, setTodayAtt] = useState<Record<string, any>>({});
  const [expandedEmp, setExpandedEmp] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showZonesPanel, setShowZonesPanel] = useState(false);

  // Global defaults (silent fallback — not editable here, used for placeholder display)
  const [att, setAtt] = useState<AttendanceSettings>(DEFAULT_ATTENDANCE);

  // Per-employee overrides
  const [overrides, setOverrides] = useState<Record<string, EmployeeOverride>>({});
  const [savingOv, setSavingOv] = useState(false);

  const loadZones = async () => {
    const { data } = await supabase.from('geofence_zones').select('*').order('created_at', { ascending: false });
    setZones((data as any[]) || []);
    setLoading(false);
  };

  const loadEmployees = async () => {
    const { data: roles } = await supabase.from('user_roles').select('user_id, role');
    const adminIds = new Set((roles || []).filter((r: any) => r.role === 'admin').map((r: any) => r.user_id));
    const { data } = await supabase.from('profiles').select('id, user_id, name, email, profile_type, assigned_zone_id, photo_url').eq('status', 'active');
    setEmployees((data || []).filter((e: any) => !adminIds.has(e.user_id)));
  };

  const loadTodayAttendance = async () => {
    const today = new Date().toISOString().slice(0, 10);
    const { data } = await supabase.from('attendance').select('employee_id, login_time, logout_time, login_lat, login_lng, login_location_status, status').eq('date', today);
    const map: Record<string, any> = {};
    (data || []).forEach((a: any) => { map[a.employee_id] = a; });
    setTodayAtt(map);
  };

  useEffect(() => {
    loadZones();
    loadEmployees();
    loadTodayAttendance();
    getAttendanceSettings().then(setAtt);
    getAttendanceOverrides().then(setOverrides);
    const i = setInterval(loadTodayAttendance, 30000);
    return () => clearInterval(i);
  }, []);

  const setEmpOverride = (userId: string, patch: EmployeeOverride) => {
    setOverrides(prev => {
      const cur = prev[userId] || {};
      const next = { ...cur, ...patch };
      Object.keys(next).forEach(k => { if ((next as any)[k] === '' || (next as any)[k] === undefined || (next as any)[k] === null) delete (next as any)[k]; });
      const out = { ...prev };
      if (Object.keys(next).length === 0) delete out[userId]; else out[userId] = next;
      return out;
    });
  };

  const clearEmpOverride = (userId: string) => {
    setOverrides(prev => { const out = { ...prev }; delete out[userId]; return out; });
  };

  const handleSaveOverrides = async () => {
    setSavingOv(true);
    const { error } = await saveAttendanceOverrides(overrides, user?.id);
    setSavingOv(false);
    if (error) { toast.error('Save failed'); return; }
    toast.success('Per-employee schedules saved');
  };

  const handleGetCurrentLocation = () => {
    if (!navigator.geolocation) { toast.error('Geolocation not supported'); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setZoneForm(f => ({ ...f, latitude: pos.coords.latitude.toFixed(6), longitude: pos.coords.longitude.toFixed(6) }));
        toast.success('Location captured');
      },
      () => toast.error('Could not get location')
    );
  };

  const handleSaveZone = async () => {
    if (!zoneForm.name || !zoneForm.latitude || !zoneForm.longitude) { toast.error('Fill all required fields'); return; }
    const payload = {
      name: zoneForm.name,
      latitude: parseFloat(zoneForm.latitude),
      longitude: parseFloat(zoneForm.longitude),
      radius: parseInt(zoneForm.radius) || 100,
      zone_type: zoneForm.zone_type,
      created_by: user?.id,
    };
    if (editingZoneId) {
      await supabase.from('geofence_zones').update(payload).eq('id', editingZoneId);
      toast.success('Zone updated');
    } else {
      await supabase.from('geofence_zones').insert(payload);
      toast.success('Zone created');
    }
    setShowZoneForm(false); setEditingZoneId(null);
    setZoneForm({ name: '', latitude: '', longitude: '', radius: '100', zone_type: 'office' });
    loadZones();
  };

  const handleEditZone = (z: Zone) => {
    setZoneForm({ name: z.name, latitude: z.latitude.toString(), longitude: z.longitude.toString(), radius: z.radius.toString(), zone_type: z.zone_type });
    setEditingZoneId(z.id); setShowZoneForm(true); setShowZonesPanel(true);
  };

  const handleDeleteZone = async (id: string) => {
    if (!confirm('Delete this zone? Assigned employees will be unassigned.')) return;
    await supabase.from('profiles').update({ assigned_zone_id: null }).eq('assigned_zone_id', id);
    await supabase.from('geofence_zones').delete().eq('id', id);
    toast.success('Zone deleted');
    loadZones(); loadEmployees();
  };

  const handleAssignZone = async (employeeId: string, zoneId: string | null) => {
    await supabase.from('profiles').update({ assigned_zone_id: zoneId }).eq('id', employeeId);
    toast.success(zoneId ? 'Zone assigned' : 'Zone cleared');
    loadEmployees();
  };

  const getGoogleMapsEmbedUrl = (lat: string | number, lng: string | number, radius?: number) => {
    const zoom = radius ? Math.max(13, Math.min(18, 17 - Math.log2(Number(radius) / 50))) : 15;
    return `https://maps.google.com/maps?q=${lat},${lng}&z=${Math.round(zoom)}&output=embed`;
  };

  const filteredEmployees = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return employees;
    return employees.filter(e => (e.name || '').toLowerCase().includes(q) || (e.email || '').toLowerCase().includes(q));
  }, [employees, search]);

  const liveCount = employees.filter(e => {
    const a = todayAtt[e.user_id];
    return a && a.login_time && !a.logout_time;
  }).length;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold font-display">Employee Control Room</h2>
          <p className="text-sm text-muted-foreground">Manage every employee's zone, schedule, and live attendance from one place.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="px-3 py-1.5 rounded-full bg-success/10 text-success text-xs font-medium flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5" /> {liveCount} active now
          </div>
        </div>
      </div>

      {/* EMPLOYEE CONTROL ROOM */}
      <div className="card-nawi space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" />
            <h3 className="font-semibold font-display">All Employees ({employees.length})</h3>
          </div>
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search employee…"
            className="input-nawi text-sm py-1.5 w-56"
          />
        </div>

        <p className="text-xs text-muted-foreground">
          Click any employee to open their profile and set their <strong>Zone</strong>, <strong>Work Schedule</strong>, and <strong>Attendance Rules</strong>.
        </p>

        {filteredEmployees.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">No employees found.</p>
        ) : (
          <div className="space-y-2">
            {filteredEmployees.map(emp => {
              const ov = overrides[emp.user_id] || {};
              const hasOverride = Object.keys(ov).length > 0;
              const zone = zones.find(z => z.id === emp.assigned_zone_id);
              const att2 = todayAtt[emp.user_id];
              const isLive = att2 && att2.login_time && !att2.logout_time;
              const geofenceOff = ov.enforce_geofence === false;

              return (
                <Link
                  key={emp.id}
                  to={`/admin/employees/${emp.id}`}
                  className="block border border-border rounded-lg hover:bg-muted/40 transition-colors"
                >
                  <div className="flex items-center gap-3 px-3 py-2.5 text-left">
                    {emp.photo_url ? <img src={emp.photo_url} className="w-10 h-10 rounded-full object-cover flex-shrink-0" alt="" /> :
                      <div className="w-10 h-10 rounded-full bg-secondary text-secondary-foreground text-xs flex items-center justify-center font-bold flex-shrink-0">{emp.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}</div>}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium truncate">{emp.name}</p>
                        {isLive && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-success/15 text-success font-medium">● LIVE</span>}
                        {hasOverride && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium">CUSTOM RULES</span>}
                        {geofenceOff && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-warning/10 text-warning font-medium">GEOFENCE OFF</span>}
                      </div>
                      <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                        {zone ? <><MapPin className="w-2.5 h-2.5 inline" /> {zone.name} ({zone.radius}m)</> : <span className="text-warning">No zone assigned</span>}
                        <span className="mx-1.5">•</span>
                        {ov.work_start || att.work_start}–{ov.work_end || att.work_end} · {ov.grace_minutes ?? att.grace_minutes}m grace
                      </p>
                    </div>
                    {isLive && att2 && (
                      <span className="text-[11px] text-muted-foreground flex-shrink-0 hidden sm:inline">
                        Login {new Date(att2.login_time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                    <ExternalLink className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
