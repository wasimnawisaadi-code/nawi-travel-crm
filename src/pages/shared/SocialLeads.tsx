import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth-context';
import { toast } from 'sonner';
import { MessageCircle, Instagram, Facebook, RefreshCw, UserPlus, CheckCircle2, XCircle, Clock, Loader2, Send, StickyNote, Search, Filter } from 'lucide-react';
import EmptyState from '@/components/ui/EmptyState';

type Source = 'whatsapp' | 'instagram' | 'messenger';
type Status = 'NEW' | 'IN_PROGRESS' | 'CONVERTED' | 'NOT_CONVERTED';

interface Lead {
  id: string;
  display_id: string;
  source: Source;
  unique_key: string;
  full_name: string | null;
  first_name: string | null;
  phone: string | null;
  username: string | null;
  language: string | null;
  status: Status;
  assigned_to: string | null;
  client_need: string | null;
  notes: string | null;
  follow_up_date: string | null;
  last_interaction: string | null;
  last_seen: string | null;
  created_at: string;
}

interface Note { id: string; author_name: string; body: string; created_at: string; }

const SOURCE_META: Record<Source, { label: string; Icon: any; color: string }> = {
  whatsapp:  { label: 'WhatsApp',  Icon: MessageCircle, color: 'text-success bg-success/10' },
  instagram: { label: 'Instagram', Icon: Instagram,    color: 'text-warning bg-warning/10' },
  messenger: { label: 'Messenger', Icon: Facebook,     color: 'text-secondary bg-secondary/10' },
};

const STATUS_META: Record<Status, { label: string; color: string }> = {
  NEW: { label: 'New', color: 'bg-primary/10 text-primary' },
  IN_PROGRESS: { label: 'In Progress', color: 'bg-warning/10 text-warning' },
  CONVERTED: { label: 'Converted', color: 'bg-success/10 text-success' },
  NOT_CONVERTED: { label: 'Not Converted', color: 'bg-destructive/10 text-destructive' },
};

