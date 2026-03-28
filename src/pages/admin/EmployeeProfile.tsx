import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Edit, Save, X, Camera, Wifi, MapPin, Image } from 'lucide-react';
import { storage, KEYS, formatCurrency, formatDate } from '@/lib/storage';
import StatusBadge from '@/components/ui/StatusBadge';

export default function EmployeeProfile() {
  const { id } = useParams();
  const [emp, setEmp] = useState<any>(null);
  const [tab, setTab] = useState('overview');
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<any>({});

  useEffect(() => {
    const e = storage.getAll(KEYS.EMPLOYEES).find((e: any) => e.id === id);
    if (e) { setEmp(e); setForm(e); }
  }, [id]);

  if (!emp) return <div className="skeleton-nawi h-64 w-full" />;

  const clients = storage.getAll(KEYS.CLIENTS).filter((c: any) => c.assignedTo === emp.id || c.createdBy === emp.id);
  const tasks = storage.getAll(KEYS.TASKS).filter((t: any) => t.assignedTo === emp.id);
  const attendance = storage.getAll(KEYS.ATTENDANCE).filter((a: any) => a.employeeId === emp.id);
  const leave = storage.getAll(KEYS.LEAVE).filter((l: any) => l.employeeId === emp.id);
  const goals = storage.getAll(KEYS.GOALS).filter((g: any) => g.assignedTo === emp.id || !g.assignedTo);
  const isSales = emp.profileType === 'sales';

  const handleSave = () => {
    const updates: any = { ...form };
    if (typeof updates.allowedIPs === 'string') {
      updates.allowedIPs = updates.allowedIPs.split(',').map((ip: string) => ip.trim()).filter(Boolean);
    }
    storage.update(KEYS.EMPLOYEES, emp.id, updates);
    setEmp({ ...emp, ...updates });
    setEditing(false);
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const photo = reader.result as string;
      setForm({ ...form, photo });
      storage.update(KEYS.EMPLOYEES, emp.id, { photo });
      setEmp({ ...emp, photo });
    };
    reader.readAsDataURL(file);
  };

  const tabs = ['overview', 'clients', 'tasks', 'attendance', 'leave', 'goals'];
  if (isSales) tabs.push('field-logs');

  return (
    <div className="space-y-4 animate-fade-in">
      <Link to="/admin/employees" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="w-4 h-4" /> Back</Link>
      <div className="card-nawi flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <div className="relative">
          {emp.photo ? (
            <img src={emp.photo} alt="" className="w-16 h-16 rounded-full object-cover" />
          ) : (
            <div className="w-16 h-16 rounded-full bg-primary flex items-center justify-center text-xl font-bold text-primary-foreground">
              {emp.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
            </div>
          )}
          <label className="absolute bottom-0 right-0 w-6 h-6 bg-secondary rounded-full flex items-center justify-center cursor-pointer">
            <Camera className="w-3 h-3 text-secondary-foreground" />
            <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
          </label>
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-foreground font-display">{emp.name}</h1>
            {isSales && <span className="text-xs bg-warning/10 text-warning px-2 py-0.5 rounded-full flex items-center gap-1"><MapPin className="w-3 h-3" />Sales</span>}
            {!isSales && <span className="text-xs bg-secondary/10 text-secondary px-2 py-0.5 rounded-full flex items-center gap-1"><Wifi className="w-3 h-3" />Office</span>}
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className="font-mono text-xs text-muted-foreground">{emp.id}</span>
            <StatusBadge status={emp.status} />
            <span className="text-xs text-muted-foreground">Joined {formatDate(emp.createdAt)}</span>
          </div>
        </div>
      </div>

      <div className="flex gap-1 border-b border-border overflow-x-auto">
        {tabs.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2.5 text-sm font-medium capitalize whitespace-nowrap transition-colors ${tab === t ? 'text-primary border-b-2 border-primary' : 'text-muted-foreground hover:text-foreground'}`}>
            {t === 'field-logs' ? 'Field Logs' : t}
          </button>
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
              { label: 'Mobile', key: 'mobile' }, { label: 'Passport No.', key: 'passportNo' },
              { label: 'Emirates ID', key: 'emiratesId' }, { label: 'Base Salary', key: 'baseSalary' },
            ].map(({ label, key }) => (
              <div key={key}>
                <label className="block text-xs text-muted-foreground mb-1">{label}</label>
                {editing ? (
                  <input value={form[key] || ''} onChange={(e) => setForm({ ...form, [key]: key === 'baseSalary' ? Number(e.target.value) : e.target.value })} className="input-nawi" type={key === 'baseSalary' ? 'number' : 'text'} />
                ) : (
                  <p className="text-sm font-medium text-foreground">{key === 'baseSalary' ? formatCurrency(emp[key] || 0) : (emp[key] || '—')}</p>
                )}
              </div>
            ))}
          </div>

          {/* IP Restriction Settings */}
          {!isSales && (
            <div className="mt-4 pt-4 border-t border-border">
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><Wifi className="w-4 h-4" /> WiFi IP Restriction</h3>
              {editing ? (
                <div>
                  <input value={Array.isArray(form.allowedIPs) ? form.allowedIPs.join(', ') : form.allowedIPs || ''} onChange={(e) => setForm({ ...form, allowedIPs: e.target.value })} className="input-nawi" placeholder="192.168.1.1, 10.0.0.1 (comma separated)" />
                  <p className="text-xs text-muted-foreground mt-1">Employee can only login from these IP addresses. Leave empty to allow all.</p>
                </div>
              ) : (
                <div>
                  {emp.allowedIPs?.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {emp.allowedIPs.map((ip: string, i: number) => (
                        <span key={i} className="text-xs bg-secondary/10 text-secondary px-2 py-1 rounded-full font-mono">{ip}</span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No IP restriction — employee can login from anywhere</p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {tab === 'clients' && (
        <div className="card-nawi p-0 overflow-x-auto">
          {clients.length === 0 ? <p className="text-sm text-muted-foreground text-center py-8">No clients assigned</p> : (
            <table className="table-nawi w-full">
              <thead><tr><th>ID</th><th>Name</th><th>Service</th><th>Status</th><th>Revenue</th></tr></thead>
              <tbody>{clients.map((c: any) => <tr key={c.id}><td className="font-mono text-xs">{c.id}</td><td>{c.name}</td><td>{c.service}</td><td><StatusBadge status={c.status} /></td><td>{formatCurrency(c.revenue || 0)}</td></tr>)}</tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'tasks' && (
        <div className="card-nawi p-0 overflow-x-auto">
          {tasks.length === 0 ? <p className="text-sm text-muted-foreground text-center py-8">No tasks</p> : (
            <table className="table-nawi w-full">
              <thead><tr><th>ID</th><th>Title</th><th>Client</th><th>Due</th><th>Status</th></tr></thead>
              <tbody>{tasks.map((t: any) => <tr key={t.id}><td className="font-mono text-xs">{t.id}</td><td>{t.title}</td><td>{t.clientName}</td><td>{formatDate(t.dueDate)}</td><td><StatusBadge status={t.status} /></td></tr>)}</tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'attendance' && (
        <div className="card-nawi p-0 overflow-x-auto">
          {attendance.length === 0 ? <p className="text-sm text-muted-foreground text-center py-8">No records</p> : (
            <table className="table-nawi w-full">
              <thead><tr><th>Date</th><th>Login</th><th>Logout</th><th>Hours</th><th>Work Summary</th><th>Status</th></tr></thead>
              <tbody>{attendance.sort((a: any, b: any) => b.date.localeCompare(a.date)).map((a: any) => (
                <tr key={a.id}>
                  <td>{formatDate(a.date)}</td>
                  <td>{a.loginTime ? new Date(a.loginTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                  <td>{a.logoutTime ? new Date(a.logoutTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                  <td>{a.hoursWorked || 0}h</td>
                  <td className="max-w-[200px] truncate text-xs">{a.workSummary || '—'}</td>
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
              <tbody>{leave.map((l: any) => <tr key={l.id}><td><span className="badge-new text-xs">{l.leaveType}</span></td><td>{formatDate(l.startDate)} - {formatDate(l.endDate)}</td><td>{l.days}</td><td className="max-w-[150px] truncate">{l.reason}</td><td><StatusBadge status={l.status} /></td></tr>)}</tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'goals' && (
        <div className="card-nawi">
          {goals.length === 0 ? <p className="text-sm text-muted-foreground text-center py-8">No goals assigned</p> : (
            <div className="space-y-3">
              {goals.map((g: any) => (
                <div key={g.id} className="p-3 border border-border rounded-lg">
                  <p className="font-medium">{g.title}</p>
                  <p className="text-xs text-muted-foreground">{g.startDate ? `${formatDate(g.startDate)} → ${formatDate(g.endDate)}` : g.yearMonth}</p>
                  {g.description && <p className="text-xs text-muted-foreground mt-1">{g.description}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'field-logs' && isSales && (
        <div className="card-nawi">
          <h3 className="font-semibold font-display mb-4 flex items-center gap-2"><Image className="w-4 h-4" /> Daily Field Logs</h3>
          {(() => {
            const logs = attendance.filter((a: any) => a.fieldPhotos?.length > 0).sort((a: any, b: any) => b.date.localeCompare(a.date));
            return logs.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No field logs uploaded yet</p>
            ) : (
              <div className="space-y-4">
                {logs.map((a: any) => (
                  <div key={a.id} className="border border-border rounded-xl p-4">
                    <p className="text-sm font-semibold mb-2">{formatDate(a.date)}</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {a.fieldPhotos.map((photo: any, i: number) => (
                        <div key={i} className="rounded-lg overflow-hidden border border-border">
                          <img src={photo.base64} alt="" className="w-full h-32 object-cover" />
                          <p className="text-xs text-muted-foreground p-2">{photo.location || 'No location'}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
