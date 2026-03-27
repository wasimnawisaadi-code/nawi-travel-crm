import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Calendar, AlertTriangle, Bell, Download, Search, Filter } from 'lucide-react';
import { storage, KEYS, formatDate, daysUntil, getDateStatus, getCurrentUser, isAdmin } from '@/lib/storage';

const DATE_TYPES = ['All', 'dob', 'passportExpiry', 'visaExpiry', 'travelDate', 'weddingAnniversary'];
const DATE_LABELS: Record<string, string> = { dob: 'Birthday', passportExpiry: 'Passport Expiry', visaExpiry: 'Visa Expiry', travelDate: 'Travel Date', weddingAnniversary: 'Anniversary' };
const DATE_COLORS: Record<string, string> = { dob: 'bg-purple-100 text-purple-700', passportExpiry: 'bg-destructive/10 text-destructive', visaExpiry: 'bg-warning/10 text-warning', travelDate: 'bg-secondary/10 text-secondary', weddingAnniversary: 'bg-pink-100 text-pink-700' };

const REMINDER_THRESHOLDS = [
  { label: 'Today', days: 0, color: 'bg-destructive text-destructive-foreground' },
  { label: 'Tomorrow', days: 1, color: 'bg-destructive text-destructive-foreground' },
  { label: '2 Days', days: 2, color: 'bg-destructive/80 text-destructive-foreground' },
  { label: '7 Days', days: 7, color: 'bg-warning text-warning-foreground' },
  { label: '30 Days', days: 30, color: 'bg-warning/60 text-warning-foreground' },
  { label: '60 Days', days: 60, color: 'bg-secondary/60 text-secondary-foreground' },
  { label: '90 Days', days: 90, color: 'bg-muted text-muted-foreground' },
];

