import { useState, useEffect } from 'react';
import { Users, TrendingUp, CheckSquare, UserCheck, AlertTriangle, FileText, Target, Clock } from 'lucide-react';
import { storage, KEYS, formatCurrency, formatDate, daysUntil, getCurrentUser } from '@/lib/storage';
import StatusBadge from '@/components/ui/StatusBadge';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

const COLORS = ['#052F59', '#1A5B96', '#0A7040', '#C45000', '#C0392B', '#64748B', '#C5D8EE', '#E8F0F8'];

export default function AdminDashboard() {
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    const clients = storage.getAll(KEYS.CLIENTS);
    const tasks = storage.getAll(KEYS.TASKS);
    const employees = storage.getAll(KEYS.EMPLOYEES);
    const attendance = storage.getAll(KEYS.ATTENDANCE);
    const leave = storage.getAll(KEYS.LEAVE);
    const goals = storage.getAll(KEYS.GOALS);
    const auditLog = storage.getAll(KEYS.AUDIT_LOG);

    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const today = now.toISOString().split('T')[0];

    const revenueThisMonth = clients
      .filter((c: any) => c.createdAt?.startsWith(thisMonth))
      .reduce((sum: number, c: any) => sum + (c.revenue || 0), 0);

    const activeTasks = tasks.filter((t: any) => t.status === 'New' || t.status === 'Processing').length;
    const overdueTasks = tasks.filter((t: any) => (t.status === 'New' || t.status === 'Processing') && t.dueDate && new Date(t.dueDate) < now).length;
    const pendingLeave = leave.filter((l: any) => l.status === 'Pending').length;
    const employeesOnline = attendance.filter((a: any) => a.date === today && !a.logoutTime).length;

    // Goal achievement
    const monthGoals = goals.filter((g: any) => g.yearMonth === thisMonth);
    const totalTarget = monthGoals.reduce((s: number, g: any) => s + (g.target || 0), 0);
    const totalAchieved = monthGoals.reduce((s: number, g: any) => s + (g.achieved || 0), 0);
    const goalPct = totalTarget > 0 ? Math.round((totalAchieved / totalTarget) * 100) : 0;

    // Service distribution
    const serviceCounts: Record<string, number> = {};
    clients.forEach((c: any) => {
      if (c.service) serviceCounts[c.service] = (serviceCounts[c.service] || 0) + 1;
    });
    const serviceData = Object.entries(serviceCounts).map(([name, value]) => ({ name, value }));

    // Monthly revenue
    const monthlyRevenue: Record<string, number> = {};
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('en-US', { month: 'short' });
      monthlyRevenue[label] = clients
        .filter((c: any) => c.createdAt?.startsWith(key))
        .reduce((s: number, c: any) => s + (c.revenue || 0), 0);
    }
    const revenueData = Object.entries(monthlyRevenue).map(([month, revenue]) => ({ month, revenue }));

    // Upcoming dates
    const upcomingDates: any[] = [];
    clients.forEach((c: any) => {
      const dates = c.importantDates || {};
      Object.entries(dates).forEach(([type, val]) => {
        if (!val) return;
        const days = daysUntil(val as string);
        if (days >= 0 && days <= 14) {
          upcomingDates.push({ clientName: c.name, clientId: c.id, type, date: val, days });
        }
      });
    });
    upcomingDates.sort((a, b) => a.days - b.days);

    // Today attendance
    const todayAttendance = attendance.filter((a: any) => a.date === today).map((a: any) => {
      const emp = employees.find((e: any) => e.id === a.employeeId);
      return { ...a, name: emp?.name || a.employeeId };
    });

    setData({
      totalClients: clients.length,
      revenueThisMonth,
      activeTasks,
      employeesOnline,
      overdueTasks,
      pendingLeave,
      goalPct,
      serviceData,
      revenueData,
      upcomingDates: upcomingDates.slice(0, 10),
      todayAttendance,
      recentAudit: auditLog.slice(-10).reverse(),
    });
  }, []);

  if (!data) return <div className="skeleton-nawi h-96 w-full" />;

  const statCards = [
    { label: 'Total Clients', value: data.totalClients, icon: Users, color: 'bg-secondary' },
    { label: 'Revenue This Month', value: formatCurrency(data.revenueThisMonth), icon: TrendingUp, color: 'bg-success' },
    { label: 'Active Tasks', value: data.activeTasks, icon: CheckSquare, color: 'bg-warning' },
    { label: 'Employees Online', value: data.employeesOnline, icon: UserCheck, color: 'bg-primary' },
  ];

  const statCards2 = [
    { label: 'Overdue Tasks', value: data.overdueTasks, icon: AlertTriangle, color: 'bg-destructive' },
    { label: 'Pending Leave', value: data.pendingLeave, icon: FileText, color: 'bg-warning' },
    { label: 'Goal Achievement', value: `${data.goalPct}%`, icon: Target, color: 'bg-success' },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Stat Cards Row 1 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((s) => (
          <div key={s.label} className="stat-card">
            <div className={`stat-card-icon ${s.color}`}>
              <s.icon className="w-6 h-6 text-primary-foreground" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">{s.label}</p>
              <p className="text-xl font-bold text-foreground font-display">{s.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Stat Cards Row 2 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {statCards2.map((s) => (
          <div key={s.label} className="stat-card">
            <div className={`stat-card-icon ${s.color}`}>
              <s.icon className="w-6 h-6 text-primary-foreground" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">{s.label}</p>
              <p className="text-xl font-bold text-foreground font-display">{s.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card-nawi">
          <h3 className="text-base font-semibold text-foreground font-display mb-4">Monthly Revenue</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={data.revenueData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(213,45%,92%)" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip formatter={(v: number) => formatCurrency(v)} />
              <Bar dataKey="revenue" fill="#052F59" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="card-nawi">
          <h3 className="text-base font-semibold text-foreground font-display mb-4">Clients by Service</h3>
          {data.serviceData.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-16">No clients yet</p>
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={data.serviceData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={({ name, value }) => `${name}: ${value}`} labelLine={false}>
                  {data.serviceData.map((_: any, i: number) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Recent Activity + Upcoming Dates */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card-nawi">
          <h3 className="text-base font-semibold text-foreground font-display mb-4">Recent Activity</h3>
          <div className="space-y-3 max-h-80 overflow-y-auto">
            {data.recentAudit.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No activity yet</p>
            ) : data.recentAudit.map((a: any) => (
              <div key={a.id} className="flex items-start gap-3 text-sm">
                <div className="w-2 h-2 rounded-full bg-secondary mt-1.5 flex-shrink-0" />
                <div>
                  <p className="text-foreground"><span className="font-medium">{a.userName}</span> {a.action.replace(/_/g, ' ')}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(a.timestamp)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card-nawi">
          <h3 className="text-base font-semibold text-foreground font-display mb-4">Upcoming Important Dates</h3>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {data.upcomingDates.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No upcoming dates</p>
            ) : data.upcomingDates.map((d: any, i: number) => (
              <div key={i} className="flex items-center justify-between p-2.5 rounded-lg bg-muted/50">
                <div>
                  <p className="text-sm font-medium text-foreground">{d.clientName}</p>
                  <p className="text-xs text-muted-foreground capitalize">{d.type.replace(/([A-Z])/g, ' $1').trim()}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">{formatDate(d.date)}</p>
                  <span className={`text-xs font-medium ${d.days <= 7 ? 'text-destructive' : d.days <= 30 ? 'text-warning' : 'text-success'}`}>
                    {d.days === 0 ? 'Today' : `${d.days}d left`}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Today's Attendance */}
      <div className="card-nawi">
        <h3 className="text-base font-semibold text-foreground font-display mb-4">Today's Attendance</h3>
        {data.todayAttendance.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No attendance records today</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {data.todayAttendance.map((a: any) => (
              <div key={a.id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center text-xs font-bold text-primary-foreground">
                  {a.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">{a.name}</p>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={a.status} />
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {new Date(a.loginTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