export default function SocialLeads() {
  const { user, profile } = useAuth();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [employees, setEmployees] = useState<Record<string, { name: string; photo: string | null }>>({});
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [filterSource, setFilterSource] = useState<'all' | Source>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | Status>('all');
  const [search, setSearch] = useState('');
  const [openLead, setOpenLead] = useState<Lead | null>(null);

  const load = async () => {
    const { data } = await supabase
      .from('social_leads').select('*')
      .order('last_interaction', { ascending: false, nullsFirst: false });
    setLeads((data as Lead[]) || []);
    setLoading(false);
  };

  const loadEmps = async () => {
    const { data } = await supabase.from('profiles').select('user_id, name, photo_url');
    const map: Record<string, any> = {};
    (data || []).forEach((e: any) => { map[e.user_id] = { name: e.name, photo: e.photo_url }; });
    setEmployees(map);
  };

  useEffect(() => {
    load(); loadEmps();
    const channel = supabase
      .channel('social-leads-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'social_leads' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sync-social-leads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Sync failed');
      const t = json.summary;
      const newCount = t.whatsapp.new + t.instagram.new + t.messenger.new;
      const updCount = t.whatsapp.updated + t.instagram.updated + t.messenger.updated;
      toast.success(`Sync complete — ${newCount} new, ${updCount} updated`);
      load();
    } catch (e: any) {
      toast.error(e.message || 'Sync failed');
    } finally { setSyncing(false); }
  };

  const takeLead = async (lead: Lead) => {
    if (lead.assigned_to && lead.assigned_to !== user?.id) {
      toast.error(`Already taken by ${employees[lead.assigned_to]?.name || 'another employee'}`);
      return;
    }
    const { error } = await supabase
      .from('social_leads')
      .update({ assigned_to: user!.id, assigned_at: new Date().toISOString(), status: lead.status === 'NEW' ? 'IN_PROGRESS' : lead.status })
      .eq('id', lead.id);
    if (error) { toast.error(error.message); return; }
    toast.success('Lead assigned to you');
    load();
  };

  const filtered = useMemo(() => {
    return leads.filter(l => {
      if (filterSource !== 'all' && l.source !== filterSource) return false;
      if (filterStatus !== 'all' && l.status !== filterStatus) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!(l.full_name || '').toLowerCase().includes(q)
          && !(l.phone || '').includes(q)
          && !(l.username || '').toLowerCase().includes(q)
          && !(l.display_id || '').toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [leads, filterSource, filterStatus, search]);

  const counts = useMemo(() => ({
    total: leads.length,
    new: leads.filter(l => l.status === 'NEW').length,
    inProgress: leads.filter(l => l.status === 'IN_PROGRESS').length,
    converted: leads.filter(l => l.status === 'CONVERTED').length,
  }), [leads]);

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold font-display">Social Media Leads</h2>
          <p className="text-sm text-muted-foreground">Auto-synced from WhatsApp, Instagram & Messenger every 15 minutes.</p>
        </div>
        <button onClick={handleSync} disabled={syncing} className="btn-primary disabled:opacity-50">
          {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          {syncing ? 'Syncing…' : 'Sync Now'}
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Total" value={counts.total} color="text-foreground" />
        <StatCard label="New" value={counts.new} color="text-primary" />
        <StatCard label="In Progress" value={counts.inProgress} color="text-warning" />
        <StatCard label="Converted" value={counts.converted} color="text-success" />
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} className="input-nawi pl-9" placeholder="Search name, phone, username…" />
        </div>
        <select value={filterSource} onChange={e => setFilterSource(e.target.value as any)} className="input-nawi w-auto">
          <option value="all">All Sources</option>
          <option value="whatsapp">WhatsApp</option>
          <option value="instagram">Instagram</option>
          <option value="messenger">Messenger</option>
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as any)} className="input-nawi w-auto">
          <option value="all">All Statuses</option>
          <option value="NEW">New</option>
          <option value="IN_PROGRESS">In Progress</option>
          <option value="CONVERTED">Converted</option>
          <option value="NOT_CONVERTED">Not Converted</option>
        </select>
      </div>

      {loading ? (
        <div className="skeleton-nawi h-64" />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<MessageCircle className="w-8 h-8 text-muted-foreground" />}
          title="No leads yet"
          description="Click 'Sync Now' to pull the latest leads from your Google Sheets."
          action={<button onClick={handleSync} className="btn-primary"><RefreshCw className="w-4 h-4" /> Sync Now</button>}
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {filtered.map(lead => {
            const meta = SOURCE_META[lead.source];
            const Icon = meta.Icon;
            const status = STATUS_META[lead.status];
            const owner = lead.assigned_to ? employees[lead.assigned_to] : null;
            const isMine = lead.assigned_to === user?.id;
            return (
              <div key={lead.id} className="card-nawi hover:shadow-elevated transition-shadow space-y-3">
                <div className="flex items-start gap-3">
                  <div className={`w-11 h-11 rounded-full flex items-center justify-center ${meta.color}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold truncate">{lead.full_name || lead.username || 'Unnamed'}</p>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${status.color}`}>{status.label}</span>
                      <span className="text-[10px] font-mono text-muted-foreground">{lead.display_id}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {lead.phone && <span>📱 {lead.phone}</span>}
                      {lead.username && <span> @{lead.username}</span>}
                      {lead.language && <span> • {lead.language}</span>}
                    </p>
                    {lead.last_interaction && (
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        <Clock className="w-3 h-3 inline" /> {new Date(lead.last_interaction).toLocaleString('en-GB')}
                      </p>
                    )}
                  </div>
                </div>

                {lead.client_need && (
                  <p className="text-xs bg-muted/50 rounded p-2"><strong>Need:</strong> {lead.client_need}</p>
                )}

                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="text-xs text-muted-foreground">
                    {owner ? (
                      <span className="flex items-center gap-1">
                        {owner.photo
                          ? <img src={owner.photo} className="w-5 h-5 rounded-full object-cover" alt="" />
                          : <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground text-[9px] flex items-center justify-center font-bold">{owner.name.slice(0, 2)}</span>}
                        Handled by <strong>{isMine ? 'you' : owner.name}</strong>
                      </span>
                    ) : <span className="text-warning font-medium">Unassigned</span>}
                  </div>
                  <div className="flex gap-2">
                    {(!lead.assigned_to || isMine) && (
                      <button onClick={() => takeLead(lead)} className="btn-outline text-xs">
                        <UserPlus className="w-3 h-3" /> {isMine ? 'Take again' : 'Take Lead'}
                      </button>
                    )}
                    <button onClick={() => setOpenLead(lead)} className="btn-primary text-xs">
                      <StickyNote className="w-3 h-3" /> Manage
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {openLead && (
        <LeadModal
          lead={openLead}
          onClose={() => setOpenLead(null)}
          onSaved={() => { setOpenLead(null); load(); }}
          canEdit={!openLead.assigned_to || openLead.assigned_to === user?.id || profile?.email === 'admin@nawisaadi.com'}
          currentUserId={user!.id}
          currentUserName={profile?.name || 'Unknown'}
        />
      )}
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="card-nawi py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-2xl font-bold font-display ${color}`}>{value}</p>
    </div>
  );
}

function LeadModal({ lead, onClose, onSaved, canEdit, currentUserId, currentUserName }: {
  lead: Lead; onClose: () => void; onSaved: () => void; canEdit: boolean; currentUserId: string; currentUserName: string;
}) {
  const [form, setForm] = useState({
    status: lead.status, client_need: lead.client_need || '', notes: lead.notes || '',
    follow_up_date: lead.follow_up_date || '',
  });
  const [notes, setNotes] = useState<Note[]>([]);
  const [newNote, setNewNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.from('lead_notes').select('*').eq('lead_id', lead.id).order('created_at', { ascending: false }).then(({ data }) => {
      setNotes((data as Note[]) || []);
    });
  }, [lead.id]);

  const save = async () => {
    setSaving(true);
    const { error } = await supabase.from('social_leads').update({
      status: form.status,
      client_need: form.client_need || null,
      notes: form.notes || null,
      follow_up_date: form.follow_up_date || null,
    }).eq('id', lead.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Lead updated');
    onSaved();
  };

  const addNote = async () => {
    if (!newNote.trim()) return;
    const { data, error } = await supabase.from('lead_notes').insert({
      lead_id: lead.id, author_id: currentUserId, author_name: currentUserName, body: newNote.trim(),
    }).select().single();
    if (error) { toast.error(error.message); return; }
    setNotes(n => [data as Note, ...n]);
    setNewNote('');
  };

  const meta = SOURCE_META[lead.source];

  return (
    <div className="fixed inset-0 bg-foreground/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card rounded-xl shadow-elevated w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="p-6 border-b border-border flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold font-display">{lead.full_name || lead.username || 'Lead'}</h3>
            <p className="text-xs text-muted-foreground font-mono">{lead.display_id} • {meta.label}</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><XCircle className="w-5 h-5" /></button>
        </div>

        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Info label="Phone" value={lead.phone} />
            <Info label="Username" value={lead.username} />
            <Info label="Language" value={lead.language} />
            <Info label="Last Seen" value={lead.last_seen ? new Date(lead.last_seen).toLocaleString('en-GB') : null} />
          </div>

          <div className="space-y-3 pt-2 border-t border-border">
            <div>
              <label className="block text-xs font-medium mb-1">Status</label>
              <select disabled={!canEdit} value={form.status} onChange={e => setForm({ ...form, status: e.target.value as Status })} className="input-nawi disabled:opacity-60">
                <option value="NEW">New</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="CONVERTED">Converted</option>
                <option value="NOT_CONVERTED">Not Converted</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Client Need (visa, ticket, package…)</label>
              <input disabled={!canEdit} value={form.client_need} onChange={e => setForm({ ...form, client_need: e.target.value })} className="input-nawi disabled:opacity-60" placeholder="e.g. UAE Visa, Family Trip" />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Follow-up Date</label>
              <input disabled={!canEdit} type="date" value={form.follow_up_date} onChange={e => setForm({ ...form, follow_up_date: e.target.value })} className="input-nawi disabled:opacity-60" />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Summary Notes</label>
              <textarea disabled={!canEdit} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={3} className="input-nawi disabled:opacity-60" />
            </div>
            {canEdit && (
              <button onClick={save} disabled={saving} className="btn-primary w-full disabled:opacity-50">
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            )}
            {!canEdit && (
              <p className="text-xs text-muted-foreground text-center italic">Read-only — only the assigned employee or admin can edit.</p>
            )}
          </div>

          <div className="pt-4 border-t border-border space-y-2">
            <h4 className="text-sm font-semibold flex items-center gap-1.5"><StickyNote className="w-4 h-4" /> Activity Log</h4>
            <div className="flex gap-2">
              <input value={newNote} onChange={e => setNewNote(e.target.value)} onKeyDown={e => e.key === 'Enter' && addNote()} placeholder="Add a note…" className="input-nawi flex-1" />
              <button onClick={addNote} className="btn-primary"><Send className="w-4 h-4" /></button>
            </div>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {notes.length === 0 ? <p className="text-xs text-muted-foreground italic">No notes yet.</p> :
                notes.map(n => (
                  <div key={n.id} className="bg-muted/40 rounded p-2 text-xs">
                    <p className="text-foreground">{n.body}</p>
                    <p className="text-[10px] text-muted-foreground mt-1">{n.author_name} • {new Date(n.created_at).toLocaleString('en-GB')}</p>
                  </div>
                ))
              }
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p className="text-[11px] text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="text-sm font-medium">{value || '—'}</p>
    </div>
  );
}