export default function ImportantDates() {
  const session = getCurrentUser();
  const admin = isAdmin();
  const [filter, setFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [timeFilter, setTimeFilter] = useState('all');
  const basePath = admin ? '/admin' : '/employee';

  let clients = storage.getAll(KEYS.CLIENTS);
  if (!admin && session) clients = clients.filter((c: any) => c.assignedTo === session.userId || c.createdBy === session.userId);

  // Collect all dates
  const allDates: any[] = [];
  clients.forEach((c: any) => {
    Object.entries(c.importantDates || {}).forEach(([type, val]) => {
      if (!val) return;
      const days = daysUntil(val as string);
      const status = getDateStatus(val as string);
      allDates.push({ clientName: c.name, clientId: c.id, mobile: c.mobile, email: c.email, type, date: val, days, status, service: c.service });
    });
  });

  // Filter
  let filtered = allDates;
  if (filter !== 'All') filtered = filtered.filter(d => d.type === filter);
  if (search) filtered = filtered.filter(d => d.clientName.toLowerCase().includes(search.toLowerCase()));
  if (timeFilter === 'today') filtered = filtered.filter(d => d.days === 0);
  else if (timeFilter === 'week') filtered = filtered.filter(d => d.days >= 0 && d.days <= 7);
  else if (timeFilter === 'month') filtered = filtered.filter(d => d.days >= 0 && d.days <= 30);
  else if (timeFilter === '60days') filtered = filtered.filter(d => d.days >= 0 && d.days <= 60);
  else if (timeFilter === '90days') filtered = filtered.filter(d => d.days >= 0 && d.days <= 90);
  else if (timeFilter === 'overdue') filtered = filtered.filter(d => d.days < 0);

  filtered.sort((a, b) => a.days - b.days);

  // Group by urgency
  const urgent = filtered.filter(d => d.days >= 0 && d.days <= 2);
  const warning = filtered.filter(d => d.days > 2 && d.days <= 30);
  const safe = filtered.filter(d => d.days > 30);
  const overdue = filtered.filter(d => d.days < 0);

  const exportCSV = () => {
    const rows = filtered.map(d => ({ Client: d.clientName, Mobile: d.mobile, Email: d.email, Type: DATE_LABELS[d.type] || d.type, Date: formatDate(d.date), DaysLeft: d.days, Status: d.status, Service: d.service }));
    if (rows.length === 0) return;
    const headers = Object.keys(rows[0]);
    const csv = [headers.join(','), ...rows.map(r => headers.map(h => `"${(r as any)[h] || ''}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'important_dates.csv';
    link.click();
  };

  const statusColors: Record<string, string> = {
    safe: 'border-success/20 bg-success/5',
    warning: 'border-warning/20 bg-warning/5',
    urgent: 'border-destructive/20 bg-destructive/5',
    overdue: 'border-destructive/30 bg-destructive/10',
  };

  const DateCard = ({ d }: { d: any }) => (
    <Link to={`${basePath}/clients/${d.clientId}`} className={`p-3 rounded-xl border ${statusColors[d.status]} hover:shadow-md transition-all`}>
      <div className="flex items-center justify-between mb-1">
        <span className={`text-xs px-2 py-0.5 rounded-full ${DATE_COLORS[d.type] || 'bg-muted text-muted-foreground'}`}>{DATE_LABELS[d.type] || d.type}</span>
        <span className={`text-xs font-bold ${d.days < 0 ? 'text-destructive' : d.days <= 2 ? 'text-destructive' : d.days <= 7 ? 'text-warning' : d.days <= 30 ? 'text-warning' : 'text-success'}`}>
          {d.days < 0 ? `${Math.abs(d.days)}d overdue` : d.days === 0 ? 'TODAY!' : `${d.days}d left`}
        </span>
      </div>
      <p className="text-sm font-medium">{d.clientName}</p>
      <p className="text-xs text-muted-foreground">{formatDate(d.date)} • {d.mobile || '—'}</p>
    </Link>
  );

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-bold font-display flex items-center gap-2"><Calendar className="w-5 h-5 text-primary" /> Important Dates</h2>
        <button onClick={exportCSV} className="btn-outline"><Download className="w-4 h-4" /> Export</button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} className="input-nawi pl-9" placeholder="Search client..." />
        </div>
        <select value={filter} onChange={e => setFilter(e.target.value)} className="input-nawi w-auto">
          {DATE_TYPES.map(t => <option key={t} value={t}>{t === 'All' ? 'All Types' : DATE_LABELS[t]}</option>)}
        </select>
        <select value={timeFilter} onChange={e => setTimeFilter(e.target.value)} className="input-nawi w-auto">
          <option value="all">All Time</option><option value="overdue">Overdue</option><option value="today">Today</option><option value="week">Next 7 Days</option><option value="month">Next 30 Days</option><option value="60days">Next 60 Days</option><option value="90days">Next 90 Days</option>
        </select>
      </div>

      {/* Summary badges */}
      <div className="flex flex-wrap gap-3">
        {overdue.length > 0 && <div className="flex items-center gap-2 px-3 py-1.5 bg-destructive/10 text-destructive rounded-full text-sm font-medium"><AlertTriangle className="w-4 h-4" />{overdue.length} Overdue</div>}
        {urgent.length > 0 && <div className="flex items-center gap-2 px-3 py-1.5 bg-destructive/10 text-destructive rounded-full text-sm font-medium"><Bell className="w-4 h-4" />{urgent.length} Urgent (0-2 days)</div>}
        {warning.length > 0 && <div className="flex items-center gap-2 px-3 py-1.5 bg-warning/10 text-warning rounded-full text-sm font-medium">{warning.length} Warning (3-30 days)</div>}
        <div className="flex items-center gap-2 px-3 py-1.5 bg-muted text-muted-foreground rounded-full text-sm">{filtered.length} total dates</div>
      </div>

      {/* Overdue Section */}
      {overdue.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-destructive mb-2 uppercase tracking-wider">⚠️ Overdue</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {overdue.map((d, i) => <DateCard key={`o-${i}`} d={d} />)}
          </div>
        </div>
      )}

      {/* Urgent */}
      {urgent.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-destructive mb-2 uppercase tracking-wider">🔴 Urgent (0-2 days)</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {urgent.map((d, i) => <DateCard key={`u-${i}`} d={d} />)}
          </div>
        </div>
      )}

      {/* Warning */}
      {warning.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-warning mb-2 uppercase tracking-wider">🟠 Coming Up (3-30 days)</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {warning.map((d, i) => <DateCard key={`w-${i}`} d={d} />)}
          </div>
        </div>
      )}

      {/* Safe */}
      {safe.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-success mb-2 uppercase tracking-wider">🟢 Safe (30+ days)</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {safe.map((d, i) => <DateCard key={`s-${i}`} d={d} />)}
          </div>
        </div>
      )}

      {filtered.length === 0 && (
        <div className="text-center py-16">
          <Calendar className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">No important dates found</p>
        </div>
      )}
    </div>
  );
}
