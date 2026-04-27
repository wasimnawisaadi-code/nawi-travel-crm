import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Edit, Save, X, MapPin, Power, PowerOff, Trash2, Clock, Shield } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { formatCurrency, formatDate, auditLog } from '@/lib/supabase-service';
import StatusBadge from '@/components/ui/StatusBadge';
import PasswordConfirmDialog from '@/components/PasswordConfirmDialog';
import { getAttendanceSettings, getAttendanceOverrides, saveAttendanceOverrides, type EmployeeOverride } from '@/lib/settings';
import { toast } from 'sonner';

export default function EmployeeProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [emp, setEmp] = useState<any>(null);
  const [empRole, setEmpRole] = useState<'admin' | 'superadmin' | 'employee'>('employee');
  const [tab, setTab] = useState('overview');
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<any>({});
  const [clients, setClients] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [attendance, setAttendance] = useState<any[]>([]);
  const [leave, setLeave] = useState<any[]>([]);
  const [goals, setGoals] = useState<any[]>([]);
  const [pwdAction, setPwdAction] = useState<'save' | 'activate' | 'deactivate' | 'delete' | null>(null);
  const [zones, setZones] = useState<any[]>([]);
  const [globalAtt, setGlobalAtt] = useState<any>(null);
  const [override, setOverride] = useState<EmployeeOverride>({});
  const [savingZone, setSavingZone] = useState(false);
  const [savingSchedule, setSavingSchedule] = useState(false);

  useEffect(() => {
    const fetchAll = async () => {
      // id here is the profile id or user_id — try both
      let { data: profile } = await supabase.from('profiles').select('*').eq('user_id', id!).maybeSingle();
      if (!profile) {
        const res = await supabase.from('profiles').select('*').eq('id', id!).maybeSingle();
        profile = res.data;
      }
      if (!profile) return;

      // Skip admin/superadmin accounts silently — they don't appear in employee list
      const { data: roleRows } = await supabase.from('user_roles').select('role').eq('user_id', profile.user_id);
      const roles = new Set((roleRows || []).map((r: any) => r.role));
      if (roles.has('admin') || roles.has('superadmin')) {
        navigate('/admin/employees');
        return;
      }

      setEmp(profile);
      setForm(profile);

      const userId = profile.user_id;
      const [cRes, tRes, aRes, lRes, gRes, zRes, ovAll, baseAtt] = await Promise.all([
        supabase.from('clients').select('*').or(`assigned_to.eq.${userId},created_by.eq.${userId}`),
        supabase.from('tasks').select('*').or(`assigned_to.eq.${userId},created_by.eq.${userId}`),
        supabase.from('attendance').select('*').eq('employee_id', userId).order('date', { ascending: false }).limit(50),
        supabase.from('leave_requests').select('*').eq('employee_id', userId).order('created_at', { ascending: false }),
        supabase.from('goals').select('*').or(`assigned_to.eq.${userId},assigned_to.is.null`),
        supabase.from('geofence_zones').select('*').eq('is_active', true).order('name'),
        getAttendanceOverrides(),
        getAttendanceSettings(),
      ]);
      setClients(cRes.data || []);
      setTasks(tRes.data || []);
      setAttendance(aRes.data || []);
      setLeave(lRes.data || []);
      setGoals(gRes.data || []);
      setZones(zRes.data || []);
      setGlobalAtt(baseAtt);
      setOverride(ovAll[userId] || {});
    };
    fetchAll();
  }, [id]);

  if (!emp) return <div className="skeleton-nawi h-64 w-full" />;

  const handleSave = async () => {
    const updates: any = { name: form.name, email: form.email, mobile: form.mobile, passport_no: form.passport_no, emirates_id: form.emirates_id, base_salary: Number(form.base_salary) || 0 };
    await supabase.from('profiles').update(updates).eq('id', emp.id);
    await auditLog('employee_updated', 'employee', emp.user_id, updates);
    setEmp({ ...emp, ...updates });
    setEditing(false);
    toast.success('Employee updated');
  };

  const runPwdAction = async () => {
    if (!pwdAction || !emp) return;
    if (pwdAction === 'save') return handleSave();
    if (pwdAction === 'activate') {
      await supabase.from('profiles').update({ status: 'active' }).eq('user_id', emp.user_id);
      await auditLog('employee_activated', 'employee', emp.user_id, { name: emp.name });
      setEmp({ ...emp, status: 'active' });
      toast.success('Activated');
    } else if (pwdAction === 'deactivate') {
      await supabase.from('profiles').update({ status: 'inactive' }).eq('user_id', emp.user_id);
      await auditLog('employee_deactivated', 'employee', emp.user_id, { name: emp.name });
      setEmp({ ...emp, status: 'inactive' });
      toast.success('Deactivated — login disabled');
    } else if (pwdAction === 'delete') {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-delete-employee`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ user_id: emp.user_id }),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.error || 'Delete failed'); return; }
      await auditLog('employee_deleted', 'employee', emp.user_id, { name: emp.name });
      toast.success('Employee deleted permanently');
      navigate('/admin/employees');
    }
  };

  const handleAssignZone = async (zoneId: string | null) => {
    setSavingZone(true);
    const { error } = await supabase.from('profiles').update({ assigned_zone_id: zoneId }).eq('id', emp.id);
    setSavingZone(false);
    if (error) { toast.error('Failed to assign zone'); return; }
    setEmp({ ...emp, assigned_zone_id: zoneId });
    await auditLog('employee_zone_assigned', 'employee', emp.user_id, { zone_id: zoneId });
    toast.success(zoneId ? 'Zone assigned' : 'Zone cleared');
  };

  const handleSaveSchedule = async () => {
    setSavingSchedule(true);
    const allOverrides = await getAttendanceOverrides();
    const cleaned: EmployeeOverride = { ...override };
    Object.keys(cleaned).forEach(k => {
      const v = (cleaned as any)[k];
      if (v === '' || v === undefined || v === null) delete (cleaned as any)[k];
    });
    const next = { ...allOverrides };
    if (Object.keys(cleaned).length === 0) delete next[emp.user_id]; else next[emp.user_id] = cleaned;
    const { error } = await saveAttendanceOverrides(next);
    setSavingSchedule(false);
    if (error) { toast.error('Save failed'); return; }
    await auditLog('employee_schedule_updated', 'employee', emp.user_id, cleaned as any);
    toast.success('Schedule saved');
  };

  const tabs = ['overview', 'schedule', 'clients', 'tasks', 'attendance', 'leave', 'goals'];
  const assignedZone = zones.find(z => z.id === emp?.assigned_zone_id);
  const effective = { ...(globalAtt || {}), ...override };

  const getMapsEmbed = (lat: number, lng: number, radius?: number) => {
    const zoom = radius ? Math.max(13, Math.min(18, 17 - Math.log2(radius / 50))) : 15;
    return `https://maps.google.com/maps?q=${lat},${lng}&z=${Math.round(zoom)}&output=embed`;
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <Link to="/admin/employees" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="w-4 h-4" /> Back</Link>
      <div className="card-nawi flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <div className="relative">
          {emp.photo_url ? (
            <img src={emp.photo_url} alt="" className="w-16 h-16 rounded-full object-cover" />
          ) : (
            <div className="w-16 h-16 rounded-full bg-primary flex items-center justify-center text-xl font-bold text-primary-foreground">
              {emp.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
            </div>
          )}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold text-foreground font-display">{emp.name}</h1>
          </div>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <StatusBadge status={emp.status} />
            <span className="text-xs text-muted-foreground">Joined {formatDate(emp.created_at)}</span>
            {assignedZone ? (
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium inline-flex items-center gap-1">
                <MapPin className="w-3 h-3" /> {assignedZone.name} ({assignedZone.radius}m)
              </span>
            ) : (
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-warning/10 text-warning font-medium inline-flex items-center gap-1">
                <MapPin className="w-3 h-3" /> No zone
              </span>
            )}
            {Object.keys(override).length > 0 && (
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground font-medium">Custom schedule</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {emp.status === 'active' ? (
            <button onClick={() => setPwdAction('deactivate')} className="btn-outline text-warning border-warning/30 hover:bg-warning/10"><PowerOff className="w-4 h-4" /> Deactivate</button>
          ) : (
            <button onClick={() => setPwdAction('activate')} className="btn-outline text-success border-success/30 hover:bg-success/10"><Power className="w-4 h-4" /> Activate</button>
          )}
          <button onClick={() => setPwdAction('delete')} className="btn-danger"><Trash2 className="w-4 h-4" /> Delete</button>
        </div>
      </div>

      <PasswordConfirmDialog
        open={!!pwdAction}
        onClose={() => setPwdAction(null)}
        onConfirm={runPwdAction}
        title={
          pwdAction === 'delete' ? `Delete ${emp.name}` :
          pwdAction === 'activate' ? `Activate ${emp.name}` :
          pwdAction === 'deactivate' ? `Deactivate ${emp.name}` :
          'Confirm changes'
        }
        description={
          pwdAction === 'delete' ? 'Permanently deletes this employee, their login, and unassigns all clients/tasks. Cannot be undone.' :
          pwdAction === 'activate' ? 'Re-enable login for this employee.' :
          pwdAction === 'deactivate' ? 'Disable login. The profile is kept for records.' :
          'Save profile changes.'
        }
        actionLabel={
          pwdAction === 'delete' ? 'Delete Permanently' :
          pwdAction === 'activate' ? 'Activate' :
          pwdAction === 'deactivate' ? 'Deactivate' : 'Save'
        }
        destructive={pwdAction !== 'activate' && pwdAction !== 'save'}
      />

      <div className="flex gap-1 border-b border-border overflow-x-auto">
        {tabs.map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2.5 text-sm font-medium capitalize whitespace-nowrap transition-colors ${tab === t ? 'text-primary border-b-2 border-primary' : 'text-muted-foreground hover:text-foreground'}`}>{t}</button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="card-nawi">
          <div className="flex justify-end mb-4">
            {editing ? (
              <div className="flex gap-2"><button onClick={handleSave} className="btn-primary"><Save className="w-4 h-4" /> Save</button><button onClick={() => { setEditing(false); setForm(emp); }} className="btn-outline"><X className="w-4 h-4" /></button></div>
            ) : (
              <button onClick={() => setEditing(true)} className="btn-outline"><Edit className="w-4 h-4" /> Edit</button>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              { label: 'Full Name', key: 'name' }, { label: 'Email', key: 'email' },
              { label: 'Mobile', key: 'mobile' }, { label: 'Passport No.', key: 'passport_no' },
              { label: 'Emirates ID', key: 'emirates_id' }, { label: 'Base Salary', key: 'base_salary' },
            ].map(({ label, key }) => (
              <div key={key}>
                <label className="block text-xs text-muted-foreground mb-1">{label}</label>
                {editing ? (
                  <input value={form[key] || ''} onChange={(e) => setForm({ ...form, [key]: key === 'base_salary' ? Number(e.target.value) : e.target.value })} className="input-nawi" type={key === 'base_salary' ? 'number' : 'text'} />
                ) : (
                  <p className="text-sm font-medium text-foreground">{key === 'base_salary' ? formatCurrency(emp[key] || 0) : (emp[key] || '—')}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'schedule' && (
        <div className="space-y-4">
          {/* ZONE CARD */}
          <div className="card-nawi space-y-3">
            <div className="flex items-center gap-2">
              <MapPin className="w-5 h-5 text-primary" />
              <h3 className="font-semibold font-display">Geofence Zone</h3>
              {savingZone && <span className="text-xs text-muted-foreground">Saving…</span>}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-start">
              <div className="md:col-span-1 space-y-2">
                <label className="block text-xs text-muted-foreground">Assigned Zone</label>
                <select
                  value={emp.assigned_zone_id || ''}
                  onChange={(e) => handleAssignZone(e.target.value || null)}
                  className="input-nawi text-sm"
                >
                  <option value="">— No zone (login from anywhere) —</option>
                  {zones.map(z => (
                    <option key={z.id} value={z.id}>{z.name} ({z.zone_type}, {z.radius}m)</option>
                  ))}
                </select>
                {assignedZone ? (
                  <div className="text-xs text-muted-foreground space-y-0.5">
                    <p>📍 {assignedZone.latitude.toFixed(6)}, {assignedZone.longitude.toFixed(6)}</p>
                    <p>Radius: <span className="text-foreground font-medium">{assignedZone.radius}m</span> · Type: <span className="capitalize">{assignedZone.zone_type}</span></p>
                    <a href={`https://www.google.com/maps?q=${assignedZone.latitude},${assignedZone.longitude}`} target="_blank" rel="noopener" className="text-primary underline">Open in Google Maps ↗</a>
                  </div>
                ) : (
                  <p className="text-xs text-warning">No zone assigned — falls back to default zone or any active office zone.</p>
                )}
                <label className="flex items-center gap-2 cursor-pointer text-xs pt-2 border-t border-border">
                  <input
                    type="checkbox"
                    checked={override.enforce_geofence !== false}
                    onChange={(e) => setOverride({ ...override, enforce_geofence: e.target.checked ? undefined : false })}
                    className="w-4 h-4 rounded border-border"
                  />
                  <Shield className="w-3.5 h-3.5" />
                  <span>Enforce geofence on login</span>
                </label>
                <p className="text-[11px] text-muted-foreground pl-6">Uncheck for sales/field staff who work outside.</p>
              </div>
              {assignedZone && (
                <div className="md:col-span-2 rounded-lg overflow-hidden border border-border">
                  <iframe
                    src={getMapsEmbed(assignedZone.latitude, assignedZone.longitude, assignedZone.radius)}
                    className="w-full h-56" loading="lazy" title={assignedZone.name}
                  />
                </div>
              )}
            </div>
          </div>

          {/* SCHEDULE CARD */}
          <div className="card-nawi space-y-4">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-primary" />
              <h3 className="font-semibold font-display">Work Schedule</h3>
              <span className="text-xs text-muted-foreground">— blank fields use the company default</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Work Start</label>
                <input type="time" value={override.work_start || ''}
                  onChange={(e) => setOverride({ ...override, work_start: e.target.value || undefined })}
                  className="input-nawi text-sm" />
                <p className="text-[10px] text-muted-foreground mt-0.5">Default: {globalAtt?.work_start}</p>
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Work End</label>
                <input type="time" value={override.work_end || ''}
                  onChange={(e) => setOverride({ ...override, work_end: e.target.value || undefined })}
                  className="input-nawi text-sm" />
                <p className="text-[10px] text-muted-foreground mt-0.5">Default: {globalAtt?.work_end}</p>
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Grace (min)</label>
                <input type="number" min={0} max={120} value={override.grace_minutes ?? ''}
                  onChange={(e) => setOverride({ ...override, grace_minutes: e.target.value === '' ? undefined : Math.max(0, Number(e.target.value) || 0) })}
                  className="input-nawi text-sm" />
                <p className="text-[10px] text-muted-foreground mt-0.5">Default: {globalAtt?.grace_minutes}m</p>
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Half Day Below (h)</label>
                <input type="number" min={0} max={12} step={0.5} value={override.half_day_after_hours ?? ''}
                  onChange={(e) => setOverride({ ...override, half_day_after_hours: e.target.value === '' ? undefined : Math.max(0, Number(e.target.value) || 0) })}
                  className="input-nawi text-sm" />
                <p className="text-[10px] text-muted-foreground mt-0.5">Default: {globalAtt?.half_day_after_hours}h</p>
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Full Day From (h)</label>
                <input type="number" min={0} max={16} step={0.5} value={override.min_full_day_hours ?? ''}
                  onChange={(e) => setOverride({ ...override, min_full_day_hours: e.target.value === '' ? undefined : Math.max(0, Number(e.target.value) || 0) })}
                  className="input-nawi text-sm" />
                <p className="text-[10px] text-muted-foreground mt-0.5">Default: {globalAtt?.min_full_day_hours}h</p>
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Early Leave (min)</label>
                <input type="number" min={0} max={120} value={override.early_leave_threshold_min ?? ''}
                  onChange={(e) => setOverride({ ...override, early_leave_threshold_min: e.target.value === '' ? undefined : Math.max(0, Number(e.target.value) || 0) })}
                  className="input-nawi text-sm" />
                <p className="text-[10px] text-muted-foreground mt-0.5">Default: {globalAtt?.early_leave_threshold_min}m</p>
              </div>
            </div>

            {/* Effective preview */}
            <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs space-y-1">
              <p className="font-semibold text-foreground">Effective for {emp.name}:</p>
              <p className="text-muted-foreground">⏰ {effective.work_start} → {effective.work_end} · Grace {effective.grace_minutes}m · Late after {effective.work_start}+{effective.grace_minutes}m</p>
              <p className="text-muted-foreground">📊 Half Day &lt; {effective.half_day_after_hours}h · Full Day ≥ {effective.min_full_day_hours}h · Early Leave if logout {effective.early_leave_threshold_min}m before {effective.work_end}</p>
              <p className="text-muted-foreground">📍 Geofence: {effective.enforce_geofence !== false ? 'enforced' : 'disabled (this employee)'} · Auto-logout: {effective.auto_logout_outside_zone ? 'on' : 'off'}</p>
            </div>

            <div className="flex gap-2">
              <button onClick={handleSaveSchedule} disabled={savingSchedule} className="btn-primary text-sm">
                <Save className="w-4 h-4" /> {savingSchedule ? 'Saving…' : 'Save Schedule'}
              </button>
              {Object.keys(override).length > 0 && (
                <button
                  onClick={() => setOverride({})}
                  className="btn-outline text-sm text-destructive border-destructive/30"
                >
                  Reset to defaults
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {tab === 'clients' && (
        <div className="card-nawi p-0 overflow-x-auto">
          {clients.length === 0 ? <p className="text-sm text-muted-foreground text-center py-8">No clients assigned</p> : (
            <table className="table-nawi w-full">
              <thead><tr><th>ID</th><th>Name</th><th>Service</th><th>Status</th><th>Revenue</th></tr></thead>
              <tbody>{clients.map(c => <tr key={c.id}><td className="font-mono text-xs">{c.display_id}</td><td>{c.name}</td><td>{c.service}</td><td><StatusBadge status={c.status} /></td><td>{formatCurrency(c.revenue || 0)}</td></tr>)}</tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'tasks' && (
        <div className="card-nawi p-0 overflow-x-auto">
          {tasks.length === 0 ? <p className="text-sm text-muted-foreground text-center py-8">No tasks</p> : (
            <table className="table-nawi w-full">
              <thead><tr><th>ID</th><th>Title</th><th>Client</th><th>Due</th><th>Status</th></tr></thead>
              <tbody>{tasks.map(t => <tr key={t.id}><td className="font-mono text-xs">{t.display_id}</td><td>{t.title}</td><td>{t.client_name}</td><td>{formatDate(t.due_date)}</td><td><StatusBadge status={t.status} /></td></tr>)}</tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'attendance' && (
        <div className="card-nawi p-0 overflow-x-auto">
          {attendance.length === 0 ? <p className="text-sm text-muted-foreground text-center py-8">No records</p> : (
            <table className="table-nawi w-full">
              <thead><tr><th>Date</th><th>Login</th><th>Logout</th><th>Hours</th><th>Work Summary</th><th>Status</th></tr></thead>
              <tbody>{attendance.map(a => (
                <tr key={a.id}>
                  <td>{formatDate(a.date)}</td>
                  <td>{a.login_time ? new Date(a.login_time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                  <td>{a.logout_time ? new Date(a.logout_time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                  <td>{a.hours_worked || 0}h</td>
                  <td className="max-w-[200px] truncate text-xs">{a.work_summary || '—'}</td>
                  <td><StatusBadge status={a.status} /></td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'leave' && (
        <div className="card-nawi p-0 overflow-x-auto">
          {leave.length === 0 ? <p className="text-sm text-muted-foreground text-center py-8">No leave records</p> : (
            <table className="table-nawi w-full">
              <thead><tr><th>Type</th><th>Dates</th><th>Days</th><th>Reason</th><th>Status</th></tr></thead>
              <tbody>{leave.map(l => <tr key={l.id}><td><span className="badge-new text-xs">{l.leave_type}</span></td><td>{formatDate(l.start_date)} - {formatDate(l.end_date)}</td><td>{l.days}</td><td className="max-w-[150px] truncate">{l.reason}</td><td><StatusBadge status={l.status} /></td></tr>)}</tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'goals' && (
        <div className="card-nawi">
          {goals.length === 0 ? <p className="text-sm text-muted-foreground text-center py-8">No goals assigned</p> : (
            <div className="space-y-3">
              {goals.map(g => (
                <div key={g.id} className="p-3 border border-border rounded-lg">
                  <p className="font-medium">{g.title || g.service}</p>
                  <p className="text-xs text-muted-foreground">{g.start_date ? `${formatDate(g.start_date)} → ${formatDate(g.end_date)}` : g.year_month}</p>
                  {g.description && <p className="text-xs text-muted-foreground mt-1">{g.description}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
