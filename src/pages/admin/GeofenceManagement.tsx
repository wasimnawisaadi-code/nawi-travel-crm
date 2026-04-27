import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth-context';
import { MapPin, Plus, Trash2, Edit2, Check, X, Navigation, Clock, Save, Users, Activity, Settings2, ChevronDown, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { getAttendanceSettings, saveAttendanceSettings, getAttendanceOverrides, saveAttendanceOverrides, DEFAULT_ATTENDANCE, type AttendanceSettings, type EmployeeOverride } from '@/lib/settings';

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

  // Global defaults
  const [att, setAtt] = useState<AttendanceSettings>(DEFAULT_ATTENDANCE);
  const [savingAtt, setSavingAtt] = useState(false);

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

  const toggleDay = (d: number) => {
    setAtt(s => ({ ...s, weekend_days: s.weekend_days.includes(d) ? s.weekend_days.filter(x => x !== d) : [...s.weekend_days, d].sort() }));
  };

  const handleSaveAtt = async () => {
    setSavingAtt(true);
    const { error } = await saveAttendanceSettings(att, user?.id);
    setSavingAtt(false);
    if (error) { toast.error('Save failed'); return; }
    toast.success('Default attendance rules saved');
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
          <button onClick={() => setShowZonesPanel(s => !s)} className="btn-outline text-sm">
            <MapPin className="w-4 h-4" /> Zones ({zones.length})
          </button>
        </div>
      </div>

      {/* Default Rules */}
      <div className="card-nawi space-y-4">
        <div className="flex items-center gap-2">
          <Clock className="w-5 h-5 text-primary" />
          <h3 className="font-semibold font-display">Default Attendance Rules</h3>
          <span className="text-xs text-muted-foreground">(applies to all employees unless overridden below)</span>
        </div>

        {/* Schedule */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Work Start</label>
            <input type="time" value={att.work_start} onChange={e => setAtt(s => ({ ...s, work_start: e.target.value }))} className="input-nawi" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Work End</label>
            <input type="time" value={att.work_end} onChange={e => setAtt(s => ({ ...s, work_end: e.target.value }))} className="input-nawi" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Grace (min)</label>
            <input type="number" min={0} max={120} value={att.grace_minutes}
              onChange={e => setAtt(s => ({ ...s, grace_minutes: Math.max(0, Number(e.target.value) || 0) }))}
              className="input-nawi" />
            <p className="text-[11px] text-muted-foreground mt-0.5">Late after Start + Grace</p>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Cutoff for Present</label>
            <div className="input-nawi flex items-center text-sm text-muted-foreground bg-muted">{att.work_start} + {att.grace_minutes}m</div>
          </div>
        </div>

        {/* Hours / classification */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Half Day Below (h)</label>
            <input type="number" min={1} max={12} step={0.5} value={att.half_day_after_hours}
              onChange={e => setAtt(s => ({ ...s, half_day_after_hours: Math.max(0, Number(e.target.value) || 0) }))}
              className="input-nawi" />
            <p className="text-[11px] text-muted-foreground mt-0.5">Worked &lt; this = Half Day</p>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Full Day From (h)</label>
            <input type="number" min={1} max={16} step={0.5} value={att.min_full_day_hours}
              onChange={e => setAtt(s => ({ ...s, min_full_day_hours: Math.max(0, Number(e.target.value) || 0) }))}
              className="input-nawi" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Early Leave (min)</label>
            <input type="number" min={0} max={120} value={att.early_leave_threshold_min}
              onChange={e => setAtt(s => ({ ...s, early_leave_threshold_min: Math.max(0, Number(e.target.value) || 0) }))}
              className="input-nawi" />
            <p className="text-[11px] text-muted-foreground mt-0.5">Logout &gt; N min before End</p>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Default Zone</label>
            <select value={att.default_zone_id || ''} onChange={e => setAtt(s => ({ ...s, default_zone_id: e.target.value || null }))} className="input-nawi text-sm">
              <option value="">— None (use any active office zone) —</option>
              {zones.filter(z => z.is_active).map(z => (
                <option key={z.id} value={z.id}>{z.name} ({z.zone_type}, {z.radius}m)</option>
              ))}
            </select>
          </div>
        </div>

        {/* Geofence master switches */}
        <div className="flex flex-wrap gap-4 pt-1">
          <label className="flex items-center gap-2 cursor-pointer text-sm">
            <input type="checkbox" checked={att.enforce_geofence}
              onChange={e => setAtt(s => ({ ...s, enforce_geofence: e.target.checked }))}
              className="w-4 h-4 rounded border-border" />
            <span>Enforce geofence on login</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer text-sm">
            <input type="checkbox" checked={att.auto_logout_outside_zone}
              onChange={e => setAtt(s => ({ ...s, auto_logout_outside_zone: e.target.checked }))}
              className="w-4 h-4 rounded border-border" />
            <span>Auto-logout if employee leaves zone</span>
          </label>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Weekend Days</label>
          <div className="flex flex-wrap gap-2">
            {DAYS.map((d, i) => (
              <button key={d} type="button" onClick={() => toggleDay(i)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${att.weekend_days.includes(i) ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-muted-foreground border-border hover:border-primary/50'}`}>
                {d}
              </button>
            ))}
          </div>
        </div>
        <button onClick={handleSaveAtt} disabled={savingAtt} className="btn-primary text-sm">
          <Save className="w-4 h-4" /> {savingAtt ? 'Saving…' : 'Save Default Rules'}
        </button>
      </div>

      {/* Zones Panel (collapsible) */}
      {showZonesPanel && (
        <div className="card-nawi space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MapPin className="w-5 h-5 text-primary" />
              <h3 className="font-semibold font-display">Zones ({zones.length})</h3>
            </div>
            <button onClick={() => { setShowZoneForm(true); setEditingZoneId(null); setZoneForm({ name: '', latitude: '', longitude: '', radius: '100', zone_type: 'office' }); }}
              className="btn-primary text-sm"><Plus className="w-4 h-4" /> Add Zone</button>
          </div>

          {showZoneForm && (
            <div className="border border-border rounded-lg p-4 space-y-4 bg-muted/20">
              <h4 className="font-semibold text-sm">{editingZoneId ? 'Edit Zone' : 'Create New Zone'}</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Zone Name *</label>
                  <input value={zoneForm.name} onChange={e => setZoneForm(f => ({ ...f, name: e.target.value }))} className="input-nawi" placeholder="Main Office" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Zone Type</label>
                  <select value={zoneForm.zone_type} onChange={e => setZoneForm(f => ({ ...f, zone_type: e.target.value }))} className="input-nawi">
                    <option value="office">Office</option>
                    <option value="sales">Field / Sales</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Latitude *</label>
                  <input value={zoneForm.latitude} onChange={e => setZoneForm(f => ({ ...f, latitude: e.target.value }))} className="input-nawi" placeholder="25.2048" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Longitude *</label>
                  <input value={zoneForm.longitude} onChange={e => setZoneForm(f => ({ ...f, longitude: e.target.value }))} className="input-nawi" placeholder="55.2708" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Radius (meters)</label>
                  <input type="number" value={zoneForm.radius} onChange={e => setZoneForm(f => ({ ...f, radius: e.target.value }))} className="input-nawi" min={10} max={5000} />
                  <p className="text-xs text-muted-foreground mt-1">Recommended 50–200m. Login allowed within this circle.</p>
                </div>
                <div className="flex items-end">
                  <button onClick={handleGetCurrentLocation} className="btn-outline text-sm w-full">
                    <Navigation className="w-4 h-4" /> Pin My Current Location
                  </button>
                </div>
              </div>

              {zoneForm.latitude && zoneForm.longitude && (
                <div className="rounded-xl overflow-hidden border border-border">
                  <iframe
                    src={getGoogleMapsEmbedUrl(zoneForm.latitude, zoneForm.longitude, parseInt(zoneForm.radius))}
                    className="w-full h-64" loading="lazy" allowFullScreen
                    referrerPolicy="no-referrer-when-downgrade" title="Zone Preview"
                  />
                  <div className="bg-muted px-4 py-2 flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">📍 {Number(zoneForm.latitude).toFixed(6)}, {Number(zoneForm.longitude).toFixed(6)} — Radius: {zoneForm.radius}m</p>
                    <a href={`https://www.google.com/maps?q=${zoneForm.latitude},${zoneForm.longitude}`} target="_blank" rel="noopener" className="text-xs text-primary underline">Open in Google Maps</a>
                  </div>
                </div>
              )}

              <div className="flex gap-3">
                <button onClick={handleSaveZone} className="btn-primary text-sm"><Check className="w-4 h-4" /> Save</button>
                <button onClick={() => { setShowZoneForm(false); setEditingZoneId(null); }} className="btn-outline text-sm"><X className="w-4 h-4" /> Cancel</button>
              </div>
            </div>
          )}

          {loading ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Loading…</p>
          ) : zones.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No zones yet. Create one to start assigning employees.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {zones.map(z => {
                const assignedCount = employees.filter(e => e.assigned_zone_id === z.id).length;
                return (
                  <div key={z.id} className="border border-border rounded-lg overflow-hidden bg-card">
                    <iframe
                      src={getGoogleMapsEmbedUrl(z.latitude, z.longitude, z.radius)}
                      className="w-full h-32" loading="lazy" title={z.name}
                    />
                    <div className="p-3 space-y-2">
                      <div className="flex items-start justify-between">
                        <div className="min-w-0">
                          <p className="font-semibold text-sm truncate">{z.name}</p>
                          <p className="text-[11px] text-muted-foreground capitalize">{z.zone_type} • {z.radius}m • {assignedCount} assigned</p>
                        </div>
                        <div className="flex gap-1 flex-shrink-0">
                          <button onClick={() => handleEditZone(z)} className="p-1 hover:bg-muted rounded" title="Edit"><Edit2 className="w-3.5 h-3.5" /></button>
                          <button onClick={() => handleDeleteZone(z.id)} className="p-1 hover:bg-destructive/10 rounded text-destructive" title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* EMPLOYEE CONTROL ROOM */}
      <div className="card-nawi space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" />
            <h3 className="font-semibold font-display">All Employees ({employees.length})</h3>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search employee…"
              className="input-nawi text-sm py-1.5 w-48"
            />
            <select
              onChange={async (e) => {
                const zoneId = e.target.value;
                if (!zoneId) return;
                if (!confirm(`Assign ${filteredEmployees.length} visible employee(s) to this zone?`)) { e.target.value = ''; return; }
                await Promise.all(filteredEmployees.map(emp =>
                  supabase.from('profiles').update({ assigned_zone_id: zoneId === '__none__' ? null : zoneId }).eq('id', emp.id)
                ));
                toast.success(`Updated ${filteredEmployees.length} employee(s)`);
                loadEmployees();
                e.target.value = '';
              }}
              className="input-nawi text-sm py-1.5"
              defaultValue=""
              title="Bulk assign zone to all visible employees"
            >
              <option value="" disabled>Bulk assign zone…</option>
              <option value="__none__">— Clear zones —</option>
              {zones.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
            </select>
            <button onClick={handleSaveOverrides} disabled={savingOv} className="btn-primary text-sm">
              <Save className="w-4 h-4" /> {savingOv ? 'Saving…' : 'Save Overrides'}
            </button>
          </div>
        </div>

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
              const isExpanded = expandedEmp === emp.id;

              return (
                <div key={emp.id} className="border border-border rounded-lg overflow-hidden">
                  {/* Row header */}
                  <button
                    onClick={() => setExpandedEmp(isExpanded ? null : emp.id)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-muted/40 transition-colors text-left"
                  >
                    {isExpanded ? <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />}
                    {emp.photo_url ? <img src={emp.photo_url} className="w-9 h-9 rounded-full object-cover flex-shrink-0" alt="" /> :
                      <div className="w-9 h-9 rounded-full bg-secondary text-secondary-foreground text-xs flex items-center justify-center font-bold flex-shrink-0">{emp.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}</div>}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium truncate">{emp.name}</p>
                        {isLive && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-success/15 text-success font-medium">● LIVE</span>}
                        {hasOverride && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium">CUSTOM</span>}
                      </div>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {zone ? <><MapPin className="w-2.5 h-2.5 inline" /> {zone.name} ({zone.radius}m)</> : <span className="text-warning">No zone — anywhere</span>}
                        <span className="mx-1.5">•</span>
                        Start {ov.work_start || att.work_start} · {ov.grace_minutes ?? att.grace_minutes}m grace
                      </p>
                    </div>
                    {isLive && (
                      <span className="text-[11px] text-muted-foreground flex-shrink-0">
                        Login {new Date(att2.login_time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </button>

                  {/* Expanded controls */}
                  {isExpanded && (
                    <div className="border-t border-border bg-muted/20 p-4 space-y-4">
                      {/* Zone assignment */}
                      <div>
                        <label className="block text-xs font-semibold mb-2 flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" /> Geofence Zone</label>
                        <div className="flex gap-2 items-center flex-wrap">
                          <select
                            value={emp.assigned_zone_id || ''}
                            onChange={(e) => handleAssignZone(emp.id, e.target.value || null)}
                            className="input-nawi text-sm py-1.5 flex-1 min-w-[200px]"
                          >
                            <option value="">— No zone (login from anywhere) —</option>
                            {zones.map(z => (
                              <option key={z.id} value={z.id}>{z.name} ({z.zone_type}, {z.radius}m)</option>
                            ))}
                          </select>
                          {zone && (
                            <a href={`https://www.google.com/maps?q=${zone.latitude},${zone.longitude}`} target="_blank" rel="noopener" className="text-xs text-primary underline">Open</a>
                          )}
                        </div>
                        {zone && (
                          <div className="mt-2 rounded-lg overflow-hidden border border-border">
                            <iframe
                              src={getGoogleMapsEmbedUrl(zone.latitude, zone.longitude, zone.radius)}
                              className="w-full h-40" loading="lazy" title={`${zone.name} radius`}
                            />
                            <div className="bg-muted px-3 py-1.5 text-[11px] text-muted-foreground">
                              📍 {zone.latitude.toFixed(6)}, {zone.longitude.toFixed(6)} — Radius {zone.radius}m
                            </div>
                          </div>
                        )}
                        <label className="flex items-center gap-2 mt-3 cursor-pointer text-xs">
                          <input
                            type="checkbox"
                            checked={ov.enforce_geofence !== false}
                            onChange={(e) => setEmpOverride(emp.user_id, { enforce_geofence: e.target.checked ? undefined : false })}
                            className="w-4 h-4 rounded border-border"
                          />
                          <span>Enforce geofence for this employee</span>
                          <span className="text-muted-foreground">(uncheck for sales/field staff who work outside)</span>
                        </label>
                      </div>

                      {/* Schedule overrides */}
                      <div>
                        <label className="block text-xs font-semibold mb-2 flex items-center gap-1.5"><Settings2 className="w-3.5 h-3.5" /> Schedule Override</label>
                        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                          <div>
                            <label className="block text-[11px] text-muted-foreground mb-1">Work Start</label>
                            <input
                              type="time"
                              value={ov.work_start || ''}
                              onChange={(e) => setEmpOverride(emp.user_id, { work_start: e.target.value || undefined })}
                              placeholder={att.work_start}
                              className="input-nawi text-sm py-1.5 w-full"
                            />
                            <p className="text-[10px] text-muted-foreground mt-0.5">Default: {att.work_start}</p>
                          </div>
                          <div>
                            <label className="block text-[11px] text-muted-foreground mb-1">Work End</label>
                            <input
                              type="time"
                              value={ov.work_end || ''}
                              onChange={(e) => setEmpOverride(emp.user_id, { work_end: e.target.value || undefined })}
                              placeholder={att.work_end}
                              className="input-nawi text-sm py-1.5 w-full"
                            />
                            <p className="text-[10px] text-muted-foreground mt-0.5">Default: {att.work_end}</p>
                          </div>
                          <div>
                            <label className="block text-[11px] text-muted-foreground mb-1">Grace (min)</label>
                            <input
                              type="number" min={0} max={120}
                              value={ov.grace_minutes ?? ''}
                              onChange={(e) => {
                                const v = e.target.value;
                                setEmpOverride(emp.user_id, { grace_minutes: v === '' ? undefined : Math.max(0, Number(v) || 0) });
                              }}
                              placeholder={String(att.grace_minutes)}
                              className="input-nawi text-sm py-1.5 w-full"
                            />
                            <p className="text-[10px] text-muted-foreground mt-0.5">Default: {att.grace_minutes}m</p>
                          </div>
                          <div className="flex items-end">
                            {hasOverride && (
                              <button onClick={() => clearEmpOverride(emp.user_id)} className="text-xs text-destructive hover:underline py-1.5">
                                Reset to defaults
                              </button>
                            )}
                          </div>
                        </div>
                        <div className="mt-3">
                          <label className="block text-[11px] text-muted-foreground mb-1">Weekend Days {ov.weekend_days ? '(custom)' : '(using default)'}</label>
                          <div className="flex flex-wrap gap-1.5">
                            {DAYS.map((d, i) => {
                              const wk = ov.weekend_days ?? null;
                              const active = wk ? wk.includes(i) : att.weekend_days.includes(i);
                              const isOverride = !!wk;
                              return (
                                <button key={d} type="button"
                                  onClick={() => {
                                    const cur = ov.weekend_days ?? [...att.weekend_days];
                                    const next = cur.includes(i) ? cur.filter(x => x !== i) : [...cur, i].sort();
                                    setEmpOverride(emp.user_id, { weekend_days: next });
                                  }}
                                  className={`px-2.5 py-1 rounded text-[11px] font-medium border transition-colors ${active ? (isOverride ? 'bg-primary text-primary-foreground border-primary' : 'bg-muted text-foreground border-border') : 'bg-card text-muted-foreground border-border hover:border-primary/50'}`}
                                >
                                  {d}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>

                      {/* Today's attendance */}
                      {att2 && (
                        <div className="bg-card border border-border rounded-lg p-3 text-xs space-y-1">
                          <p className="font-semibold text-foreground mb-1 flex items-center gap-1.5"><Activity className="w-3.5 h-3.5 text-success" /> Today</p>
                          <p className="text-muted-foreground">Login: {att2.login_time ? new Date(att2.login_time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '—'} {att2.login_location_status === 'inside' ? '✅' : att2.login_location_status === 'outside' ? '⚠️ Outside zone' : ''}</p>
                          <p className="text-muted-foreground">Logout: {att2.logout_time ? new Date(att2.logout_time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '—'}</p>
                          <p className="text-muted-foreground">Status: <span className="font-medium text-foreground">{att2.status || '—'}</span></p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
