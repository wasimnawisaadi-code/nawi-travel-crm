import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Search, Eye, LayoutGrid, LayoutList, Briefcase, Filter, Download } from 'lucide-react';
import { storage, KEYS, formatCurrency, formatDate, getCurrentUser, isAdmin } from '@/lib/storage';
import StatusBadge from '@/components/ui/StatusBadge';
import EmptyState from '@/components/ui/EmptyState';

export default function ClientList({ adminView = false }: { adminView?: boolean }) {
  const navigate = useNavigate();
  const session = getCurrentUser();
  const [clients, setClients] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [serviceFilter, setServiceFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [leadFilter, setLeadFilter] = useState('all');
  const [nationalityFilter, setNationalityFilter] = useState('all');
  const [monthFilter, setMonthFilter] = useState('all');
  const [employeeFilter, setEmployeeFilter] = useState('all');
  const [viewMode, setViewMode] = useState<'table' | 'card'>('table');

  useEffect(() => {
    let all = storage.getAll(KEYS.CLIENTS);
    if (!adminView && session) {
      all = all.filter((c: any) => c.assignedTo === session.userId || c.createdBy === session.userId);
    }
    setClients(all);
  }, [adminView, session]);

  const services = [...new Set(clients.map((c: any) => c.service).filter(Boolean))];
  const nationalities = [...new Set(clients.map((c: any) => c.nationality || c.serviceDetails?.nationality).filter(Boolean))];
  const months = [...new Set(clients.map((c: any) => c.createdAt?.substring(0, 7)).filter(Boolean))].sort().reverse();
  const employees = storage.getAll(KEYS.EMPLOYEES);
  const leadSources = [...new Set(clients.map((c: any) => c.leadSource).filter(Boolean))];

  const filtered = clients.filter((c: any) => {
    if (serviceFilter !== 'all' && c.service !== serviceFilter) return false;
    if (statusFilter !== 'all' && c.status !== statusFilter) return false;
    if (leadFilter !== 'all' && c.leadSource !== leadFilter) return false;
    if (nationalityFilter !== 'all' && (c.nationality || c.serviceDetails?.nationality) !== nationalityFilter) return false;
    if (monthFilter !== 'all' && !c.createdAt?.startsWith(monthFilter)) return false;
    if (employeeFilter !== 'all' && c.assignedTo !== employeeFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return c.name?.toLowerCase().includes(q) || c.id?.toLowerCase().includes(q) || c.mobile?.includes(q) || c.passportNo?.toLowerCase().includes(q);
    }
    return true;
  });

  const basePath = adminView ? '/admin' : '/employee';

  const exportCSV = () => {
    const rows = filtered.map(c => ({ ID: c.id, Name: c.name, Mobile: c.mobile, Service: c.service, Status: c.status, LeadSource: c.leadSource, Revenue: c.revenue || 0, Profit: c.profit || 0, Created: formatDate(c.createdAt) }));
    if (rows.length === 0) return;
    const headers = Object.keys(rows[0]);
    const csv = [headers.join(','), ...rows.map(r => headers.map(h => `"${(r as any)[h] || ''}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'clients_export.csv';
    link.click();
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap flex-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} className="input-nawi pl-9 w-52" placeholder="Search name, ID, mobile, passport..." />
          </div>
          <select value={serviceFilter} onChange={(e) => setServiceFilter(e.target.value)} className="input-nawi w-auto text-sm">
            <option value="all">All Services</option>
            {services.map((s: any) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="input-nawi w-auto text-sm">
            <option value="all">All Status</option>
            <option value="New">New</option><option value="Processing">Processing</option><option value="Success">Success</option><option value="Failed">Failed</option>
          </select>
          <select value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)} className="input-nawi w-auto text-sm">
            <option value="all">All Months</option>
            {months.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={exportCSV} className="btn-outline text-sm"><Download className="w-4 h-4" /></button>
          <div className="flex border border-border rounded-lg overflow-hidden">
            <button onClick={() => setViewMode('table')} className={`p-1.5 ${viewMode === 'table' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}><LayoutList className="w-4 h-4" /></button>
            <button onClick={() => setViewMode('card')} className={`p-1.5 ${viewMode === 'card' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}><LayoutGrid className="w-4 h-4" /></button>
          </div>
          <button onClick={() => navigate(`${basePath}/clients/new`)} className="btn-primary"><Plus className="w-4 h-4" /> Add Client</button>
        </div>
      </div>

      {/* Additional filters row */}
      <div className="flex flex-wrap gap-2">
        {adminView && (
          <select value={employeeFilter} onChange={(e) => setEmployeeFilter(e.target.value)} className="input-nawi w-auto text-sm">
            <option value="all">All Employees</option>
            {employees.map((e: any) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        )}
        <select value={leadFilter} onChange={(e) => setLeadFilter(e.target.value)} className="input-nawi w-auto text-sm">
          <option value="all">All Sources</option>
          {leadSources.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        {nationalities.length > 0 && (
          <select value={nationalityFilter} onChange={(e) => setNationalityFilter(e.target.value)} className="input-nawi w-auto text-sm">
            <option value="all">All Nationalities</option>
            {nationalities.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        )}
        <span className="text-sm text-muted-foreground self-center ml-auto">{filtered.length} clients</span>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={<Briefcase className="w-8 h-8 text-muted-foreground" />} title="No clients found" description="Add your first client to get started." action={<button onClick={() => navigate(`${basePath}/clients/new`)} className="btn-primary"><Plus className="w-4 h-4" /> Add Client</button>} />
      ) : viewMode === 'table' ? (
        <div className="card-nawi overflow-x-auto p-0">
          <table className="table-nawi w-full">
            <thead><tr><th>ID</th><th>Name</th><th>Mobile</th><th>Service</th><th>Status</th><th>Source</th><th>Assigned</th><th>Created</th><th>Revenue</th><th></th></tr></thead>
            <tbody>
              {filtered.map((c: any) => {
                const emp = employees.find((e: any) => e.id === c.assignedTo);
                return (
                  <tr key={c.id} className="cursor-pointer" onClick={() => navigate(`${basePath}/clients/${c.id}`)}>
                    <td className="font-mono text-xs">{c.id}</td>
                    <td className="font-medium">{c.name}</td>
                    <td>{c.mobile}</td>
                    <td><span className="text-xs">{c.service || '—'}</span></td>
                    <td><StatusBadge status={c.status} /></td>
                    <td className="text-xs">{c.leadSource || '—'}</td>
                    <td className="text-xs">{emp?.name || '—'}</td>
                    <td className="text-xs">{formatDate(c.createdAt)}</td>
                    <td className="text-xs">{formatCurrency(c.revenue || 0)}</td>
                    <td><Eye className="w-4 h-4 text-muted-foreground" /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((c: any) => (
            <Link key={c.id} to={`${basePath}/clients/${c.id}`} className="card-nawi-hover">
              <div className="flex items-start justify-between mb-2">
                <div><p className="font-medium">{c.name}</p><p className="font-mono text-xs text-muted-foreground">{c.id}</p></div>
                <StatusBadge status={c.status} />
              </div>
              <div className="space-y-1 text-sm text-muted-foreground">
                <p>{c.service || 'No service'} • {c.leadSource}</p>
                <p>{c.mobile}</p>
                <p className="font-medium text-foreground">{formatCurrency(c.revenue || 0)}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
