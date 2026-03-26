import { useState, useEffect } from 'react';
import { Check, X, Upload, FileText } from 'lucide-react';
import { storage, KEYS, formatDate, auditLog, getCurrentUser, calculateWorkingDays, generateId } from '@/lib/storage';
import StatusBadge from '@/components/ui/StatusBadge';

const LEAVE_TYPES = [
  { key: 'Annual', days: 30, description: 'Annual leave per UAE Labour Law' },
  { key: 'Sick', days: 90, description: 'Sick leave (first 15 full pay, next 30 half pay, remaining unpaid)' },
  { key: 'Maternity', days: 60, description: 'Maternity leave (45 days full pay + 15 days half pay)' },
  { key: 'Paternity', days: 5, description: 'Paternity leave per UAE law' },
  { key: 'Hajj', days: 30, description: 'Hajj leave (unpaid, once during employment)' },
  { key: 'Bereavement', days: 5, description: 'Bereavement leave (3-5 days depending on relation)' },
  { key: 'Emergency', days: 3, description: 'Personal emergency leave' },
];

export default function LeaveManagement({ isEmployee = false }: { isEmployee?: boolean }) {
  const session = getCurrentUser();
  const [leave, setLeave] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ startDate: '', endDate: '', reason: '', leaveType: 'Annual', document: null as any });

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

  // Calculate used leave for employee
  const usedLeave = leave.filter((l: any) => l.employeeId === session?.userId && l.status === 'Approved').reduce((s: number, l: any) => s + l.days, 0);

  return (
    <div className="space-y-4 animate-fade-in">
      {/* UAE Leave Rules Info */}
      {isEmployee && (
        <div className="card-nawi bg-primary/5 border-primary/20">
          <h3 className="font-semibold font-display mb-3 text-primary">UAE Leave Entitlements</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="text-center"><p className="text-2xl font-bold text-foreground">30</p><p className="text-xs text-muted-foreground">Annual Leave</p></div>
            <div className="text-center"><p className="text-2xl font-bold text-foreground">{usedLeave}</p><p className="text-xs text-muted-foreground">Used</p></div>
            <div className="text-center"><p className="text-2xl font-bold text-success">{30 - usedLeave}</p><p className="text-xs text-muted-foreground">Remaining</p></div>
            <div className="text-center"><p className="text-2xl font-bold text-foreground">90</p><p className="text-xs text-muted-foreground">Sick Leave</p></div>
          </div>
        </div>
      )}

      {isEmployee && (
        <div className="flex justify-end"><button onClick={() => setShowForm(true)} className="btn-primary">Apply for Leave</button></div>
      )}

      {/* Pending Requests (Admin view) */}
      {!isEmployee && pending.length > 0 && (
        <div className="card-nawi border-warning/30">
          <h3 className="font-semibold font-display mb-3 text-warning">Pending Requests ({pending.length})</h3>
          <div className="space-y-3">
            {pending.map((l: any) => (
              <div key={l.id} className="flex items-center justify-between p-3 border border-border rounded-lg">
                <div>
                  <p className="font-medium text-foreground">{l.employeeName}</p>
                  <p className="text-sm text-muted-foreground">{l.leaveType} • {formatDate(l.startDate)} — {formatDate(l.endDate)} ({l.days} days)</p>
                  <p className="text-sm text-muted-foreground">{l.reason}</p>
                  {l.document && <span className="inline-flex items-center gap-1 text-xs text-secondary mt-1"><FileText className="w-3 h-3" /> {l.document.name}</span>}
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

      {/* History */}
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

      {/* Apply Form */}
      {showForm && (
        <div className="fixed inset-0 bg-foreground/50 z-50 flex items-center justify-center p-4" onClick={() => setShowForm(false)}>
          <div className="bg-card rounded-xl shadow-elevated w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold font-display mb-4">Apply for Leave</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Leave Type *</label>
                <select value={form.leaveType} onChange={(e) => setForm({ ...form, leaveType: e.target.value })} className="input-nawi">
                  {LEAVE_TYPES.map(lt => <option key={lt.key} value={lt.key}>{lt.key} ({lt.days} days max)</option>)}
                </select>
                <p className="text-xs text-muted-foreground mt-1">{LEAVE_TYPES.find(lt => lt.key === form.leaveType)?.description}</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-sm font-medium mb-1">Start Date *</label><input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} className="input-nawi" required /></div>
                <div><label className="block text-sm font-medium mb-1">End Date *</label><input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} className="input-nawi" required /></div>
              </div>
              {form.startDate && form.endDate && <p className="text-sm font-medium text-primary">{calculateWorkingDays(form.startDate, form.endDate)} working days</p>}
              <div><label className="block text-sm font-medium mb-1">Reason *</label><textarea value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} className="input-nawi" rows={3} required /></div>
              <div>
                <label className="block text-sm font-medium mb-1">Supporting Document {form.leaveType === 'Sick' && <span className="text-destructive">(Required for sick leave)</span>}</label>
                <label className="btn-outline cursor-pointer w-full justify-center">
                  <Upload className="w-4 h-4" /> {form.document ? form.document.name : 'Upload Document'}
                  <input type="file" className="hidden" onChange={handleDocUpload} />
                </label>
              </div>
              <div className="flex justify-end gap-3"><button type="button" onClick={() => setShowForm(false)} className="btn-outline">Cancel</button><button type="submit" className="btn-primary">Submit</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
