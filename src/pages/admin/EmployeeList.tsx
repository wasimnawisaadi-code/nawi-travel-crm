import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Search, Edit, Trash2, Eye, Users } from 'lucide-react';
import { storage, KEYS, generateId, auditLog, formatCurrency } from '@/lib/storage';
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
  const [form, setForm] = useState({ name: '', mobile: '', email: '', password: '', baseSalary: 0, passportNo: '', emiratesId: '', leaveBalance: 21 });

  const load = () => setEmployees(storage.getAll(KEYS.EMPLOYEES));
  useEffect(load, []);

  const filtered = employees.filter((e: any) => {
    if (statusFilter !== 'all' && e.status !== statusFilter) return false;
    if (search && !e.name.toLowerCase().includes(search.toLowerCase()) && !e.email.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const clients = storage.getAll(KEYS.CLIENTS);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    const id = generateId('EMP');
    const emp = {
      id, ...form, baseSalary: Number(form.baseSalary), status: 'active',
      createdAt: new Date().toISOString(), createdBy: 'ADM-001',
    };
    storage.push(KEYS.EMPLOYEES, emp);
    auditLog('employee_created', 'employee', id, { name: form.name });
    setShowCreateForm(false);
    setForm({ name: '', mobile: '', email: '', password: '', baseSalary: 0, passportNo: '', emiratesId: '', leaveBalance: 21 });
    load();
  };

  const handleDelete = () => {
    if (!showDeleteModal || deleteConfirmName !== showDeleteModal.name) return;
    storage.update(KEYS.EMPLOYEES, showDeleteModal.id, { status: 'inactive' });
    auditLog('employee_deleted', 'employee', showDeleteModal.id, { name: showDeleteModal.name });
    setShowDeleteModal(null);
    setDeleteConfirmName('');
    load();
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
        <div className="card-nawi overflow-x-auto p-0">
          <table className="table-nawi w-full">
            <thead><tr><th>ID</th><th>Name</th><th>Mobile</th><th>Email</th><th>Salary</th><th>Clients</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {filtered.map((e: any) => (
                <tr key={e.id}>
                  <td className="font-mono text-xs">{e.id}</td>
                  <td className="font-medium">{e.name}</td>
                  <td>{e.mobile}</td>
                  <td>{e.email}</td>
                  <td>{formatCurrency(e.baseSalary || 0)}</td>
                  <td>{clients.filter((c: any) => c.assignedTo === e.id).length}</td>
                  <td><StatusBadge status={e.status} /></td>
                  <td>
                    <div className="flex items-center gap-1">
                      <button onClick={() => navigate(`/admin/employees/${e.id}`)} className="p-1.5 hover:bg-muted rounded-lg text-muted-foreground hover:text-foreground"><Eye className="w-4 h-4" /></button>
                      <button onClick={() => { setShowDeleteModal(e); setDeleteConfirmName(''); }} className="p-1.5 hover:bg-destructive/10 rounded-lg text-muted-foreground hover:text-destructive"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Modal */}
      {showCreateForm && (
        <div className="fixed inset-0 bg-foreground/50 z-50 flex items-center justify-center p-4" onClick={() => setShowCreateForm(false)}>
          <div className="bg-card rounded-xl shadow-elevated w-full max-w-lg p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-foreground font-display mb-4">Add New Employee</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium mb-1">Full Name *</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input-nawi" required /></div>
                <div><label className="block text-sm font-medium mb-1">Mobile *</label><input value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} className="input-nawi" required /></div>
                <div><label className="block text-sm font-medium mb-1">Email *</label><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="input-nawi" required /></div>
                <div><label className="block text-sm font-medium mb-1">Password *</label><input value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="input-nawi" required /></div>
                <div><label className="block text-sm font-medium mb-1">Base Salary (AED) *</label><input type="number" value={form.baseSalary} onChange={(e) => setForm({ ...form, baseSalary: Number(e.target.value) })} className="input-nawi" required /></div>
                <div><label className="block text-sm font-medium mb-1">Leave Balance</label><input type="number" value={form.leaveBalance} onChange={(e) => setForm({ ...form, leaveBalance: Number(e.target.value) })} className="input-nawi" /></div>
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

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-foreground/50 z-50 flex items-center justify-center p-4">
          <div className="bg-card rounded-xl shadow-elevated w-full max-w-md p-6">
            <h2 className="text-lg font-bold text-foreground font-display mb-2">Delete Employee</h2>
            <p className="text-sm text-muted-foreground mb-3">This will permanently deactivate <strong>{showDeleteModal.name}</strong>'s account.</p>
            <div className="bg-destructive/10 text-destructive text-sm px-4 py-2.5 rounded-lg mb-4">This action cannot be undone.</div>
            <p className="text-sm text-foreground mb-2">To confirm, type the employee's full name below:</p>
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
