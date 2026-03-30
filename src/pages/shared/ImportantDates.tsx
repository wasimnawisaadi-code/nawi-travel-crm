import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Calendar, AlertTriangle, Bell, Download, Search, MessageCircle, Filter } from 'lucide-react';
import { storage, KEYS, formatDate, daysUntil, getDateStatus, getCurrentUser, isAdmin } from '@/lib/storage';

const DATE_TYPES = ['All', 'dob', 'passportExpiry', 'visaExpiry', 'travelDate', 'weddingAnniversary', 'emiratesIdExpiry', 'medicalExpiry', 'contractEndDate'];
const DATE_LABELS: Record<string, string> = {
  dob: '🎂 Birthday', passportExpiry: '📕 Passport Expiry', visaExpiry: '🪪 Visa Expiry',
  travelDate: '✈️ Travel Date', weddingAnniversary: '💍 Anniversary',
  emiratesIdExpiry: '🆔 Emirates ID', medicalExpiry: '🏥 Medical', contractEndDate: '📄 Contract End',
};
const DATE_COLORS: Record<string, string> = {
  dob: 'bg-purple-100 text-purple-700', passportExpiry: 'bg-destructive/10 text-destructive',
  visaExpiry: 'bg-warning/10 text-warning', travelDate: 'bg-secondary/10 text-secondary',
  weddingAnniversary: 'bg-pink-100 text-pink-700', emiratesIdExpiry: 'bg-primary/10 text-primary',
  medicalExpiry: 'bg-success/10 text-success', contractEndDate: 'bg-muted text-muted-foreground',
};

const REMINDER_MESSAGES: Record<string, (name: string, days: number, date: string) => string> = {
  passportExpiry: (name, days, date) => `Dear ${name}, your passport expires ${days === 0 ? 'today' : `in ${days} days`} (${date}). Please renew it at your earliest convenience. — Nawi Saadi Travel`,
  visaExpiry: (name, days, date) => `Dear ${name}, your visa expires ${days === 0 ? 'today' : `in ${days} days`} (${date}). Contact us for renewal assistance. — Nawi Saadi Travel`,
  dob: (name) => `Happy Birthday ${name}! 🎂 Wishing you a wonderful year ahead. — Nawi Saadi Travel & Tourism`,
  travelDate: (name, days, date) => `Dear ${name}, your travel date is ${days === 0 ? 'today' : `in ${days} days`} (${date}). Have a safe journey! — Nawi Saadi Travel`,
  emiratesIdExpiry: (name, days, date) => `Dear ${name}, your Emirates ID expires ${days === 0 ? 'today' : `in ${days} days`} (${date}). Please renew it soon. — Nawi Saadi Travel`,
  weddingAnniversary: (name) => `Happy Anniversary ${name}! 💍 Wishing you many more beautiful years together. — Nawi Saadi Travel`,
  medicalExpiry: (name, days, date) => `Dear ${name}, your medical report expires ${days === 0 ? 'today' : `in ${days} days`} (${date}). Please schedule a renewal. — Nawi Saadi Travel`,
  contractEndDate: (name, days, date) => `Dear ${name}, your contract ends ${days === 0 ? 'today' : `in ${days} days`} (${date}). Please contact us for next steps. — Nawi Saadi Travel`,
};

