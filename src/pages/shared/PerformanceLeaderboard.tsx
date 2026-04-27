import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth-context';
import { formatCurrency } from '@/lib/supabase-service';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Trophy, TrendingUp, Users as UsersIcon, MessagesSquare, Briefcase, Clock, Medal, Crown, Award } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

type EmpStat = {
  user_id: string;
  name: string;
  photo_url: string | null;
  dsr_sales: number;
  dsr_profit: number;
  dsr_count: number;
  clients_added: number;
  clients_converted: number;
  leads_taken: number;
  leads_converted: number;
  attendance_present: number;
  attendance_late: number;
  attendance_score: number;
  total_score: number;
};

const RANGES = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This Week' },
  { key: 'month', label: 'This Month' },
  { key: 'year', label: 'This Year' },
];

function rangeBounds(key: string) {
  const now = new Date();
  const end = now.toISOString().split('T')[0];
  const start = new Date(now);
  if (key === 'today') {} 
  else if (key === 'week') start.setDate(now.getDate() - 6);
  else if (key === 'month') start.setDate(1);
  else if (key === 'year') { start.setMonth(0); start.setDate(1); }
  return { from: start.toISOString().split('T')[0], to: end };
}

export default function PerformanceLeaderboard() {
  const { user, isAdmin } = useAuth();
  const [range, setRange] = useState('month');
  const [stats, setStats] = useState<EmpStat[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      const { from, to } = rangeBounds(range);

      const [profRes, dsrRes, clientsRes, leadsRes, attRes] = await Promise.all([
        supabase.from('profiles').select('user_id, name, photo_url, profile_type, status').eq('status', 'active'),
        supabase.from('dsr_entries').select('employee_id, sale_amount, profit_amount').gte('entry_date', from).lte('entry_date', to),
        supabase.from('clients').select('created_by, status, created_at').gte('created_at', `${from}T00:00:00`).lte('created_at', `${to}T23:59:59`),
        supabase.from('social_leads').select('assigned_to, status, assigned_at, converted_at'),
        supabase.from('attendance').select('employee_id, status, date').gte('date', from).lte('date', to),
      ]);

      // Filter out admins from leaderboard (boss role doesn't compete)
      const { data: roleRows } = await supabase.from('user_roles').select('user_id, role');
      const adminIds = new Set((roleRows || []).filter((r: any) => r.role === 'admin').map((r: any) => r.user_id));

      const employees = (profRes.data || []).filter((p: any) => !adminIds.has(p.user_id));
      const dsr = dsrRes.data || [];
      const clients = clientsRes.data || [];
      const leads = (leadsRes.data || []).filter((l: any) => {
        if (!l.assigned_at) return false;
        const d = l.assigned_at.split('T')[0];
        return d >= from && d <= to;
      });
      const att = attRes.data || [];

      const rows: EmpStat[] = employees.map((e: any) => {
        const myDsr = dsr.filter((d: any) => d.employee_id === e.user_id);
        const myClients = clients.filter((c: any) => c.created_by === e.user_id);
        const myLeads = leads.filter((l: any) => l.assigned_to === e.user_id);
        const myAtt = att.filter((a: any) => a.employee_id === e.user_id);

        const dsr_sales = myDsr.reduce((s, d: any) => s + Number(d.sale_amount || 0), 0);
        const dsr_profit = myDsr.reduce((s, d: any) => s + Number(d.profit_amount || 0), 0);
        const clients_added = myClients.length;
        const clients_converted = myClients.filter((c: any) => c.status === 'Completed').length;
        const leads_taken = myLeads.length;
        const leads_converted = myLeads.filter((l: any) => l.status === 'CONVERTED').length;
        const present = myAtt.filter((a: any) => a.status === 'Present').length;
        const late = myAtt.filter((a: any) => a.status === 'Late').length;
        const totalDays = Math.max(1, myAtt.length);
        const attendance_score = Math.round(((present + late * 0.7) / totalDays) * 100);

        // Composite score: weighted across DSR profit, conversions, leads, attendance
        const total_score =
          Math.round(dsr_profit / 100) +    // 1 pt per 100 profit
          clients_converted * 50 +
          clients_added * 10 +
          leads_converted * 30 +
          leads_taken * 5 +
          attendance_score;

        return {
          user_id: e.user_id,
          name: e.name,
          photo_url: e.photo_url,
          dsr_sales, dsr_profit, dsr_count: myDsr.length,
          clients_added, clients_converted,
          leads_taken, leads_converted,
          attendance_present: present, attendance_late: late, attendance_score,
          total_score,
        };
      });

      rows.sort((a, b) => b.total_score - a.total_score);
      setStats(rows);
      setLoading(false);
    })();
  }, [user, range]);

  const myRow = useMemo(() => stats.find(s => s.user_id === user?.id), [stats, user]);
  const myRank = useMemo(() => stats.findIndex(s => s.user_id === user?.id) + 1, [stats, user]);
  const visible = isAdmin ? stats : stats.slice(0, 10);

  const top3 = stats.slice(0, 3);
  const totals = useMemo(() => ({
    sales: stats.reduce((s, r) => s + r.dsr_sales, 0),
    profit: stats.reduce((s, r) => s + r.dsr_profit, 0),
    clients: stats.reduce((s, r) => s + r.clients_added, 0),
    leads: stats.reduce((s, r) => s + r.leads_taken, 0),
  }), [stats]);

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Trophy className="h-7 w-7 text-warning" />
          <div>
            <h1 className="text-2xl font-bold font-display">Performance Leaderboard</h1>
            <p className="text-sm text-muted-foreground">{isAdmin ? 'Team rankings & KPI tracker' : 'Your standing among the team'}</p>
          </div>
        </div>
        <Tabs value={range} onValueChange={setRange}>
          <TabsList>{RANGES.map(r => <TabsTrigger key={r.key} value={r.key}>{r.label}</TabsTrigger>)}</TabsList>
        </Tabs>
      </div>

      {!isAdmin && myRow && (
        <Card className="border-primary/40 bg-gradient-to-r from-primary/5 to-secondary/5">
          <CardContent className="pt-6 grid grid-cols-2 md:grid-cols-5 gap-4">
            <div><p className="text-xs text-muted-foreground">Your Rank</p><p className="text-3xl font-bold font-display text-primary">#{myRank}</p></div>
            <div><p className="text-xs text-muted-foreground">Total Score</p><p className="text-2xl font-bold">{myRow.total_score}</p></div>
            <div><p className="text-xs text-muted-foreground">DSR Profit</p><p className="text-lg font-semibold text-success">{formatCurrency(myRow.dsr_profit)}</p></div>
            <div><p className="text-xs text-muted-foreground">Clients Added</p><p className="text-lg font-semibold">{myRow.clients_added}</p></div>
            <div><p className="text-xs text-muted-foreground">Attendance</p><p className="text-lg font-semibold">{myRow.attendance_score}%</p></div>
          </CardContent>
        </Card>
      )}

      {isAdmin && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard icon={TrendingUp} label="Team Sales" value={formatCurrency(totals.sales)} />
          <KpiCard icon={TrendingUp} label="Team Profit" value={formatCurrency(totals.profit)} highlight />
          <KpiCard icon={Briefcase} label="Clients Added" value={String(totals.clients)} />
          <KpiCard icon={MessagesSquare} label="Leads Taken" value={String(totals.leads)} />
        </div>
      )}

      {top3.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {top3.map((s, i) => (
            <Card key={s.user_id} className={i === 0 ? 'border-warning/60 bg-warning/5' : i === 1 ? 'border-muted-foreground/30' : 'border-border'}>
              <CardContent className="pt-6 flex items-center gap-4">
                <div className="relative">
                  {s.photo_url ? <img src={s.photo_url} className="w-14 h-14 rounded-full object-cover" alt="" />
                    : <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center font-bold">{s.name.split(' ').map(n => n[0]).join('').slice(0, 2)}</div>}
                  <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-card border flex items-center justify-center">
                    {i === 0 ? <Crown className="w-3.5 h-3.5 text-warning" /> : i === 1 ? <Medal className="w-3.5 h-3.5 text-muted-foreground" /> : <Award className="w-3.5 h-3.5 text-orange-600" />}
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate">{s.name}</p>
                  <p className="text-xs text-muted-foreground">Rank #{i + 1}</p>
                  <p className="text-lg font-bold text-primary">{s.total_score} pts</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Trophy className="h-4 w-4" /> Full Leaderboard</CardTitle></CardHeader>
        <CardContent>
          {loading ? <div className="text-center py-8 text-muted-foreground">Loading…</div>
            : visible.length === 0 ? <div className="text-center py-8 text-muted-foreground">No data yet</div>
            : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b text-xs text-muted-foreground">
                    <th className="text-left py-2 px-2">#</th>
                    <th className="text-left py-2 px-2">Employee</th>
                    <th className="text-right">DSR Sales</th>
                    <th className="text-right">DSR Profit</th>
                    <th className="text-right">Clients +/conv</th>
                    <th className="text-right">Leads +/conv</th>
                    <th className="text-right">Attend.</th>
                    <th className="text-right pr-2">Score</th>
                  </tr></thead>
                  <tbody>
                    {visible.map((s, i) => (
                      <tr key={s.user_id} className={`border-b last:border-0 ${s.user_id === user?.id ? 'bg-primary/5' : ''}`}>
                        <td className="py-2 px-2 font-bold">{i + 1}</td>
                        <td className="py-2 px-2 flex items-center gap-2">
                          {s.photo_url ? <img src={s.photo_url} className="w-7 h-7 rounded-full object-cover" alt="" />
                            : <div className="w-7 h-7 rounded-full bg-muted text-xs flex items-center justify-center font-semibold">{s.name.split(' ').map(n => n[0]).join('').slice(0,2)}</div>}
                          <span className="font-medium">{s.name}</span>
                        </td>
                        <td className="text-right">{formatCurrency(s.dsr_sales)}</td>
                        <td className="text-right text-success font-medium">{formatCurrency(s.dsr_profit)}</td>
                        <td className="text-right">{s.clients_added} / <span className="text-success">{s.clients_converted}</span></td>
                        <td className="text-right">{s.leads_taken} / <span className="text-success">{s.leads_converted}</span></td>
                        <td className="text-right">{s.attendance_score}%</td>
                        <td className="text-right pr-2 font-bold text-primary">{s.total_score}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
        </CardContent>
      </Card>
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, highlight }: any) {
  return (
    <Card className={highlight ? 'border-primary/40 bg-primary/5' : ''}>
      <CardContent className="pt-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1"><Icon className="h-3.5 w-3.5" />{label}</div>
        <div className="text-lg font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}
