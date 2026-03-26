import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Plus, X } from 'lucide-react';
import { storage, KEYS, formatDate, getCurrentUser, isAdmin, generateId, auditLog } from '@/lib/storage';
import StatusBadge from '@/components/ui/StatusBadge';

const SERVICES = ['Air Ticket', 'UAE Visa', 'Global Visa', 'Holiday Package', 'Travel Insurance', 'Pilgrimage', 'Meet & Assist', 'Hotel Booking'];

export default function OperationsCalendar() {
  const session = getCurrentUser();
  const admin = isAdmin();
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth());
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [showAddTask, setShowAddTask] = useState(false);
  const [tasks, setTasks] = useState<any[]>([]);
  const [goals, setGoals] = useState<any[]>([]);
  const [taskForm, setTaskForm] = useState({ clientId: '', service: '', title: '', assignedTo: '', dueDate: '', notes: '' });

  const reload = () => {
    let t = storage.getAll(KEYS.TASKS);
    if (!admin && session) t = t.filter((tk: any) => tk.assignedTo === session.userId);
    setTasks(t);
    setGoals(storage.getAll(KEYS.GOALS));
  };
  useEffect(reload, [admin, session]);

  const employees = storage.getAll(KEYS.EMPLOYEES);
  const clients = storage.getAll(KEYS.CLIENTS);
  const yearMonth = `${year}-${String(month + 1).padStart(2, '0')}`;

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfWeek = new Date(year, month, 1).getDay();
  const today = new Date();
  const isToday = (d: number) => year === today.getFullYear() && month === today.getMonth() && d === today.getDate();

  const getTasksForDay = (day: number) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return tasks.filter((t: any) => t.dueDate === dateStr);
  };

  const monthGoals = goals.filter((g: any) => g.yearMonth === yearMonth);

  const handlePrev = () => { if (month === 0) { setMonth(11); setYear(year - 1); } else setMonth(month - 1); };
  const handleNext = () => { if (month === 11) { setMonth(0); setYear(year + 1); } else setMonth(month + 1); };

  const handleAddTask = (e: React.FormEvent) => {
    e.preventDefault();
    const client = clients.find((c: any) => c.id === taskForm.clientId);
    const emp = employees.find((e: any) => e.id === taskForm.assignedTo);
    const task = {
      id: generateId('TSK'),
      clientId: taskForm.clientId,
      clientName: client?.name || '',
      service: taskForm.service || client?.service || '',
      title: taskForm.title,
      assignedTo: admin ? taskForm.assignedTo : session?.userId || '',
      assignedToName: admin ? emp?.name || '' : session?.userName || '',
      dueDate: taskForm.dueDate,
      completedDate: '',
      status: 'New',
      profit: 0,
      notes: taskForm.notes,
      createdAt: new Date().toISOString(),
      createdBy: session?.userId || '',
    };
    storage.push(KEYS.TASKS, task);
    auditLog('task_created', 'task', task.id, {});
    setShowAddTask(false);
    setTaskForm({ clientId: '', service: '', title: '', assignedTo: '', dueDate: '', notes: '' });
    reload();
  };

  const updateTaskStatus = (taskId: string, status: string) => {
    const updates: any = { status };
    if (status === 'Completed') {
      const profit = prompt('Enter profit amount (AED):');
      if (profit) {
        updates.profit = Number(profit);
        updates.completedDate = new Date().toISOString();
        // Update goal
        const task = tasks.find((t: any) => t.id === taskId);
        if (task) {
          const goal = goals.find((g: any) => g.yearMonth === yearMonth && g.service === task.service);
          if (goal) storage.update(KEYS.GOALS, goal.id, { achieved: (goal.achieved || 0) + 1 });
        }
      }
    }
    storage.update(KEYS.TASKS, taskId, updates);
    auditLog('task_updated', 'task', taskId, { status });
    reload();
  };

  const dayTasks = selectedDay ? getTasksForDay(selectedDay) : [];

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={handlePrev} className="btn-outline p-2"><ChevronLeft className="w-4 h-4" /></button>
          <h2 className="text-xl font-bold font-display">{new Date(year, month).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</h2>
          <button onClick={handleNext} className="btn-outline p-2"><ChevronRight className="w-4 h-4" /></button>
        </div>
        <button onClick={() => setShowAddTask(true)} className="btn-primary"><Plus className="w-4 h-4" /> Add Task</button>
      </div>

      {/* Goal Strip */}
      {monthGoals.length > 0 && (
        <div className="card-nawi">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {monthGoals.map((g: any) => (
              <div key={g.id}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="font-medium text-foreground">{g.service}</span>
                  <span className="text-muted-foreground">{g.achieved || 0}/{g.target}</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${Math.min(100, ((g.achieved || 0) / g.target) * 100)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-4">
        {/* Calendar Grid */}
        <div className="card-nawi flex-1">
          <div className="grid grid-cols-7 gap-px">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
              <div key={d} className="text-center text-xs font-medium text-muted-foreground py-2">{d}</div>
            ))}
            {Array.from({ length: firstDayOfWeek }).map((_, i) => <div key={`e-${i}`} />)}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const dayT = getTasksForDay(day);
              const hasOverdue = dayT.some((t: any) => (t.status === 'New' || t.status === 'Processing') && new Date(t.dueDate) < today);
              return (
                <button
                  key={day}
                  onClick={() => setSelectedDay(day)}
                  className={`relative p-2 rounded-lg text-sm transition-all min-h-[48px] ${
                    selectedDay === day ? 'bg-primary text-primary-foreground' :
                    isToday(day) ? 'border-2 border-primary' :
                    hasOverdue ? 'bg-destructive/10' :
                    'hover:bg-muted'
                  }`}
                >
                  {day}
                  {dayT.length > 0 && (
                    <span className={`absolute bottom-1 left-1/2 -translate-x-1/2 text-[10px] px-1.5 py-0.5 rounded-full ${selectedDay === day ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-primary text-primary-foreground'}`}>{dayT.length}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Day Detail Panel */}
        {selectedDay && (
          <div className="card-nawi w-80 flex-shrink-0 animate-slide-in-right">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold font-display">{new Date(year, month, selectedDay).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}</h3>
              <button onClick={() => setSelectedDay(null)} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
            </div>
            {dayTasks.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No tasks for this day</p>
            ) : (
              <div className="space-y-3">
                {dayTasks.map((t: any) => (
                  <div key={t.id} className="p-3 border border-border rounded-lg">
                    <p className="font-medium text-sm text-foreground">{t.title}</p>
                    <p className="text-xs text-muted-foreground">{t.clientName} • {t.service}</p>
                    <div className="flex items-center justify-between mt-2">
                      <StatusBadge status={t.status} />
                      <select value={t.status} onChange={(e) => updateTaskStatus(t.id, e.target.value)} className="text-xs border border-border rounded px-1 py-0.5">
                        <option>New</option><option>Processing</option><option>Completed</option><option>Failed</option>
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <button onClick={() => { setTaskForm({ ...taskForm, dueDate: `${year}-${String(month + 1).padStart(2, '0')}-${String(selectedDay).padStart(2, '0')}` }); setShowAddTask(true); }} className="btn-outline w-full mt-4"><Plus className="w-4 h-4" /> Add Task</button>
          </div>
        )}
      </div>

      {/* Add Task Modal */}
      {showAddTask && (
        <div className="fixed inset-0 bg-foreground/50 z-50 flex items-center justify-center p-4" onClick={() => setShowAddTask(false)}>
          <div className="bg-card rounded-xl shadow-elevated w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold font-display mb-4">Add Task</h2>
            <form onSubmit={handleAddTask} className="space-y-4">
              <div><label className="block text-sm font-medium mb-1">Client</label>
                <select value={taskForm.clientId} onChange={(e) => { const c = clients.find((c: any) => c.id === e.target.value); setTaskForm({ ...taskForm, clientId: e.target.value, service: c?.service || '' }); }} className="input-nawi">
                  <option value="">Select client...</option>
                  {clients.map((c: any) => <option key={c.id} value={c.id}>{c.name} ({c.id})</option>)}
                </select>
              </div>
              <div><label className="block text-sm font-medium mb-1">Service</label>
                <select value={taskForm.service} onChange={(e) => setTaskForm({ ...taskForm, service: e.target.value })} className="input-nawi">
                  <option value="">Select...</option>{SERVICES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div><label className="block text-sm font-medium mb-1">Title *</label><input value={taskForm.title} onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })} className="input-nawi" required /></div>
              {admin && (
                <div><label className="block text-sm font-medium mb-1">Assigned To</label>
                  <select value={taskForm.assignedTo} onChange={(e) => setTaskForm({ ...taskForm, assignedTo: e.target.value })} className="input-nawi">
                    <option value="">Select...</option>{employees.map((e: any) => <option key={e.id} value={e.id}>{e.name}</option>)}
                  </select>
                </div>
              )}
              <div><label className="block text-sm font-medium mb-1">Due Date *</label><input type="date" value={taskForm.dueDate} onChange={(e) => setTaskForm({ ...taskForm, dueDate: e.target.value })} className="input-nawi" required /></div>
              <div><label className="block text-sm font-medium mb-1">Notes</label><textarea value={taskForm.notes} onChange={(e) => setTaskForm({ ...taskForm, notes: e.target.value })} className="input-nawi" rows={2} /></div>
              <div className="flex justify-end gap-3"><button type="button" onClick={() => setShowAddTask(false)} className="btn-outline">Cancel</button><button type="submit" className="btn-primary">Add Task</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