export default function ImportantDates() {
  const session = getCurrentUser();
  const admin = isAdmin();
  const [filter, setFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [timeFilter, setTimeFilter] = useState('all');
  const [nationalityFilter, setNationalityFilter] = useState('all');
  const [showMessage, setShowMessage] = useState<any>(null);
  const basePath = admin ? '/admin' : '/employee';

  let clients = storage.getAll(KEYS.CLIENTS);
  if (!admin && session) clients = clients.filter((c: any) => c.assignedTo === session.userId || c.createdBy === session.userId);

  const nationalities = [...new Set(clients.map((c: any) => c.nationality).filter(Boolean))];

  // Collect all dates including family member dates
  const allDates: any[] = [];
  clients.forEach((c: any) => {
    Object.entries(c.importantDates || {}).forEach(([type, val]) => {
      if (!val || type === 'passportNo') return;
      if (!DATE_LABELS[type]) return;
      const days = type === 'dob' ? getDobDays(val as string) : daysUntil(val as string);
      const status = type === 'dob' ? (days === 0 ? 'urgent' : days <= 7 ? 'warning' : 'safe') : getDateStatus(val as string);
      allDates.push({
        clientName: c.name, clientId: c.id, mobile: c.mobile, email: c.email,
        type, date: val, days, status, service: c.service, nationality: c.nationality, isFamilyMember: false,
      });
    });
    // Family member dates
    (c.familyMembers || []).forEach((fm: any) => {
      if (fm.passportExpiry) {
        const days = daysUntil(fm.passportExpiry);
        allDates.push({
          clientName: `${fm.name} (${fm.relation} of ${c.name})`, clientId: c.id, mobile: c.mobile, email: c.email,
          type: 'passportExpiry', date: fm.passportExpiry, days, status: getDateStatus(fm.passportExpiry),
          service: c.service, nationality: fm.nationality || c.nationality, isFamilyMember: true,
        });
      }
      if (fm.dob) {
        const days = getDobDays(fm.dob);
        allDates.push({
          clientName: `${fm.name} (${fm.relation} of ${c.name})`, clientId: c.id, mobile: c.mobile,
          type: 'dob', date: fm.dob, days, status: days === 0 ? 'urgent' : days <= 7 ? 'warning' : 'safe',
          service: c.service, nationality: fm.nationality || c.nationality, isFamilyMember: true,
        });
      }
    });
  });

  // Filter
  let filtered = allDates;
  if (filter !== 'All') filtered = filtered.filter(d => d.type === filter);
  if (search) filtered = filtered.filter(d => d.clientName.toLowerCase().includes(search.toLowerCase()));
  if (nationalityFilter !== 'all') filtered = filtered.filter(d => d.nationality === nationalityFilter);
  if (timeFilter === 'today') filtered = filtered.filter(d => d.days === 0);
  else if (timeFilter === 'tomorrow') filtered = filtered.filter(d => d.days === 1);
  else if (timeFilter === '2days') filtered = filtered.filter(d => d.days >= 0 && d.days <= 2);
  else if (timeFilter === 'week') filtered = filtered.filter(d => d.days >= 0 && d.days <= 7);
  else if (timeFilter === 'month') filtered = filtered.filter(d => d.days >= 0 && d.days <= 30);
  else if (timeFilter === '60days') filtered = filtered.filter(d => d.days >= 0 && d.days <= 60);
  else if (timeFilter === '90days') filtered = filtered.filter(d => d.days >= 0 && d.days <= 90);
  else if (timeFilter === 'overdue') filtered = filtered.filter(d => d.days < 0);

  filtered.sort((a, b) => a.days - b.days);

  const urgent = filtered.filter(d => d.days >= 0 && d.days <= 2);
  const warning = filtered.filter(d => d.days > 2 && d.days <= 30);
  const safe = filtered.filter(d => d.days > 30);
  const overdue = filtered.filter(d => d.days < 0);

  const exportCSV = () => {
    const rows = filtered.map(d => ({ Client: d.clientName, Mobile: d.mobile, Email: d.email, Type: DATE_LABELS[d.type] || d.type, Date: formatDate(d.date), DaysLeft: d.days, Status: d.status, Service: d.service, Nationality: d.nationality }));
    if (rows.length === 0) return;
    const headers = Object.keys(rows[0]);
    const csv = [headers.join(','), ...rows.map(r => headers.map(h => `"${(r as any)[h] || ''}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'important_dates.csv';
    link.click();
  };

  const openWhatsApp = (d: any) => {
    const msgFn = REMINDER_MESSAGES[d.type];
    const msg = msgFn ? msgFn(d.clientName, d.days, formatDate(d.date)) : `Reminder: ${DATE_LABELS[d.type]} for ${d.clientName} is ${d.days === 0 ? 'today' : `in ${d.days} days`}.`;
    setShowMessage({ ...d, message: msg });
  };

  const sendWhatsApp = (mobile: string, message: string) => {
    const phone = mobile.replace(/[^0-9+]/g, '');
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank');
    setShowMessage(null);
  };

  const statusColors: Record<string, string> = {
    safe: 'border-success/20 bg-success/5',
    warning: 'border-warning/20 bg-warning/5',
    urgent: 'border-destructive/20 bg-destructive/5',
    overdue: 'border-destructive/30 bg-destructive/10',
  };

  const DateCard = ({ d }: { d: any }) => (
    <div className={`p-3 rounded-xl border ${statusColors[d.status]} hover:shadow-md transition-all`}>
      <div className="flex items-center justify-between mb-1">
        <span className={`text-xs px-2 py-0.5 rounded-full ${DATE_COLORS[d.type] || 'bg-muted text-muted-foreground'}`}>{DATE_LABELS[d.type] || d.type}</span>
        <span className={`text-xs font-bold ${d.days < 0 ? 'text-destructive' : d.days <= 2 ? 'text-destructive' : d.days <= 7 ? 'text-warning' : d.days <= 30 ? 'text-warning' : 'text-success'}`}>
          {d.days < 0 ? `${Math.abs(d.days)}d overdue` : d.days === 0 ? '🔴 TODAY!' : d.days === 1 ? '🟠 TOMORROW' : `${d.days}d left`}
        </span>
      </div>
      <Link to={`${basePath}/clients/${d.clientId}`} className="hover:underline">
        <p className="text-sm font-medium">{d.clientName}</p>
      </Link>
      <p className="text-xs text-muted-foreground">{formatDate(d.date)} • {d.mobile || '—'} {d.nationality ? `• ${d.nationality}` : ''}</p>
      <div className="flex items-center gap-2 mt-2">
        <button onClick={() => openWhatsApp(d)} className="text-xs text-success hover:underline flex items-center gap-1"><MessageCircle className="w-3 h-3" /> Send Reminder</button>
      </div>
    </div>
  );

  const Section = ({ title, items, emoji }: { title: string; items: any[]; emoji: string }) => items.length > 0 ? (
    <div>
      <h3 className="text-sm font-semibold mb-2 uppercase tracking-wider flex items-center gap-2">{emoji} {title} ({items.length})</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {items.map((d, i) => <DateCard key={`${d.clientId}-${d.type}-${i}`} d={d} />)}
      </div>
    </div>
  ) : null;

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
          <option value="all">All Time</option><option value="overdue">Overdue</option><option value="today">Today</option><option value="tomorrow">Tomorrow</option><option value="2days">Next 2 Days</option><option value="week">Next 7 Days</option><option value="month">Next 30 Days</option><option value="60days">Next 60 Days</option><option value="90days">Next 90 Days</option>
        </select>
        {nationalities.length > 0 && (
          <select value={nationalityFilter} onChange={e => setNationalityFilter(e.target.value)} className="input-nawi w-auto">
            <option value="all">All Nationalities</option>
            {nationalities.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        )}
      </div>

      {/* Summary */}
      <div className="flex flex-wrap gap-3">
        {overdue.length > 0 && <div className="flex items-center gap-2 px-3 py-1.5 bg-destructive/10 text-destructive rounded-full text-sm font-medium"><AlertTriangle className="w-4 h-4" />{overdue.length} Overdue</div>}
        {urgent.length > 0 && <div className="flex items-center gap-2 px-3 py-1.5 bg-destructive/10 text-destructive rounded-full text-sm font-medium"><Bell className="w-4 h-4" />{urgent.length} Urgent (0-2d)</div>}
        {warning.length > 0 && <div className="flex items-center gap-2 px-3 py-1.5 bg-warning/10 text-warning rounded-full text-sm font-medium">{warning.length} Warning (3-30d)</div>}
        <div className="flex items-center gap-2 px-3 py-1.5 bg-muted text-muted-foreground rounded-full text-sm">{filtered.length} total</div>
      </div>

      <Section title="Overdue" items={overdue} emoji="⚠️" />
      <Section title="Urgent (0-2 days)" items={urgent} emoji="🔴" />
      <Section title="Coming Up (3-30 days)" items={warning} emoji="🟠" />
      <Section title="Safe (30+ days)" items={safe} emoji="🟢" />

      {filtered.length === 0 && (
        <div className="text-center py-16">
          <Calendar className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">No important dates found</p>
        </div>
      )}

      {/* WhatsApp Message Modal */}
      {showMessage && (
        <div className="fixed inset-0 bg-foreground/50 z-50 flex items-center justify-center p-4" onClick={() => setShowMessage(null)}>
          <div className="bg-card rounded-xl shadow-elevated w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold font-display mb-3">📤 Send Reminder</h3>
            <p className="text-xs text-muted-foreground mb-2">To: {showMessage.clientName} ({showMessage.mobile})</p>
            <textarea value={showMessage.message} onChange={e => setShowMessage({ ...showMessage, message: e.target.value })} className="input-nawi" rows={5} />
            <div className="flex justify-end gap-3 mt-4">
              <button onClick={() => setShowMessage(null)} className="btn-outline">Cancel</button>
              <button onClick={() => { navigator.clipboard.writeText(showMessage.message); alert('Message copied!'); }} className="btn-outline">📋 Copy</button>
              <button onClick={() => sendWhatsApp(showMessage.mobile, showMessage.message)} className="btn-primary bg-success hover:bg-success/90"><MessageCircle className="w-4 h-4" /> WhatsApp</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Calculate days until next birthday (not calendar days)
function getDobDays(dob: string): number {
  const today = new Date();
  const birth = new Date(dob);
  const nextBirthday = new Date(today.getFullYear(), birth.getMonth(), birth.getDate());
  if (nextBirthday < today) {
    nextBirthday.setFullYear(today.getFullYear() + 1);
  }
  today.setHours(0, 0, 0, 0);
  nextBirthday.setHours(0, 0, 0, 0);
  return Math.ceil((nextBirthday.getTime() - today.getTime()) / 86400000);
}
