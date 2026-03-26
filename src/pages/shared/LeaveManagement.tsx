import { useState, useEffect } from 'react';
import { Check, X } from 'lucide-react';
import { storage, KEYS, formatDate, auditLog, getCurrentUser, calculateWorkingDays, generateId } from '@/lib/storage';
import StatusBadge from '@/components/ui/StatusBadge';

export default function LeaveManagement({ isEmployee = false }: { isEmployee?: boolean }) {
  const session = getCurrentUser();
  const [leave, setLeave] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ startDate: '', endDate: '', reason: '' });

  const load = () => {
    let all = storage.getAll(KEYS.LEAVE);
    if (isEmployee && session) all = all.filter((l: any) => l.employeeId === session.userId);
    setLeave(all);
  };
  useEffect(load, [isEmployee, session]);

  const employees = storage.getAll(KEYS.EMPLOYEES);
  const pending = leave.filter((l: any) => l.status === 'Pending');
  const history = leave.filter((l: any) => l.status !== 'Pending');

  const handleApprove = (id: string) => {
    storage.update(KEYS.LEAVE, id, { status: 'Approved', reviewedBy: session?.userName, reviewedAt: new Date().toISOString() });
    const lv = leave.find((l: any) => l.id === id);
    if (lv) {
      const emp = employees.find((e: any) => e.id === lv.employeeId);
      if (emp) storage.update(KEYS.EMPLOYEES, emp.id, { leaveBalance: Math.max(0, (emp.leaveBalance || 21) - lv.days) });
    }
    auditLog('leave_approved', 'leave', id, {});
    load();
  };

  const handleReject = (id: string) => {
    storage.update(KEYS.LEAVE, id, { status: 'Rejected', reviewedBy: session?.userName, reviewedAt: new Date().toISOString() });
    auditLog('leave_rejected', 'leave', id, {});
    load();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const days = calculateWorkingDays(form.startDate, form.endDate);
    storage.push(KEYS.LEAVE, {
      id: generateId('LVE'),
      employeeId: session?.userId,
      employeeName: session?.userName,
      startDate: form.startDate,
      endDate: form.endDate,
      days,
      reason: form.reason,
      status: 'Pending',
      reviewedBy: '',
      reviewedAt: '',
      createdAt: new Date().toISOString(),
    });
    setShowForm(false);
    setForm({ startDate: '', endDate: '', reason: '' });
    load();
  };

  const emp = isEmployee && session ? employees.find((e: any) => e.id === session.userId) : null;
  const usedLeave = leave.filter((l: any) => l.employeeId === session?.userId && l.status === 'Approved').reduce((s: number, l: any) => s + l.days, 0);

  return (
    <div className="space-y-4 animate-fade-in">
      {isEmployee && emp && (
        <div className="grid grid-cols-3 gap-4">
          <div className="stat-card"><div><p className="text-xs text-muted-foreground">Annual Balance</p><p className="text-xl font-bold font-display">{emp.leaveBalance || 21} days</p></div></div>
          <div className="stat-card"><div><p className="text-xs text-muted-foreground">Used</p><p className="text-xl font-bold font-display">{usedLeave} days</p></div></div>
          <div className="stat-card"><div><p className="text-xs text-muted-foreground">Remaining</p><p className="text-xl font-bold font-display">{(emp.leaveBalance || 21) - usedLeave} days</p></div></div>
        </div>
      )}

      {isEmployee && (
        <div className="flex justify-end">
          <button onClick={() => setShowForm(true)} className="btn-primary">Apply for Leave</button>
        </div>
      )}

      {!isEmployee && pending.length > 0 && (
        <div className="card-nawi border-warning/30">
          <h3 className="font-semibold font-display mb-3 text-warning">Pending Requests ({pending.length})</h3>
          <div className="space-y-3">
            {pending.map((l: any) => (
              <div key={l.id} className="flex items-center justify-between p-3 border border-border rounded-lg">
                <div>
                  <p className="font-medium text-foreground">{l.employeeName}</p>
                  <p className="text-sm text-muted-foreground">{formatDate(l.startDate)} — {formatDate(l.endDate)} ({l.days} days)</p>
                  <p className="text-sm text-muted-foreground">{l.reason}</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => handleApprove(l.id)} className="btn-success p-2"><Check className="w-4 h-4" /></button>
                  <button onClick={() => handleReject(l.id)} className="btn-danger p-2"><X className="w-4 h-4" /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card-nawi p-0 overflow-x-auto">
        <table className="table-nawi w-full">
          <thead><tr><th>Employee</th><th>Start</th><th>End</th><th>Days</th><th>Reason</th><th>Status</th><th>Reviewed By</th></tr></thead>
          <tbody>
            {(isEmployee ? leave : history).map((l: any) => (
              <tr key={l.id}><td>{l.employeeName}</td><td>{formatDate(l.startDate)}</td><td>{formatDate(l.endDate)}</td><td>{l.days}</td><td>{l.reason}</td><td><StatusBadge status={l.status} /></td><td>{l.reviewedBy || '—'}</td></tr>
            ))}
            {(isEmployee ? leave : history).length === 0 && <tr><td colSpan={7} className="text-center text-muted-foreground py-8">No leave records</td></tr>}
          </tbody>
        </table>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-foreground/50 z-50 flex items-center justify-center p-4" onClick={() => setShowForm(false)}>
          <div className="bg-card rounded-xl shadow-elevated w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold font-display mb-4">Apply for Leave</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div><label className="block text-sm font-medium mb-1">Start Date *</label><input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} className="input-nawi" required /></div>
              <div><label className="block text-sm font-medium mb-1">End Date *</label><input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} className="input-nawi" required /></div>
              {form.startDate && form.endDate && <p className="text-sm text-muted-foreground">{calculateWorkingDays(form.startDate, form.endDate)} working days</p>}
              <div><label className="block text-sm font-medium mb-1">Reason *</label><textarea value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} className="input-nawi" rows={3} required /></div>
              <div className="flex justify-end gap-3"><button type="button" onClick={() => setShowForm(false)} className="btn-outline">Cancel</button><button type="submit" className="btn-primary">Submit</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
