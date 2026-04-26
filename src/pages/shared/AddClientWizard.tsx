import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Check, ChevronLeft, ChevronRight, Upload, AlertTriangle, Plus, Trash2,
  Loader2, Sparkles, Camera, FileText,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/integrations/supabase/client';
import { generateDisplayId, auditLog, formatDate } from '@/lib/supabase-service';
import { toast } from 'sonner';
import WhatsAppTemplateModal from '@/components/WhatsAppTemplateModal';

const SERVICES = [
  { key: 'Air Ticket', emoji: '✈️' },
  { key: 'UAE Visa', emoji: '🪪' },
  { key: 'Global Visa', emoji: '🌍' },
  { key: 'Holiday Package', emoji: '🏝️' },
  { key: 'Travel Insurance', emoji: '🛡️' },
  { key: 'Pilgrimage', emoji: '🕌' },
  { key: 'Meet & Assist', emoji: '🤝' },
  { key: 'Hotel Booking', emoji: '🏨' },
];

const CLIENT_TYPES = [
  { key: 'Individual', icon: '👤', desc: 'Single person' },
  { key: 'B2B', icon: '🏢', desc: 'Business partner' },
  { key: 'Corporate', icon: '🏗️', desc: 'Company / Group' },
];

const LEAD_SOURCES = ['Walk-in', 'Call', 'WhatsApp', 'Social Media', 'Reference', 'Website', 'B2B Partner'];

interface DocEntry {
  id: string;
  name: string;
  fileName: string;
  fileType: string;
  base64: string;
  uploadedAt: string;
  ocrExtracted?: boolean;
}
interface DateEntry { id: string; name: string; date: string; }

const uid = () => Math.random().toString(36).slice(2, 10);

const buildWelcomeMessage = (name: string, service: string) =>
  `Dear ${name},\n\nThank you for choosing Nawi Saadi Travel & Tourism for your ${service || 'travel'} requirement. ✈️\n\nOur team has registered your enquiry and will be in touch shortly with the next steps.\n\nWarm regards,\nNawi Saadi Travel & Tourism`;

