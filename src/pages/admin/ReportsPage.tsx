import { useState } from 'react';
import { storage, KEYS, formatCurrency, formatDate, getCurrentUser, generateId, auditLog } from '@/lib/storage';
import { BarChart3, Download } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

const COLORS = ['#052F59', '#1A5B96', '#0A7040', '#C45000', '#C0392B', '#64748B'];

export default function ReportsPage() {
  const [tab, setTab] = useState('clients');
  const now = new Date();
  const [yearMonth, setYearMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);

  const clients = storage.getAll(KEYS.CLIENTS);
  const employees = storage.getAll(KEYS.EMPLOYEES);
  const tasks = storage.getAll(KEYS.TASKS);

  const exportCSV = (data: any[], filename: string) => {
    if (data.length === 0) return;
    const headers = Object.keys(data[0]);
    const csv = [headers.join(','), ...data.map(r => headers.map(h => `"${r[h] || ''}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
  };

  // Service distribution
  const serviceCounts: Record<string, number> = {};
  clients.forEach((c: any) => { if (c.service) serviceCounts[c.service] = (serviceCounts[c.service] || 0) + 1; });
  const serviceData = Object.entries(serviceCounts).map(([name, value]) => ({ name, value }));

  // Revenue by employee
  const empRevenue = employees.map((e: any) => ({
    name: e.name,
    revenue: clients.filter((c: any) => c.assignedTo === e.id).reduce((s: number, c: any) => s + (c.revenue || 0), 0),
    tasks: tasks.filter((t: any) => t.assignedTo === e.id && t.status === 'Completed').length,
  }));

  const tabs = ['clients', 'revenue', 'services', 'performance'];

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold font-display">Reports</h2>
        <input type="month" value={yearMonth} onChange={(e) => setYearMonth(e.target.value)} className="input-nawi w-auto" />
      </div>
      <div className="flex gap-1 border-b border-border">
        {tabs.map((t) => <button key={t} onClick={() => setTab(t)} className={`px-4 py-2.5 text-sm font-medium capitalize ${tab === t ? 'text-primary border-b-2 border-primary' : 'text-muted-foreground'}`}>{t}</button>)}
      </div>

      {tab === 'clients' && (
        <div className="card-nawi">
          <div className="flex justify-end mb-3"><button onClick={() => exportCSV(clients.map((c: any) => ({ ID: c.id, Name: c.name, Service: c.service, Status: c.status, Revenue: c.revenue })), 'clients.csv')} className="btn-outline text-sm"><Download className="w-4 h-4" /> Export CSV</button></div>
          <div className="overflow-x-auto">
            <table className="table-nawi w-full"><thead><tr><th>ID</th><th>Name</th><th>Service</th><th>Status</th><th>Revenue</th></tr></thead>
              <tbody>{clients.map((c: any) => <tr key={c.id}><td className="font-mono text-xs">{c.id}</td><td>{c.name}</td><td>{c.service}</td><td>{c.status}</td><td>{formatCurrency(c.revenue || 0)}</td></tr>)}</tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'services' && (
        <div className="card-nawi">
          <ResponsiveContainer width="100%" height={300}>
            <PieChart><Pie data={serviceData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label>{serviceData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Pie><Tooltip /></PieChart>
          </ResponsiveContainer>
        </div>
      )}

      {tab === 'revenue' && (
        <div className="card-nawi">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={empRevenue}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" /><YAxis /><Tooltip formatter={(v: number) => formatCurrency(v)} /><Bar dataKey="revenue" fill="#052F59" radius={[4,4,0,0]} /></BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {tab === 'performance' && (
        <div className="card-nawi p-0 overflow-x-auto">
          <table className="table-nawi w-full"><thead><tr><th>Employee</th><th>Revenue</th><th>Tasks Completed</th></tr></thead>
            <tbody>{empRevenue.map((e) => <tr key={e.name}><td className="font-medium">{e.name}</td><td>{formatCurrency(e.revenue)}</td><td>{e.tasks}</td></tr>)}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}
