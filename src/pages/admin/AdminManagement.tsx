import { useEffect, useState } from 'react';
import { Crown, Shield, UserPlus, Trash2, Users } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth-context';
import { auditLog } from '@/lib/supabase-service';
import { toast } from 'sonner';
import EmptyState from '@/components/ui/EmptyState';

interface Admin {
  user_id: string;
  name: string;
  email: string;
  photo_url: string | null;
  isSuper: boolean;
}

export default function AdminManagement() {
  const { isSuperAdmin, user } = useAuth();
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const { data: roles } = await supabase.from('user_roles').select('user_id, role');
    const adminIds = new Set<string>();
    const superIds = new Set<string>();
    (roles || []).forEach((r: any) => {
      if (r.role === 'admin') adminIds.add(r.user_id);
      if (r.role === 'superadmin') superIds.add(r.user_id);
    });
    const allIds = Array.from(new Set([...adminIds, ...superIds]));
    if (allIds.length === 0) { setAdmins([]); return; }
    const { data: profs } = await supabase.from('profiles').select('user_id, name, email, photo_url').in('user_id', allIds);
    setAdmins((profs || []).map((p: any) => ({
      user_id: p.user_id, name: p.name, email: p.email, photo_url: p.photo_url,
      isSuper: superIds.has(p.user_id),
    })));
  };

  useEffect(() => { load(); }, []);

  if (!isSuperAdmin) {
    return (
      <div className="card-nawi text-center py-12">
        <Shield className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
        <p className="text-sm text-muted-foreground">Only Super Admins can manage admin accounts.</p>
      </div>
    );
  }

  const generatePassword = () => {
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%';
    let p = '';
    for (let i = 0; i < 14; i++) p += chars.charAt(Math.floor(Math.random() * chars.length));
    setForm(f => ({ ...f, password: p }));
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) { toast.error('Invalid email'); return; }
    if (form.password.length < 8) { toast.error('Password must be 8+ characters'); return; }

    setBusy(true);
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: form.email, password: form.password,
      options: { data: { name: form.name } },
    });
    if (authError || !authData.user) { setBusy(false); toast.error(authError?.message || 'Could not create user'); return; }

    await supabase.from('profiles').update({ name: form.name }).eq('user_id', authData.user.id);
    await supabase.from('user_roles').insert([{ user_id: authData.user.id, role: 'admin' as any }]);
    await auditLog('admin_created', 'admin', authData.user.id, { name: form.name, email: form.email });

    toast.success(`Admin ${form.name} created`);
    setForm({ name: '', email: '', password: '' });
    setShowForm(false);
    setBusy(false);
    load();
  };

  const revokeAdmin = async (a: Admin) => {
    if (a.isSuper) { toast.error('Cannot revoke a Super Admin'); return; }
    if (!confirm(`Remove admin role from ${a.name}? They will become a regular employee.`)) return;
    await supabase.from('user_roles').delete().eq('user_id', a.user_id).eq('role', 'admin');
    await supabase.from('user_roles').insert([{ user_id: a.user_id, role: 'employee' as any }]).then(() => null);
    await auditLog('admin_revoked', 'admin', a.user_id, { name: a.name });
    toast.success('Admin role revoked');
    load();
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold font-display flex items-center gap-2">
            <Crown className="w-5 h-5 text-warning" /> Admin Management
          </h2>
          <p className="text-sm text-muted-foreground">Super Admins can create and manage Admin accounts.</p>
        </div>
        <button onClick={() => setShowForm(true)} className="btn-primary text-sm"><UserPlus className="w-4 h-4" /> Create Admin</button>
      </div>

      {admins.length === 0 ? (
        <EmptyState icon={<Users className="w-8 h-8 text-muted-foreground" />} title="No admins" description="Create your first admin account." />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {admins.map(a => (
            <div key={a.user_id} className="card-nawi flex items-start gap-3">
              {a.photo_url ? (
                <img src={a.photo_url} alt="" className="w-12 h-12 rounded-full object-cover flex-shrink-0" />
              ) : (
                <div className="w-12 h-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold flex-shrink-0">
                  {a.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="font-semibold truncate">{a.name}</p>
                  {a.isSuper ? (
                    <span className="text-[10px] bg-warning/15 text-warning px-1.5 py-0.5 rounded-full flex items-center gap-0.5"><Crown className="w-3 h-3" />Super</span>
                  ) : (
                    <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full flex items-center gap-0.5"><Shield className="w-3 h-3" />Admin</span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground truncate">{a.email}</p>
                {!a.isSuper && a.user_id !== user?.id && (
                  <button onClick={() => revokeAdmin(a)} className="mt-2 text-xs text-destructive hover:underline flex items-center gap-1">
                    <Trash2 className="w-3 h-3" /> Revoke admin
                  </button>
                )}
                {a.user_id === user?.id && (
                  <p className="mt-2 text-[11px] text-muted-foreground italic">That's you</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-foreground/50 z-50 flex items-center justify-center p-4" onClick={() => setShowForm(false)}>
          <div className="bg-card rounded-xl shadow-elevated w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold font-display mb-4">Create Admin Account</h3>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Full Name *</label>
                <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="input-nawi" required />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Email *</label>
                <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className="input-nawi" required />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Temporary Password *</label>
                <div className="flex gap-2">
                  <input value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} className="input-nawi flex-1" minLength={8} required />
                  <button type="button" onClick={generatePassword} className="btn-outline text-xs">Generate</button>
                </div>
                <p className="text-xs text-muted-foreground mt-1">Share this password securely. They can change it after sign-in.</p>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="btn-outline">Cancel</button>
                <button type="submit" disabled={busy} className="btn-primary disabled:opacity-50">{busy ? 'Creating…' : 'Create Admin'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