export default function AddClientWizard() {
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  const basePath = isAdmin ? '/admin' : '/employee';

  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [duplicates, setDuplicates] = useState<any[]>([]);
  const [showWelcome, setShowWelcome] = useState<{ mobile: string; name: string; service: string } | null>(null);
  const [createdClientId, setCreatedClientId] = useState<string | null>(null);

  const [form, setForm] = useState({
    // Step 1 - Basics
    clientType: '' as '' | 'Individual' | 'B2B' | 'Corporate',
    leadSource: '',
    service: '',
    companyName: '',
    companyNumber: '',
    paymentType: '',
    // Step 3 - Personal (auto-filled by OCR)
    name: '',
    mobile: '',
    email: '',
    nationality: '',
    passportNo: '',
    notes: '',
    // Step 4 - Docs & Dates
    documents: [] as DocEntry[],
    importantDates: [] as DateEntry[],
  });

  const updateForm = (changes: Partial<typeof form>) => setForm(prev => ({ ...prev, ...changes }));

  // Duplicate check
  useEffect(() => {
    if (step < 2) return;
    if (!form.name && !form.mobile) { setDuplicates([]); return; }
    const t = setTimeout(async () => {
      const conds: string[] = [];
      if (form.name.length >= 3) conds.push(`name.ilike.%${form.name}%`);
      if (form.mobile.length >= 5) conds.push(`mobile.eq.${form.mobile}`);
      if (!conds.length) { setDuplicates([]); return; }
      const { data } = await supabase.from('clients')
        .select('id, name, mobile, display_id, service')
        .or(conds.join(','));
      setDuplicates(data || []);
    }, 400);
    return () => clearTimeout(t);
  }, [form.name, form.mobile, step]);

  // ---- OCR scan: handle multiple images at step 2 ----
  const handleOcrScan = async (files: File[]) => {
    setScanning(true);
    let added = 0;
    const newDocs: DocEntry[] = [];
    const newDates: DateEntry[] = [];
    const fieldUpdates: Partial<typeof form> = {};

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const base64Data = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result as string);
        r.onerror = reject;
        r.readAsDataURL(file);
      });

      const docName = file.name.replace(/\.[^/.]+$/, '') || `Scanned Document ${i + 1}`;
      const entry: DocEntry = {
        id: uid(),
        name: docName,
        fileName: file.name,
        fileType: file.type,
        base64: `NAWI_ENC::${base64Data}`,
        uploadedAt: new Date().toISOString(),
      };

      if (!file.type.startsWith('image/')) {
        newDocs.push(entry);
        continue;
      }

      try {
        const { data, error } = await supabase.functions.invoke('extract-document', {
          body: { imageBase64: base64Data, docType: docName, service: form.service },
        });
        if (error) throw error;
        if (data?.success && data.data) {
          const ex = data.data;
          entry.ocrExtracted = true;
          if (ex.fullName && !fieldUpdates.name && !form.name) fieldUpdates.name = ex.fullName;
          if (ex.passportNo && !fieldUpdates.passportNo && !form.passportNo) fieldUpdates.passportNo = ex.passportNo;
          if (ex.nationality && !fieldUpdates.nationality && !form.nationality) fieldUpdates.nationality = ex.nationality;
          if (ex.phoneNumber && !fieldUpdates.mobile && !form.mobile) fieldUpdates.mobile = ex.phoneNumber;
          if (ex.email && !fieldUpdates.email && !form.email) fieldUpdates.email = ex.email;

          const pushDate = (name: string, val?: string) => {
            if (!val) return;
            if (newDates.some(d => d.name.toLowerCase() === name.toLowerCase())) return;
            if (form.importantDates.some(d => d.name.toLowerCase() === name.toLowerCase())) return;
            newDates.push({ id: uid(), name, date: val });
          };
          pushDate('Date of Birth', ex.dateOfBirth);
          pushDate('Passport Expiry', ex.passportExpiry);
          pushDate('Passport Issue Date', ex.passportIssueDate);
          pushDate('Visa Expiry', ex.visaExpiry);
          pushDate('Emirates ID Expiry', (ex.otherDetails as any)?.emiratesIdExpiry);
          added++;
        }
      } catch (err) {
        console.error('OCR failed for', file.name, err);
      }
      newDocs.push(entry);
    }

    setForm(prev => ({
      ...prev,
      ...fieldUpdates,
      documents: [...prev.documents, ...newDocs],
      importantDates: [...prev.importantDates, ...newDates],
    }));
    setScanning(false);
    if (added > 0) toast.success(`✨ Auto-filled details from ${added} of ${files.length} document(s)`);
    else if (newDocs.length > 0) toast.info(`Added ${newDocs.length} document(s). Fill fields manually if needed.`);
  };

  const triggerScan = (camera: boolean) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,.pdf';
    input.multiple = true;
    if (camera) input.setAttribute('capture', 'environment');
    input.onchange = (e: any) => {
      const files = Array.from((e.target as HTMLInputElement).files || []) as File[];
      if (files.length) handleOcrScan(files);
    };
    input.click();
  };

  // ---- Manual document add (step 4) ----
  const addManualDoc = (file: File, name: string) => {
    const r = new FileReader();
    r.onload = () => {
      const entry: DocEntry = {
        id: uid(),
        name: name || file.name,
        fileName: file.name,
        fileType: file.type,
        base64: `NAWI_ENC::${r.result as string}`,
        uploadedAt: new Date().toISOString(),
      };
      setForm(prev => ({ ...prev, documents: [...prev.documents, entry] }));
    };
    r.readAsDataURL(file);
  };
  const removeDoc = (id: string) => setForm(prev => ({ ...prev, documents: prev.documents.filter(d => d.id !== id) }));
  const renameDoc = (id: string, newName: string) => setForm(prev => ({ ...prev, documents: prev.documents.map(d => d.id === id ? { ...d, name: newName } : d) }));

  const addDate = (name = '', date = '') => setForm(prev => ({ ...prev, importantDates: [...prev.importantDates, { id: uid(), name, date }] }));
  const removeDate = (id: string) => setForm(prev => ({ ...prev, importantDates: prev.importantDates.filter(d => d.id !== id) }));
  const updateDate = (id: string, changes: Partial<DateEntry>) => setForm(prev => ({ ...prev, importantDates: prev.importantDates.map(d => d.id === id ? { ...d, ...changes } : d) }));

  // ---- Submit ----
  const handleSubmit = async () => {
    if (!user) return;
    if (!form.name || !form.mobile) { toast.error('Name and mobile are required'); setStep(2); return; }
    setSubmitting(true);
    try {
      const datesObj: Record<string, string> = {};
      form.importantDates.forEach(d => { if (d.name && d.date) datesObj[d.name] = d.date; });

      const displayId = await generateDisplayId('CLT');
      const { data: newClient, error } = await supabase.from('clients').insert({
        display_id: displayId,
        name: form.name,
        mobile: form.mobile,
        email: form.email || null,
        passport_no: form.passportNo || null,
        nationality: form.nationality || null,
        client_type: form.clientType || null,
        company_name: form.companyName || null,
        company_number: form.companyNumber || null,
        payment_type: form.paymentType || null,
        lead_source: form.leadSource || null,
        service: form.service,
        notes: form.notes || '',
        documents: form.documents as any,
        important_dates: datesObj as any,
        family_members: [] as any,
        status: 'New' as const,
        assigned_to: user.id,
        created_by: user.id,
      }).select('id').single();

      if (error || !newClient) {
        toast.error(error?.message || 'Failed to create client');
        return;
      }
      await auditLog('client_created', 'client', newClient.id, { name: form.name, service: form.service });
      toast.success('Client created');
      setCreatedClientId(newClient.id);
      setShowWelcome({ mobile: form.mobile, name: form.name, service: form.service });
    } finally {
      setSubmitting(false);
    }
  };

  const steps = ['Basics', 'AI Scan', 'Personal Details', 'Docs & Dates', 'Review'];

  const canProceed = () => {
    if (step === 0) return !!(form.clientType && form.leadSource && form.service && (form.clientType === 'Individual' || form.companyName));
    if (step === 2) return !!(form.name && form.mobile);
    return true;
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
      <div className="card-nawi">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium">Step {step + 1} of {steps.length}</span>
          <span className="text-sm text-muted-foreground">{steps[step]}</span>
        </div>
        <div className="flex gap-1">
          {steps.map((_, i) => <div key={i} className={`h-1.5 flex-1 rounded-full transition-colors ${i <= step ? 'bg-primary' : 'bg-muted'}`} />)}
        </div>
      </div>

      {duplicates.length > 0 && step >= 2 && (
        <div className="bg-warning/10 border border-warning/20 p-4 rounded-xl">
          <div className="flex items-center gap-2 mb-2"><AlertTriangle className="w-5 h-5 text-warning" /><span className="font-medium text-warning">Possible Duplicate</span></div>
          {duplicates.slice(0, 3).map((d: any) => (
            <div key={d.id} className="flex items-center justify-between p-2 bg-card rounded-lg border border-border mb-1">
              <div>
                <span className="text-sm font-medium">{d.name}</span>
                <span className="text-xs text-muted-foreground ml-2">{d.mobile} • {d.display_id}</span>
              </div>
              <button onClick={() => navigate(`${basePath}/clients/${d.id}`)} className="btn-outline text-xs">Open</button>
            </div>
          ))}
        </div>
      )}

      <div className="card-nawi">
        {/* ===== STEP 0: BASICS ===== */}
        {step === 0 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-bold font-display mb-3">1. Client Type</h2>
              <div className="grid grid-cols-3 gap-3">
                {CLIENT_TYPES.map(({ key, icon, desc }) => (
                  <button key={key} onClick={() => updateForm({ clientType: key as any })}
                    className={`p-4 rounded-xl border-2 text-center transition-all ${form.clientType === key ? 'border-primary bg-primary/5' : 'border-border hover:border-secondary'}`}>
                    <span className="text-2xl block mb-1">{icon}</span>
                    <span className="text-sm font-medium">{key}</span>
                    <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
                  </button>
                ))}
              </div>
              {(form.clientType === 'B2B' || form.clientType === 'Corporate') && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 mt-4 border-t border-border">
                  <div><label className="block text-sm font-medium mb-1">Company Name *</label><input value={form.companyName} onChange={e => updateForm({ companyName: e.target.value })} className="input-nawi" /></div>
                  <div><label className="block text-sm font-medium mb-1">Company Reg. No.</label><input value={form.companyNumber} onChange={e => updateForm({ companyNumber: e.target.value })} className="input-nawi" /></div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Payment Type</label>
                    <div className="flex gap-3 mt-1">
                      {['Cash', 'Credit'].map(t => (
                        <label key={t} className="flex items-center gap-2 cursor-pointer">
                          <input type="radio" name="paymentType" value={t} checked={form.paymentType === t} onChange={e => updateForm({ paymentType: e.target.value })} className="w-4 h-4" />
                          <span className="text-sm">{t}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div>
              <h2 className="text-lg font-bold font-display mb-3">2. Lead Source</h2>
              <div className="flex flex-wrap gap-2">
                {LEAD_SOURCES.map(s => (
                  <button key={s} onClick={() => updateForm({ leadSource: s })}
                    className={`px-4 py-2 rounded-full text-sm font-medium border transition-colors ${form.leadSource === s ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:border-secondary'}`}>{s}</button>
                ))}
              </div>
            </div>

            <div>
              <h2 className="text-lg font-bold font-display mb-3">3. Select Service</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {SERVICES.map(({ key, emoji }) => (
                  <button key={key} onClick={() => updateForm({ service: key })}
                    className={`p-4 rounded-xl border-2 text-center transition-all ${form.service === key ? 'border-primary bg-primary/5' : 'border-border hover:border-secondary'}`}>
                    <span className="text-2xl block mb-2">{emoji}</span>
                    <span className="text-sm font-medium">{key}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ===== STEP 1: AI SCAN ===== */}
        {step === 1 && (
          <div className="space-y-6">
            <div className="text-center">
              <Sparkles className="w-12 h-12 text-primary mx-auto mb-2" />
              <h2 className="text-xl font-bold font-display">AI Document Scan</h2>
              <p className="text-sm text-muted-foreground mt-1">Upload or capture passport, Emirates ID, visa, or any client document. AI will auto-fill the form.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <button onClick={() => triggerScan(false)} disabled={scanning}
                className="p-6 rounded-xl border-2 border-dashed border-border hover:border-primary hover:bg-primary/5 transition-all disabled:opacity-50 flex flex-col items-center gap-2">
                <Upload className="w-8 h-8 text-primary" />
                <span className="font-semibold">Upload Photo(s)</span>
                <span className="text-xs text-muted-foreground">Select multiple from device</span>
              </button>
              <button onClick={() => triggerScan(true)} disabled={scanning}
                className="p-6 rounded-xl border-2 border-dashed border-border hover:border-primary hover:bg-primary/5 transition-all disabled:opacity-50 flex flex-col items-center gap-2">
                <Camera className="w-8 h-8 text-primary" />
                <span className="font-semibold">Open Camera</span>
                <span className="text-xs text-muted-foreground">Capture document directly</span>
              </button>
            </div>

            {scanning && (
              <div className="flex items-center justify-center gap-3 p-4 bg-primary/5 border border-primary/20 rounded-xl">
                <Loader2 className="w-5 h-5 animate-spin text-primary" />
                <span className="text-sm text-primary font-medium">AI is reading your documents…</span>
              </div>
            )}

            {form.documents.length > 0 && (
              <div>
                <p className="text-sm font-semibold mb-2">{form.documents.length} document(s) scanned</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                  {form.documents.map(d => {
                    const src = d.base64?.replace('NAWI_ENC::', '');
                    return (
                      <div key={d.id} className="relative border border-border rounded-lg overflow-hidden">
                        {d.fileType?.startsWith('image/') ? (
                          <img src={src} alt={d.name} className="w-full h-20 object-cover" />
                        ) : (
                          <div className="w-full h-20 bg-muted flex items-center justify-center"><FileText className="w-8 h-8 text-muted-foreground" /></div>
                        )}
                        {d.ocrExtracted && (
                          <span className="absolute top-1 right-1 bg-success text-success-foreground rounded-full p-0.5"><Check className="w-3 h-3" /></span>
                        )}
                        <p className="text-[10px] truncate p-1 bg-card">{d.name}</p>
                      </div>
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground mt-2">You can review and edit auto-filled fields in the next step.</p>
              </div>
            )}

            <p className="text-center text-xs text-muted-foreground">
              No document handy? Click <strong>Skip</strong> below and fill the form manually.
            </p>
          </div>
        )}

        {/* ===== STEP 2: PERSONAL DETAILS ===== */}
        {step === 2 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-bold font-display">Personal Details</h2>
              <p className="text-sm text-muted-foreground">Review the auto-filled information and complete missing fields.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div><label className="block text-sm font-medium mb-1">Full Name *</label><input value={form.name} onChange={e => updateForm({ name: e.target.value })} className="input-nawi" required /></div>
              <div><label className="block text-sm font-medium mb-1">Mobile *</label><input value={form.mobile} onChange={e => updateForm({ mobile: e.target.value })} className="input-nawi" required /></div>
              <div><label className="block text-sm font-medium mb-1">Email</label><input type="email" value={form.email} onChange={e => updateForm({ email: e.target.value })} className="input-nawi" /></div>
              <div><label className="block text-sm font-medium mb-1">Nationality</label><input value={form.nationality} onChange={e => updateForm({ nationality: e.target.value })} className="input-nawi" /></div>
              <div><label className="block text-sm font-medium mb-1">Passport Number</label><input value={form.passportNo} onChange={e => updateForm({ passportNo: e.target.value })} className="input-nawi" /></div>
              <div><label className="block text-sm font-medium mb-1">Service</label><input value={form.service} disabled className="input-nawi bg-muted" /></div>
              <div className="md:col-span-2"><label className="block text-sm font-medium mb-1">Notes</label><textarea value={form.notes} onChange={e => updateForm({ notes: e.target.value })} className="input-nawi" rows={3} placeholder="Any other relevant info..." /></div>
            </div>
          </div>
        )}

        {/* ===== STEP 3: DOCS & DATES ===== */}
        {step === 3 && (
          <div className="space-y-8">
            <DocumentsSection
              docs={form.documents}
              onAdd={addManualDoc}
              onRemove={removeDoc}
              onRename={renameDoc}
            />
            <DatesSection
              dates={form.importantDates}
              onAdd={addDate}
              onRemove={removeDate}
              onUpdate={updateDate}
            />
          </div>
        )}

        {/* ===== STEP 4: REVIEW ===== */}
        {step === 4 && (
          <div className="space-y-5">
            <h2 className="text-lg font-bold font-display">Review & Submit</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase">Client</h3>
                {[['Name', form.name], ['Mobile', form.mobile], ['Email', form.email], ['Nationality', form.nationality], ['Passport', form.passportNo], ['Type', form.clientType], ['Company', form.companyName], ['Lead Source', form.leadSource]].map(([l, v]) => v ? (
                  <div key={l} className="flex justify-between text-sm"><span className="text-muted-foreground">{l}</span><span className="font-medium">{v}</span></div>
                ) : null)}
              </div>
              <div className="space-y-2">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase">Service</h3>
                <div className="flex justify-between text-sm"><span className="text-muted-foreground">Service</span><span className="font-medium">{form.service}</span></div>
                <div className="flex justify-between text-sm"><span className="text-muted-foreground">Documents</span><span className="font-medium">{form.documents.length} files</span></div>
                <div className="flex justify-between text-sm"><span className="text-muted-foreground">Important Dates</span><span className="font-medium">{form.importantDates.filter(d => d.name && d.date).length} dates</span></div>
              </div>
            </div>
            {form.importantDates.filter(d => d.name && d.date).length > 0 && (
              <div className="border-t border-border pt-3">
                <p className="text-xs font-semibold mb-2">📅 Dates</p>
                <div className="flex flex-wrap gap-2">
                  {form.importantDates.filter(d => d.name && d.date).map(d => (
                    <span key={d.id} className="text-xs bg-primary/10 text-primary px-2 py-1 rounded-full">{d.name}: {formatDate(d.date)}</span>
                  ))}
                </div>
              </div>
            )}
            {form.documents.length > 0 && (
              <div className="border-t border-border pt-3">
                <p className="text-xs font-semibold mb-2">📎 Documents</p>
                <div className="flex flex-wrap gap-2">
                  {form.documents.map(d => (
                    <span key={d.id} className="text-xs bg-success/10 text-success px-2 py-1 rounded-full">{d.name}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex justify-between pt-6 border-t border-border mt-6">
          <button onClick={() => step > 0 ? setStep(step - 1) : navigate(`${basePath}/clients`)} className="btn-outline" disabled={submitting}>
            <ChevronLeft className="w-4 h-4" /> {step === 0 ? 'Cancel' : 'Back'}
          </button>
          {step < steps.length - 1 ? (
            <div className="flex gap-2">
              {step === 1 && (
                <button onClick={() => setStep(2)} className="btn-outline">Skip</button>
              )}
              <button onClick={() => setStep(step + 1)} disabled={!canProceed()} className="btn-primary disabled:opacity-50">
                Next <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button onClick={handleSubmit} className="btn-primary" disabled={submitting}>
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Create Client
            </button>
          )}
        </div>
      </div>

      {showWelcome && createdClientId && (
        <WhatsAppTemplateModal
          open
          onClose={() => { setShowWelcome(null); navigate(`${basePath}/clients/${createdClientId}`); }}
          mobile={showWelcome.mobile}
          defaultMessage={buildWelcomeMessage(showWelcome.name, showWelcome.service)}
          title="Send Welcome Message"
        />
      )}
    </div>
  );
}

// ===================== Documents Section =====================
function DocumentsSection({
  docs, onAdd, onRemove, onRename,
}: {
  docs: DocEntry[];
  onAdd: (file: File, name: string) => void;
  onRemove: (id: string) => void;
  onRename: (id: string, name: string) => void;
}) {
  const [pendingName, setPendingName] = useState('');

  const triggerUpload = (camera: boolean) => {
    if (!pendingName.trim()) {
      toast.error('Enter a document name first');
      return;
    }
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,.pdf';
    input.multiple = true;
    if (camera) input.setAttribute('capture', 'environment');
    input.onchange = (e: any) => {
      const files = Array.from((e.target as HTMLInputElement).files || []) as File[];
      files.forEach((file, i) => onAdd(file, files.length > 1 ? `${pendingName} (${i + 1})` : pendingName));
      setPendingName('');
    };
    input.click();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-base font-semibold font-display">📎 Documents</h3>
        <span className="text-xs text-muted-foreground">{docs.length} uploaded</span>
      </div>
      <p className="text-xs text-muted-foreground mb-3">Add any document. Give it a name (e.g. "Passport Copy") and upload one or more images. Same format works for all 8 services.</p>

      <div className="card-nawi bg-muted/30 space-y-3">
        <input
          type="text"
          value={pendingName}
          onChange={e => setPendingName(e.target.value)}
          placeholder="Document name (e.g. Passport, Emirates ID, Visa, Booking Voucher...)"
          className="input-nawi"
        />
        <div className="flex gap-2">
          <button type="button" onClick={() => triggerUpload(false)} className="btn-outline flex-1"><Upload className="w-4 h-4" /> Upload File(s)</button>
          <button type="button" onClick={() => triggerUpload(true)} className="btn-outline flex-1"><Camera className="w-4 h-4" /> Take Photo</button>
        </div>
      </div>

      {docs.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-4">
          {docs.map(d => {
            const src = d.base64?.replace('NAWI_ENC::', '');
            const isImg = d.fileType?.startsWith('image/');
            return (
              <div key={d.id} className="border border-border rounded-lg overflow-hidden bg-card">
                {isImg && src ? (
                  <a href={src} target="_blank" rel="noopener noreferrer">
                    <img src={src} alt={d.name} className="w-full h-32 object-cover hover:opacity-90 transition-opacity" />
                  </a>
                ) : (
                  <div className="w-full h-32 bg-muted flex items-center justify-center"><FileText className="w-12 h-12 text-muted-foreground" /></div>
                )}
                <div className="p-2 space-y-1">
                  <input value={d.name} onChange={e => onRename(d.id, e.target.value)} className="input-nawi text-xs py-1 font-medium" />
                  <p className="text-[10px] text-muted-foreground truncate">{d.fileName}</p>
                  <button onClick={() => onRemove(d.id)} className="text-xs text-destructive hover:underline flex items-center gap-1">
                    <Trash2 className="w-3 h-3" /> Remove
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ===================== Dates Section =====================
function DatesSection({
  dates, onAdd, onRemove, onUpdate,
}: {
  dates: DateEntry[];
  onAdd: (name?: string, date?: string) => void;
  onRemove: (id: string) => void;
  onUpdate: (id: string, changes: Partial<DateEntry>) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-base font-semibold font-display">📅 Important Dates</h3>
        <span className="text-xs text-muted-foreground">{dates.length} added</span>
      </div>
      <p className="text-xs text-muted-foreground mb-3">Add any date with a custom name (Travel Date, Passport Expiry, Birthday…). Same format for all services. Reminders trigger automatically.</p>

      <button type="button" onClick={() => onAdd('', '')} className="btn-outline text-sm mb-3">
        <Plus className="w-4 h-4" /> Add Date
      </button>

      {dates.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6 border border-dashed border-border rounded-lg">No dates added yet</p>
      ) : (
        <div className="space-y-2">
          {dates.map(d => (
            <div key={d.id} className="grid grid-cols-12 gap-2 items-center">
              <input value={d.name} onChange={e => onUpdate(d.id, { name: e.target.value })} placeholder="Date name (e.g. Passport Expiry)" className="input-nawi col-span-6" />
              <input type="date" value={d.date} onChange={e => onUpdate(d.id, { date: e.target.value })} className="input-nawi col-span-5" />
              <button onClick={() => onRemove(d.id)} className="text-destructive p-2 hover:bg-destructive/10 rounded-lg col-span-1 flex justify-center"><Trash2 className="w-4 h-4" /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
