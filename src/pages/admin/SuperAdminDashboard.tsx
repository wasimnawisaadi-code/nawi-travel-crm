import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Crown, Users, Shield, UserCheck, Briefcase, DollarSign, Activity, AlertTriangle, TrendingUp, Clock, FileText, MapPin } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth-context';
import { formatCurrency } from '@/lib/supabase-service';
import StatusBadge from '@/components/ui/StatusBadge';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, Legend } from 'recharts';

interface AdminLite { user_id: string; name: string; email: string; photo_url: string | null; }
interface EmpLite extends AdminLite { base_salary: number; status: string; }

export default function SuperAdminDashboard() {
  const { profile } = useAuth();
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    const load = async () => {
      const today = new Date().toISOString().slice(0, 10);
      const now = new Date();
      const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

      const [
        { data: roles },
        { data: profs },
        { data: clients },
        { data: tasks },
        { data: leave },
        { data: attToday },
        { data: payroll },
        { data: audit },
        { data: zones },
      ] = await Promise.all([
        supabase.from('user_roles').select('user_id, role'),
        supabase.from('profiles').select('user_id, name, email, photo_url, base_salary, status'),
        supabase.from('clients').select('id, name, status, revenue, profit, created_at, assigned_to'),
        supabase.from('tasks').select('id, status, due_date, assigned_to'),
        supabase.from('leave_requests').select('id, status, employee_id'),
        supabase.from('attendance').select('employee_id, status, login_time, logout_time, login_location_status').eq('date', today),
        supabase.from('payroll').select('employee_id, year_month, final_salary, status, locked').eq('year_month', thisMonth),
        supabase.from('audit_log').select('*').order('created_at', { ascending: false }).limit(20),
        supabase.from('geofence_zones').select('id, name, is_active'),
      ]);

      const allRoles = roles || [];
      const adminIds = new Set(allRoles.filter((r: any) => r.role === 'admin').map((r: any) => r.user_id));
      const superIds = new Set(allRoles.filter((r: any) => r.role === 'superadmin').map((r: any) => r.user_id));

      const allProfs = (profs || []) as EmpLite[];
      const admins: AdminLite[] = allProfs.filter(p => adminIds.has(p.user_id) || superIds.has(p.user_id));
      const employees: EmpLite[] = allProfs.filter(p => !adminIds.has(p.user_id) && !superIds.has(p.user_id));
      const activeEmployees = employees.filter(e => e.status === 'active');

      const allClients = clients || [];
      const totalRevenue = allClients.reduce((s, c: any) => s + (c.revenue || 0), 0);
      const totalProfit = allClients.reduce((s, c: any) => s + (c.profit || 0), 0);
      const monthClients = allClients.filter((c: any) => c.created_at?.startsWith(thisMonth));

      const allTasks = tasks || [];
      const overdueTasks = allTasks.filter((t: any) => (t.status === 'New' || t.status === 'Processing') && t.due_date && new Date(t.due_date) < now).length;

      const att = attToday || [];
      const onlineNow = att.filter((a: any) => !a.logout_time).length;
      const lateToday = att.filter((a: any) => a.status === 'Late').length;
      const outsideZone = att.filter((a: any) => a.login_location_status === 'outside_zone').length;

      const pendingLeave = (leave || []).filter((l: any) => l.status === 'Pending').length;

      const monthPayroll = payroll || [];
      const totalPayroll = monthPayroll.reduce((s: number, p: any) => s + (p.final_salary || 0), 0);
      const draftPayroll = monthPayroll.filter((p: any) => p.status === 'Draft').length;

      // 6-month trend
      const trend: any[] = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const label = d.toLocaleDateString('en-US', { month: 'short' });
        const monthCs = allClients.filter((c: any) => c.created_at?.startsWith(key));
        trend.push({
          month: label,
          revenue: monthCs.reduce((s: number, c: any) => s + (c.revenue || 0), 0),
          profit: monthCs.reduce((s: number, c: any) => s + (c.profit || 0), 0),
          clients: monthCs.length,
        });
      }

      // Per-admin scoreboard: clients/tasks/employees-managed-by metric is hard,
      // so show clients/revenue created by each admin (uses created_by approx via assigned_to).
      const adminScores = admins.map(a => {
        const adminClients = allClients.filter((c: any) => c.assigned_to === a.user_id);
        return {
          ...a,
          isSuper: superIds.has(a.user_id),
          clients: adminClients.length,
          revenue: adminClients.reduce((s: number, c: any) => s + (c.revenue || 0), 0),
        };
      }).sort((x, y) => y.revenue - x.revenue);

      // Per-employee live snapshot
      const empSnapshot = activeEmployees.map(e => {
        const a = att.find((x: any) => x.employee_id === e.user_id);
        const ec = allClients.filter((c: any) => c.assigned_to === e.user_id);
        const et = allTasks.filter((t: any) => t.assigned_to === e.user_id);
        return {
          ...e,
          attendance: a ? (a.logout_time ? 'Logged out' : a.status || 'Present') : 'Absent',
          loginTime: a?.login_time || null,
          locationStatus: a?.login_location_status || 'unknown',
          clients: ec.length,
          revenue: ec.reduce((s: number, c: any) => s + (c.revenue || 0), 0),
          activeTasks: et.filter((t: any) => t.status !== 'Completed').length,
        };
      }).sort((x, y) => y.revenue - x.revenue);

      setData({
        admins, adminScores,
        totalEmployees: activeEmployees.length,
        totalAdmins: admins.length,
        superCount: superIds.size,
        clientsTotal: allClients.length,
        clientsThisMonth: monthClients.length,
        totalRevenue, totalProfit,
        onlineNow, lateToday, outsideZone, pendingLeave,
        overdueTasks,
        totalPayroll, draftPayroll,
        trend,
        empSnapshot,
        recentAudit: audit || [],
        zonesActive: (zones || []).filter((z: any) => z.is_active).length,
        thisMonth,
      });
    };
    load();
    const i = setInterval(load, 60_000);
    return () => clearInterval(i);
  }, []);

  if (!data) return <div className="skeleton-nawi h-96 w-full" />;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Hero */}
      <div className="card-nawi bg-gradient-to-r from-primary to-secondary text-primary-foreground border-0">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-warning/20 flex items-center justify-center">
              <Crown className="w-6 h-6 text-warning" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-primary-foreground/70">Super Admin Console</p>
              <h2 className="text-xl font-bold font-display">Welcome, {profile?.name || 'Boss'}</h2>
              <p className="text-xs text-primary-foreground/70">Live monitoring across all admins, employees, clients, finances, and operations.</p>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Link to="/admin/admins" className="btn-outline border-primary-foreground/30 text-primary-foreground hover:bg-primary-foreground/10 text-xs">
              <Shield className="w-4 h-4" /> Manage Admins
            </Link>
            <Link to="/admin/audit-log" className="btn-outline border-primary-foreground/30 text-primary-foreground hover:bg-primary-foreground/10 text-xs">
              <FileText className="w-4 h-4" /> Audit Log
            </Link>
            <Link to="/admin/geofence" className="btn-outline border-primary-foreground/30 text-primary-foreground hover:bg-primary-foreground/10 text-xs">
              <MapPin className="w-4 h-4" /> Zones
            </Link>
          </div>
        </div>
      </div>

      {/* Key counters */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        <KpiCard icon={<Crown className="w-4 h-4 text-warning" />} label="Super Admins" value={String(data.superCount)} />
        <KpiCard icon={<Shield className="w-4 h-4 text-primary" />} label="Admins" value={String(data.totalAdmins)} />
        <KpiCard icon={<Users className="w-4 h-4 text-secondary" />} label="Employees" value={String(data.totalEmployees)} />
        <KpiCard icon={<UserCheck className="w-4 h-4 text-success" />} label="Online Now" value={`${data.onlineNow}/${data.totalEmployees}`} />
        <KpiCard icon={<Briefcase className="w-4 h-4 text-primary" />} label="Clients" value={String(data.clientsTotal)} sub={`+${data.clientsThisMonth} this mo`} />
        <KpiCard icon={<TrendingUp className="w-4 h-4 text-success" />} label="Total Revenue" value={formatCurrency(data.totalRevenue)} />
        <KpiCard icon={<DollarSign className="w-4 h-4 text-success" />} label={`Payroll ${data.thisMonth}`} value={formatCurrency(data.totalPayroll)} sub={data.draftPayroll > 0 ? `${data.draftPayroll} draft` : 'all confirmed'} />
      </div>

      {/* Alerts */}
      {(data.overdueTasks > 0 || data.lateToday > 0 || data.outsideZone > 0 || data.pendingLeave > 0 || data.draftPayroll > 0) && (
        <div className="card-nawi border-warning/30 bg-warning/5">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 text-warning" />
            <h3 className="font-semibold text-sm">Things needing attention</h3>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            {data.overdueTasks > 0 && <span className="bg-destructive/10 text-destructive px-2 py-1 rounded-full">{data.overdueTasks} overdue tasks</span>}
            {data.lateToday > 0 && <span className="bg-warning/15 text-warning px-2 py-1 rounded-full">{data.lateToday} late today</span>}
            {data.outsideZone > 0 && <span className="bg-warning/15 text-warning px-2 py-1 rounded-full">{data.outsideZone} logged in outside zone</span>}
            {data.pendingLeave > 0 && <span className="bg-secondary/15 text-secondary px-2 py-1 rounded-full">{data.pendingLeave} leave to review</span>}
            {data.draftPayroll > 0 && <span className="bg-primary/10 text-primary px-2 py-1 rounded-full">{data.draftPayroll} draft payslips</span>}
          </div>
        </div>
      )}

      {/* Trend + Admin scoreboard */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="card-nawi lg:col-span-2">
          <h3 className="text-base font-semibold font-display mb-3">Revenue & Profit — Last 6 months</h3>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={data.trend}>
              <defs>
                <linearGradient id="sRev" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#052F59" stopOpacity={0.2} /><stop offset="95%" stopColor="#052F59" stopOpacity={0} /></linearGradient>
                <linearGradient id="sProf" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#0A7040" stopOpacity={0.2} /><stop offset="95%" stopColor="#0A7040" stopOpacity={0} /></linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(213,45%,92%)" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: number) => formatCurrency(v)} />
              <Legend />
              <Area type="monotone" dataKey="revenue" stroke="#052F59" fill="url(#sRev)" strokeWidth={2} />
              <Area type="monotone" dataKey="profit" stroke="#0A7040" fill="url(#sProf)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="card-nawi">
          <h3 className="text-base font-semibold font-display mb-3">Admin Scoreboard</h3>
          {data.adminScores.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No admins yet</p>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {data.adminScores.map((a: any) => (
                <div key={a.user_id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted">
                  {a.photo_url ? <img src={a.photo_url} alt="" className="w-8 h-8 rounded-full object-cover" /> :
                    <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-bold">{a.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}</div>}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate flex items-center gap-1">
                      {a.name}
                      {a.isSuper && <Crown className="w-3 h-3 text-warning" />}
                    </p>
                    <p className="text-[11px] text-muted-foreground">{a.clients} clients</p>
                  </div>
                  <span className="text-sm font-semibold text-success">{formatCurrency(a.revenue)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Live Employee Snapshot */}
      <div className="card-nawi">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-success" />
            <h3 className="text-base font-semibold font-display">Live Employee Snapshot</h3>
          </div>
          <span className="text-xs text-muted-foreground">Auto-refresh every 60s</span>
        </div>
        {data.empSnapshot.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">No active employees</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-border text-xs text-muted-foreground">
                  <th className="py-2 px-2">Employee</th>
                  <th className="py-2 px-2">Today</th>
                  <th className="py-2 px-2">Login</th>
                  <th className="py-2 px-2">Location</th>
                  <th className="py-2 px-2">Clients</th>
                  <th className="py-2 px-2">Revenue</th>
                  <th className="py-2 px-2">Tasks</th>
                </tr>
              </thead>
              <tbody>
                {data.empSnapshot.slice(0, 12).map((e: any) => (
                  <tr key={e.user_id} className="border-b border-border/50 hover:bg-muted/30">
                    <td className="py-2 px-2">
                      <div className="flex items-center gap-2">
                        {e.photo_url ? <img src={e.photo_url} className="w-7 h-7 rounded-full object-cover" alt="" /> :
                          <div className="w-7 h-7 rounded-full bg-secondary text-secondary-foreground text-[10px] flex items-center justify-center font-bold">{e.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}</div>}
                        <span className="font-medium">{e.name}</span>
                      </div>
                    </td>
                    <td className="py-2 px-2"><StatusBadge status={e.attendance} /></td>
                    <td className="py-2 px-2 text-xs text-muted-foreground">
                      {e.loginTime ? new Date(e.loginTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '—'}
                    </td>
                    <td className="py-2 px-2 text-xs">
                      {e.locationStatus === 'inside_zone' && <span className="text-success">✅ Inside</span>}
                      {e.locationStatus === 'outside_zone' && <span className="text-warning">⚠️ Outside</span>}
                      {e.locationStatus === 'no_zone' && <span className="text-muted-foreground">No zone</span>}
                      {e.locationStatus === 'location_denied' && <span className="text-destructive">Denied</span>}
                      {e.locationStatus === 'unknown' && <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="py-2 px-2">{e.clients}</td>
                    <td className="py-2 px-2 text-success font-medium">{formatCurrency(e.revenue)}</td>
                    <td className="py-2 px-2">{e.activeTasks}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Recent Audit */}
      <div className="card-nawi">
        <div className="flex items-center gap-2 mb-3">
          <Clock className="w-4 h-4 text-primary" />
          <h3 className="text-base font-semibold font-display">Recent System Activity</h3>
        </div>
        {data.recentAudit.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">No recent activity</p>
        ) : (
          <div className="divide-y divide-border max-h-80 overflow-y-auto">
            {data.recentAudit.map((a: any) => (
              <div key={a.id} className="py-2 flex items-start gap-3 text-sm">
                <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium">{a.action.replace(/_/g, ' ')}</p>
                  <p className="text-xs text-muted-foreground">
                    {a.user_name || 'System'} • {a.target_type} • {new Date(a.created_at).toLocaleString('en-GB')}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function KpiCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <div className="card-nawi">
      <div className="flex items-center gap-1.5 mb-1">{icon}<p className="text-[11px] text-muted-foreground uppercase tracking-wide">{label}</p></div>
      <p className="text-lg font-bold font-display truncate">{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
    </div>
  );
}
