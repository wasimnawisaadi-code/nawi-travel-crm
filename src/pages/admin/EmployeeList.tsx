import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Trash2, Eye, Users, Camera } from 'lucide-react';
import { storage, KEYS, generateId, auditLog } from '@/lib/storage';
import StatusBadge from '@/components/ui/StatusBadge';
import EmptyState from '@/components/ui/EmptyState';

export default function EmployeeList() {
  const navigate = useNavigate();
  const [employees, setEmployees] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showDeleteModal, setShowDeleteModal] = useState<any>(null);
  const [deleteConfirmName, setDeleteConfirmName] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [form, setForm] = useState({ name: '', mobile: '', email: '', password: '', passportNo: '', emiratesId: '', photo: '' });

  const load = () => setEmployees(storage.getAll(KEYS.EMPLOYEES));
  useEffect(load, []);

  const filtered = employees.filter((e: any) => {
    if (statusFilter !== 'all' && e.status !== statusFilter) return false;
    if (search && !e.name.toLowerCase().includes(search.toLowerCase()) && !e.email.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const clients = storage.getAll(KEYS.CLIENTS);

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setForm({ ...form, photo: reader.result as string });
    reader.readAsDataURL(file);
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    const id = generateId('EMP');
    const emp = {
      id, name: form.name, mobile: form.mobile, email: form.email,
      password: form.password, passportNo: form.passportNo, emiratesId: form.emiratesId,
      photo: form.photo, baseSalary: 0, leaveBalance: 30,
      status: 'active', createdAt: new Date().toISOString(), createdBy: 'ADM-001',
    };
    storage.push(KEYS.EMPLOYEES, emp);
    auditLog('employee_created', 'employee', id, { name: form.name });
    setShowCreateForm(false);
    setForm({ name: '', mobile: '', email: '', password: '', passportNo: '', emiratesId: '', photo: '' });
    load();
  };

  const handleDelete = () => {
    if (!showDeleteModal || deleteConfirmName !== showDeleteModal.name) return;
    storage.update(KEYS.EMPLOYEES, showDeleteModal.id, { status: 'inactive' });
    auditLog('employee_deleted', 'employee', showDeleteModal.id, { name: showDeleteModal.name });

    // Reassign clients
    const empClients = clients.filter((c: any) => c.assignedTo === showDeleteModal.id);
    empClients.forEach((c: any) => {
      storage.update(KEYS.CLIENTS, c.id, { assignedTo: '' });
    });

    setShowDeleteModal(null);
    setDeleteConfirmName('');
    load();
  };

  // Generate secure password
  const generatePassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%';
    let pwd = '';
    for (let i = 0; i < 12; i++) pwd += chars.charAt(Math.floor(Math.random() * chars.length));
    setForm({ ...form, password: pwd });
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-1 w-full sm:w-auto">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} className="input-nawi pl-9" placeholder="Search employees..." />
          </div>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="input-nawi w-auto">
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
        <button onClick={() => setShowCreateForm(true)} className="btn-primary"><Plus className="w-4 h-4" /> Add Employee</button>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={<Users className="w-8 h-8 text-muted-foreground" />} title="No employees yet" description="Add your first employee to get started." action={<button onClick={() => setShowCreateForm(true)} className="btn-primary"><Plus className="w-4 h-4" /> Add Employee</button>} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((e: any) => {
            const clientCount = clients.filter((c: any) => c.assignedTo === e.id).length;
            return (
              <div key={e.id} className="card-nawi-hover cursor-pointer" onClick={() => navigate(`/admin/employees/${e.id}`)}>
                <div className="flex items-start gap-3">
                  {e.photo ? (
                    <img src={e.photo} alt="" className="w-14 h-14 rounded-full object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-14 h-14 rounded-full bg-primary flex items-center justify-center text-lg font-bold text-primary-foreground flex-shrink-0">
                      {e.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="font-semibold text-foreground truncate">{e.name}</p>
                      <StatusBadge status={e.status} />
                    </div>
                    <p className="text-xs text-muted-foreground font-mono">{e.id}</p>
                    <p className="text-xs text-muted-foreground mt-1">{e.email}</p>
                    <p className="text-xs text-muted-foreground">{e.mobile}</p>
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-xs text-muted-foreground">{clientCount} clients</span>
                      <div className="flex items-center gap-1">
                        <button onClick={(ev) => { ev.stopPropagation(); navigate(`/admin/employees/${e.id}`); }} className="p-1.5 hover:bg-muted rounded-lg text-muted-foreground hover:text-foreground"><Eye className="w-4 h-4" /></button>
                        <button onClick={(ev) => { ev.stopPropagation(); setShowDeleteModal(e); setDeleteConfirmName(''); }} className="p-1.5 hover:bg-destructive/10 rounded-lg text-muted-foreground hover:text-destructive"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Modal */}
      {showCreateForm && (
        <div className="fixed inset-0 bg-foreground/50 z-50 flex items-center justify-center p-4" onClick={() => setShowCreateForm(false)}>
          <div className="bg-card rounded-xl shadow-elevated w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-foreground font-display mb-4">Add New Employee</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              {/* Photo Upload */}
              <div className="flex justify-center">
                <label className="relative cursor-pointer">
                  {form.photo ? (
                    <img src={form.photo} alt="" className="w-24 h-24 rounded-full object-cover border-4 border-border" />
                  ) : (
                    <div className="w-24 h-24 rounded-full bg-muted flex items-center justify-center border-4 border-border">
                      <Camera className="w-8 h-8 text-muted-foreground" />
                    </div>
                  )}
                  <div className="absolute bottom-0 right-0 w-8 h-8 bg-primary rounded-full flex items-center justify-center">
                    <Camera className="w-4 h-4 text-primary-foreground" />
                  </div>
                  <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
                </label>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2"><label className="block text-sm font-medium mb-1">Full Name *</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input-nawi" required /></div>
                <div><label className="block text-sm font-medium mb-1">Mobile *</label><input value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} className="input-nawi" required /></div>
                <div><label className="block text-sm font-medium mb-1">Email *</label><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="input-nawi" required /></div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium mb-1">Password *</label>
                  <div className="flex gap-2">
                    <input value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="input-nawi flex-1" required />
                    <button type="button" onClick={generatePassword} className="btn-outline text-xs whitespace-nowrap">Generate</button>
                  </div>
                </div>
                <div><label className="block text-sm font-medium mb-1">Passport No.</label><input value={form.passportNo} onChange={(e) => setForm({ ...form, passportNo: e.target.value })} className="input-nawi" /></div>
                <div><label className="block text-sm font-medium mb-1">Emirates ID</label><input value={form.emiratesId} onChange={(e) => setForm({ ...form, emiratesId: e.target.value })} className="input-nawi" /></div>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowCreateForm(false)} className="btn-outline">Cancel</button>
                <button type="submit" className="btn-primary">Create Employee</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-foreground/50 z-50 flex items-center justify-center p-4">
          <div className="bg-card rounded-xl shadow-elevated w-full max-w-md p-6">
            <h2 className="text-lg font-bold text-foreground font-display mb-2">Delete Employee</h2>
            <p className="text-sm text-muted-foreground mb-3">This will permanently deactivate <strong>{showDeleteModal.name}</strong>'s account.</p>
            <div className="bg-destructive/10 text-destructive text-sm px-4 py-2.5 rounded-lg mb-4">This action cannot be undone.</div>
            <p className="text-sm text-foreground mb-2">Type the employee's full name to confirm:</p>
            <div className="inline-block bg-primary text-primary-foreground text-sm px-3 py-1 rounded-full mb-3">{showDeleteModal.name}</div>
            <input value={deleteConfirmName} onChange={(e) => setDeleteConfirmName(e.target.value)} className="input-nawi mb-4" placeholder="Type employee name..." />
            <div className="flex justify-end gap-3">
              <button onClick={() => { setShowDeleteModal(null); setDeleteConfirmName(''); }} className="btn-outline">Cancel</button>
              <button onClick={handleDelete} disabled={deleteConfirmName !== showDeleteModal.name} className="btn-danger disabled:opacity-40">Confirm Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
