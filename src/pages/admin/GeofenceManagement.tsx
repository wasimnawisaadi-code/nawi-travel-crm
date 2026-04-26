import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth-context';
import { MapPin, Plus, Trash2, Edit2, Check, X, Navigation, Clock, Save, Users, Activity } from 'lucide-react';
import { toast } from 'sonner';
import { getAttendanceSettings, saveAttendanceSettings, getAttendanceOverrides, saveAttendanceOverrides, type AttendanceSettings, type EmployeeOverride } from '@/lib/settings';

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
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', latitude: '', longitude: '', radius: '100', zone_type: 'office' });
  const [employees, setEmployees] = useState<any[]>([]);
  const [assignModal, setAssignModal] = useState<string | null>(null);
  const [todayAtt, setTodayAtt] = useState<Record<string, any>>({});

  // Attendance settings (work_start, grace, weekend)
  const [att, setAtt] = useState<AttendanceSettings>({ work_start: '09:00', grace_minutes: 15, weekend_days: [5, 6] });
  const [savingAtt, setSavingAtt] = useState(false);

  const loadZones = async () => {
    const { data } = await supabase.from('geofence_zones').select('*').order('created_at', { ascending: false });
    setZones((data as any[]) || []);
    setLoading(false);
  };

  // Load only employees (exclude admins)
  const loadEmployees = async () => {
    const { data: roles } = await supabase.from('user_roles').select('user_id, role');
    const adminIds = new Set((roles || []).filter((r: any) => r.role === 'admin').map((r: any) => r.user_id));
    const { data } = await supabase.from('profiles').select('id, user_id, name, profile_type, assigned_zone_id, photo_url').eq('status', 'active');
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
    const i = setInterval(loadTodayAttendance, 30000);
    return () => clearInterval(i);
  }, []);

  const handleGetCurrentLocation = () => {
    if (!navigator.geolocation) { toast.error('Geolocation not supported'); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setForm(f => ({ ...f, latitude: pos.coords.latitude.toFixed(6), longitude: pos.coords.longitude.toFixed(6) }));
        toast.success('Location captured');
      },
      () => toast.error('Could not get location')
    );
  };

  const handleSave = async () => {
    if (!form.name || !form.latitude || !form.longitude) { toast.error('Fill all required fields'); return; }
    const payload = {
      name: form.name,
      latitude: parseFloat(form.latitude),
      longitude: parseFloat(form.longitude),
      radius: parseInt(form.radius) || 100,
      zone_type: form.zone_type,
      created_by: user?.id,
    };
    if (editingId) {
      await supabase.from('geofence_zones').update(payload).eq('id', editingId);
      toast.success('Zone updated');
    } else {
      await supabase.from('geofence_zones').insert(payload);
      toast.success('Zone created');
    }
    setShowForm(false); setEditingId(null);
    setForm({ name: '', latitude: '', longitude: '', radius: '100', zone_type: 'office' });
    loadZones();
  };

  const handleEdit = (z: Zone) => {
    setForm({ name: z.name, latitude: z.latitude.toString(), longitude: z.longitude.toString(), radius: z.radius.toString(), zone_type: z.zone_type });
    setEditingId(z.id); setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this zone? Employees assigned to it will need to be re-assigned.')) return;
    await supabase.from('profiles').update({ assigned_zone_id: null }).eq('assigned_zone_id', id);
    await supabase.from('geofence_zones').delete().eq('id', id);
    toast.success('Zone deleted');
    loadZones(); loadEmployees();
  };

  const handleAssignEmployee = async (employeeId: string, zoneId: string | null) => {
    await supabase.from('profiles').update({ assigned_zone_id: zoneId }).eq('id', employeeId);
    toast.success(zoneId ? 'Employee assigned to zone' : 'Zone unassigned');
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
    toast.success('Attendance rules saved');
  };

  const getGoogleMapsEmbedUrl = (lat: string | number, lng: string | number, radius?: number) => {
    const zoom = radius ? Math.max(13, Math.min(18, 17 - Math.log2(Number(radius) / 50))) : 15;
    return `https://maps.google.com/maps?q=${lat},${lng}&z=${Math.round(zoom)}&output=embed`;
  };

  // Marker map of all employees who logged in today (with coordinates)
  const liveEmployees = employees.filter(e => {
    const a = todayAtt[e.user_id];
    return a && a.login_lat && a.login_lng && !a.logout_time;
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold font-display">Geofence & Attendance Control</h2>
          <p className="text-sm text-muted-foreground">All employees are zone-based. Define office zones, assign employees, and set attendance rules.</p>
        </div>
        <button onClick={() => { setShowForm(true); setEditingId(null); setForm({ name: '', latitude: '', longitude: '', radius: '100', zone_type: 'office' }); }}
          className="btn-primary text-sm"><Plus className="w-4 h-4" /> Add Zone</button>
      </div>

      {/* Attendance Rules embedded */}
      <div className="card-nawi space-y-4">
        <div className="flex items-center gap-2">
          <Clock className="w-5 h-5 text-primary" />
          <h3 className="font-semibold font-display">Attendance Rules</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Work Start</label>
            <input type="time" value={att.work_start} onChange={e => setAtt(s => ({ ...s, work_start: e.target.value }))} className="input-nawi" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Grace (minutes)</label>
            <input type="number" min={0} max={120} value={att.grace_minutes}
              onChange={e => setAtt(s => ({ ...s, grace_minutes: Math.max(0, Number(e.target.value) || 0) }))}
              className="input-nawi" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Cutoff for Present</label>
            <div className="input-nawi flex items-center text-sm text-muted-foreground bg-muted">{att.work_start} + {att.grace_minutes}m</div>
          </div>
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
          <Save className="w-4 h-4" /> {savingAtt ? 'Saving…' : 'Save Rules'}
        </button>
      </div>

      {/* Live Employee Locations */}
      <div className="card-nawi">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-success" />
            <h3 className="font-semibold font-display">Live Employee Locations — Today</h3>
          </div>
          <span className="text-xs text-muted-foreground">{liveEmployees.length} active now • auto-refresh 30s</span>
        </div>
        {liveEmployees.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">No employees currently logged in.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {liveEmployees.map(e => {
              const a = todayAtt[e.user_id];
              return (
                <div key={e.id} className="bg-muted/40 border border-border rounded-lg p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    {e.photo_url ? <img src={e.photo_url} className="w-8 h-8 rounded-full object-cover" alt="" /> :
                      <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-bold">{e.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}</div>}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{e.name}</p>
                      <p className="text-[11px] text-muted-foreground">Login {new Date(a.login_time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })} • {a.login_location_status === 'inside' ? '✅ Inside zone' : '⚠️ Outside zone'}</p>
                    </div>
                  </div>
                  <iframe
                    src={getGoogleMapsEmbedUrl(a.login_lat, a.login_lng, 80)}
                    className="w-full h-32 rounded border border-border" loading="lazy" title={`${e.name} location`}
                  />
                  <a href={`https://www.google.com/maps?q=${a.login_lat},${a.login_lng}`} target="_blank" rel="noopener" className="text-[11px] text-primary underline">Open in Maps</a>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Zone Form */}
      {showForm && (
        <div className="card-nawi space-y-4">
          <h3 className="font-semibold">{editingId ? 'Edit Zone' : 'Create New Zone'}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Zone Name *</label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="input-nawi" placeholder="Main Office" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Zone Type</label>
              <select value={form.zone_type} onChange={e => setForm(f => ({ ...f, zone_type: e.target.value }))} className="input-nawi">
                <option value="office">Office</option>
                <option value="sales">Sales Area</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Latitude *</label>
              <input value={form.latitude} onChange={e => setForm(f => ({ ...f, latitude: e.target.value }))} className="input-nawi" placeholder="25.2048" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Longitude *</label>
              <input value={form.longitude} onChange={e => setForm(f => ({ ...f, longitude: e.target.value }))} className="input-nawi" placeholder="55.2708" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Radius (meters)</label>
              <input type="number" value={form.radius} onChange={e => setForm(f => ({ ...f, radius: e.target.value }))} className="input-nawi" min={10} max={5000} />
              <p className="text-xs text-muted-foreground mt-1">Employees must be within this radius to login. Recommended 50–200m.</p>
            </div>
            <div className="flex items-end">
              <button onClick={handleGetCurrentLocation} className="btn-outline text-sm w-full">
                <Navigation className="w-4 h-4" /> Pin My Current Location
              </button>
            </div>
          </div>

          {form.latitude && form.longitude && (
            <div className="rounded-xl overflow-hidden border border-border">
              <iframe
                src={getGoogleMapsEmbedUrl(form.latitude, form.longitude, parseInt(form.radius))}
                className="w-full h-64" loading="lazy" allowFullScreen
                referrerPolicy="no-referrer-when-downgrade" title="Zone Preview"
              />
              <div className="bg-muted px-4 py-2 flex items-center justify-between">
                <p className="text-xs text-muted-foreground">📍 {Number(form.latitude).toFixed(6)}, {Number(form.longitude).toFixed(6)} — Radius: {form.radius}m</p>
                <a href={`https://www.google.com/maps?q=${form.latitude},${form.longitude}`} target="_blank" rel="noopener" className="text-xs text-primary underline">Open in Google Maps</a>
              </div>
            </div>
          )}

          <div className="flex gap-3">
            <button onClick={handleSave} className="btn-primary text-sm"><Check className="w-4 h-4" /> Save</button>
            <button onClick={() => { setShowForm(false); setEditingId(null); }} className="btn-outline text-sm"><X className="w-4 h-4" /> Cancel</button>
          </div>
        </div>
      )}

      {/* Zones Grid */}
      <div>
        <h3 className="font-semibold font-display mb-3 flex items-center gap-2"><MapPin className="w-4 h-4" /> Zones ({zones.length})</h3>
        {loading ? (
          <div className="text-center py-12 text-muted-foreground">Loading zones...</div>
        ) : zones.length === 0 ? (
          <div className="card-nawi text-center py-10">
            <MapPin className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">No zones created yet.</p>
            <p className="text-xs text-muted-foreground mt-1">Create at least one zone — every employee must be assigned to one.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {zones.map(z => {
              const assignedEmps = employees.filter(e => e.assigned_zone_id === z.id);
              return (
                <div key={z.id} className="card-nawi relative">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${z.zone_type === 'office' ? 'bg-primary/10 text-primary' : 'bg-warning/10 text-warning'}`}>
                        <MapPin className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="font-semibold text-sm">{z.name}</p>
                        <p className="text-xs text-muted-foreground capitalize">{z.zone_type} • {z.radius}m radius</p>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => handleEdit(z)} className="p-1 hover:bg-muted rounded" title="Edit"><Edit2 className="w-3.5 h-3.5" /></button>
                      <button onClick={() => handleDelete(z.id)} className="p-1 hover:bg-destructive/10 rounded text-destructive" title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>

                  <div className="rounded-lg overflow-hidden border border-border mb-3">
                    <iframe
                      src={getGoogleMapsEmbedUrl(z.latitude, z.longitude, z.radius)}
                      className="w-full h-40" loading="lazy" allowFullScreen
                      referrerPolicy="no-referrer-when-downgrade" title={`Map of ${z.name}`}
                    />
                  </div>

                  <div className="bg-muted rounded-lg p-3 mb-3">
                    <p className="text-xs font-mono text-muted-foreground">📍 {z.latitude.toFixed(6)}, {z.longitude.toFixed(6)}</p>
                    <p className="text-xs text-muted-foreground mt-1">Login allowed within {z.radius}m radius</p>
                  </div>

                  <button onClick={() => setAssignModal(z.id)} className="btn-outline text-xs w-full">
                    <Users className="w-3.5 h-3.5" /> {assignedEmps.length} employee{assignedEmps.length !== 1 ? 's' : ''} assigned — manage
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Assign Modal */}
      {assignModal && (
        <div className="fixed inset-0 bg-foreground/50 z-50 flex items-center justify-center p-4" onClick={() => setAssignModal(null)}>
          <div className="bg-card rounded-xl shadow-elevated w-full max-w-md p-6 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold font-display mb-2">Assign Employees</h3>
            <p className="text-xs text-muted-foreground mb-4">
              Zone: <strong>{zones.find(z => z.id === assignModal)?.name}</strong>
            </p>
            <div className="space-y-2">
              {employees.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No employees yet.</p>}
              {employees.map(emp => (
                <div key={emp.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-muted">
                  <div className="flex items-center gap-2 min-w-0">
                    {emp.photo_url ? <img src={emp.photo_url} className="w-7 h-7 rounded-full object-cover" alt="" /> :
                      <div className="w-7 h-7 rounded-full bg-secondary text-secondary-foreground text-[10px] flex items-center justify-center font-bold">{emp.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}</div>}
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{emp.name}</p>
                      <p className="text-[11px] text-muted-foreground capitalize">
                        {emp.profile_type || 'office'}
                        {emp.assigned_zone_id && emp.assigned_zone_id !== assignModal && (
                          <span className="ml-1 text-warning">• Other zone</span>
                        )}
                        {!emp.assigned_zone_id && <span className="ml-1 text-destructive">• Unassigned</span>}
                      </p>
                    </div>
                  </div>
                  {emp.assigned_zone_id === assignModal ? (
                    <button onClick={() => handleAssignEmployee(emp.id, null)} className="text-xs bg-destructive/10 text-destructive px-2 py-1 rounded">Remove</button>
                  ) : (
                    <button onClick={() => handleAssignEmployee(emp.id, assignModal)} className="text-xs bg-primary/10 text-primary px-2 py-1 rounded">Assign</button>
                  )}
                </div>
              ))}
            </div>
            <button onClick={() => setAssignModal(null)} className="btn-outline w-full mt-4 text-sm">Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
