import { useState, useEffect } from 'react';
import { storage, KEYS, formatCurrency, generateId, auditLog } from '@/lib/storage';
import StatusBadge from '@/components/ui/StatusBadge';
import { Download, Calculator, Edit, Save, X } from 'lucide-react';

export default function PayrollManagement() {
  const now = new Date();
  const [yearMonth, setYearMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
  const [payroll, setPayroll] = useState<any[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<any>({});
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
      const presentDays = monthAttendance.filter((a: any) => a.status === 'Present' || a.status === 'Late').length;
      const lateDays = monthAttendance.filter((a: any) => a.status === 'Late').length;
      const totalHours = monthAttendance.reduce((s: number, a: any) => s + (a.hoursWorked || 0), 0);

      const monthLeave = leave.filter((l: any) => l.employeeId === emp.id && l.status === 'Approved' && l.startDate?.startsWith(yearMonth));
      const paidLeaveDays = monthLeave.filter((l: any) => l.leaveType === 'Annual' || l.leaveType === 'Paternity' || l.leaveType === 'Bereavement').reduce((s: number, l: any) => s + l.days, 0);
      const sickLeave = monthLeave.filter((l: any) => l.leaveType === 'Sick').reduce((s: number, l: any) => s + l.days, 0);
      const unpaidLeave = monthLeave.filter((l: any) => l.leaveType === 'Hajj' || l.leaveType === 'Emergency').reduce((s: number, l: any) => s + l.days, 0);

      const baseSalary = emp.baseSalary || 0;
      const dailyRate = baseSalary / 22;

      // Sick leave: first 15 days full, next 15 half, rest unpaid (UAE law)
      const sickFullPay = Math.min(sickLeave, 15);
      const sickHalfPay = Math.max(0, Math.min(sickLeave - 15, 15));
      const sickUnpaid = Math.max(0, sickLeave - 30);
      const sickDeduction = (sickHalfPay * dailyRate * 0.5) + (sickUnpaid * dailyRate);

      const unpaidDeduction = unpaidLeave * dailyRate;
      const absentDays = Math.max(0, 22 - presentDays - paidLeaveDays - sickLeave - unpaidLeave);
      const absenceDeduction = absentDays * dailyRate;
      const lateDeduction = lateDays > 3 ? (lateDays - 3) * (dailyRate * 0.25) : 0; // Fine after 3 late days

      const totalDeductions = sickDeduction + unpaidDeduction + absenceDeduction + lateDeduction;
      const finalSalary = Math.max(0, baseSalary - totalDeductions);

      storage.push(KEYS.PAYROLL, {
        id: generateId('PAY'), employeeId: emp.id, yearMonth, baseSalary,
        presentDays, lateDays, paidLeaveDays, sickLeave, unpaidLeave, absentDays, totalHours: Math.round(totalHours),
        sickDeduction: Math.round(sickDeduction), unpaidDeduction: Math.round(unpaidDeduction),
        absenceDeduction: Math.round(absenceDeduction), lateDeduction: Math.round(lateDeduction),
        totalDeductions: Math.round(totalDeductions),
        bonus: 0, allowances: 0, overtime: 0,
        finalSalary: Math.round(finalSalary),
        confirmedBy: '', confirmedAt: '', status: 'Draft',
      });
    });
    load();
  };

  const confirmPayroll = (id: string) => {
    storage.update(KEYS.PAYROLL, id, { status: 'Confirmed', confirmedBy: 'ADM-001', confirmedAt: new Date().toISOString() });
    auditLog('payroll_confirmed', 'payroll', id, {});
    load();
  };

  const handleEdit = (p: any) => {
    setEditingId(p.id);
    setEditForm({ bonus: p.bonus || 0, allowances: p.allowances || 0, overtime: p.overtime || 0 });
  };

  const handleSaveEdit = (p: any) => {
    const bonus = Number(editForm.bonus) || 0;
    const allowances = Number(editForm.allowances) || 0;
    const overtime = Number(editForm.overtime) || 0;
    const finalSalary = p.baseSalary - p.totalDeductions + bonus + allowances + overtime;
    storage.update(KEYS.PAYROLL, p.id, { bonus, allowances, overtime, finalSalary: Math.round(finalSalary) });
    setEditingId(null);
    load();
  };

  const totalPayroll = payroll.reduce((s, p) => s + p.finalSalary, 0);
  const totalDeductions = payroll.reduce((s, p) => s + (p.totalDeductions || 0), 0);

  const exportCSV = () => {
    const headers = ['Employee', 'Base Salary', 'Present', 'Late', 'Absent', 'Leave', 'Sick', 'Deductions', 'Bonus', 'Allowances', 'OT', 'Final Salary', 'Status'];
    const rows = payroll.map(p => {
      const emp = employees.find((e: any) => e.id === p.employeeId);
      return [emp?.name, p.baseSalary, p.presentDays, p.lateDays, p.absentDays, p.paidLeaveDays, p.sickLeave, p.totalDeductions, p.bonus, p.allowances, p.overtime, p.finalSalary, p.status];
    });
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `payroll_${yearMonth}.csv`;
    link.click();
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-bold font-display">Payroll Management</h2>
          <input type="month" value={yearMonth} onChange={(e) => setYearMonth(e.target.value)} className="input-nawi w-auto" />
        </div>
        <div className="flex gap-2">
          <button onClick={exportCSV} className="btn-outline"><Download className="w-4 h-4" /> Export</button>
          <button onClick={calculatePayroll} className="btn-primary"><Calculator className="w-4 h-4" /> Calculate Payroll</button>
        </div>
      </div>

      {/* Summary */}
      {payroll.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="stat-card"><div><p className="text-xs text-muted-foreground">Total Payroll</p><p className="text-xl font-bold font-display">{formatCurrency(totalPayroll)}</p></div></div>
          <div className="stat-card"><div><p className="text-xs text-muted-foreground">Total Deductions</p><p className="text-xl font-bold font-display text-destructive">{formatCurrency(totalDeductions)}</p></div></div>
          <div className="stat-card"><div><p className="text-xs text-muted-foreground">Employees</p><p className="text-xl font-bold font-display">{payroll.length}</p></div></div>
        </div>
      )}

      <div className="card-nawi p-0 overflow-x-auto">
        <table className="table-nawi w-full text-sm">
          <thead>
            <tr>
              <th>Employee</th><th>Base</th><th>Days</th><th>Late</th><th>Absent</th><th>Leave</th>
              <th>Deductions</th><th>Bonus</th><th>Allow.</th><th>OT</th><th>Final</th><th>Status</th><th></th>
            </tr>
          </thead>
          <tbody>
            {payroll.length === 0 ? (
              <tr><td colSpan={13} className="text-center text-muted-foreground py-8">Click "Calculate Payroll" to generate</td></tr>
            ) : payroll.map((p: any) => {
              const emp = employees.find((e: any) => e.id === p.employeeId);
              const isEditing = editingId === p.id;
              return (
                <tr key={p.id}>
                  <td className="font-medium">{emp?.name || p.employeeId}</td>
                  <td>{formatCurrency(p.baseSalary)}</td>
                  <td><span className="text-success">{p.presentDays}</span>/22</td>
                  <td>{p.lateDays > 0 ? <span className="text-warning">{p.lateDays}</span> : '0'}</td>
                  <td>{p.absentDays > 0 ? <span className="text-destructive">{p.absentDays}</span> : '0'}</td>
                  <td>{(p.paidLeaveDays || 0) + (p.sickLeave || 0)}</td>
                  <td className="text-destructive">{formatCurrency(p.totalDeductions || 0)}</td>
                  <td>{isEditing ? <input type="number" value={editForm.bonus} onChange={e => setEditForm({ ...editForm, bonus: e.target.value })} className="input-nawi w-20 text-xs py-1" /> : <span className="text-success">{formatCurrency(p.bonus || 0)}</span>}</td>
                  <td>{isEditing ? <input type="number" value={editForm.allowances} onChange={e => setEditForm({ ...editForm, allowances: e.target.value })} className="input-nawi w-20 text-xs py-1" /> : formatCurrency(p.allowances || 0)}</td>
                  <td>{isEditing ? <input type="number" value={editForm.overtime} onChange={e => setEditForm({ ...editForm, overtime: e.target.value })} className="input-nawi w-20 text-xs py-1" /> : formatCurrency(p.overtime || 0)}</td>
                  <td className="font-bold">{formatCurrency(p.finalSalary)}</td>
                  <td><StatusBadge status={p.status} /></td>
                  <td>
                    <div className="flex gap-1">
                      {isEditing ? (
                        <><button onClick={() => handleSaveEdit(p)} className="text-success p-1"><Save className="w-3 h-3" /></button><button onClick={() => setEditingId(null)} className="text-muted-foreground p-1"><X className="w-3 h-3" /></button></>
                      ) : (
                        <>{p.status === 'Draft' && <><button onClick={() => handleEdit(p)} className="text-secondary p-1"><Edit className="w-3 h-3" /></button><button onClick={() => confirmPayroll(p.id)} className="btn-success text-xs px-2 py-0.5">Confirm</button></>}</>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* UAE Payroll Rules Info */}
      <div className="card-nawi bg-primary/5 border-primary/20">
        <h3 className="text-sm font-semibold text-primary mb-2">UAE Payroll Rules Applied</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-muted-foreground">
          <p>• 22 working days/month (Fri-Sat weekend)</p>
          <p>• Sick leave: 15 days full pay, 15 days half pay, rest unpaid</p>
          <p>• Late penalty: After 3 late days, 25% daily rate deduction</p>
          <p>• Absent days deducted at full daily rate</p>
          <p>• Annual, Paternity, Bereavement leaves are fully paid</p>
          <p>• Hajj & Emergency leaves are unpaid</p>
        </div>
      </div>
    </div>
  );
}
