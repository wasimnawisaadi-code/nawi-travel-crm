import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import {
  DSRTemplate, DSREntry, fetchAllTemplates, fetchAssignedTemplates,
  fetchEntries, createEntry, updateEntry, deleteEntry,
  parseExcelForTemplate, bulkCreateEntries, downloadTemplateExcel, exportEntriesToExcel,
  ExcelParseResult,
} from '@/lib/dsr-service';
import { supabase } from '@/integrations/supabase/client';
import { formatCurrency } from '@/lib/supabase-service';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import {
  ClipboardList, Plus, Upload, Download, FileSpreadsheet, Pencil, Trash2,
  Settings as SettingsIcon, TrendingUp, DollarSign, Users, AlertCircle, CheckCircle2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';

export default function DailyStatusReport() {
  const { user, profile, isAdmin } = useAuth();
  const [templates, setTemplates] = useState<DSRTemplate[]>([]);
  const [activeTemplate, setActiveTemplate] = useState<DSRTemplate | null>(null);
  const [entries, setEntries] = useState<DSREntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [fromDate, setFromDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [toDate, setToDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [employeeFilter, setEmployeeFilter] = useState<string>('all');
  const [employees, setEmployees] = useState<{ user_id: string; name: string }[]>([]);
  const [showEntryModal, setShowEntryModal] = useState(false);
  const [editingEntry, setEditingEntry] = useState<DSREntry | null>(null);

  const loadTemplates = async () => {
    if (!user) return;
    const list = isAdmin ? await fetchAllTemplates() : await fetchAssignedTemplates(user.id);
    setTemplates(list);
    if (list.length > 0 && !activeTemplate) setActiveTemplate(list[0]);
  };

  const loadEntries = async () => {
    if (!activeTemplate) { setEntries([]); return; }
    setLoading(true);
    try {
      const data = await fetchEntries({
        templateId: activeTemplate.id,
        fromDate, toDate,
        employeeId: employeeFilter !== 'all' ? employeeFilter : undefined,
        isAdmin, currentUserId: user?.id,
      });
      setEntries(data);
    } catch (e: any) {
      toast.error(e.message);
    } finally { setLoading(false); }
  };

  const loadEmployees = async () => {
    if (!isAdmin) return;
    const { data } = await supabase.from('profiles').select('user_id, name').eq('status', 'active').order('name');
    setEmployees((data || []) as any);
  };

  useEffect(() => { loadTemplates(); loadEmployees(); }, [user, isAdmin]);
  useEffect(() => { loadEntries(); }, [activeTemplate, fromDate, toDate, employeeFilter]);

  // Aggregate KPIs for current view
  const kpis = useMemo(() => {
    const totalSale = entries.reduce((s, e) => s + Number(e.sale_amount || 0), 0);
    const totalCost = entries.reduce((s, e) => s + Number(e.cost_amount || 0), 0);
    const totalProfit = entries.reduce((s, e) => s + Number(e.profit_amount || 0), 0);
    const uniqueEmployees = new Set(entries.map(e => e.employee_id)).size;
    return { totalSale, totalCost, totalProfit, count: entries.length, uniqueEmployees };
  }, [entries]);

  // Per-employee breakdown for admin dashboard
  const empBreakdown = useMemo(() => {
    const map = new Map<string, { name: string; count: number; sale: number; profit: number }>();
    entries.forEach(e => {
      const k = e.employee_id;
      const existing = map.get(k) || { name: e.employee_name || 'Unknown', count: 0, sale: 0, profit: 0 };
      existing.count++;
      existing.sale += Number(e.sale_amount || 0);
      existing.profit += Number(e.profit_amount || 0);
      map.set(k, existing);
    });
    return Array.from(map.values()).sort((a, b) => b.profit - a.profit);
  }, [entries]);

  const handleSaveEntry = async (data: Record<string, any>) => {
    if (!activeTemplate || !user || !profile) return;
    try {
      if (editingEntry) {
        await updateEntry(editingEntry.id, activeTemplate, data);
        toast.success('Entry updated');
      } else {
        await createEntry(activeTemplate, user.id, profile.name, fromDate, data);
        toast.success('Entry added');
      }
      setShowEntryModal(false);
      setEditingEntry(null);
      loadEntries();
    } catch (e: any) { toast.error(e.message); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this entry?')) return;
    try {
      await deleteEntry(id);
      toast.success('Deleted');
      loadEntries();
    } catch (e: any) { toast.error(e.message); }
  };

  if (templates.length === 0) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-3 mb-6">
          <ClipboardList className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Daily Status Report</h1>
            <p className="text-sm text-muted-foreground">Track daily bookings, visas, and tours</p>
          </div>
        </div>
        <Card>
          <CardContent className="py-12 text-center">
            <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
            <h3 className="font-semibold mb-2">
              {isAdmin ? 'No DSR templates yet' : 'No templates assigned to you'}
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              {isAdmin
                ? 'Create or activate templates to begin tracking daily reports.'
                : 'Ask your admin to assign DSR templates to you.'}
            </p>
            {isAdmin && (
              <Button asChild>
                <Link to="/admin/dsr-assignments"><SettingsIcon className="h-4 w-4 mr-2" />Manage Templates</Link>
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <ClipboardList className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Daily Status Report</h1>
            <p className="text-sm text-muted-foreground">
              {isAdmin ? 'Monitor all employee DSR submissions' : 'Submit your daily reports'}
            </p>
          </div>
        </div>
        {isAdmin && (
          <Button asChild variant="outline">
            <Link to="/admin/dsr-assignments"><SettingsIcon className="h-4 w-4 mr-2" />Manage Assignments</Link>
          </Button>
        )}
      </div>

      {/* Template tabs */}
      <Tabs value={activeTemplate?.id} onValueChange={(v) => setActiveTemplate(templates.find(t => t.id === v) || null)}>
        <TabsList className="flex flex-wrap h-auto">
          {templates.map(t => (
            <TabsTrigger key={t.id} value={t.id} className="gap-2">
              <span>{t.icon}</span>{t.name}
            </TabsTrigger>
          ))}
        </TabsList>

        {activeTemplate && (
          <TabsContent value={activeTemplate.id} className="space-y-4 mt-4">
            {/* Filters & actions */}
            <Card>
              <CardContent className="pt-6 flex flex-wrap items-end gap-3">
                <div>
                  <Label className="text-xs">From</Label>
                  <Input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="w-40" />
                </div>
                <div>
                  <Label className="text-xs">To</Label>
                  <Input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="w-40" />
                </div>
                {isAdmin && (
                  <div>
                    <Label className="text-xs">Employee</Label>
                    <Select value={employeeFilter} onValueChange={setEmployeeFilter}>
                      <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Employees</SelectItem>
                        {employees.map(e => <SelectItem key={e.user_id} value={e.user_id}>{e.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="flex gap-2 ml-auto flex-wrap">
                  <Button variant="outline" size="sm" onClick={() => downloadTemplateExcel(activeTemplate)}>
                    <Download className="h-4 w-4 mr-1" />Template
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => exportEntriesToExcel(activeTemplate, entries)} disabled={entries.length === 0}>
                    <FileSpreadsheet className="h-4 w-4 mr-1" />Export
                  </Button>
                  {!isAdmin && (
                    <>
                      <ExcelUploadButton template={activeTemplate} userId={user!.id} userName={profile!.name} entryDate={fromDate} onDone={loadEntries} />
                      <Button size="sm" onClick={() => { setEditingEntry(null); setShowEntryModal(true); }}>
                        <Plus className="h-4 w-4 mr-1" />Add Row
                      </Button>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* KPI cards */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <KpiCard icon={ClipboardList} label="Entries" value={String(kpis.count)} />
              <KpiCard icon={Users} label="Employees" value={String(kpis.uniqueEmployees)} />
              <KpiCard icon={DollarSign} label="Sales" value={formatCurrency(kpis.totalSale)} />
              <KpiCard icon={DollarSign} label="Cost" value={formatCurrency(kpis.totalCost)} />
              <KpiCard icon={TrendingUp} label="Profit" value={formatCurrency(kpis.totalProfit)} highlight />
            </div>

            {/* Admin breakdown */}
            {isAdmin && empBreakdown.length > 0 && (
              <Card>
                <CardHeader><CardTitle className="text-base">Employee Performance</CardTitle></CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead><tr className="border-b text-xs text-muted-foreground"><th className="text-left py-2">Employee</th><th className="text-right">Entries</th><th className="text-right">Sales</th><th className="text-right">Profit</th></tr></thead>
                      <tbody>
                        {empBreakdown.map((e, i) => (
                          <tr key={i} className="border-b last:border-0">
                            <td className="py-2 font-medium">{e.name}</td>
                            <td className="text-right">{e.count}</td>
                            <td className="text-right">{formatCurrency(e.sale)}</td>
                            <td className="text-right text-green-600 font-medium">{formatCurrency(e.profit)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Entries table */}
            <Card>
              <CardHeader><CardTitle className="text-base">{activeTemplate.icon} {activeTemplate.name} — Entries</CardTitle></CardHeader>
              <CardContent>
                {loading ? <div className="text-center py-8 text-muted-foreground">Loading…</div>
                  : entries.length === 0 ? <div className="text-center py-8 text-muted-foreground">No entries for this period</div>
                  : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/50">
                          <tr className="text-xs text-muted-foreground">
                            <th className="text-left p-2 whitespace-nowrap">ID</th>
                            <th className="text-left p-2 whitespace-nowrap">Date</th>
                            {isAdmin && <th className="text-left p-2 whitespace-nowrap">Employee</th>}
                            {activeTemplate.columns.slice(0, 6).map(c => (
                              <th key={c.key} className="text-left p-2 whitespace-nowrap">{c.label}</th>
                            ))}
                            <th className="text-right p-2 whitespace-nowrap">Profit</th>
                            <th className="p-2">Source</th>
                            <th className="p-2"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {entries.map(e => (
                            <tr key={e.id} className="border-b hover:bg-muted/30">
                              <td className="p-2 font-mono text-xs">{e.display_id}</td>
                              <td className="p-2 whitespace-nowrap">{e.entry_date}</td>
                              {isAdmin && <td className="p-2">{e.employee_name}</td>}
                              {activeTemplate.columns.slice(0, 6).map(c => (
                                <td key={c.key} className="p-2 max-w-[180px] truncate">{e.data[c.key] || '—'}</td>
                              ))}
                              <td className="p-2 text-right text-green-600 font-medium whitespace-nowrap">{formatCurrency(Number(e.profit_amount || 0))}</td>
                              <td className="p-2"><Badge variant={e.source === 'excel' ? 'secondary' : 'outline'} className="text-xs">{e.source}</Badge></td>
                              <td className="p-2 whitespace-nowrap">
                                {(e.employee_id === user?.id || isAdmin) && (
                                  <div className="flex gap-1">
                                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditingEntry(e); setShowEntryModal(true); }}>
                                      <Pencil className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => handleDelete(e.id)}>
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  </div>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>

      {showEntryModal && activeTemplate && (
        <EntryModal
          template={activeTemplate}
          entry={editingEntry}
          onSave={handleSaveEntry}
          onClose={() => { setShowEntryModal(false); setEditingEntry(null); }}
        />
      )}
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

function EntryModal({ template, entry, onSave, onClose }: { template: DSRTemplate; entry: DSREntry | null; onSave: (d: Record<string, any>) => void; onClose: () => void; }) {
  const [data, setData] = useState<Record<string, any>>(entry?.data || {});
  const update = (k: string, v: any) => setData(prev => ({ ...prev, [k]: v }));

  const submit = () => {
    const missing = template.columns.filter(c => c.required && (!data[c.key] || String(data[c.key]).trim() === ''));
    if (missing.length > 0) { toast.error(`Required: ${missing.map(m => m.label).join(', ')}`); return; }
    onSave(data);
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{template.icon} {entry ? 'Edit' : 'Add'} {template.name} Entry</DialogTitle></DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-2">
          {template.columns.map(c => (
            <div key={c.key} className={c.type === 'textarea' ? 'md:col-span-2' : ''}>
              <Label className="text-xs">{c.label}{c.required && <span className="text-destructive ml-0.5">*</span>}</Label>
              {c.type === 'select' ? (
                <Select value={data[c.key] || ''} onValueChange={v => update(c.key, v)}>
                  <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>{c.options?.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                </Select>
              ) : c.type === 'textarea' ? (
                <Textarea value={data[c.key] || ''} onChange={e => update(c.key, e.target.value)} rows={2} />
              ) : (
                <Input type={c.type === 'number' ? 'number' : c.type === 'date' ? 'date' : 'text'} value={data[c.key] || ''} onChange={e => update(c.key, e.target.value)} />
              )}
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ExcelUploadButton({ template, userId, userName, entryDate, onDone }: { template: DSRTemplate; userId: string; userName: string; entryDate: string; onDone: () => void; }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<ExcelParseResult | null>(null);
  const [busy, setBusy] = useState(false);

  const handleFile = async (file: File) => {
    setBusy(true);
    try {
      const r = await parseExcelForTemplate(file, template);
      setResult(r);
    } catch (e: any) { toast.error('Could not parse file: ' + e.message); }
    finally { setBusy(false); if (inputRef.current) inputRef.current.value = ''; }
  };

  const confirm = async () => {
    if (!result?.ok || !result.rows) return;
    setBusy(true);
    try {
      const n = await bulkCreateEntries(template, userId, userName, entryDate, result.rows);
      toast.success(`Imported ${n} rows`);
      setResult(null);
      onDone();
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  };

  return (
    <>
      <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" hidden onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
      <Button size="sm" variant="outline" onClick={() => inputRef.current?.click()} disabled={busy}>
        <Upload className="h-4 w-4 mr-1" />Upload Excel
      </Button>

      {result && (
        <Dialog open onOpenChange={() => setResult(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {result.ok ? <CheckCircle2 className="h-5 w-5 text-green-600" /> : <AlertCircle className="h-5 w-5 text-destructive" />}
                {result.ok ? 'Ready to Import' : 'Upload Rejected'}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3 text-sm">
              {!result.ok && <div className="p-3 bg-destructive/10 text-destructive rounded">{result.reason}</div>}
              {result.ok && <div className="p-3 bg-green-500/10 text-green-700 rounded">Detected {result.rows?.length} valid rows. Will be saved for {entryDate}.</div>}

              {result.matchedColumns && result.matchedColumns.length > 0 && (
                <div>
                  <div className="font-medium mb-1">Matched columns ({result.matchedColumns.length}):</div>
                  <div className="flex flex-wrap gap-1">
                    {result.matchedColumns.map((m, i) => (
                      <Badge key={i} variant="secondary" className="text-xs">{m.excelHeader} → {m.label}</Badge>
                    ))}
                  </div>
                </div>
              )}
              {result.unmatchedHeaders && result.unmatchedHeaders.length > 0 && (
                <div>
                  <div className="font-medium mb-1 text-muted-foreground">Ignored columns:</div>
                  <div className="flex flex-wrap gap-1">
                    {result.unmatchedHeaders.map((h, i) => <Badge key={i} variant="outline" className="text-xs">{h}</Badge>)}
                  </div>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setResult(null)}>Cancel</Button>
              {result.ok && <Button onClick={confirm} disabled={busy}>Import {result.rows?.length} rows</Button>}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
