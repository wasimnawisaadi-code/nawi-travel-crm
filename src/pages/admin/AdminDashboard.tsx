import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Users, TrendingUp, CheckSquare, UserCheck, AlertTriangle, Clock, Briefcase, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { storage, KEYS, formatCurrency, formatDate, daysUntil, getCurrentUser } from '@/lib/storage';
import StatusBadge from '@/components/ui/StatusBadge';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, AreaChart, Area } from 'recharts';

const COLORS = ['#052F59', '#1A5B96', '#0A7040', '#C45000', '#C0392B', '#64748B', '#C5D8EE', '#E8F0F8'];

export default function AdminDashboard() {
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    const clients = storage.getAll(KEYS.CLIENTS);
    const tasks = storage.getAll(KEYS.TASKS);
    const employees = storage.getAll(KEYS.EMPLOYEES);
    const attendance = storage.getAll(KEYS.ATTENDANCE);
    const quotations = storage.getAll(KEYS.QUOTATIONS);
    const auditLog = storage.getAll(KEYS.AUDIT_LOG);

    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const lastMonth = `${now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()}-${String(now.getMonth() === 0 ? 12 : now.getMonth()).padStart(2, '0')}`;
    const today = now.toISOString().split('T')[0];

    const revenueThisMonth = clients.filter((c: any) => c.createdAt?.startsWith(thisMonth)).reduce((s: number, c: any) => s + (c.revenue || 0), 0);
    const revenueLastMonth = clients.filter((c: any) => c.createdAt?.startsWith(lastMonth)).reduce((s: number, c: any) => s + (c.revenue || 0), 0);
    const profitThisMonth = clients.filter((c: any) => c.createdAt?.startsWith(thisMonth)).reduce((s: number, c: any) => s + (c.profit || 0), 0);

    const activeTasks = tasks.filter((t: any) => t.status === 'New' || t.status === 'Processing').length;
    const overdueTasks = tasks.filter((t: any) => (t.status === 'New' || t.status === 'Processing') && t.dueDate && new Date(t.dueDate) < now).length;
    const completedTasks = tasks.filter((t: any) => t.status === 'Completed' && t.completedDate?.startsWith(thisMonth)).length;
    const employeesOnline = attendance.filter((a: any) => a.date === today && !a.logoutTime).length;
    const totalActiveEmp = employees.filter((e: any) => e.status === 'active').length;

    const clientsThisMonth = clients.filter((c: any) => c.createdAt?.startsWith(thisMonth)).length;
    const clientsLastMonth = clients.filter((c: any) => c.createdAt?.startsWith(lastMonth)).length;

    // Service distribution
    const serviceCounts: Record<string, number> = {};
    clients.forEach((c: any) => { if (c.service) serviceCounts[c.service] = (serviceCounts[c.service] || 0) + 1; });
    const serviceData = Object.entries(serviceCounts).map(([name, value]) => ({ name, value }));

    // Monthly revenue trend (12 months)
    const revenueData: any[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('en-US', { month: 'short' });
      const rev = clients.filter((c: any) => c.createdAt?.startsWith(key)).reduce((s: number, c: any) => s + (c.revenue || 0), 0);
      const prof = clients.filter((c: any) => c.createdAt?.startsWith(key)).reduce((s: number, c: any) => s + (c.profit || 0), 0);
      revenueData.push({ month: label, revenue: rev, profit: prof });
    }

    // Client status distribution
    const statusCounts: Record<string, number> = { New: 0, Processing: 0, Success: 0, Failed: 0 };
    clients.forEach((c: any) => { if (statusCounts[c.status] !== undefined) statusCounts[c.status]++; });

    // Upcoming dates
    const upcomingDates: any[] = [];
    clients.forEach((c: any) => {
      Object.entries(c.importantDates || {}).forEach(([type, val]) => {
        if (!val) return;
        const days = daysUntil(val as string);
        if (days >= 0 && days <= 14) upcomingDates.push({ clientName: c.name, clientId: c.id, type, date: val, days });
      });
    });
    upcomingDates.sort((a, b) => a.days - b.days);

    // Today attendance
    const todayAttendance = attendance.filter((a: any) => a.date === today).map((a: any) => {
      const emp = employees.find((e: any) => e.id === a.employeeId);
      return { ...a, name: emp?.name || a.employeeId, photo: emp?.photo };
    });

    // Top employees by revenue
    const topEmployees = employees.filter((e: any) => e.status === 'active').map((e: any) => ({
      name: e.name,
      photo: e.photo,
      clients: clients.filter((c: any) => c.assignedTo === e.id).length,
      revenue: clients.filter((c: any) => c.assignedTo === e.id).reduce((s: number, c: any) => s + (c.revenue || 0), 0),
      tasks: tasks.filter((t: any) => t.assignedTo === e.id && t.status === 'Completed').length,
    })).sort((a, b) => b.revenue - a.revenue).slice(0, 5);

    // Lead sources
    const leadCounts: Record<string, number> = {};
    clients.forEach((c: any) => { if (c.leadSource) leadCounts[c.leadSource] = (leadCounts[c.leadSource] || 0) + 1; });
    const leadData = Object.entries(leadCounts).map(([name, value]) => ({ name, value }));

    setData({
      totalClients: clients.length, clientsThisMonth, clientsLastMonth,
      revenueThisMonth, revenueLastMonth, profitThisMonth,
      activeTasks, overdueTasks, completedTasks,
      employeesOnline, totalActiveEmp,
      serviceData, revenueData, statusCounts,
      upcomingDates: upcomingDates.slice(0, 10),
      todayAttendance,
      recentAudit: auditLog.slice(-10).reverse(),
      topEmployees, leadData,
    });
  }, []);

  if (!data) return <div className="skeleton-nawi h-96 w-full" />;

  const revenueChange = data.revenueLastMonth > 0 ? Math.round(((data.revenueThisMonth - data.revenueLastMonth) / data.revenueLastMonth) * 100) : 0;
  const clientChange = data.clientsLastMonth > 0 ? Math.round(((data.clientsThisMonth - data.clientsLastMonth) / data.clientsLastMonth) * 100) : 0;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card-nawi relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-secondary/10 rounded-bl-[60px]" />
          <div className="relative">
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 rounded-lg bg-secondary/10 flex items-center justify-center"><Users className="w-5 h-5 text-secondary" /></div>
              {clientChange !== 0 && (
                <span className={`flex items-center gap-1 text-xs font-medium ${clientChange > 0 ? 'text-success' : 'text-destructive'}`}>
                  {clientChange > 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                  {Math.abs(clientChange)}%
                </span>
              )}
            </div>
            <p className="text-2xl font-bold font-display text-foreground">{data.totalClients}</p>
            <p className="text-xs text-muted-foreground mt-1">Total Clients · {data.clientsThisMonth} this month</p>
          </div>
        </div>

        <div className="card-nawi relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-success/10 rounded-bl-[60px]" />
          <div className="relative">
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 rounded-lg bg-success/10 flex items-center justify-center"><TrendingUp className="w-5 h-5 text-success" /></div>
              {revenueChange !== 0 && (
                <span className={`flex items-center gap-1 text-xs font-medium ${revenueChange > 0 ? 'text-success' : 'text-destructive'}`}>
                  {revenueChange > 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                  {Math.abs(revenueChange)}%
                </span>
              )}
            </div>
            <p className="text-2xl font-bold font-display text-foreground">{formatCurrency(data.revenueThisMonth)}</p>
            <p className="text-xs text-muted-foreground mt-1">Revenue · Profit: {formatCurrency(data.profitThisMonth)}</p>
          </div>
        </div>

        <div className="card-nawi relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-warning/10 rounded-bl-[60px]" />
          <div className="relative">
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 rounded-lg bg-warning/10 flex items-center justify-center"><CheckSquare className="w-5 h-5 text-warning" /></div>
              {data.overdueTasks > 0 && <span className="bg-destructive text-destructive-foreground text-xs px-2 py-0.5 rounded-full">{data.overdueTasks} overdue</span>}
            </div>
            <p className="text-2xl font-bold font-display text-foreground">{data.activeTasks}</p>
            <p className="text-xs text-muted-foreground mt-1">Active Tasks · {data.completedTasks} completed this month</p>
          </div>
        </div>

        <div className="card-nawi relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-primary/10 rounded-bl-[60px]" />
          <div className="relative">
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center"><UserCheck className="w-5 h-5 text-primary" /></div>
            </div>
            <p className="text-2xl font-bold font-display text-foreground">{data.employeesOnline}/{data.totalActiveEmp}</p>
            <p className="text-xs text-muted-foreground mt-1">Employees Online Today</p>
          </div>
        </div>
      </div>

      {/* Client Status Mini Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {Object.entries(data.statusCounts).map(([status, count]) => (
          <div key={status} className="card-nawi flex items-center justify-between py-3">
            <StatusBadge status={status} />
            <span className="text-lg font-bold font-display">{count as number}</span>
          </div>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="card-nawi lg:col-span-2">
          <h3 className="text-base font-semibold font-display mb-4">Revenue & Profit Trend</h3>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={data.revenueData}>
              <defs>
                <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#052F59" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#052F59" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorProf" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#0A7040" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#0A7040" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(213,45%,92%)" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: number) => formatCurrency(v)} />
              <Area type="monotone" dataKey="revenue" stroke="#052F59" fill="url(#colorRev)" strokeWidth={2} name="Revenue" />
              <Area type="monotone" dataKey="profit" stroke="#0A7040" fill="url(#colorProf)" strokeWidth={2} name="Profit" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="card-nawi">
          <h3 className="text-base font-semibold font-display mb-4">Services Distribution</h3>
          {data.serviceData.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-16">No clients yet</p>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={data.serviceData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={90} paddingAngle={3}
                  label={({ name, percent }) => `${name.split(' ')[0]} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                  {data.serviceData.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Middle Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Employees */}
        <div className="card-nawi">
          <h3 className="text-base font-semibold font-display mb-4">Top Performers</h3>
          {data.topEmployees.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No employees</p>
          ) : (
            <div className="space-y-3">
              {data.topEmployees.map((emp: any, i: number) => (
                <div key={i} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted transition-colors">
                  <span className="text-xs font-bold text-muted-foreground w-5">{i + 1}</span>
                  {emp.photo ? (
                    <img src={emp.photo} alt="" className="w-9 h-9 rounded-full object-cover" />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center text-xs font-bold text-primary-foreground">
                      {emp.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{emp.name}</p>
                    <p className="text-xs text-muted-foreground">{emp.clients} clients · {emp.tasks} tasks</p>
                  </div>
                  <span className="text-sm font-semibold text-success">{formatCurrency(emp.revenue)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Upcoming Dates */}
        <div className="card-nawi">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold font-display">Upcoming Dates</h3>
            <span className="text-xs text-muted-foreground">Next 14 days</span>
          </div>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {data.upcomingDates.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No upcoming dates</p>
            ) : data.upcomingDates.map((d: any, i: number) => (
              <Link key={i} to={`/admin/clients/${d.clientId}`} className="flex items-center justify-between p-2.5 rounded-lg hover:bg-muted transition-colors">
                <div>
                  <p className="text-sm font-medium text-foreground">{d.clientName}</p>
                  <p className="text-xs text-muted-foreground capitalize">{d.type.replace(/([A-Z])/g, ' $1').trim()}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">{formatDate(d.date)}</p>
                  <span className={`text-xs font-bold ${d.days <= 3 ? 'text-destructive' : d.days <= 7 ? 'text-warning' : 'text-success'}`}>
                    {d.days === 0 ? 'Today!' : `${d.days}d left`}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Lead Sources + Recent */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card-nawi">
          <h3 className="text-base font-semibold font-display mb-4">Lead Sources</h3>
          {data.leadData.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No data</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={data.leadData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(213,45%,92%)" />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={80} />
                <Tooltip />
                <Bar dataKey="value" fill="#1A5B96" radius={[0, 4, 4, 0]} name="Clients" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="card-nawi">
          <h3 className="text-base font-semibold font-display mb-4">Recent Activity</h3>
          <div className="space-y-3 max-h-56 overflow-y-auto">
            {data.recentAudit.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No activity</p>
            ) : data.recentAudit.map((a: any) => (
              <div key={a.id} className="flex items-start gap-3 text-sm">
                <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${a.action.includes('delete') ? 'bg-destructive' : a.action.includes('create') ? 'bg-success' : 'bg-secondary'}`} />
                <div>
                  <p className="text-foreground"><span className="font-medium">{a.userName}</span> {a.action.replace(/_/g, ' ')}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(a.timestamp)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Today's Attendance */}
      <div className="card-nawi">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold font-display">Today's Attendance</h3>
          <Link to="/admin/attendance" className="text-xs text-secondary hover:underline">View All →</Link>
        </div>
        {data.todayAttendance.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No attendance records today</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {data.todayAttendance.map((a: any) => (
              <div key={a.id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                {a.photo ? (
                  <img src={a.photo} alt="" className="w-9 h-9 rounded-full object-cover" />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center text-xs font-bold text-primary-foreground">
                    {a.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                  </div>
                )}
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
