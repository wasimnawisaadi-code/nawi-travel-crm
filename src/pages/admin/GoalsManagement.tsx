import { useState, useEffect } from 'react';
import { Save, Target } from 'lucide-react';
import { storage, KEYS, generateId } from '@/lib/storage';

const SERVICES = ['Air Ticket', 'UAE Visa', 'Global Visa', 'Holiday Package', 'Travel Insurance', 'Pilgrimage', 'Meet & Assist', 'Hotel Booking'];

export default function GoalsManagement() {
  const now = new Date();
  const [yearMonth, setYearMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
  const [goals, setGoals] = useState<any[]>([]);

  const load = () => setGoals(storage.getAll(KEYS.GOALS).filter((g: any) => g.yearMonth === yearMonth));
  useEffect(load, [yearMonth]);

  const getGoal = (service: string) => goals.find((g: any) => g.service === service);

  const updateTarget = (service: string, target: number) => {
    const existing = getGoal(service);
    if (existing) {
      storage.update(KEYS.GOALS, existing.id, { target });
    } else {
      storage.push(KEYS.GOALS, { id: generateId('GOAL'), yearMonth, service, target, achieved: 0, createdBy: 'ADM-001' });
    }
    load();
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold font-display">Goals Management</h2>
        <input type="month" value={yearMonth} onChange={(e) => setYearMonth(e.target.value)} className="input-nawi w-auto" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {SERVICES.map((service) => {
          const goal = getGoal(service);
          const target = goal?.target || 0;
          const achieved = goal?.achieved || 0;
          const pct = target > 0 ? Math.min(100, Math.round((achieved / target) * 100)) : 0;

          return (
            <div key={service} className="card-nawi">
              <div className="flex items-center gap-2 mb-3">
                <Target className="w-5 h-5 text-secondary" />
                <h3 className="font-medium text-foreground text-sm">{service}</h3>
              </div>
              <div className="space-y-2">
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Target</label>
                  <input type="number" value={target} onChange={(e) => updateTarget(service, Number(e.target.value))} className="input-nawi" min={0} />
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Achieved</label>
                  <p className="text-lg font-bold text-foreground font-display">{achieved}</p>
                </div>
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-muted-foreground">Progress</span>
                    <span className="font-medium text-foreground">{pct}%</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
