import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Trash2, Eye, Users, Camera, Shield, Wifi, MapPin } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth-context';
import { auditLog } from '@/lib/supabase-service';
import StatusBadge from '@/components/ui/StatusBadge';
import EmptyState from '@/components/ui/EmptyState';

export default function EmployeeList() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [employees, setEmployees] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [roleFilter, setRoleFilter] = useState('all');
  const [showDeleteModal, setShowDeleteModal] = useState<any>(null);
  const [deleteConfirmName, setDeleteConfirmName] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [form, setForm] = useState({
    name: '', mobile: '', email: '', password: '',
    passportNo: '', emiratesId: '', photo: '',
    profileType: 'office' as 'office' | 'sales',
    allowedIPs: '' as string,
  });

  const load = async () => {
    const { data } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
    // Filter out admin's own profile if needed
    setEmployees(data || []);
  };
  useEffect(() => { load(); }, []);

  const filtered = employees.filter((e: any) => {
    if (statusFilter !== 'all' && e.status !== statusFilter) return false;
    if (roleFilter !== 'all' && (e.profile_type || 'office') !== roleFilter) return false;
    if (search && !e.name.toLowerCase().includes(search.toLowerCase()) && !e.email.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const [clientCounts, setClientCounts] = useState<Record<string, number>>({});
  useEffect(() => {
    const fetchCounts = async () => {
      const { data } = await supabase.from('clients').select('assigned_to');
      const counts: Record<string, number> = {};
      (data || []).forEach((c: any) => { if (c.assigned_to) counts[c.assigned_to] = (counts[c.assigned_to] || 0) + 1; });
      setClientCounts(counts);
    };
    fetchCounts();
  }, []);

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { alert('Photo must be under 5MB'); return; }
    const reader = new FileReader();
    reader.onload = () => setForm({ ...form, photo: reader.result as string });
    reader.readAsDataURL(file);
  };

  const generatePassword = () => {
    const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const lower = 'abcdefghjkmnpqrstuvwxyz';
    const digits = '23456789';
    const special = '!@#$%&*';
    let pwd = '';
    pwd += upper.charAt(Math.floor(Math.random() * upper.length));
    pwd += lower.charAt(Math.floor(Math.random() * lower.length));
    pwd += digits.charAt(Math.floor(Math.random() * digits.length));
    pwd += special.charAt(Math.floor(Math.random() * special.length));
    const all = upper + lower + digits + special;
    for (let i = 0; i < 8; i++) pwd += all.charAt(Math.floor(Math.random() * all.length));
    pwd = pwd.split('').sort(() => Math.random() - 0.5).join('');
    setForm({ ...form, password: pwd });
  };

  const validateEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateEmail(form.email)) { alert('Please enter a valid email address'); return; }
    if (form.password.length < 8) { alert('Password must be at least 8 characters'); return; }

    // Create auth user via Supabase admin (we use signUp which will auto-create profile via trigger)
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: { data: { name: form.name } }
    });

    if (authError) { alert(authError.message); return; }
    if (!authData.user) { alert('Failed to create user'); return; }

    // Update profile with additional details
    await supabase.from('profiles').update({
      name: form.name,
      mobile: form.mobile,
      passport_no: form.passportNo || null,
      emirates_id: form.emiratesId || null,
      photo_url: form.photo || null,
      profile_type: form.profileType as any,
      allowed_ips: form.allowedIPs ? form.allowedIPs.split(',').map(ip => ip.trim()).filter(Boolean) : [],
    }).eq('user_id', authData.user.id);

    // Assign employee role
    await supabase.from('user_roles').insert([{ user_id: authData.user.id, role: 'employee' as any }]);

    await auditLog('employee_created', 'employee', authData.user.id, { name: form.name, profileType: form.profileType });
    setShowCreateForm(false);
    setForm({ name: '', mobile: '', email: '', password: '', passportNo: '', emiratesId: '', photo: '', profileType: 'office', allowedIPs: '' });
    load();
  };

  const handleDelete = async () => {
    if (!showDeleteModal || deleteConfirmName !== showDeleteModal.name) return;
    await supabase.from('profiles').update({ status: 'inactive' }).eq('user_id', showDeleteModal.user_id);
    // Unassign clients
    await supabase.from('clients').update({ assigned_to: null }).eq('assigned_to', showDeleteModal.user_id);
    await auditLog('employee_deleted', 'employee', showDeleteModal.user_id, { name: showDeleteModal.name });
    setShowDeleteModal(null);
    setDeleteConfirmName('');
    load();
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-1 w-full sm:w-auto flex-wrap">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} className="input-nawi pl-9" placeholder="Search employees..." />
          </div>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="input-nawi w-auto">
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className="input-nawi w-auto">
            <option value="all">All Types</option>
            <option value="office">Office</option>
            <option value="sales">Sales</option>
          </select>
        </div>
        <button onClick={() => setShowCreateForm(true)} className="btn-primary"><Plus className="w-4 h-4" /> Add Employee</button>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={<Users className="w-8 h-8 text-muted-foreground" />} title="No employees yet" description="Add your first employee to get started." action={<button onClick={() => setShowCreateForm(true)} className="btn-primary"><Plus className="w-4 h-4" /> Add Employee</button>} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((e: any) => {
            const clientCount = clientCounts[e.user_id] || 0;
            const isSales = e.profile_type === 'sales';
            return (
              <div key={e.id} className="card-nawi-hover cursor-pointer" onClick={() => navigate(`/admin/employees/${e.user_id}`)}>
                <div className="flex items-start gap-3">
                  {e.photo_url ? (
                    <img src={e.photo_url} alt="" className="w-14 h-14 rounded-full object-cover flex-shrink-0" />
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
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <p className="text-xs text-muted-foreground font-mono">{e.user_id?.slice(0, 8)}</p>
                      {isSales && <span className="text-xs bg-warning/10 text-warning px-1.5 py-0.5 rounded-full flex items-center gap-0.5"><MapPin className="w-3 h-3" />Sales</span>}
                      {!isSales && e.allowed_ips?.length > 0 && <span title="IP restricted"><Wifi className="w-3 h-3 text-secondary" /></span>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{e.email}</p>
                    <p className="text-xs text-muted-foreground">{e.mobile}</p>
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-xs text-muted-foreground">{clientCount} clients</span>
                      <div className="flex items-center gap-1">
                        <button onClick={(ev) => { ev.stopPropagation(); navigate(`/admin/employees/${e.user_id}`); }} className="p-1.5 hover:bg-muted rounded-lg text-muted-foreground hover:text-foreground"><Eye className="w-4 h-4" /></button>
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

              <div>
                <label className="block text-sm font-medium mb-2">Employee Type</label>
                <div className="grid grid-cols-2 gap-3">
                  <button type="button" onClick={() => setForm({ ...form, profileType: 'office' })}
                    className={`p-3 rounded-xl border-2 text-center transition-all ${form.profileType === 'office' ? 'border-primary bg-primary/5' : 'border-border'}`}>
                    <Wifi className="w-5 h-5 mx-auto mb-1" /><span className="text-sm font-medium">Office</span>
                    <p className="text-xs text-muted-foreground mt-0.5">IP restricted access</p>
                  </button>
                  <button type="button" onClick={() => setForm({ ...form, profileType: 'sales' })}
                    className={`p-3 rounded-xl border-2 text-center transition-all ${form.profileType === 'sales' ? 'border-primary bg-primary/5' : 'border-border'}`}>
                    <MapPin className="w-5 h-5 mx-auto mb-1" /><span className="text-sm font-medium">Sales</span>
                    <p className="text-xs text-muted-foreground mt-0.5">Login from anywhere</p>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2"><label className="block text-sm font-medium mb-1">Full Name *</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input-nawi" required /></div>
                <div><label className="block text-sm font-medium mb-1">Mobile *</label><input value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} className="input-nawi" required /></div>
                <div><label className="block text-sm font-medium mb-1">Email *</label><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="input-nawi" required /></div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium mb-1">Password *</label>
                  <div className="flex gap-2">
                    <input value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="input-nawi flex-1" required minLength={8} />
                    <button type="button" onClick={generatePassword} className="btn-outline text-xs whitespace-nowrap"><Shield className="w-3 h-3" /> Generate</button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Min 8 chars with uppercase, lowercase, number & special char</p>
                </div>
                <div><label className="block text-sm font-medium mb-1">Passport No.</label><input value={form.passportNo} onChange={(e) => setForm({ ...form, passportNo: e.target.value })} className="input-nawi" /></div>
                <div><label className="block text-sm font-medium mb-1">Emirates ID</label><input value={form.emiratesId} onChange={(e) => setForm({ ...form, emiratesId: e.target.value })} className="input-nawi" /></div>
              </div>

              {form.profileType === 'office' && (
                <div>
                  <label className="block text-sm font-medium mb-1 flex items-center gap-1"><Wifi className="w-3 h-3" /> Allowed WiFi IP Addresses</label>
                  <input value={form.allowedIPs} onChange={(e) => setForm({ ...form, allowedIPs: e.target.value })} className="input-nawi" placeholder="e.g., 192.168.1.1, 10.0.0.1 (comma separated)" />
                  <p className="text-xs text-muted-foreground mt-1">Leave empty for now — you can add IPs later from employee profile</p>
                </div>
              )}

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
            <h2 className="text-lg font-bold text-foreground font-display mb-2">Deactivate Employee</h2>
            <p className="text-sm text-muted-foreground mb-3">This will permanently deactivate <strong>{showDeleteModal.name}</strong>'s account and unassign all their clients.</p>
            <div className="bg-destructive/10 text-destructive text-sm px-4 py-2.5 rounded-lg mb-4">
              <p>⚠️ This action cannot be undone.</p>
              <p className="text-xs mt-1">{clientCounts[showDeleteModal.user_id] || 0} clients will be unassigned.</p>
            </div>
            <p className="text-sm text-foreground mb-2">Type the employee's full name to confirm:</p>
            <div className="inline-block bg-primary text-primary-foreground text-sm px-3 py-1 rounded-full mb-3">{showDeleteModal.name}</div>
            <input value={deleteConfirmName} onChange={(e) => setDeleteConfirmName(e.target.value)} className="input-nawi mb-4" placeholder="Type employee name..." />
            <div className="flex justify-end gap-3">
              <button onClick={() => { setShowDeleteModal(null); setDeleteConfirmName(''); }} className="btn-outline">Cancel</button>
              <button onClick={handleDelete} disabled={deleteConfirmName !== showDeleteModal.name} className="btn-danger disabled:opacity-40">Confirm Deactivate</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
