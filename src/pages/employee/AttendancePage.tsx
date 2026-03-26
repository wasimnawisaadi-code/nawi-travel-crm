import { useState, useEffect } from 'react';
import { getCurrentUser, storage, KEYS, formatDate } from '@/lib/storage';
import StatusBadge from '@/components/ui/StatusBadge';

export default function AttendancePage() {
  const session = getCurrentUser();
  const [yearMonth, setYearMonth] = useState(() => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`; });
  const attendance = storage.getAll(KEYS.ATTENDANCE).filter((a: any) => a.employeeId === session?.userId && a.date?.startsWith(yearMonth));

  const present = attendance.filter((a: any) => a.status === 'Present').length;
  const late = attendance.filter((a: any) => a.status === 'Late').length;
  const absent = attendance.filter((a: any) => a.status === 'Absent').length;

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold font-display">My Attendance</h2>
        <input type="month" value={yearMonth} onChange={(e) => setYearMonth(e.target.value)} className="input-nawi w-auto" />
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div className="stat-card"><div className="stat-card-icon bg-success"><span className="text-primary-foreground font-bold">{present}</span></div><div><p className="text-xs text-muted-foreground">Present</p></div></div>
        <div className="stat-card"><div className="stat-card-icon bg-warning"><span className="text-primary-foreground font-bold">{late}</span></div><div><p className="text-xs text-muted-foreground">Late</p></div></div>
        <div className="stat-card"><div className="stat-card-icon bg-destructive"><span className="text-primary-foreground font-bold">{absent}</span></div><div><p className="text-xs text-muted-foreground">Absent</p></div></div>
      </div>
      <div className="card-nawi p-0 overflow-x-auto">
        <table className="table-nawi w-full">
          <thead><tr><th>Date</th><th>Login</th><th>Logout</th><th>Hours</th><th>Status</th></tr></thead>
          <tbody>
            {attendance.length === 0 ? <tr><td colSpan={5} className="text-center text-muted-foreground py-8">No records</td></tr> :
              attendance.sort((a: any, b: any) => b.date.localeCompare(a.date)).map((a: any) => (
                <tr key={a.id}><td>{formatDate(a.date)}</td><td>{a.loginTime ? new Date(a.loginTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '—'}</td><td>{a.logoutTime ? new Date(a.logoutTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '—'}</td><td>{a.hoursWorked || 0}h</td><td><StatusBadge status={a.status} /></td></tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
