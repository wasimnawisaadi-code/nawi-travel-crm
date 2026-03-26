import { useState, useEffect } from 'react';
import { storage, KEYS, formatDate } from '@/lib/storage';
import { Shield, Search } from 'lucide-react';
import EmptyState from '@/components/ui/EmptyState';

export default function AuditLog() {
  const [logs, setLogs] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  useEffect(() => setLogs(storage.getAll(KEYS.AUDIT_LOG).reverse()), []);

  const filtered = logs.filter((l: any) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return l.userName?.toLowerCase().includes(q) || l.action?.toLowerCase().includes(q) || l.targetId?.toLowerCase().includes(q);
  });

  const actionColors: Record<string, string> = { created: 'text-success', updated: 'text-secondary', deleted: 'text-destructive' };
  const getColor = (action: string) => Object.entries(actionColors).find(([k]) => action.includes(k))?.[1] || 'text-muted-foreground';

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold font-display">Audit Log</h2>
        <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><input value={search} onChange={(e) => setSearch(e.target.value)} className="input-nawi pl-9 w-64" placeholder="Search logs..." /></div>
      </div>
      {filtered.length === 0 ? (
        <EmptyState icon={<Shield className="w-8 h-8 text-muted-foreground" />} title="No audit logs" description="Actions will be recorded here." />
      ) : (
        <div className="card-nawi space-y-3">
          {filtered.map((l: any) => (
            <div key={l.id} className="flex items-start gap-3">
              <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${getColor(l.action).replace('text-', 'bg-')}`} />
              <div>
                <p className="text-sm text-foreground"><span className="font-medium">{l.userName}</span> <span className={getColor(l.action)}>{l.action.replace(/_/g, ' ')}</span> <span className="font-mono text-xs text-muted-foreground">{l.targetId}</span></p>
                <p className="text-xs text-muted-foreground">{formatDate(l.timestamp)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
