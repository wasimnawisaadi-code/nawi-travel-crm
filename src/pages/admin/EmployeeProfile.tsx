import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Edit, Save, X } from 'lucide-react';
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
  const payroll = storage.getAll(KEYS.PAYROLL).filter((p: any) => p.employeeId === emp.id);

  const handleSave = () => {
    storage.update(KEYS.EMPLOYEES, emp.id, form);
    setEmp({ ...emp, ...form });
    setEditing(false);
  };

  const tabs = ['overview', 'clients', 'tasks', 'attendance', 'leave', 'payroll'];

  return (
    <div className="space-y-4 animate-fade-in">
      <Link to="/admin/employees" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="w-4 h-4" /> Back</Link>
      <div className="card-nawi flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <div className="w-14 h-14 rounded-full bg-primary flex items-center justify-center text-xl font-bold text-primary-foreground">
          {emp.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
        </div>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-foreground font-display">{emp.name}</h1>
          <div className="flex items-center gap-2 mt-1">
            <span className="font-mono text-xs text-muted-foreground">{emp.id}</span>
            <StatusBadge status={emp.status} />
            <span className="text-xs text-muted-foreground">Joined {formatDate(emp.createdAt)}</span>
          </div>
        </div>
      </div>

      <div className="flex gap-1 border-b border-border overflow-x-auto">
        {tabs.map((t) => (
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
              { label: 'Mobile', key: 'mobile' }, { label: 'Base Salary', key: 'baseSalary' },
              { label: 'Passport No.', key: 'passportNo' }, { label: 'Emirates ID', key: 'emiratesId' },
              { label: 'Leave Balance', key: 'leaveBalance' },
            ].map(({ label, key }) => (
              <div key={key}>
                <label className="block text-xs text-muted-foreground mb-1">{label}</label>
                {editing ? (
                  <input value={form[key] || ''} onChange={(e) => setForm({ ...form, [key]: key === 'baseSalary' || key === 'leaveBalance' ? Number(e.target.value) : e.target.value })} className="input-nawi" />
                ) : (
                  <p className="text-sm font-medium text-foreground">{key === 'baseSalary' ? formatCurrency(emp[key] || 0) : (emp[key] || '—')}</p>
                )}
              </div>
            ))}
          </div>
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
              <thead><tr><th>Date</th><th>Login</th><th>Logout</th><th>Hours</th><th>Status</th></tr></thead>
              <tbody>{attendance.sort((a: any, b: any) => b.date.localeCompare(a.date)).map((a: any) => <tr key={a.id}><td>{formatDate(a.date)}</td><td>{a.loginTime ? new Date(a.loginTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '—'}</td><td>{a.logoutTime ? new Date(a.logoutTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '—'}</td><td>{a.hoursWorked || 0}h</td><td><StatusBadge status={a.status} /></td></tr>)}</tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'leave' && (
        <div className="card-nawi p-0 overflow-x-auto">
          {leave.length === 0 ? <p className="text-sm text-muted-foreground text-center py-8">No leave records</p> : (
            <table className="table-nawi w-full">
              <thead><tr><th>Dates</th><th>Days</th><th>Reason</th><th>Status</th></tr></thead>
              <tbody>{leave.map((l: any) => <tr key={l.id}><td>{formatDate(l.startDate)} - {formatDate(l.endDate)}</td><td>{l.days}</td><td>{l.reason}</td><td><StatusBadge status={l.status} /></td></tr>)}</tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'payroll' && (
        <div className="card-nawi p-0 overflow-x-auto">
          {payroll.length === 0 ? <p className="text-sm text-muted-foreground text-center py-8">No payroll records</p> : (
            <table className="table-nawi w-full">
              <thead><tr><th>Month</th><th>Base</th><th>Deductions</th><th>Bonus</th><th>Final</th><th>Status</th></tr></thead>
              <tbody>{payroll.map((p: any) => <tr key={p.id}><td>{p.yearMonth}</td><td>{formatCurrency(p.baseSalary)}</td><td>{formatCurrency((p.leaveDeduction || 0) + (p.absenceDeduction || 0))}</td><td>{formatCurrency(p.bonus || 0)}</td><td className="font-semibold">{formatCurrency(p.finalSalary)}</td><td><StatusBadge status={p.status} /></td></tr>)}</tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
