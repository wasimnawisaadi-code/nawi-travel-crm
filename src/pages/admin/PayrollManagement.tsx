import { useState, useEffect } from 'react';
import { exportToExcel } from '@/lib/excel-export';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth-context';
import { formatCurrency, generateDisplayId, auditLog } from '@/lib/supabase-service';
import StatusBadge from '@/components/ui/StatusBadge';
import PasswordConfirmDialog from '@/components/PasswordConfirmDialog';
import { Download, Calculator, Edit, Save, X, Lock, Unlock, FileText } from 'lucide-react';
import { toast } from 'sonner';

export default function PayrollManagement() {
  const { user } = useAuth();
  const now = new Date();
  const [yearMonth, setYearMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
  const [payroll, setPayroll] = useState<any[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<any>({});
  const [employees, setEmployees] = useState<any[]>([]);
  const [pwdAction, setPwdAction] = useState<{ type: 'lock' | 'unlock' | 'confirm'; row: any } | null>(null);

  const monthLocked = payroll.length > 0 && payroll.every(p => p.locked);

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
    toast.success('Payroll confirmed');
    load();
  };

  const lockMonth = async () => {
    await supabase.from('payroll').update({ locked: true, locked_at: new Date().toISOString(), locked_by: user?.email || '' } as any).eq('year_month', yearMonth);
    await auditLog('payroll_locked', 'payroll', yearMonth, {});
    toast.success(`Payroll for ${yearMonth} locked`);
    load();
  };

  const unlockMonth = async () => {
    await supabase.from('payroll').update({ locked: false, locked_at: null, locked_by: null } as any).eq('year_month', yearMonth);
    await auditLog('payroll_unlocked', 'payroll', yearMonth, {});
    toast.success(`Payroll for ${yearMonth} unlocked`);
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

  const downloadPayslip = async (p: any) => {
    const emp = employees.find(e => e.user_id === p.employee_id);
    const jsPDF = (await import('jspdf')).default;
    const { drawBrandHeader, drawBrandFooter } = await import('@/lib/pdf-helpers');
    const doc = new jsPDF();
    const headerBottom = await drawBrandHeader(doc, `Payslip — ${yearMonth}`);
    let y = headerBottom + 4;
    doc.setFontSize(9); doc.setTextColor(120);
    doc.text(`Payslip ID: ${p.display_id}`, 140, y);
    y = headerBottom + 12;

    doc.setFontSize(9); doc.setTextColor(120); doc.text('EMPLOYEE', 18, y);
    doc.setTextColor(0); doc.setFontSize(10);
    y += 5; doc.text(emp?.name || '—', 18, y);
    y += 5; doc.text(emp?.email || '—', 18, y);
    y += 5; doc.text(`Status: ${p.status}${p.locked ? ' (Locked)' : ''}`, 18, y);

    // Attendance table
    y += 10;
    doc.setFillColor(5, 47, 89); doc.rect(18, y, 174, 8, 'F');
    doc.setTextColor(255); doc.setFontSize(9);
    doc.text('ATTENDANCE SUMMARY', 22, y + 5.5);
    y += 12; doc.setTextColor(0); doc.setFontSize(9);
    const attRows = [
      ['Present Days', `${p.present_days || 0} / 22`],
      ['Late Days', String(p.late_days || 0)],
      ['Absent Days', String(p.absent_days || 0)],
      ['Paid Leave', String(p.paid_leave_days || 0)],
      ['Sick Leave', String(p.sick_leave || 0)],
      ['Unpaid Leave', String(p.unpaid_leave || 0)],
      ['Total Hours', String(p.total_hours || 0)],
    ];
    attRows.forEach(([k, v]) => { doc.text(k, 22, y); doc.text(v, 188, y, { align: 'right' }); y += 6; });

    // Earnings
    y += 4;
    doc.setFillColor(10, 112, 64); doc.rect(18, y, 174, 8, 'F');
    doc.setTextColor(255); doc.text('EARNINGS', 22, y + 5.5);
    y += 12; doc.setTextColor(0);
    const earnings = [
      ['Base Salary', p.base_salary || 0],
      ['Bonus', p.bonus || 0],
      ['Allowances', p.allowances || 0],
      ['Overtime', p.overtime || 0],
    ];
    earnings.forEach(([k, v]: any) => { doc.text(String(k), 22, y); doc.text(formatCurrency(v), 188, y, { align: 'right' }); y += 6; });

    // Deductions
    y += 4;
    doc.setFillColor(196, 57, 43); doc.rect(18, y, 174, 8, 'F');
    doc.setTextColor(255); doc.text('DEDUCTIONS', 22, y + 5.5);
    y += 12; doc.setTextColor(0);
    const deds = [
      ['Sick Deduction', p.sick_deduction || 0],
      ['Unpaid Deduction', p.unpaid_deduction || 0],
      ['Absence Deduction', p.absence_deduction || 0],
      ['Late Deduction', p.late_deduction || 0],
      ['Total Deductions', p.total_deductions || 0],
    ];
    deds.forEach(([k, v]: any, i: number) => {
      if (i === deds.length - 1) doc.setFont(undefined, 'bold');
      doc.text(String(k), 22, y); doc.text(formatCurrency(v), 188, y, { align: 'right' });
      doc.setFont(undefined, 'normal');
      y += 6;
    });

    // Final
    y += 6;
    doc.setFillColor(5, 47, 89); doc.rect(18, y, 174, 12, 'F');
    doc.setTextColor(255); doc.setFontSize(13);
    doc.text('FINAL SALARY', 22, y + 8);
    doc.text(formatCurrency(p.final_salary || 0), 188, y + 8, { align: 'right' });

    if (p.confirmed_by) {
      y += 18; doc.setFontSize(8); doc.setTextColor(120);
      doc.text(`Confirmed by ${p.confirmed_by} on ${new Date(p.confirmed_at).toLocaleString('en-GB')}`, 18, y);
    }

    await drawBrandFooter(doc, user?.email || '');
    doc.save(`Payslip_${(emp?.name || p.employee_id).replace(/\s+/g, '_')}_${yearMonth}.pdf`);
  };

  const totalPayroll = payroll.reduce((s, p) => s + (p.final_salary || 0), 0);
  const totalDeductions = payroll.reduce((s, p) => s + (p.total_deductions || 0), 0);

  const exportXlsx = () => {
    const rows = payroll.map(p => {
      const emp = employees.find(e => e.user_id === p.employee_id);
      return {
        Employee: emp?.name || '—',
        Email: emp?.email || '',
        'Base Salary': p.base_salary || 0,
        Present: p.present_days || 0,
        Late: p.late_days || 0,
        Absent: p.absent_days || 0,
        'Paid Leave': p.paid_leave_days || 0,
        Sick: p.sick_leave || 0,
        Deductions: p.total_deductions || 0,
        Bonus: p.bonus || 0,
        Allowances: p.allowances || 0,
        Overtime: p.overtime || 0,
        'Final Salary': p.final_salary || 0,
        Status: p.status,
      };
    });
    exportToExcel(rows, `payroll_${yearMonth}`, 'Payroll');
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-bold font-display">Payroll Management</h2>
          <input type="month" value={yearMonth} onChange={(e) => setYearMonth(e.target.value)} className="input-nawi w-auto" />
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={exportXlsx} className="btn-outline"><Download className="w-4 h-4" /> Export Excel</button>
          {payroll.length > 0 && (
            monthLocked
              ? <button onClick={() => setPwdAction({ type: 'unlock', row: null })} className="btn-outline"><Unlock className="w-4 h-4" /> Unlock Month</button>
              : <button onClick={() => setPwdAction({ type: 'lock', row: null })} className="btn-outline"><Lock className="w-4 h-4" /> Lock Month</button>
          )}
          <button onClick={calculatePayroll} disabled={monthLocked} className="btn-primary disabled:opacity-50"><Calculator className="w-4 h-4" /> Calculate Payroll</button>
        </div>
      </div>

      {monthLocked && (
        <div className="card-nawi bg-warning/5 border-warning/30 flex items-center gap-3 py-3">
          <Lock className="w-5 h-5 text-warning" />
          <div className="text-sm">
            <strong className="text-warning">Payroll for {yearMonth} is locked.</strong>
            <span className="text-muted-foreground ml-2">No further edits, confirmations, or recalculations are allowed. Unlock to make changes.</span>
          </div>
        </div>
      )}

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
                    <div className="flex gap-1 items-center">
                      {isEditing ? (
                        <><button onClick={() => handleSaveEdit(p)} className="text-success p-1" title="Save"><Save className="w-3 h-3" /></button><button onClick={() => setEditingId(null)} className="text-muted-foreground p-1" title="Cancel"><X className="w-3 h-3" /></button></>
                      ) : p.locked ? (
                        <><Lock className="w-3 h-3 text-warning" /><button onClick={() => downloadPayslip(p)} className="text-primary p-1" title="Download payslip"><FileText className="w-3 h-3" /></button></>
                      ) : (
                        <>
                          {p.status === 'Draft' && (
                            <>
                              <button onClick={() => handleEdit(p)} className="text-secondary p-1" title="Edit"><Edit className="w-3 h-3" /></button>
                              <button onClick={() => setPwdAction({ type: 'confirm', row: p })} className="btn-success text-xs px-2 py-0.5">Confirm</button>
                            </>
                          )}
                          <button onClick={() => downloadPayslip(p)} className="text-primary p-1" title="Download payslip"><FileText className="w-3 h-3" /></button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>


      <PasswordConfirmDialog
        open={!!pwdAction}
        onClose={() => setPwdAction(null)}
        title={pwdAction?.type === 'lock' ? 'Lock Payroll Month' : pwdAction?.type === 'unlock' ? 'Unlock Payroll Month' : 'Confirm Payroll'}
        description={
          pwdAction?.type === 'lock' ? `Lock all payroll records for ${yearMonth}? Re-enter your password to confirm.` :
          pwdAction?.type === 'unlock' ? `Unlock payroll for ${yearMonth} so it can be edited again? Re-enter your password.` :
          `Confirm payroll for ${pwdAction?.row ? employees.find(e => e.user_id === pwdAction.row.employee_id)?.name : ''}? Re-enter your password.`
        }
        onConfirm={async () => {
          if (!pwdAction) return;
          if (pwdAction.type === 'lock') await lockMonth();
          else if (pwdAction.type === 'unlock') await unlockMonth();
          else if (pwdAction.type === 'confirm' && pwdAction.row) await confirmPayroll(pwdAction.row.id);
          setPwdAction(null);
        }}
      />
    </div>
  );
}
