import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Search, Eye, LayoutGrid, LayoutList, Briefcase } from 'lucide-react';
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
  const [viewMode, setViewMode] = useState<'table' | 'card'>('table');

  useEffect(() => {
    let all = storage.getAll(KEYS.CLIENTS);
    if (!adminView && session) {
      all = all.filter((c: any) => c.assignedTo === session.userId || c.createdBy === session.userId);
    }
    setClients(all);
  }, [adminView, session]);

  const services = [...new Set(clients.map((c: any) => c.service).filter(Boolean))];
  const employees = storage.getAll(KEYS.EMPLOYEES);

  const filtered = clients.filter((c: any) => {
    if (serviceFilter !== 'all' && c.service !== serviceFilter) return false;
    if (statusFilter !== 'all' && c.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return c.name?.toLowerCase().includes(q) || c.id?.toLowerCase().includes(q) || c.mobile?.includes(q);
    }
    return true;
  });

  const basePath = adminView ? '/admin' : '/employee';

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-wrap flex-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} className="input-nawi pl-9 w-56" placeholder="Search clients..." />
          </div>
          <select value={serviceFilter} onChange={(e) => setServiceFilter(e.target.value)} className="input-nawi w-auto">
            <option value="all">All Services</option>
            {services.map((s: any) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="input-nawi w-auto">
            <option value="all">All Status</option>
            <option value="New">New</option><option value="Processing">Processing</option><option value="Success">Success</option><option value="Failed">Failed</option>
          </select>
          <div className="flex border border-border rounded-lg overflow-hidden">
            <button onClick={() => setViewMode('table')} className={`p-1.5 ${viewMode === 'table' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}><LayoutList className="w-4 h-4" /></button>
            <button onClick={() => setViewMode('card')} className={`p-1.5 ${viewMode === 'card' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}><LayoutGrid className="w-4 h-4" /></button>
          </div>
        </div>
        <button onClick={() => navigate(`${basePath}/clients/new`)} className="btn-primary"><Plus className="w-4 h-4" /> Add Client</button>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={<Briefcase className="w-8 h-8 text-muted-foreground" />} title="No clients yet" description="Add your first client to get started." action={<button onClick={() => navigate(`${basePath}/clients/new`)} className="btn-primary"><Plus className="w-4 h-4" /> Add Client</button>} />
      ) : viewMode === 'table' ? (
        <div className="card-nawi overflow-x-auto p-0">
          <table className="table-nawi w-full">
            <thead><tr><th>ID</th><th>Name</th><th>Mobile</th><th>Service</th><th>Status</th><th>Assigned To</th><th>Created</th><th>Revenue</th><th>Actions</th></tr></thead>
            <tbody>
              {filtered.map((c: any) => {
                const emp = employees.find((e: any) => e.id === c.assignedTo);
                return (
                  <tr key={c.id}>
                    <td className="font-mono text-xs">{c.id}</td>
                    <td className="font-medium">{c.name}</td>
                    <td>{c.mobile}</td>
                    <td>{c.service || '—'}</td>
                    <td><StatusBadge status={c.status} /></td>
                    <td>{emp?.name || c.assignedTo || '—'}</td>
                    <td>{formatDate(c.createdAt)}</td>
                    <td>{formatCurrency(c.revenue || 0)}</td>
                    <td><Link to={`${basePath}/clients/${c.id}`} className="p-1.5 hover:bg-muted rounded-lg text-muted-foreground hover:text-foreground inline-block"><Eye className="w-4 h-4" /></Link></td>
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
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="font-medium text-foreground">{c.name}</p>
                  <p className="font-mono text-xs text-muted-foreground">{c.id}</p>
                </div>
                <StatusBadge status={c.status} />
              </div>
              <div className="space-y-1 text-sm text-muted-foreground">
                <p>{c.service || 'No service'}</p>
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
