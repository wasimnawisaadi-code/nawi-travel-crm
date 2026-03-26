import { useState, useEffect } from 'react';
import { storage, KEYS, formatCurrency, generateId, auditLog } from '@/lib/storage';
import StatusBadge from '@/components/ui/StatusBadge';

export default function PayrollManagement() {
  const now = new Date();
  const [yearMonth, setYearMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
  const [payroll, setPayroll] = useState<any[]>([]);
  const employees = storage.getAll(KEYS.EMPLOYEES).filter((e: any) => e.status === 'active');

  const load = () => setPayroll(storage.getAll(KEYS.PAYROLL).filter((p: any) => p.yearMonth === yearMonth));
  useEffect(load, [yearMonth]);

  const calculatePayroll = () => {
    const attendance = storage.getAll(KEYS.ATTENDANCE);
    const leave = storage.getAll(KEYS.LEAVE);

    employees.forEach((emp: any) => {
      const existing = payroll.find((p: any) => p.employeeId === emp.id);
      if (existing) return;

      const monthAttendance = attendance.filter((a: any) => a.employeeId === emp.id && a.date?.startsWith(yearMonth));
      const absentDays = 22 - monthAttendance.filter((a: any) => a.status === 'Present' || a.status === 'Late').length;
      const monthLeave = leave.filter((l: any) => l.employeeId === emp.id && l.status === 'Approved' && l.startDate?.startsWith(yearMonth));
      const leaveDays = monthLeave.reduce((s: number, l: any) => s + l.days, 0);

      const dailyRate = (emp.baseSalary || 0) / 22;
      const leaveDeduction = leaveDays * dailyRate;
      const absenceDeduction = Math.max(0, absentDays - leaveDays) * dailyRate;
      const finalSalary = (emp.baseSalary || 0) - leaveDeduction - absenceDeduction;

      storage.push(KEYS.PAYROLL, {
        id: generateId('PAY'),
        employeeId: emp.id,
        yearMonth,
        baseSalary: emp.baseSalary || 0,
        leaveDeduction: Math.round(leaveDeduction),
        absenceDeduction: Math.round(absenceDeduction),
        bonus: 0,
        finalSalary: Math.round(finalSalary),
        confirmedBy: '',
        confirmedAt: '',
        status: 'Draft',
      });
    });
    load();
  };

  const confirmPayroll = (id: string) => {
    storage.update(KEYS.PAYROLL, id, { status: 'Confirmed', confirmedBy: 'ADM-001', confirmedAt: new Date().toISOString() });
    auditLog('payroll_confirmed', 'payroll', id, {});
    load();
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-bold font-display">Payroll Management</h2>
          <input type="month" value={yearMonth} onChange={(e) => setYearMonth(e.target.value)} className="input-nawi w-auto" />
        </div>
        <button onClick={calculatePayroll} className="btn-primary">Calculate Payroll</button>
      </div>

      <div className="card-nawi p-0 overflow-x-auto">
        <table className="table-nawi w-full">
          <thead><tr><th>Employee</th><th>Base Salary</th><th>Leave Ded.</th><th>Absence Ded.</th><th>Bonus</th><th>Final Salary</th><th>Status</th><th>Action</th></tr></thead>
          <tbody>
            {payroll.length === 0 ? (
              <tr><td colSpan={8} className="text-center text-muted-foreground py-8">Click "Calculate Payroll" to generate</td></tr>
            ) : payroll.map((p: any) => {
              const emp = employees.find((e: any) => e.id === p.employeeId);
              return (
                <tr key={p.id}>
                  <td className="font-medium">{emp?.name || p.employeeId}</td>
                  <td>{formatCurrency(p.baseSalary)}</td>
                  <td className="text-destructive">{formatCurrency(p.leaveDeduction)}</td>
                  <td className="text-destructive">{formatCurrency(p.absenceDeduction)}</td>
                  <td className="text-success">{formatCurrency(p.bonus)}</td>
                  <td className="font-bold">{formatCurrency(p.finalSalary)}</td>
                  <td><StatusBadge status={p.status} /></td>
                  <td>{p.status === 'Draft' && <button onClick={() => confirmPayroll(p.id)} className="btn-success text-xs px-2 py-1">Confirm</button>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
