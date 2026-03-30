import { useState, useEffect } from 'react';
import { Check, X, Upload, FileText, Calendar, Download } from 'lucide-react';
import { storage, KEYS, formatDate, auditLog, getCurrentUser, calculateWorkingDays, generateId } from '@/lib/storage';
import StatusBadge from '@/components/ui/StatusBadge';

const LEAVE_TYPES = [
  { key: 'Annual', days: 30, description: 'Annual leave per UAE Labour Law', paid: true },
  { key: 'Sick', days: 90, description: 'First 15 full pay, next 15 half pay, rest unpaid', paid: true },
  { key: 'Maternity', days: 60, description: '45 days full pay + 15 days half pay', paid: true },
  { key: 'Paternity', days: 5, description: 'Paternity leave per UAE law', paid: true },
  { key: 'Hajj', days: 30, description: 'Hajj leave (unpaid, once)', paid: false },
  { key: 'Bereavement', days: 5, description: '3-5 days depending on relation', paid: true },
  { key: 'Emergency', days: 3, description: 'Personal emergency leave', paid: false },
];

export default function LeaveManagement({ isEmployee = false }: { isEmployee?: boolean }) {
  const session = getCurrentUser();
  const [leave, setLeave] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ startDate: '', endDate: '', reason: '', leaveType: 'Annual', document: null as any });
  const [yearMonth, setYearMonth] = useState(() => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`; });
  const [employeeFilter, setEmployeeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const load = () => {
    let all = storage.getAll(KEYS.LEAVE);
    if (isEmployee && session) all = all.filter((l: any) => l.employeeId === session.userId);
    setLeave(all);
  };
  useEffect(load, [isEmployee, session]);

  const employees = storage.getAll(KEYS.EMPLOYEES);
  const attendance = storage.getAll(KEYS.ATTENDANCE);

  // Filter
  let displayed = leave;
  if (employeeFilter !== 'all') displayed = displayed.filter((l: any) => l.employeeId === employeeFilter);
  if (statusFilter !== 'all') displayed = displayed.filter((l: any) => l.status === statusFilter);
  // Month filter for history
  const monthFiltered = displayed.filter((l: any) => l.startDate?.startsWith(yearMonth) || l.endDate?.startsWith(yearMonth) || l.createdAt?.startsWith(yearMonth));

  const pending = displayed.filter((l: any) => l.status === 'Pending');
  const history = monthFiltered.filter((l: any) => l.status !== 'Pending');

  const handleApprove = (id: string) => {
    storage.update(KEYS.LEAVE, id, { status: 'Approved', reviewedBy: session?.userName, reviewedAt: new Date().toISOString() });
    auditLog('leave_approved', 'leave', id, {});
    load();
  };
  const handleReject = (id: string) => {
    storage.update(KEYS.LEAVE, id, { status: 'Rejected', reviewedBy: session?.userName, reviewedAt: new Date().toISOString() });
    auditLog('leave_rejected', 'leave', id, {});
    load();
  };

  const handleDocUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setForm({ ...form, document: { name: file.name, base64: reader.result } });
    reader.readAsDataURL(file);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (form.leaveType === 'Sick' && !form.document) {
      if (!confirm('Sick leave requires a medical certificate. Submit without document?')) return;
    }
    const days = calculateWorkingDays(form.startDate, form.endDate);
    storage.push(KEYS.LEAVE, {
      id: generateId('LVE'), employeeId: session?.userId, employeeName: session?.userName,
      startDate: form.startDate, endDate: form.endDate, days, reason: form.reason,
      leaveType: form.leaveType, document: form.document,
      status: 'Pending', reviewedBy: '', reviewedAt: '', createdAt: new Date().toISOString(),
    });
    setShowForm(false);
    setForm({ startDate: '', endDate: '', reason: '', leaveType: 'Annual', document: null });
    load();
  };

  // Calculate balances for employee
  const getBalances = (empId: string) => {
    const empLeave = leave.filter((l: any) => l.employeeId === empId && l.status === 'Approved');
    const balances: Record<string, { used: number; total: number }> = {};
    LEAVE_TYPES.forEach(lt => {
      balances[lt.key] = { total: lt.days, used: empLeave.filter((l: any) => l.leaveType === lt.key).reduce((s: number, l: any) => s + l.days, 0) };
    });
    return balances;
  };

  const myBalances = session ? getBalances(session.userId) : {};

  // Calendar view for admin
  const [y, mo] = yearMonth.split('-').map(Number);
  const daysInMonth = new Date(y, mo, 0).getDate();
  const firstDayOfWeek = new Date(y, mo - 1, 1).getDay();

  const exportCSV = () => {
    const rows = monthFiltered.map(l => ({
      Employee: l.employeeName, Type: l.leaveType, Start: formatDate(l.startDate), End: formatDate(l.endDate),
      Days: l.days, Reason: l.reason, Status: l.status, ReviewedBy: l.reviewedBy || '',
    }));
    if (rows.length === 0) return;
    const headers = Object.keys(rows[0]);
    const csv = [headers.join(','), ...rows.map(r => headers.map(h => `"${(r as any)[h] || ''}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `leave_${yearMonth}.csv`;
    link.click();
  };

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Employee Balances */}
      {isEmployee && (
        <div className="card-nawi bg-primary/5 border-primary/20">
          <h3 className="font-semibold font-display mb-3 text-primary">Leave Balances (UAE Labour Law)</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {LEAVE_TYPES.filter(lt => lt.paid).slice(0, 4).map(lt => (
              <div key={lt.key} className="text-center">
                <p className="text-xs text-muted-foreground">{lt.key}</p>
                <p className="text-2xl font-bold">{lt.days - (myBalances[lt.key]?.used || 0)}</p>
                <p className="text-xs text-muted-foreground">of {lt.days} remaining</p>
                <div className="w-full h-1.5 bg-muted rounded-full mt-1">
                  <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${Math.min(100, ((myBalances[lt.key]?.used || 0) / lt.days) * 100)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <input type="month" value={yearMonth} onChange={e => setYearMonth(e.target.value)} className="input-nawi w-auto" />
          {!isEmployee && (
            <select value={employeeFilter} onChange={e => setEmployeeFilter(e.target.value)} className="input-nawi w-auto text-sm">
              <option value="all">All Employees</option>
              {employees.map((e: any) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          )}
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="input-nawi w-auto text-sm">
            <option value="all">All Status</option><option value="Pending">Pending</option><option value="Approved">Approved</option><option value="Rejected">Rejected</option>
          </select>
        </div>
        <div className="flex gap-2">
          <button onClick={exportCSV} className="btn-outline text-sm"><Download className="w-4 h-4" /></button>
          {isEmployee && <button onClick={() => setShowForm(true)} className="btn-primary">Apply for Leave</button>}
        </div>
      </div>

      {/* Pending Requests (Admin) */}
      {!isEmployee && pending.length > 0 && (
        <div className="card-nawi border-warning/30">
          <h3 className="font-semibold font-display mb-3 text-warning">Pending Requests ({pending.length})</h3>
          <div className="space-y-3">
            {pending.map((l: any) => {
              const empBal = getBalances(l.employeeId);
              const typeInfo = LEAVE_TYPES.find(lt => lt.key === l.leaveType);
              return (
                <div key={l.id} className="flex items-center justify-between p-3 border border-border rounded-lg">
                  <div>
                    <p className="font-medium text-foreground">{l.employeeName}</p>
                    <p className="text-sm text-muted-foreground">{l.leaveType} • {formatDate(l.startDate)} — {formatDate(l.endDate)} ({l.days} days)</p>
                    <p className="text-sm text-muted-foreground">{l.reason}</p>
                    <p className="text-xs text-secondary mt-1">
                      Balance: {typeInfo ? `${typeInfo.days - (empBal[l.leaveType]?.used || 0)}/${typeInfo.days}` : '—'} remaining
                    </p>
                    {l.document && <span className="inline-flex items-center gap-1 text-xs text-secondary mt-1"><FileText className="w-3 h-3" /> {l.document.name}</span>}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => handleApprove(l.id)} className="btn-success p-2"><Check className="w-4 h-4" /></button>
                    <button onClick={() => handleReject(l.id)} className="btn-danger p-2"><X className="w-4 h-4" /></button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Leave Calendar (Admin) */}
      {!isEmployee && (
        <div className="card-nawi">
          <h3 className="text-base font-semibold font-display mb-3 flex items-center gap-2"><Calendar className="w-4 h-4 text-primary" /> Leave Calendar — {yearMonth}</h3>
          <div className="grid grid-cols-7 gap-1 text-center text-xs mb-2">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
              <div key={d} className={`py-1 font-semibold ${d === 'Fri' || d === 'Sat' ? 'text-destructive/60' : 'text-muted-foreground'}`}>{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {Array(firstDayOfWeek).fill(null).map((_, i) => <div key={`e-${i}`} />)}
            {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
              const dateStr = `${yearMonth}-${String(day).padStart(2, '0')}`;
              const dayLeaves = leave.filter((l: any) => l.status === 'Approved' && l.startDate <= dateStr && l.endDate >= dateStr);
              const dow = new Date(y, mo - 1, day).getDay();
              const isWE = dow === 5 || dow === 6;
              return (
                <div key={day} className={`p-1 rounded text-xs min-h-[40px] border ${isWE ? 'bg-muted/30 border-transparent' : dayLeaves.length > 0 ? 'border-secondary/30 bg-secondary/5' : 'border-border'}`}>
                  <span className="font-medium">{day}</span>
                  {dayLeaves.slice(0, 2).map((l: any, i: number) => (
                    <p key={i} className="text-[9px] text-secondary truncate">{l.employeeName?.split(' ')[0]}</p>
                  ))}
                  {dayLeaves.length > 2 && <p className="text-[9px] text-muted-foreground">+{dayLeaves.length - 2}</p>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* History Table */}
      <div className="card-nawi p-0 overflow-x-auto">
        <table className="table-nawi w-full">
          <thead><tr><th>Employee</th><th>Type</th><th>Start</th><th>End</th><th>Days</th><th>Reason</th><th>Doc</th><th>Status</th><th>Reviewed By</th></tr></thead>
          <tbody>
            {(isEmployee ? leave : [...pending, ...history]).map((l: any) => (
              <tr key={l.id}>
                <td>{l.employeeName}</td>
                <td><span className="badge-new text-xs">{l.leaveType || 'Annual'}</span></td>
                <td>{formatDate(l.startDate)}</td><td>{formatDate(l.endDate)}</td><td>{l.days}</td>
                <td className="max-w-[150px] truncate">{l.reason}</td>
                <td>{l.document ? <FileText className="w-4 h-4 text-secondary" /> : '—'}</td>
                <td><StatusBadge status={l.status} /></td><td>{l.reviewedBy || '—'}</td>
              </tr>
            ))}
            {(isEmployee ? leave : [...pending, ...history]).length === 0 && <tr><td colSpan={9} className="text-center text-muted-foreground py-8">No leave records</td></tr>}
          </tbody>
        </table>
      </div>

      {/* UAE Leave Rules */}
      <div className="card-nawi bg-primary/5 border-primary/20">
        <h3 className="text-sm font-semibold text-primary mb-2">UAE Leave Entitlements</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-muted-foreground">
          {LEAVE_TYPES.map(lt => (
            <p key={lt.key}>• <strong>{lt.key}:</strong> {lt.days} days — {lt.description} {!lt.paid && '(Unpaid)'}</p>
          ))}
        </div>
      </div>

      {/* Apply Form */}
      {showForm && (
        <div className="fixed inset-0 bg-foreground/50 z-50 flex items-center justify-center p-4" onClick={() => setShowForm(false)}>
          <div className="bg-card rounded-xl shadow-elevated w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold font-display mb-4">Apply for Leave</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Leave Type *</label>
                <select value={form.leaveType} onChange={e => setForm({ ...form, leaveType: e.target.value })} className="input-nawi">
                  {LEAVE_TYPES.map(lt => {
                    const remaining = lt.days - (myBalances[lt.key]?.used || 0);
                    return <option key={lt.key} value={lt.key}>{lt.key} ({remaining} days left)</option>;
                  })}
                </select>
                <p className="text-xs text-muted-foreground mt-1">{LEAVE_TYPES.find(lt => lt.key === form.leaveType)?.description}</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-sm font-medium mb-1">Start *</label><input type="date" value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value })} className="input-nawi" required /></div>
                <div><label className="block text-sm font-medium mb-1">End *</label><input type="date" value={form.endDate} onChange={e => setForm({ ...form, endDate: e.target.value })} className="input-nawi" required /></div>
              </div>
              {form.startDate && form.endDate && <p className="text-sm font-medium text-primary">{calculateWorkingDays(form.startDate, form.endDate)} working days</p>}
              <div><label className="block text-sm font-medium mb-1">Reason *</label><textarea value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} className="input-nawi" rows={3} required /></div>
              <div>
                <label className="block text-sm font-medium mb-1">Supporting Document {form.leaveType === 'Sick' && <span className="text-destructive">(Required)</span>}</label>
                <label className="btn-outline cursor-pointer w-full justify-center">
                  <Upload className="w-4 h-4" /> {form.document ? form.document.name : 'Upload Document'}
                  <input type="file" className="hidden" onChange={handleDocUpload} />
                </label>
              </div>
              <div className="flex justify-end gap-3">
                <button type="button" onClick={() => setShowForm(false)} className="btn-outline">Cancel</button>
                <button type="submit" className="btn-primary">Submit</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
