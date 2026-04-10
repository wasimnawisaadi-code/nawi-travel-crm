import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth-context';
import { MapPin, Plus, Trash2, Edit2, Check, X, Navigation, Home, Shield, ToggleLeft, ToggleRight } from 'lucide-react';
import { toast } from 'sonner';

interface Zone {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radius: number;
  zone_type: string;
  is_active: boolean;
}

export default function GeofenceManagement() {
  const { user } = useAuth();
  const [zones, setZones] = useState<Zone[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', latitude: '', longitude: '', radius: '100', zone_type: 'office' });
  const [employees, setEmployees] = useState<any[]>([]);
  const [assignModal, setAssignModal] = useState<string | null>(null);
  const [mapSearch, setMapSearch] = useState('');

  const loadZones = async () => {
    const { data } = await supabase.from('geofence_zones').select('*').order('created_at', { ascending: false });
    setZones((data as any[]) || []);
    setLoading(false);
  };

  const loadEmployees = async () => {
    const { data } = await supabase.from('profiles').select('id, user_id, name, profile_type, assigned_zone_id');
    setEmployees(data || []);
  };

  useEffect(() => { loadZones(); loadEmployees(); }, []);

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
    setShowForm(false);
    setEditingId(null);
    setForm({ name: '', latitude: '', longitude: '', radius: '100', zone_type: 'office' });
    loadZones();
  };

  const handleEdit = (z: Zone) => {
    setForm({ name: z.name, latitude: z.latitude.toString(), longitude: z.longitude.toString(), radius: z.radius.toString(), zone_type: z.zone_type });
    setEditingId(z.id);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this zone? Employees assigned to it will have their zone removed.')) return;
    // Unassign employees from this zone
    await supabase.from('profiles').update({ assigned_zone_id: null }).eq('assigned_zone_id', id);
    await supabase.from('geofence_zones').delete().eq('id', id);
    toast.success('Zone deleted');
    loadZones();
    loadEmployees();
  };

  const handleToggle = async (id: string, active: boolean) => {
    await supabase.from('geofence_zones').update({ is_active: !active }).eq('id', id);
    if (active) {
      toast.info('Zone deactivated — employees can now login from anywhere');
    } else {
      toast.success('Zone activated — location restriction enforced');
    }
    loadZones();
  };

  const handleAssignEmployee = async (employeeId: string, zoneId: string | null) => {
    await supabase.from('profiles').update({ assigned_zone_id: zoneId }).eq('id', employeeId);
    toast.success(zoneId ? 'Employee assigned to zone' : 'Location restriction removed (WFH mode)');
    loadEmployees();
  };

  const handleRemoveAllRestrictions = async (zoneId: string) => {
    const assigned = employees.filter(e => e.assigned_zone_id === zoneId);
    for (const emp of assigned) {
      await supabase.from('profiles').update({ assigned_zone_id: null }).eq('id', emp.id);
    }
    toast.success(`All ${assigned.length} employees set to Work From Home mode`);
    loadEmployees();
  };

  const getGoogleMapsEmbedUrl = (lat: string | number, lng: string | number, radius?: number) => {
    const zoom = radius ? Math.max(13, Math.min(18, 17 - Math.log2(Number(radius) / 50))) : 15;
    return `https://maps.google.com/maps?q=${lat},${lng}&z=${Math.round(zoom)}&output=embed`;
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold font-display">Location & Geofence Management</h2>
          <p className="text-sm text-muted-foreground">Set location zones for employee attendance. Disable zones to allow work from home.</p>
        </div>
        <button onClick={() => { setShowForm(true); setEditingId(null); setForm({ name: '', latitude: '', longitude: '', radius: '100', zone_type: 'office' }); }}
          className="btn-primary text-sm"><Plus className="w-4 h-4" /> Add Zone</button>
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
              <label className="block text-sm font-medium mb-1">Radius (meters) — Login area</label>
              <input type="number" value={form.radius} onChange={e => setForm(f => ({ ...f, radius: e.target.value }))} className="input-nawi" min={10} max={5000} />
              <p className="text-xs text-muted-foreground mt-1">Employees must be within this radius to login. Recommended: 50-200m for office.</p>
            </div>
            <div className="flex items-end">
              <button onClick={handleGetCurrentLocation} className="btn-outline text-sm w-full">
                <Navigation className="w-4 h-4" /> Use My Current Location
              </button>
            </div>
          </div>

          {/* Map Preview */}
          {form.latitude && form.longitude && (
            <div className="rounded-xl overflow-hidden border border-border">
              <iframe
                src={getGoogleMapsEmbedUrl(form.latitude, form.longitude, parseInt(form.radius))}
                className="w-full h-64"
                loading="lazy"
                allowFullScreen
                referrerPolicy="no-referrer-when-downgrade"
                title="Zone Location Preview"
              />
              <div className="bg-muted px-4 py-2 flex items-center justify-between">
                <p className="text-xs text-muted-foreground">📍 {Number(form.latitude).toFixed(6)}, {Number(form.longitude).toFixed(6)} — Radius: {form.radius}m</p>
                <a href={`https://www.google.com/maps?q=${form.latitude},${form.longitude}`} target="_blank" rel="noopener"
                  className="text-xs text-primary underline">Open in Google Maps</a>
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
      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Loading zones...</div>
      ) : zones.length === 0 ? (
        <div className="text-center py-12">
          <MapPin className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">No zones created yet</p>
          <p className="text-xs text-muted-foreground mt-1">Create a zone to enable location-based attendance</p>
          <p className="text-xs text-muted-foreground mt-1">Without zones, employees can login from anywhere</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {zones.map(z => {
            const assignedEmps = employees.filter(e => e.assigned_zone_id === z.id);
            return (
              <div key={z.id} className={`card-nawi relative ${!z.is_active ? 'opacity-60 border-dashed' : ''}`}>
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

                {/* Embedded Map */}
                <div className="rounded-lg overflow-hidden border border-border mb-3">
                  <iframe
                    src={getGoogleMapsEmbedUrl(z.latitude, z.longitude, z.radius)}
                    className="w-full h-40"
                    loading="lazy"
                    allowFullScreen
                    referrerPolicy="no-referrer-when-downgrade"
                    title={`Map of ${z.name}`}
                  />
                </div>

                <div className="bg-muted rounded-lg p-3 mb-3">
                  <p className="text-xs font-mono text-muted-foreground">📍 {z.latitude.toFixed(6)}, {z.longitude.toFixed(6)}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {z.is_active ? `✅ Active — Employees must be within ${z.radius}m to login` : '⏸️ Inactive — No location restriction'}
                  </p>
                </div>

                <div className="flex items-center justify-between">
                  <button onClick={() => handleToggle(z.id, z.is_active)}
                    className={`text-xs px-3 py-1.5 rounded-full flex items-center gap-1.5 font-medium transition-colors ${z.is_active ? 'bg-success/10 text-success hover:bg-success/20' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}>
                    {z.is_active ? <><ToggleRight className="w-4 h-4" /> Active</> : <><ToggleLeft className="w-4 h-4" /> Disabled (WFH)</>}
                  </button>
                  <button onClick={() => setAssignModal(z.id)} className="text-xs text-primary underline">
                    {assignedEmps.length} employee{assignedEmps.length !== 1 ? 's' : ''} assigned
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* WFH Info Card */}
      <div className="card-nawi bg-muted/30 border-dashed">
        <div className="flex items-start gap-3">
          <Home className="w-5 h-5 text-primary mt-0.5" />
          <div>
            <h3 className="text-sm font-semibold mb-1">Work From Home Mode</h3>
            <p className="text-xs text-muted-foreground">To allow employees to work from home:</p>
            <ul className="text-xs text-muted-foreground mt-1 space-y-0.5 list-disc list-inside">
              <li><strong>Entire zone:</strong> Click the Active/Disabled toggle to deactivate a zone — all assigned employees can login from anywhere</li>
              <li><strong>Specific employee:</strong> Remove their zone assignment from the employee list below — they can login from anywhere</li>
              <li><strong>Re-enable:</strong> Toggle the zone back to Active or re-assign the employee when they return to office</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Assign Modal */}
      {assignModal && (
        <div className="fixed inset-0 bg-foreground/50 z-50 flex items-center justify-center p-4" onClick={() => setAssignModal(null)}>
          <div className="bg-card rounded-xl shadow-elevated w-full max-w-md p-6 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold font-display mb-2">Assign Employees to Zone</h3>
            <p className="text-xs text-muted-foreground mb-2">
              Zone: <strong>{zones.find(z => z.id === assignModal)?.name}</strong>
            </p>
            <p className="text-xs text-muted-foreground mb-4">
              Tip: Remove an employee's zone to allow them to login from anywhere (WFH mode).
            </p>

            {employees.filter(e => e.assigned_zone_id === assignModal).length > 0 && (
              <button
                onClick={() => { handleRemoveAllRestrictions(assignModal); setAssignModal(null); }}
                className="btn-outline text-xs w-full mb-3 text-warning border-warning/30"
              >
                <Home className="w-3.5 h-3.5" /> Set All to WFH (Remove Restrictions)
              </button>
            )}

            <div className="space-y-2">
              {employees.map(emp => (
                <div key={emp.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-muted">
                  <div>
                    <p className="text-sm font-medium">{emp.name}</p>
                    <p className="text-xs text-muted-foreground capitalize">
                      {emp.profile_type}
                      {emp.assigned_zone_id && emp.assigned_zone_id !== assignModal && (
                        <span className="ml-1 text-warning">• Assigned to another zone</span>
                      )}
                      {!emp.assigned_zone_id && (
                        <span className="ml-1 text-success">• No restriction (WFH)</span>
                      )}
                    </p>
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
