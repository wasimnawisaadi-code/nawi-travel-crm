import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { MessagesSquare, ChevronRight } from 'lucide-react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';

const COLORS = { NEW: '#1A5B96', CONTACTED: '#C45000', CONVERTED: '#0A7040', LOST: '#C0392B' } as Record<string, string>;

export default function SocialLeadsDashboardWidget({ basePath = '/admin' }: { basePath?: string }) {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<{ total: number; unassigned: number; converted: number; bySource: { name: string; value: number }[]; byStatus: { name: string; value: number }[] }>({
    total: 0, unassigned: 0, converted: 0, bySource: [], byStatus: [],
  });

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('social_leads').select('source, status, assigned_to');
      const leads = data || [];
      const sourceMap: Record<string, number> = {};
      const statusMap: Record<string, number> = {};
      let unassigned = 0, converted = 0;
      leads.forEach((l: any) => {
        sourceMap[l.source || 'unknown'] = (sourceMap[l.source || 'unknown'] || 0) + 1;
        statusMap[l.status || 'NEW'] = (statusMap[l.status || 'NEW'] || 0) + 1;
        if (!l.assigned_to) unassigned++;
        if (l.status === 'CONVERTED') converted++;
      });
      setStats({
        total: leads.length, unassigned, converted,
        bySource: Object.entries(sourceMap).map(([name, value]) => ({ name, value })),
        byStatus: Object.entries(statusMap).map(([name, value]) => ({ name, value })),
      });
      setLoading(false);
    })();
  }, []);

  const conversionRate = stats.total > 0 ? Math.round((stats.converted / stats.total) * 100) : 0;

  return (
    <div className="card-nawi space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessagesSquare className="w-5 h-5 text-secondary" />
          <h3 className="text-base font-semibold font-display">Social Leads</h3>
        </div>
        <Link to={`${basePath}/leads`} className="text-xs text-primary hover:underline flex items-center gap-1">View all <ChevronRight className="w-3 h-3" /></Link>
      </div>

      {loading ? <div className="skeleton-nawi h-40" /> : (
        <>
          <div className="grid grid-cols-4 gap-2">
            <Stat label="Total" value={String(stats.total)} />
            <Stat label="Unassigned" value={String(stats.unassigned)} warn={stats.unassigned > 0} />
            <Stat label="Converted" value={String(stats.converted)} highlight />
            <Stat label="Conv. Rate" value={`${conversionRate}%`} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-1">By Source</p>
              {stats.bySource.length === 0 ? <p className="text-xs text-muted-foreground py-3">None</p> :
                <ResponsiveContainer width="100%" height={120}>
                  <PieChart>
                    <Pie data={stats.bySource} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={45}
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                      {stats.bySource.map((_, i) => <Cell key={i} fill={['#052F59', '#1A5B96', '#0A7040', '#C45000'][i % 4]} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              }
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-1">By Status</p>
              <div className="space-y-1">
                {stats.byStatus.map((s, i) => (
                  <div key={i} className="flex items-center justify-between text-xs py-1">
                    <span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full" style={{ background: COLORS[s.name] || '#888' }} />{s.name}</span>
                    <span className="font-medium">{s.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, highlight, warn }: { label: string; value: string; highlight?: boolean; warn?: boolean }) {
  return (
    <div className={`p-2 rounded-lg ${highlight ? 'bg-success/10' : warn ? 'bg-warning/10' : 'bg-muted/40'}`}>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`text-sm font-bold font-display truncate ${highlight ? 'text-success' : warn ? 'text-warning' : ''}`}>{value}</p>
    </div>
  );
}
