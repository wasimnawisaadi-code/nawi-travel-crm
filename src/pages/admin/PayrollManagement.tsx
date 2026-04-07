import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth-context';
import { formatCurrency, generateDisplayId, auditLog } from '@/lib/supabase-service';
import StatusBadge from '@/components/ui/StatusBadge';
import { Download, Calculator, Edit, Save, X } from 'lucide-react';

export default function PayrollManagement() {
  const { user } = useAuth();
  const now = new Date();
  const [yearMonth, setYearMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
  const [payroll, setPayroll] = useState<any[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<any>({});
  const [employees, setEmployees] = useState<any[]>([]);

  useEffect(() => {
    const fetchEmps = async () => {
      const { data } = await supabase.from('profiles').select('*').eq('status', 'active');
      setEmployees(data || []);
    };
    fetchEmps();
  }, []);

  const load = async () => {
    const { data } = await supabase.from('payroll').select('*').eq('year_month', yearMonth);
    setPayroll(data || []);
  };
  useEffect(() => { load(); }, [yearMonth]);

  const calculatePayroll = async () => {
    const { data: attendance } = await supabase.from('attendance').select('*').gte('date', `${yearMonth}-01`).lte('date', `${yearMonth}-31`);
    const { data: leave } = await supabase.from('leave_requests').select('*').eq('status', 'Approved');
    const allAttendance = attendance || [];
    const allLeave = leave || [];

    for (const emp of employees) {
      const existing = payroll.find(p => p.employee_id === emp.user_id);
      if (existing) continue;

      const monthAtt = allAttendance.filter(a => a.employee_id === emp.user_id);
      const presentDays = monthAtt.filter(a => a.status === 'Present' || a.status === 'Late').length;
      const lateDays = monthAtt.filter(a => a.status === 'Late').length;
      const totalHours = monthAtt.reduce((s, a) => s + (a.hours_worked || 0), 0);

      const monthLeave = allLeave.filter(l => l.employee_id === emp.user_id && l.start_date?.startsWith(yearMonth));
      const paidLeaveDays = monthLeave.filter(l => ['Annual', 'Paternity', 'Bereavement'].includes(l.leave_type || '')).reduce((s, l) => s + (l.days || 0), 0);
      const sickLeave = monthLeave.filter(l => l.leave_type === 'Sick').reduce((s, l) => s + (l.days || 0), 0);
      const unpaidLeave = monthLeave.filter(l => ['Hajj', 'Emergency'].includes(l.leave_type || '')).reduce((s, l) => s + (l.days || 0), 0);

      const baseSalary = emp.base_salary || 0;
      const dailyRate = baseSalary / 22;
      const sickHalfPay = Math.max(0, Math.min(sickLeave - 15, 15));
      const sickUnpaid = Math.max(0, sickLeave - 30);
      const sickDeduction = (sickHalfPay * dailyRate * 0.5) + (sickUnpaid * dailyRate);
      const unpaidDeduction = unpaidLeave * dailyRate;
      const absentDays = Math.max(0, 22 - presentDays - paidLeaveDays - sickLeave - unpaidLeave);
      const absenceDeduction = absentDays * dailyRate;
      const lateDeduction = lateDays > 3 ? (lateDays - 3) * (dailyRate * 0.25) : 0;
      const totalDeductions = sickDeduction + unpaidDeduction + absenceDeduction + lateDeduction;
      const finalSalary = Math.max(0, baseSalary - totalDeductions);

      const displayId = await generateDisplayId('PAY');
      await supabase.from('payroll').insert({
        display_id: displayId, employee_id: emp.user_id, year_month: yearMonth, base_salary: baseSalary,
        present_days: presentDays, late_days: lateDays, paid_leave_days: paidLeaveDays, sick_leave: sickLeave, unpaid_leave: unpaidLeave, absent_days: absentDays,
        total_hours: Math.round(totalHours),
        sick_deduction: Math.round(sickDeduction), unpaid_deduction: Math.round(unpaidDeduction),
        absence_deduction: Math.round(absenceDeduction), late_deduction: Math.round(lateDeduction),
        total_deductions: Math.round(totalDeductions),
        bonus: 0, allowances: 0, overtime: 0,
        final_salary: Math.round(finalSalary), status: 'Draft',
      });
    }
    load();
  };

  const confirmPayroll = async (id: string) => {
    await supabase.from('payroll').update({ status: 'Confirmed', confirmed_by: user?.email || '', confirmed_at: new Date().toISOString() }).eq('id', id);
    await auditLog('payroll_confirmed', 'payroll', id, {});
    load();
  };

  const handleEdit = (p: any) => { setEditingId(p.id); setEditForm({ bonus: p.bonus || 0, allowances: p.allowances || 0, overtime: p.overtime || 0 }); };

  const handleSaveEdit = async (p: any) => {
    const bonus = Number(editForm.bonus) || 0;
    const allowances = Number(editForm.allowances) || 0;
    const overtime = Number(editForm.overtime) || 0;
    const finalSalary = (p.base_salary || 0) - (p.total_deductions || 0) + bonus + allowances + overtime;
    await supabase.from('payroll').update({ bonus, allowances, overtime, final_salary: Math.round(finalSalary) }).eq('id', p.id);
    setEditingId(null);
    load();
  };

  const totalPayroll = payroll.reduce((s, p) => s + (p.final_salary || 0), 0);
  const totalDeductions = payroll.reduce((s, p) => s + (p.total_deductions || 0), 0);

  const exportCSV = () => {
    const headers = ['Employee', 'Base Salary', 'Present', 'Late', 'Absent', 'Leave', 'Sick', 'Deductions', 'Bonus', 'Allowances', 'OT', 'Final Salary', 'Status'];
    const rows = payroll.map(p => {
      const emp = employees.find(e => e.user_id === p.employee_id);
      return [emp?.name, p.base_salary, p.present_days, p.late_days, p.absent_days, p.paid_leave_days, p.sick_leave, p.total_deductions, p.bonus, p.allowances, p.overtime, p.final_salary, p.status];
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

      {payroll.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="stat-card"><div><p className="text-xs text-muted-foreground">Total Payroll</p><p className="text-xl font-bold font-display">{formatCurrency(totalPayroll)}</p></div></div>
          <div className="stat-card"><div><p className="text-xs text-muted-foreground">Total Deductions</p><p className="text-xl font-bold font-display text-destructive">{formatCurrency(totalDeductions)}</p></div></div>
          <div className="stat-card"><div><p className="text-xs text-muted-foreground">Employees</p><p className="text-xl font-bold font-display">{payroll.length}</p></div></div>
        </div>
      )}

      <div className="card-nawi p-0 overflow-x-auto">
        <table className="table-nawi w-full text-sm">
          <thead><tr><th>Employee</th><th>Base</th><th>Days</th><th>Late</th><th>Absent</th><th>Leave</th><th>Deductions</th><th>Bonus</th><th>Allow.</th><th>OT</th><th>Final</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {payroll.length === 0 ? (
              <tr><td colSpan={13} className="text-center text-muted-foreground py-8">Click "Calculate Payroll" to generate</td></tr>
            ) : payroll.map(p => {
              const emp = employees.find(e => e.user_id === p.employee_id);
              const isEditing = editingId === p.id;
              return (
                <tr key={p.id}>
                  <td className="font-medium">{emp?.name || '—'}</td>
                  <td>{formatCurrency(p.base_salary)}</td>
                  <td><span className="text-success">{p.present_days}</span>/22</td>
                  <td>{p.late_days > 0 ? <span className="text-warning">{p.late_days}</span> : '0'}</td>
                  <td>{p.absent_days > 0 ? <span className="text-destructive">{p.absent_days}</span> : '0'}</td>
                  <td>{(p.paid_leave_days || 0) + (p.sick_leave || 0)}</td>
                  <td className="text-destructive">{formatCurrency(p.total_deductions || 0)}</td>
                  <td>{isEditing ? <input type="number" value={editForm.bonus} onChange={e => setEditForm({ ...editForm, bonus: e.target.value })} className="input-nawi w-20 text-xs py-1" /> : <span className="text-success">{formatCurrency(p.bonus || 0)}</span>}</td>
                  <td>{isEditing ? <input type="number" value={editForm.allowances} onChange={e => setEditForm({ ...editForm, allowances: e.target.value })} className="input-nawi w-20 text-xs py-1" /> : formatCurrency(p.allowances || 0)}</td>
                  <td>{isEditing ? <input type="number" value={editForm.overtime} onChange={e => setEditForm({ ...editForm, overtime: e.target.value })} className="input-nawi w-20 text-xs py-1" /> : formatCurrency(p.overtime || 0)}</td>
                  <td className="font-bold">{formatCurrency(p.final_salary)}</td>
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
