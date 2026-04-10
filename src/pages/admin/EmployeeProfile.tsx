import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Edit, Save, X, Camera, MapPin } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { formatCurrency, formatDate } from '@/lib/supabase-service';
import StatusBadge from '@/components/ui/StatusBadge';

export default function EmployeeProfile() {
  const { id } = useParams();
  const [emp, setEmp] = useState<any>(null);
  const [tab, setTab] = useState('overview');
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<any>({});
  const [clients, setClients] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [attendance, setAttendance] = useState<any[]>([]);
  const [leave, setLeave] = useState<any[]>([]);
  const [goals, setGoals] = useState<any[]>([]);

  useEffect(() => {
    const fetchAll = async () => {
      // id here is the profile id or user_id — try both
      let { data: profile } = await supabase.from('profiles').select('*').eq('user_id', id!).maybeSingle();
      if (!profile) {
        const res = await supabase.from('profiles').select('*').eq('id', id!).maybeSingle();
        profile = res.data;
      }
      if (!profile) return;
      setEmp(profile);
      setForm(profile);

      const userId = profile.user_id;
      const [cRes, tRes, aRes, lRes, gRes] = await Promise.all([
        supabase.from('clients').select('*').or(`assigned_to.eq.${userId},created_by.eq.${userId}`),
        supabase.from('tasks').select('*').or(`assigned_to.eq.${userId},created_by.eq.${userId}`),
        supabase.from('attendance').select('*').eq('employee_id', userId).order('date', { ascending: false }).limit(50),
        supabase.from('leave_requests').select('*').eq('employee_id', userId).order('created_at', { ascending: false }),
        supabase.from('goals').select('*').or(`assigned_to.eq.${userId},assigned_to.is.null`),
      ]);
      setClients(cRes.data || []);
      setTasks(tRes.data || []);
      setAttendance(aRes.data || []);
      setLeave(lRes.data || []);
      setGoals(gRes.data || []);
    };
    fetchAll();
  }, [id]);

  if (!emp) return <div className="skeleton-nawi h-64 w-full" />;

  const isSales = emp.profile_type === 'sales';

  const handleSave = async () => {
    const updates: any = { name: form.name, email: form.email, mobile: form.mobile, passport_no: form.passport_no, emirates_id: form.emirates_id, base_salary: Number(form.base_salary) || 0 };
    await supabase.from('profiles').update(updates).eq('id', emp.id);
    setEmp({ ...emp, ...updates });
    setEditing(false);
  };

  const tabs = ['overview', 'clients', 'tasks', 'attendance', 'leave', 'goals'];

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
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-foreground font-display">{emp.name}</h1>
            {isSales && <span className="text-xs bg-warning/10 text-warning px-2 py-0.5 rounded-full flex items-center gap-1"><MapPin className="w-3 h-3" />Sales</span>}
            {!isSales && <span className="text-xs bg-secondary/10 text-secondary px-2 py-0.5 rounded-full flex items-center gap-1"><MapPin className="w-3 h-3" />Office</span>}
          </div>
          <div className="flex items-center gap-2 mt-1">
            <StatusBadge status={emp.status} />
            <span className="text-xs text-muted-foreground">Joined {formatDate(emp.created_at)}</span>
          </div>
        </div>
      </div>

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
          <div className="mt-4 pt-4 border-t border-border">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><MapPin className="w-4 h-4" /> Location Zone</h3>
            <p className="text-sm text-muted-foreground">
              {emp.assigned_zone_id
                ? 'Employee has a location zone assigned. Manage zones in Geofence Management.'
                : 'No location restriction — employee can login from anywhere (WFH mode).'}
            </p>
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
