import { useState, useEffect } from 'react';
import { Download, Clock, Users, AlertTriangle } from 'lucide-react';
import { storage, KEYS, formatDate } from '@/lib/storage';
import StatusBadge from '@/components/ui/StatusBadge';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

const COLORS = ['#0A7040', '#C45000', '#C0392B', '#64748B'];

export default function AdminAttendance() {
  const now = new Date();
  const [yearMonth, setYearMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
  const [selectedDate, setSelectedDate] = useState(now.toISOString().split('T')[0]);

  const employees = storage.getAll(KEYS.EMPLOYEES).filter((e: any) => e.status === 'active');
  const allAttendance = storage.getAll(KEYS.ATTENDANCE);
  const monthAttendance = allAttendance.filter((a: any) => a.date?.startsWith(yearMonth));
  const dayAttendance = allAttendance.filter((a: any) => a.date === selectedDate);

  // Stats
  const totalDays = new Date(parseInt(yearMonth.split('-')[0]), parseInt(yearMonth.split('-')[1]), 0).getDate();
  const presentCount = monthAttendance.filter((a: any) => a.status === 'Present').length;
  const lateCount = monthAttendance.filter((a: any) => a.status === 'Late').length;
  const absentCount = monthAttendance.filter((a: any) => a.status === 'Absent').length;

  // Daily breakdown chart
  const dailyData: any[] = [];
  for (let d = 1; d <= totalDays; d++) {
    const dateStr = `${yearMonth}-${String(d).padStart(2, '0')}`;
    const dayRecs = allAttendance.filter((a: any) => a.date === dateStr);
    dailyData.push({
      day: d,
      present: dayRecs.filter((a: any) => a.status === 'Present').length,
      late: dayRecs.filter((a: any) => a.status === 'Late').length,
      absent: dayRecs.filter((a: any) => a.status === 'Absent').length,
    });
  }

  // Pie data
  const pieData = [
    { name: 'Present', value: presentCount },
    { name: 'Late', value: lateCount },
    { name: 'Absent', value: absentCount },
  ].filter(d => d.value > 0);

  // Employee-wise summary
  const empSummary = employees.map((emp: any) => {
    const recs = monthAttendance.filter((a: any) => a.employeeId === emp.id);
    const totalHours = recs.reduce((s: number, a: any) => s + (a.hoursWorked || 0), 0);
    return {
      ...emp,
      present: recs.filter((a: any) => a.status === 'Present').length,
      late: recs.filter((a: any) => a.status === 'Late').length,
      absent: recs.filter((a: any) => a.status === 'Absent').length,
      totalHours: Math.round(totalHours * 10) / 10,
      avgHours: recs.length > 0 ? Math.round((totalHours / recs.length) * 10) / 10 : 0,
    };
  });

  const exportCSV = () => {
    const headers = ['Employee', 'Present Days', 'Late Days', 'Absent Days', 'Total Hours', 'Avg Hours/Day'];
    const rows = empSummary.map(e => [e.name, e.present, e.late, e.absent, e.totalHours, e.avgHours]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `attendance_${yearMonth}.csv`;
    link.click();
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold font-display">Attendance Management</h2>
        <div className="flex items-center gap-3">
          <input type="month" value={yearMonth} onChange={(e) => setYearMonth(e.target.value)} className="input-nawi w-auto" />
          <button onClick={exportCSV} className="btn-outline"><Download className="w-4 h-4" /> Export</button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="stat-card"><div className="stat-card-icon bg-primary"><Users className="w-6 h-6 text-primary-foreground" /></div><div><p className="text-xs text-muted-foreground">Total Employees</p><p className="text-xl font-bold font-display">{employees.length}</p></div></div>
        <div className="stat-card"><div className="stat-card-icon bg-success"><Clock className="w-6 h-6 text-primary-foreground" /></div><div><p className="text-xs text-muted-foreground">Present (Month)</p><p className="text-xl font-bold font-display">{presentCount}</p></div></div>
        <div className="stat-card"><div className="stat-card-icon bg-warning"><Clock className="w-6 h-6 text-primary-foreground" /></div><div><p className="text-xs text-muted-foreground">Late (Month)</p><p className="text-xl font-bold font-display">{lateCount}</p></div></div>
        <div className="stat-card"><div className="stat-card-icon bg-destructive"><AlertTriangle className="w-6 h-6 text-primary-foreground" /></div><div><p className="text-xs text-muted-foreground">Absent (Month)</p><p className="text-xl font-bold font-display">{absentCount}</p></div></div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="card-nawi lg:col-span-2">
          <h3 className="text-base font-semibold font-display mb-4">Daily Attendance</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={dailyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(213,45%,92%)" />
              <XAxis dataKey="day" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip />
              <Bar dataKey="present" fill="#0A7040" stackId="a" radius={[0, 0, 0, 0]} name="Present" />
              <Bar dataKey="late" fill="#C45000" stackId="a" name="Late" />
              <Bar dataKey="absent" fill="#C0392B" stackId="a" radius={[4, 4, 0, 0]} name="Absent" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="card-nawi">
          <h3 className="text-base font-semibold font-display mb-4">Distribution</h3>
          {pieData.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-16">No data</p>
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, value }) => `${name}: ${value}`} labelLine={false}>
                  {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Today's / Selected Date */}
      <div className="card-nawi">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold font-display">Daily View</h3>
          <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="input-nawi w-auto" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {employees.map((emp: any) => {
            const rec = dayAttendance.find((a: any) => a.employeeId === emp.id);
            return (
              <div key={emp.id} className="flex items-center gap-3 p-3 rounded-lg border border-border">
                {emp.photo ? (
                  <img src={emp.photo} alt="" className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-xs font-bold text-primary-foreground flex-shrink-0">
                    {emp.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{emp.name}</p>
                  {rec ? (
                    <div className="flex items-center gap-2 text-xs">
                      <StatusBadge status={rec.status} />
                      <span className="text-muted-foreground">
                        {rec.loginTime ? new Date(rec.loginTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '—'}
                        {rec.logoutTime ? ` → ${new Date(rec.logoutTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}` : ' (Active)'}
                      </span>
                      {rec.hoursWorked > 0 && <span className="text-muted-foreground">{rec.hoursWorked}h</span>}
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">No record</span>
                  )}
                </div>
              </div>
            );
          })}
          {employees.length === 0 && <p className="text-sm text-muted-foreground col-span-full text-center py-8">No employees</p>}
        </div>
      </div>

      {/* Employee Summary Table */}
      <div className="card-nawi p-0 overflow-x-auto">
        <table className="table-nawi w-full">
          <thead>
            <tr><th>Employee</th><th>Present</th><th>Late</th><th>Absent</th><th>Total Hours</th><th>Avg Hours/Day</th></tr>
          </thead>
          <tbody>
            {empSummary.map((e) => (
              <tr key={e.id}>
                <td className="font-medium">{e.name}</td>
                <td><span className="text-success font-medium">{e.present}</span></td>
                <td><span className="text-warning font-medium">{e.late}</span></td>
                <td><span className="text-destructive font-medium">{e.absent}</span></td>
                <td>{e.totalHours}h</td>
                <td>{e.avgHours}h</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
