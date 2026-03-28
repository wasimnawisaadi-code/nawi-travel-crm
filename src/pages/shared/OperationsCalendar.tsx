import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Plus, X, Target, Trash2 } from 'lucide-react';
import { storage, KEYS, formatDate, getCurrentUser, isAdmin, generateId, auditLog } from '@/lib/storage';
import StatusBadge from '@/components/ui/StatusBadge';

export default function OperationsCalendar() {
  const session = getCurrentUser();
  const admin = isAdmin();
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth());
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [showAddTask, setShowAddTask] = useState(false);
  const [showAddGoal, setShowAddGoal] = useState(false);
  const [tasks, setTasks] = useState<any[]>([]);
  const [goals, setGoals] = useState<any[]>([]);
  const [taskForm, setTaskForm] = useState({ clientId: '', service: '', title: '', assignedTo: '', dueDate: '', notes: '' });
  const [goalForm, setGoalForm] = useState({ title: '', assignedTo: '', startDate: '', endDate: '', description: '', goalTasks: [{ title: '', dueDate: '' }] as { title: string; dueDate: string }[] });

  const reload = () => {
    let t = storage.getAll(KEYS.TASKS);
    if (!admin && session) t = t.filter((tk: any) => tk.assignedTo === session.userId);
    setTasks(t);
    setGoals(storage.getAll(KEYS.GOALS));
  };
  useEffect(reload, [admin, session]);

  const employees = storage.getAll(KEYS.EMPLOYEES).filter((e: any) => e.status === 'active');
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

  const monthGoals = goals.filter((g: any) => {
    if (g.yearMonth) return g.yearMonth === yearMonth;
    if (g.startDate && g.endDate) {
      const start = g.startDate.substring(0, 7);
      const end = g.endDate.substring(0, 7);
      return yearMonth >= start && yearMonth <= end;
    }
    return false;
  });

  const handlePrev = () => { if (month === 0) { setMonth(11); setYear(year - 1); } else setMonth(month - 1); };
  const handleNext = () => { if (month === 11) { setMonth(0); setYear(year + 1); } else setMonth(month + 1); };

  const handleAddTask = (e: React.FormEvent) => {
    e.preventDefault();
    const client = clients.find((c: any) => c.id === taskForm.clientId);
    const emp = employees.find((e: any) => e.id === taskForm.assignedTo);
    const task = {
      id: generateId('TSK'), clientId: taskForm.clientId, clientName: client?.name || '',
      service: taskForm.service || client?.service || '', title: taskForm.title,
      assignedTo: admin ? taskForm.assignedTo : session?.userId || '',
      assignedToName: admin ? emp?.name || '' : session?.userName || '',
      dueDate: taskForm.dueDate, completedDate: '', status: 'New', profit: 0, notes: taskForm.notes,
      createdAt: new Date().toISOString(), createdBy: session?.userId || '',
    };
    storage.push(KEYS.TASKS, task);
    auditLog('task_created', 'task', task.id, {});
    setShowAddTask(false);
    setTaskForm({ clientId: '', service: '', title: '', assignedTo: '', dueDate: '', notes: '' });
    reload();
  };

  const handleAddGoal = (e: React.FormEvent) => {
    e.preventDefault();
    const goalId = generateId('GOAL');
    const goal = {
      id: goalId, title: goalForm.title, assignedTo: goalForm.assignedTo,
      startDate: goalForm.startDate, endDate: goalForm.endDate, description: goalForm.description,
      yearMonth, status: 'Active', createdBy: session?.userId || '', createdAt: new Date().toISOString(),
    };
    storage.push(KEYS.GOALS, goal);

    // Create tasks under this goal
    const emp = employees.find((e: any) => e.id === goalForm.assignedTo);
    goalForm.goalTasks.forEach(gt => {
      if (!gt.title) return;
      const task = {
        id: generateId('TSK'), clientId: '', clientName: '',
        service: '', title: gt.title,
        assignedTo: goalForm.assignedTo || '',
        assignedToName: emp?.name || 'All',
        dueDate: gt.dueDate || goalForm.endDate, completedDate: '', status: 'New', profit: 0,
        notes: `Goal: ${goalForm.title}`, goalId,
        createdAt: new Date().toISOString(), createdBy: session?.userId || '',
      };
      storage.push(KEYS.TASKS, task);
    });

    auditLog('goal_created', 'goal', goalId, { tasksCount: goalForm.goalTasks.filter(t => t.title).length });
    setShowAddGoal(false);
    setGoalForm({ title: '', assignedTo: '', startDate: '', endDate: '', description: '', goalTasks: [{ title: '', dueDate: '' }] });
    reload();
  };

  const addGoalTask = () => {
    setGoalForm({ ...goalForm, goalTasks: [...goalForm.goalTasks, { title: '', dueDate: '' }] });
  };

  const updateGoalTask = (index: number, field: string, value: string) => {
    const updated = [...goalForm.goalTasks];
    (updated[index] as any)[field] = value;
    setGoalForm({ ...goalForm, goalTasks: updated });
  };

  const removeGoalTask = (index: number) => {
    setGoalForm({ ...goalForm, goalTasks: goalForm.goalTasks.filter((_, i) => i !== index) });
  };

  const updateTaskStatus = (taskId: string, status: string) => {
    const updates: any = { status };
    if (status === 'Completed') {
      const profit = prompt('Enter profit amount (AED):');
      if (profit) {
        updates.profit = Number(profit);
        updates.completedDate = new Date().toISOString();
      }
    }
    storage.update(KEYS.TASKS, taskId, updates);
    auditLog('task_updated', 'task', taskId, { status });
    reload();
  };

  const dayTasks = selectedDay ? getTasksForDay(selectedDay) : [];

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button onClick={handlePrev} className="btn-outline p-2"><ChevronLeft className="w-4 h-4" /></button>
          <h2 className="text-xl font-bold font-display">{new Date(year, month).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</h2>
          <button onClick={handleNext} className="btn-outline p-2"><ChevronRight className="w-4 h-4" /></button>
        </div>
        <div className="flex gap-2">
          {admin && <button onClick={() => setShowAddGoal(true)} className="btn-outline"><Target className="w-4 h-4" /> Set Goal</button>}
          <button onClick={() => setShowAddTask(true)} className="btn-primary"><Plus className="w-4 h-4" /> Add Task</button>
        </div>
      </div>

      {/* Goals Strip */}
      {monthGoals.length > 0 && (
        <div className="card-nawi bg-primary/5 border-primary/20">
          <h3 className="text-sm font-semibold text-primary mb-3 flex items-center gap-2"><Target className="w-4 h-4" /> Goals</h3>
          <div className="space-y-2">
            {monthGoals.map((g: any) => {
              const emp = employees.find((e: any) => e.id === g.assignedTo);
              const goalTasks = tasks.filter((t: any) => t.goalId === g.id);
              const completedCount = goalTasks.filter((t: any) => t.status === 'Completed').length;
              return (
                <div key={g.id} className="p-3 bg-background rounded-lg">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-medium">{g.title}</p>
                    {goalTasks.length > 0 && <span className="text-xs font-medium text-primary">{completedCount}/{goalTasks.length} tasks</span>}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {emp?.name || 'All'} • {g.startDate ? `${formatDate(g.startDate)} → ${formatDate(g.endDate)}` : g.yearMonth}
                  </p>
                  {g.description && <p className="text-xs text-muted-foreground mt-0.5">{g.description}</p>}
                  {goalTasks.length > 0 && (
                    <div className="mt-2">
                      <div className="w-full h-1.5 bg-muted rounded-full">
                        <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${goalTasks.length > 0 ? (completedCount / goalTasks.length) * 100 : 0}%` }} />
                      </div>
                      <div className="mt-2 space-y-1">
                        {goalTasks.map((t: any) => (
                          <div key={t.id} className="flex items-center justify-between text-xs">
                            <span className={t.status === 'Completed' ? 'line-through text-muted-foreground' : ''}>{t.title}</span>
                            <div className="flex items-center gap-1">
                              <StatusBadge status={t.status} />
                              {!admin ? null : null}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex gap-4">
        {/* Calendar Grid */}
        <div className="card-nawi flex-1">
          <div className="grid grid-cols-7 gap-px">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
              <div key={d} className={`text-center text-xs font-medium py-2 ${d === 'Fri' || d === 'Sat' ? 'text-muted-foreground/50' : 'text-muted-foreground'}`}>{d}</div>
            ))}
            {Array.from({ length: firstDayOfWeek }).map((_, i) => <div key={`e-${i}`} />)}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const dayT = getTasksForDay(day);
              const hasOverdue = dayT.some((t: any) => (t.status === 'New' || t.status === 'Processing') && new Date(t.dueDate) < today);
              const dayOfWeek = new Date(year, month, day).getDay();
              const isWeekend = dayOfWeek === 5 || dayOfWeek === 6;
              return (
                <button key={day} onClick={() => setSelectedDay(day)}
                  className={`relative p-2 rounded-lg text-sm transition-all min-h-[48px] ${
                    selectedDay === day ? 'bg-primary text-primary-foreground' :
                    isToday(day) ? 'border-2 border-primary' :
                    hasOverdue ? 'bg-destructive/10' :
                    isWeekend ? 'bg-muted/30 text-muted-foreground' :
                    'hover:bg-muted'
                  }`}>
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
              <p className="text-sm text-muted-foreground text-center py-8">No tasks</p>
            ) : (
              <div className="space-y-3">
                {dayTasks.map((t: any) => (
                  <div key={t.id} className="p-3 border border-border rounded-lg">
                    <p className="font-medium text-sm">{t.title}</p>
                    {t.clientName && <p className="text-xs text-muted-foreground">{t.clientName} • {t.service}</p>}
                    {t.goalId && <p className="text-xs text-secondary">🎯 Goal task</p>}
                    {t.assignedToName && <p className="text-xs text-muted-foreground">→ {t.assignedToName}</p>}
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
                  <option value="">Select (optional)...</option>{clients.map((c: any) => <option key={c.id} value={c.id}>{c.name} ({c.id})</option>)}
                </select>
              </div>
              <div><label className="block text-sm font-medium mb-1">Title *</label><input value={taskForm.title} onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })} className="input-nawi" required /></div>
              {admin && (
                <div><label className="block text-sm font-medium mb-1">Assign To</label>
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

      {/* Add Goal Modal with Tasks */}
      {showAddGoal && (
        <div className="fixed inset-0 bg-foreground/50 z-50 flex items-center justify-center p-4" onClick={() => setShowAddGoal(false)}>
          <div className="bg-card rounded-xl shadow-elevated w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold font-display mb-4 flex items-center gap-2"><Target className="w-5 h-5" /> Set Goal with Tasks</h2>
            <form onSubmit={handleAddGoal} className="space-y-4">
              <div><label className="block text-sm font-medium mb-1">Goal Title *</label><input value={goalForm.title} onChange={(e) => setGoalForm({ ...goalForm, title: e.target.value })} className="input-nawi" required placeholder="e.g., Process 50 UAE Visas" /></div>
              <div><label className="block text-sm font-medium mb-1">Assign To</label>
                <select value={goalForm.assignedTo} onChange={(e) => setGoalForm({ ...goalForm, assignedTo: e.target.value })} className="input-nawi">
                  <option value="">All Employees</option>{employees.map((e: any) => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-sm font-medium mb-1">Start Date</label><input type="date" value={goalForm.startDate} onChange={(e) => setGoalForm({ ...goalForm, startDate: e.target.value })} className="input-nawi" /></div>
                <div><label className="block text-sm font-medium mb-1">End Date</label><input type="date" value={goalForm.endDate} onChange={(e) => setGoalForm({ ...goalForm, endDate: e.target.value })} className="input-nawi" /></div>
              </div>
              <div><label className="block text-sm font-medium mb-1">Description</label><textarea value={goalForm.description} onChange={(e) => setGoalForm({ ...goalForm, description: e.target.value })} className="input-nawi" rows={2} placeholder="Details for the employee..." /></div>

              {/* Goal Tasks */}
              <div className="border-t border-border pt-4">
                <div className="flex items-center justify-between mb-3">
                  <label className="text-sm font-semibold">Tasks under this Goal</label>
                  <button type="button" onClick={addGoalTask} className="btn-outline text-xs py-1"><Plus className="w-3 h-3" /> Add Task</button>
                </div>
                {goalForm.goalTasks.map((gt, i) => (
                  <div key={i} className="flex gap-2 mb-2">
                    <input value={gt.title} onChange={(e) => updateGoalTask(i, 'title', e.target.value)} className="input-nawi flex-1" placeholder={`Task ${i + 1} title`} />
                    <input type="date" value={gt.dueDate} onChange={(e) => updateGoalTask(i, 'dueDate', e.target.value)} className="input-nawi w-36" />
                    {goalForm.goalTasks.length > 1 && <button type="button" onClick={() => removeGoalTask(i)} className="text-destructive p-1"><Trash2 className="w-4 h-4" /></button>}
                  </div>
                ))}
              </div>

              <div className="flex justify-end gap-3"><button type="button" onClick={() => setShowAddGoal(false)} className="btn-outline">Cancel</button><button type="submit" className="btn-primary">Create Goal & Tasks</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
