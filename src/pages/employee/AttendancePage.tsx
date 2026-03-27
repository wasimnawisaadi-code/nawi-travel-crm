import { useState } from 'react';
import { getCurrentUser, storage, KEYS, formatDate } from '@/lib/storage';
import StatusBadge from '@/components/ui/StatusBadge';
import { LogOut, Clock, FileText } from 'lucide-react';

export default function AttendancePage() {
  const session = getCurrentUser();
  const [yearMonth, setYearMonth] = useState(() => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`; });
  const [showCheckout, setShowCheckout] = useState(false);
  const [workSummary, setWorkSummary] = useState('');

  const attendance = storage.getAll(KEYS.ATTENDANCE).filter((a: any) => a.employeeId === session?.userId && a.date?.startsWith(yearMonth));
  const today = new Date().toISOString().split('T')[0];
  const todayRecord = storage.getAll(KEYS.ATTENDANCE).find((a: any) => a.employeeId === session?.userId && a.date === today);

  const present = attendance.filter((a: any) => a.status === 'Present').length;
  const late = attendance.filter((a: any) => a.status === 'Late').length;
  const totalHours = attendance.reduce((s: number, a: any) => s + (a.hoursWorked || 0), 0);

  const handleCheckout = () => {
    if (todayRecord && !todayRecord.logoutTime) {
      const logoutTime = new Date().toISOString();
      const loginDate = new Date(todayRecord.loginTime);
      const logoutDate = new Date(logoutTime);
      const hoursWorked = Math.round(((logoutDate.getTime() - loginDate.getTime()) / 3600000) * 10) / 10;
      storage.update(KEYS.ATTENDANCE, todayRecord.id, { logoutTime, hoursWorked, workSummary: workSummary.trim() || undefined });
      setShowCheckout(false);
      setWorkSummary('');
      window.location.reload();
    }
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold font-display">My Attendance</h2>
        <input type="month" value={yearMonth} onChange={(e) => setYearMonth(e.target.value)} className="input-nawi w-auto" />
      </div>

      {/* Today's Status */}
      {todayRecord && (
        <div className="card-nawi">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center"><Clock className="w-5 h-5 text-primary" /></div>
              <div>
                <p className="text-sm font-semibold">Today's Session</p>
                <p className="text-xs text-muted-foreground">
                  Login: {new Date(todayRecord.loginTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                  {todayRecord.logoutTime && ` → Logout: ${new Date(todayRecord.logoutTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`}
                  {todayRecord.hoursWorked > 0 && ` (${todayRecord.hoursWorked}h)`}
                </p>
                {todayRecord.workSummary && <p className="text-xs text-secondary mt-1">📝 {todayRecord.workSummary}</p>}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <StatusBadge status={todayRecord.status} />
              {!todayRecord.logoutTime && (
                <button onClick={() => setShowCheckout(true)} className="btn-outline text-sm"><LogOut className="w-4 h-4" /> Check Out</button>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-4">
        <div className="stat-card"><div className="stat-card-icon bg-success"><span className="text-primary-foreground font-bold">{present}</span></div><div><p className="text-xs text-muted-foreground">Present</p></div></div>
        <div className="stat-card"><div className="stat-card-icon bg-warning"><span className="text-primary-foreground font-bold">{late}</span></div><div><p className="text-xs text-muted-foreground">Late</p></div></div>
        <div className="stat-card"><div className="stat-card-icon bg-primary"><span className="text-primary-foreground font-bold">{Math.round(totalHours)}</span></div><div><p className="text-xs text-muted-foreground">Total Hours</p></div></div>
      </div>

      <div className="card-nawi p-0 overflow-x-auto">
        <table className="table-nawi w-full">
          <thead><tr><th>Date</th><th>Login</th><th>Logout</th><th>Hours</th><th>Work Summary</th><th>Status</th></tr></thead>
          <tbody>
            {attendance.length === 0 ? <tr><td colSpan={6} className="text-center text-muted-foreground py-8">No records</td></tr> :
              attendance.sort((a: any, b: any) => b.date.localeCompare(a.date)).map((a: any) => (
                <tr key={a.id}>
                  <td>{formatDate(a.date)}</td>
                  <td>{a.loginTime ? new Date(a.loginTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                  <td>{a.logoutTime ? new Date(a.logoutTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                  <td>{a.hoursWorked || 0}h</td>
                  <td className="max-w-[200px] truncate text-xs">{a.workSummary || '—'}</td>
                  <td><StatusBadge status={a.status} /></td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {/* Checkout Modal */}
      {showCheckout && (
        <div className="fixed inset-0 bg-foreground/50 z-50 flex items-center justify-center p-4" onClick={() => setShowCheckout(false)}>
          <div className="bg-card rounded-xl shadow-elevated w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold font-display mb-4">📝 Daily Check Out</h2>
            <p className="text-sm text-muted-foreground mb-4">Please describe what you worked on today:</p>
            <textarea value={workSummary} onChange={e => setWorkSummary(e.target.value)} className="input-nawi" rows={4} placeholder="e.g., Processed 5 visa applications, followed up with 3 clients, submitted quotations..." />
            <div className="flex justify-end gap-3 mt-4">
              <button onClick={() => setShowCheckout(false)} className="btn-outline">Cancel</button>
              <button onClick={handleCheckout} className="btn-primary"><LogOut className="w-4 h-4" /> Check Out</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
