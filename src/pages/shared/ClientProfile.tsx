import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Edit, FileText, Send, Trash2, Plus, Save, X, Upload, Download } from 'lucide-react';
import { storage, KEYS, formatCurrency, formatDate, daysUntil, getDateStatus, getCurrentUser, isAdmin, auditLog, generateId } from '@/lib/storage';
import StatusBadge from '@/components/ui/StatusBadge';

export default function ClientProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const session = getCurrentUser();
  const [client, setClient] = useState<any>(null);
  const [tab, setTab] = useState('overview');
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<any>({});
  const [newNote, setNewNote] = useState('');
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [taskForm, setTaskForm] = useState({ title: '', dueDate: '', notes: '' });

  const load = () => {
    const c = storage.getAll(KEYS.CLIENTS).find((c: any) => c.id === id);
    if (c) { setClient(c); setForm(c); }
  };
  useEffect(load, [id]);

  if (!client) return <div className="skeleton-nawi h-64 w-full" />;

  const tasks = storage.getAll(KEYS.TASKS).filter((t: any) => t.clientId === id);
  const quotations = storage.getAll(KEYS.QUOTATIONS).filter((q: any) => q.clientId === id);
  const history = storage.getAll(KEYS.AUDIT_LOG).filter((a: any) => a.targetId === id);
  const employees = storage.getAll(KEYS.EMPLOYEES);
  const assignedEmp = employees.find((e: any) => e.id === client.assignedTo);
  const basePath = isAdmin() ? '/admin' : '/employee';

  const handleSave = () => {
    storage.update(KEYS.CLIENTS, client.id, { ...form, updatedAt: new Date().toISOString() });
    auditLog('client_updated', 'client', client.id, {});
    setClient({ ...client, ...form });
    setEditing(false);
  };

  const handleAddNote = () => {
    if (!newNote.trim()) return;
    const notes = client.notes ? client.notes + '\n---\n' : '';
    const entry = `[${session?.userName} - ${new Date().toLocaleString()}] ${newNote}`;
    const updated = notes + entry;
    storage.update(KEYS.CLIENTS, client.id, { notes: updated });
    setClient({ ...client, notes: updated });
    setNewNote('');
  };

  const handleAddTask = (e: React.FormEvent) => {
    e.preventDefault();
    const task = {
      id: generateId('TSK'),
      clientId: client.id,
      clientName: client.name,
      service: client.service,
      title: taskForm.title,
      assignedTo: session?.userId || '',
      assignedToName: session?.userName || '',
      dueDate: taskForm.dueDate,
      completedDate: '',
      status: 'New',
      profit: 0,
      notes: taskForm.notes,
      createdAt: new Date().toISOString(),
      createdBy: session?.userId || '',
    };
    storage.push(KEYS.TASKS, task);
    auditLog('task_created', 'task', task.id, { clientId: client.id });
    setShowTaskModal(false);
    setTaskForm({ title: '', dueDate: '', notes: '' });
  };

  const handleDelete = () => {
    if (confirm('Are you sure you want to delete this client?')) {
      storage.delete(KEYS.CLIENTS, client.id);
      auditLog('client_deleted', 'client', client.id, { name: client.name });
      navigate(basePath + '/clients');
    }
  };

  const dateStatusColors: Record<string, string> = {
    safe: 'text-success border-success/20 bg-success/5',
    warning: 'text-warning border-warning/20 bg-warning/5',
    urgent: 'text-destructive border-destructive/20 bg-destructive/5',
    overdue: 'text-destructive border-destructive/30 bg-destructive/10',
  };

  const tabList = ['overview', 'documents', 'dates', 'quotations', 'tasks', 'revenue', 'notes', 'history'];

  return (
    <div className="space-y-4 animate-fade-in">
      <Link to={`${basePath}/clients`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="w-4 h-4" /> Back</Link>

      {/* Header */}
      <div className="card-nawi">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground font-display">{client.name}</h1>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <span className="font-mono text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">{client.id}</span>
              <StatusBadge status={client.status} />
              {client.service && <span className="badge-new">{client.service}</span>}
              {client.clientType && <span className="text-xs text-muted-foreground">{client.clientType}</span>}
              {assignedEmp && <span className="text-xs text-muted-foreground">→ {assignedEmp.name}</span>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => { setEditing(!editing); setForm(client); }} className="btn-outline"><Edit className="w-4 h-4" /> Edit</button>
            <Link to={`${basePath}/clients/${client.id}`} onClick={() => setTab('quotations')} className="btn-secondary"><FileText className="w-4 h-4" /> Quotation</Link>
            <button onClick={handleDelete} className="btn-danger"><Trash2 className="w-4 h-4" /></button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border overflow-x-auto">
        {tabList.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2.5 text-sm font-medium capitalize whitespace-nowrap transition-colors ${tab === t ? 'text-primary border-b-2 border-primary' : 'text-muted-foreground hover:text-foreground'}`}>{t}</button>
        ))}
      </div>

      {/* Overview */}
      {tab === 'overview' && (
        <div className="card-nawi">
          {editing && <div className="flex justify-end mb-4 gap-2"><button onClick={handleSave} className="btn-primary"><Save className="w-4 h-4" /> Save</button><button onClick={() => setEditing(false)} className="btn-outline"><X className="w-4 h-4" /></button></div>}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              { label: 'Name', key: 'name' }, { label: 'Mobile', key: 'mobile' }, { label: 'Email', key: 'email' },
              { label: 'Client Type', key: 'clientType' }, { label: 'Lead Source', key: 'leadSource' }, { label: 'Service', key: 'service' },
              { label: 'Company', key: 'companyName' }, { label: 'Company No.', key: 'companyNumber' }, { label: 'Payment Type', key: 'paymentType' },
              { label: 'Status', key: 'status' }, { label: 'Revenue', key: 'revenue' }, { label: 'Profit', key: 'profit' },
            ].map(({ label, key }) => (
              <div key={key}>
                <label className="block text-xs text-muted-foreground mb-1">{label}</label>
                {editing ? (
                  key === 'status' ? (
                    <select value={form[key] || ''} onChange={(e) => setForm({ ...form, [key]: e.target.value })} className="input-nawi">
                      <option value="New">New</option><option value="Processing">Processing</option><option value="Success">Success</option><option value="Failed">Failed</option>
                    </select>
                  ) : (
                    <input value={form[key] || ''} onChange={(e) => setForm({ ...form, [key]: ['revenue', 'profit'].includes(key) ? Number(e.target.value) : e.target.value })} className="input-nawi" />
                  )
                ) : (
                  <p className="text-sm font-medium text-foreground">{['revenue', 'profit'].includes(key) ? formatCurrency(client[key] || 0) : (client[key] || '—')}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Documents */}
      {tab === 'documents' && (
        <div className="card-nawi">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold font-display">Documents</h3>
            <label className="btn-outline cursor-pointer">
              <Upload className="w-4 h-4" /> Upload
              <input type="file" className="hidden" onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = () => {
                  const docs = [...(client.documents || []), { name: file.name, type: file.type, base64: `NAWI_ENC::${reader.result}`, uploadedAt: new Date().toISOString() }];
                  storage.update(KEYS.CLIENTS, client.id, { documents: docs });
                  setClient({ ...client, documents: docs });
                };
                reader.readAsDataURL(file);
              }} />
            </label>
          </div>
          {(!client.documents || client.documents.length === 0) ? (
            <p className="text-sm text-muted-foreground text-center py-8">No documents uploaded</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {client.documents.map((d: any, i: number) => (
                <div key={i} className="p-3 border border-border rounded-lg flex items-center gap-3">
                  <FileText className="w-8 h-8 text-secondary flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{d.name}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(d.uploadedAt)}</p>
                  </div>
                  <button onClick={() => {
                    const link = document.createElement('a');
                    link.href = d.base64.replace('NAWI_ENC::', '');
                    link.download = d.name;
                    link.click();
                  }} className="text-muted-foreground hover:text-foreground"><Download className="w-4 h-4" /></button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Important Dates */}
      {tab === 'dates' && (
        <div className="card-nawi">
          <h3 className="font-semibold font-display mb-4">Important Dates</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {Object.entries(client.importantDates || {}).map(([type, val]) => {
              if (!val) return null;
              const days = daysUntil(val as string);
              const status = getDateStatus(val as string);
              return (
                <div key={type} className={`p-4 rounded-xl border ${dateStatusColors[status]}`}>
                  <p className="text-xs font-medium uppercase tracking-wider mb-1">{type.replace(/([A-Z])/g, ' $1').trim()}</p>
                  <p className="text-lg font-bold font-display">{formatDate(val as string)}</p>
                  <p className="text-sm font-medium mt-1">
                    {days < 0 ? `${Math.abs(days)} days overdue` : days === 0 ? 'Today' : `${days} days left`}
                  </p>
                </div>
              );
            }).filter(Boolean)}
            {Object.values(client.importantDates || {}).every(v => !v) && (
              <p className="text-sm text-muted-foreground col-span-full text-center py-8">No dates recorded</p>
            )}
          </div>
        </div>
      )}

      {/* Quotations */}
      {tab === 'quotations' && (
        <div className="card-nawi">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold font-display">Quotations</h3>
            <Link to={`${basePath}/clients/${client.id}`} onClick={() => {/* handled by quotation page */}} className="btn-primary"><Plus className="w-4 h-4" /> Generate Quotation</Link>
          </div>
          {quotations.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No quotations yet</p>
          ) : (
            <table className="table-nawi w-full">
              <thead><tr><th>ID</th><th>Date</th><th>Quoted</th><th>Payable</th><th>Profit</th><th>Status</th></tr></thead>
              <tbody>{quotations.map((q: any) => <tr key={q.id}><td className="font-mono text-xs">{q.id}</td><td>{formatDate(q.generatedAt)}</td><td>{formatCurrency(q.quotedPrice)}</td><td>{formatCurrency(q.payableAmount)}</td><td className="text-success font-medium">{formatCurrency(q.profit)}</td><td><StatusBadge status={q.status} /></td></tr>)}</tbody>
            </table>
          )}
        </div>
      )}

      {/* Tasks */}
      {tab === 'tasks' && (
        <div className="card-nawi">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold font-display">Tasks</h3>
            <button onClick={() => setShowTaskModal(true)} className="btn-primary"><Plus className="w-4 h-4" /> Add Task</button>
          </div>
          {tasks.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No tasks yet</p>
          ) : (
            <div className="space-y-3">
              {tasks.map((t: any) => (
                <div key={t.id} className="flex items-center justify-between p-3 border border-border rounded-lg">
                  <div>
                    <p className="font-medium text-foreground">{t.title}</p>
                    <p className="text-xs text-muted-foreground">Due: {formatDate(t.dueDate)} • {t.assignedToName}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={t.status} />
                    {t.profit > 0 && <span className="text-sm font-medium text-success">{formatCurrency(t.profit)}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Revenue */}
      {tab === 'revenue' && (
        <div className="card-nawi">
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="p-4 bg-muted/50 rounded-xl"><p className="text-xs text-muted-foreground">Total Revenue</p><p className="text-xl font-bold font-display text-foreground">{formatCurrency(client.revenue || 0)}</p></div>
            <div className="p-4 bg-success/5 rounded-xl border border-success/20"><p className="text-xs text-muted-foreground">Total Profit</p><p className="text-xl font-bold font-display text-success">{formatCurrency(client.profit || 0)}</p></div>
          </div>
          {quotations.length > 0 && (
            <table className="table-nawi w-full">
              <thead><tr><th>Quotation</th><th>Date</th><th>Service</th><th>Quoted</th><th>Payable</th><th>Profit</th></tr></thead>
              <tbody>{quotations.map((q: any) => <tr key={q.id}><td className="font-mono text-xs">{q.id}</td><td>{formatDate(q.generatedAt)}</td><td>{q.service}</td><td>{formatCurrency(q.quotedPrice)}</td><td>{formatCurrency(q.payableAmount)}</td><td className="text-success font-medium">{formatCurrency(q.profit)}</td></tr>)}</tbody>
            </table>
          )}
        </div>
      )}

      {/* Notes */}
      {tab === 'notes' && (
        <div className="card-nawi">
          <h3 className="font-semibold font-display mb-4">Notes</h3>
          <div className="flex gap-2 mb-4">
            <input value={newNote} onChange={(e) => setNewNote(e.target.value)} className="input-nawi flex-1" placeholder="Add a note..." onKeyDown={(e) => e.key === 'Enter' && handleAddNote()} />
            <button onClick={handleAddNote} className="btn-primary">Add</button>
          </div>
          {client.notes ? (
            <div className="space-y-3">
              {client.notes.split('\n---\n').reverse().map((note: string, i: number) => (
                <div key={i} className="p-3 bg-muted/50 rounded-lg text-sm text-foreground whitespace-pre-wrap">{note}</div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">No notes yet</p>
          )}
        </div>
      )}

      {/* History */}
      {tab === 'history' && (
        <div className="card-nawi">
          <h3 className="font-semibold font-display mb-4">History</h3>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No history</p>
          ) : (
            <div className="space-y-3">
              {history.reverse().map((h: any) => (
                <div key={h.id} className="flex items-start gap-3">
                  <div className="w-2 h-2 rounded-full bg-secondary mt-1.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm text-foreground"><span className="font-medium">{h.userName}</span> {h.action.replace(/_/g, ' ')}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(h.timestamp)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Add Task Modal */}
      {showTaskModal && (
        <div className="fixed inset-0 bg-foreground/50 z-50 flex items-center justify-center p-4" onClick={() => setShowTaskModal(false)}>
          <div className="bg-card rounded-xl shadow-elevated w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold font-display mb-4">Add Task</h2>
            <form onSubmit={handleAddTask} className="space-y-4">
              <div><label className="block text-sm font-medium mb-1">Title *</label><input value={taskForm.title} onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })} className="input-nawi" required /></div>
              <div><label className="block text-sm font-medium mb-1">Due Date *</label><input type="date" value={taskForm.dueDate} onChange={(e) => setTaskForm({ ...taskForm, dueDate: e.target.value })} className="input-nawi" required /></div>
              <div><label className="block text-sm font-medium mb-1">Notes</label><textarea value={taskForm.notes} onChange={(e) => setTaskForm({ ...taskForm, notes: e.target.value })} className="input-nawi" rows={3} /></div>
              <div className="flex justify-end gap-3"><button type="button" onClick={() => setShowTaskModal(false)} className="btn-outline">Cancel</button><button type="submit" className="btn-primary">Add Task</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
