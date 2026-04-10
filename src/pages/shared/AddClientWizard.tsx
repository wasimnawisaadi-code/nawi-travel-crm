import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Check, ChevronLeft, ChevronRight, Upload, AlertTriangle, FileUp, X, Users, Plus, Trash2, Search, Link2, History, Calendar, Loader2, Sparkles } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/integrations/supabase/client';
import { generateDisplayId, auditLog, formatDate } from '@/lib/supabase-service';
import Papa from 'papaparse';
import { toast } from 'sonner';

const SERVICES = [
  { key: 'Air Ticket', emoji: '✈️' },
  { key: 'UAE Visa', emoji: '🪪', subcategories: ['Tourist Visa', 'Visit Visa', 'Transit Visa', 'Family Visa', 'Extension', 'Status Change', 'Visa Cancellation', 'Abscond'] },
  { key: 'Global Visa', emoji: '🌍', subcategories: ['Tourist', 'Business', 'Transit', 'Medical'], visaMode: true },
  { key: 'Holiday Package', emoji: '🏝️' },
  { key: 'Travel Insurance', emoji: '🛡️' },
  { key: 'Pilgrimage', emoji: '🕌' },
  { key: 'Meet & Assist', emoji: '🤝' },
  { key: 'Hotel Booking', emoji: '🏨' },
];

const LEAD_SOURCES = ['Walk-in', 'Call', 'WhatsApp', 'Social Media', 'Reference', 'Website', 'B2B Partner'];

const DOC_REQUIREMENTS: Record<string, Record<string, string[]>> = {
  'Air Ticket': { default: ['Passport Copy'] },
  'UAE Visa': {
    'Tourist Visa': ['Passport', 'Photo', 'Flight Ticket'],
    'Visit Visa': ['Passport', 'Photo', 'Sponsor Passport', 'Sponsor Visa'],
    'Family Visa': ['Passport', 'Photo', 'Sponsor Passport', 'Sponsor Visa', 'Sponsor Emirates ID', 'Marriage Certificate', 'Salary Certificate'],
    'Abscond': ['Passport', 'Photo', 'Current Visa Copy', 'Emirates ID', 'Police Report'],
    'Extension': ['Passport', 'Current Visa Copy', 'Emirates ID'],
    'Status Change': ['Passport', 'Current Visa Copy', 'Emirates ID', 'New Offer Letter'],
    'Visa Cancellation': ['Passport', 'Emirates ID', 'Current Visa Copy'],
    default: ['Passport', 'Photo'],
  },
  'Global Visa': {
    Employed: ['Passport', 'Photo', 'Emirates ID', 'Bank Statement (6 months)', 'NOC Letter', 'Salary Certificate', 'Travel Insurance'],
    'Self-Employed': ['Passport', 'Photo', 'Emirates ID', 'Bank Statement (6 months)', 'Trade License', 'Company Profile'],
    Unemployed: ['Passport', 'Photo', 'Sponsor Passport', 'Sponsor Bank Statement', 'Sponsor Letter', 'Relationship Proof'],
    default: ['Passport', 'Photo'],
  },
  'Holiday Package': { default: ['Passport Copy'] },
  'Travel Insurance': { default: ['Passport Copy'] },
  'Pilgrimage': { default: ['Passport', 'Photo', 'Vaccination Certificate'] },
  'Meet & Assist': { default: ['Passport Copy'] },
  'Hotel Booking': { default: [] },
};

interface FamilyMember {
  name: string; relation: string; dob: string; passportNo: string; passportExpiry: string; nationality: string; documents: any[];
}

export default function AddClientWizard() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const existingClientId = searchParams.get('existingClient');
  const { user, profile, isAdmin } = useAuth();
  const [step, setStep] = useState(0);
  const [ocrLoading, setOcrLoading] = useState<string | null>(null);
  const [ocrResults, setOcrResults] = useState<Record<string, any>>({});
  const [duplicates, setDuplicates] = useState<any[]>([]);
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const [bulkData, setBulkData] = useState<any[]>([]);
  const [bulkErrors, setBulkErrors] = useState<string[]>([]);
  const [existingClient, setExistingClient] = useState<any>(null);
  const [addingNewService, setAddingNewService] = useState(false);
  const [clientSearch, setClientSearch] = useState('');
  const [showClientPicker, setShowClientPicker] = useState(false);
  const [searchedClients, setSearchedClients] = useState<any[]>([]);
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;
  });
  const basePath = isAdmin ? '/admin' : '/employee';

  const [form, setForm] = useState({
    name: '', mobile: '', email: '', passportNo: '',
    clientType: '', companyName: '', companyNumber: '', paymentType: '',
    service: '', serviceSubcategory: '', leadSource: '', nationality: '', dob: '',
    serviceDetails: {} as Record<string, string>,
    documents: [] as any[],
    importantDates: { dob: '', passportExpiry: '', visaExpiry: '', travelDate: '', weddingAnniversary: '', emiratesIdExpiry: '', medicalExpiry: '', contractEndDate: '' } as Record<string, string>,
    familyMembers: [] as FamilyMember[],
  });

  useEffect(() => {
    if (existingClientId) {
      supabase.from('clients').select('*').eq('id', existingClientId).single().then(({ data }) => {
        if (data) {
          setExistingClient(data);
          setAddingNewService(true);
          const dates = (data.important_dates || {}) as Record<string, string>;
          setForm(prev => ({
            ...prev, name: data.name, mobile: data.mobile, email: data.email || '',
            passportNo: dates.passportNo || data.passport_no || '',
            clientType: data.client_type || '', companyName: data.company_name || '', companyNumber: data.company_number || '',
            nationality: data.nationality || '', dob: dates.dob || '',
            leadSource: data.lead_source || '', importantDates: dates as any,
            familyMembers: (data.family_members as unknown as FamilyMember[]) || [],
          }));
          setStep(0);
        }
      });
    }
  }, [existingClientId]);

  const updateForm = (changes: any) => setForm(prev => ({ ...prev, ...changes }));
  const updateSD = (key: string, val: string) => setForm(prev => ({ ...prev, serviceDetails: { ...prev.serviceDetails, [key]: val } }));

  // Duplicate check
  useEffect(() => {
    if (addingNewService) return;
    if (!form.name && !form.mobile && !form.passportNo) { setDuplicates([]); return; }
    const timer = setTimeout(async () => {
      let query = supabase.from('clients').select('id, name, mobile, passport_no, display_id, service');
      const conditions: string[] = [];
      if (form.name.length >= 3) conditions.push(`name.ilike.%${form.name}%`);
      if (form.mobile.length >= 5) conditions.push(`mobile.eq.${form.mobile}`);
      if (conditions.length === 0) { setDuplicates([]); return; }
      const { data } = await query.or(conditions.join(','));
      setDuplicates(data || []);
    }, 500);
    return () => clearTimeout(timer);
  }, [form.name, form.mobile, form.passportNo, addingNewService]);

  // Client search
  useEffect(() => {
    if (!clientSearch || clientSearch.length < 2) { setSearchedClients([]); return; }
    const timer = setTimeout(async () => {
      const q = clientSearch.toLowerCase();
      const { data } = await supabase.from('clients').select('id, name, mobile, display_id, service').or(`name.ilike.%${q}%,mobile.ilike.%${q}%,display_id.ilike.%${q}%`).limit(8);
      setSearchedClients(data || []);
    }, 300);
    return () => clearTimeout(timer);
  }, [clientSearch]);

  const linkToExistingClient = (c: any) => {
    navigate(`${basePath}/clients/new?existingClient=${c.id}`);
    setShowClientPicker(false);
    setClientSearch('');
  };

  const getRequiredDocs = () => {
    const reqs = DOC_REQUIREMENTS[form.service];
    if (!reqs) return [];
    if (form.serviceSubcategory && reqs[form.serviceSubcategory]) return reqs[form.serviceSubcategory];
    const sd = form.serviceDetails;
    if (form.service === 'UAE Visa') return reqs[sd.applicationType || 'default'] || reqs.default || [];
    if (form.service === 'Global Visa') return reqs[sd.applicantType || 'Employed'] || reqs.default || [];
    return reqs.default || [];
  };

  const handleDocUpload = async (docType: string, file: File) => {
    const reader = new FileReader();
    reader.onload = async () => {
      const base64Data = reader.result as string;
      const docEntry = { name: file.name, type: file.type, docType, base64: `NAWI_ENC::${base64Data}`, uploadedAt: new Date().toISOString(), ocrExtracted: false };
      updateForm({ documents: [...form.documents, docEntry] });

      // Run OCR extraction for images
      const isImage = file.type.startsWith('image/');
      if (isImage) {
        setOcrLoading(docType);
        try {
          const { data, error } = await supabase.functions.invoke('extract-document', {
            body: { imageBase64: base64Data, docType, service: form.service, serviceSubcategory: form.serviceSubcategory },
          });
          if (error) throw error;
          if (data?.success && data.data) {
            const extracted = data.data;
            setOcrResults(prev => ({ ...prev, [docType]: extracted }));

            // Auto-fill form fields from OCR
            const updates: any = {};
            if (extracted.fullName && !form.name) updates.name = extracted.fullName;
            if (extracted.passportNo && !form.passportNo) updates.passportNo = extracted.passportNo;
            if (extracted.nationality && !form.nationality) updates.nationality = extracted.nationality;

            const dateUpdates: any = { ...form.importantDates };
            if (extracted.dateOfBirth && !form.dob) { updates.dob = extracted.dateOfBirth; dateUpdates.dob = extracted.dateOfBirth; }
            if (extracted.passportExpiry) dateUpdates.passportExpiry = extracted.passportExpiry;
            if (extracted.visaExpiry) dateUpdates.visaExpiry = extracted.visaExpiry;
            updates.importantDates = dateUpdates;

            // Auto-fill service details
            const sdUpdates: any = { ...form.serviceDetails };
            if (extracted.gender) sdUpdates.gender = extracted.gender;
            if (extracted.profession) sdUpdates.profession = extracted.profession;
            if (extracted.placeOfBirth) sdUpdates.placeOfBirth = extracted.placeOfBirth;
            if (extracted.emiratesId) sdUpdates.emiratesId = extracted.emiratesId;
            if (extracted.sponsor) sdUpdates.sponsor = extracted.sponsor;
            if (extracted.visaType) sdUpdates.visaType = extracted.visaType;
            if (extracted.visaNumber) sdUpdates.visaNumber = extracted.visaNumber;
            updates.serviceDetails = sdUpdates;

            // Mark doc as OCR extracted
            const updatedDocs = [...form.documents];
            const lastIdx = updatedDocs.length - 1;
            if (lastIdx >= 0) updatedDocs[lastIdx] = { ...updatedDocs[lastIdx], ocrExtracted: true };
            updates.documents = updatedDocs;

            updateForm(updates);
            toast.success(`✨ AI extracted data from ${docType}. Review auto-filled fields.`);
          }
        } catch (err: any) {
          console.error('OCR extraction failed:', err);
          toast.error('Could not extract data from document. Fill fields manually.');
        }
        setOcrLoading(null);
      }
    };
    reader.readAsDataURL(file);
  };

  const addFamilyMember = () => {
    updateForm({ familyMembers: [...form.familyMembers, { name: '', relation: '', dob: '', passportNo: '', passportExpiry: '', nationality: form.nationality, documents: [] }] });
  };
  const updateFamilyMember = (index: number, changes: Partial<FamilyMember>) => {
    const updated = [...form.familyMembers];
    updated[index] = { ...updated[index], ...changes };
    updateForm({ familyMembers: updated });
  };
  const removeFamilyMember = (index: number) => updateForm({ familyMembers: form.familyMembers.filter((_, i) => i !== index) });

  const handleSubmit = async () => {
    if (!user) return;

    if (addingNewService && existingClient) {
      const svcDisplayId = await generateDisplayId('SVC');
      await supabase.from('client_services').insert({
        display_id: svcDisplayId, client_id: existingClient.id, service: form.service,
        service_subcategory: form.serviceSubcategory || null, service_details: form.serviceDetails as any,
        documents: form.documents as any, family_members: form.familyMembers as any,
        status: 'New' as const, request_month: selectedMonth, created_by: user.id,
      });
      const updatedDates = { ...(existingClient.important_dates || {}), ...form.importantDates };
      await supabase.from('clients').update({
        service: form.service, service_subcategory: form.serviceSubcategory || null,
        service_details: form.serviceDetails as any,
        documents: [...((existingClient.documents || []) as any[]), ...form.documents] as any,
        important_dates: updatedDates as any,
        family_members: form.familyMembers.length > 0 ? form.familyMembers as any : existingClient.family_members,
      }).eq('id', existingClient.id);
      await auditLog('service_added', 'client', existingClient.id, { service: form.service, month: selectedMonth });
      navigate(`${basePath}/clients/${existingClient.id}`);
      return;
    }

    const displayId = await generateDisplayId('CLT');
    const svcDisplayId = await generateDisplayId('SVC');
    const { data: newClient } = await supabase.from('clients').insert({
      display_id: displayId, name: form.name, mobile: form.mobile, email: form.email || null,
      passport_no: form.passportNo || null, client_type: form.clientType || null,
      company_name: form.companyName || null, company_number: form.companyNumber || null,
      payment_type: form.paymentType || null, service: form.service,
      service_subcategory: form.serviceSubcategory || null, lead_source: form.leadSource || null,
      nationality: form.nationality || null, service_details: form.serviceDetails as any,
      documents: form.documents as any,
      important_dates: { ...form.importantDates, dob: form.dob || form.importantDates.dob, passportNo: form.passportNo } as any,
      family_members: form.familyMembers as any, status: 'New' as const,
      assigned_to: user.id, created_by: user.id,
    }).select('id').single();

    if (newClient) {
      await supabase.from('client_services').insert({
        display_id: svcDisplayId, client_id: newClient.id, service: form.service,
        service_subcategory: form.serviceSubcategory || null, service_details: form.serviceDetails as any,
        documents: form.documents as any, family_members: form.familyMembers as any,
        status: 'New' as const, request_month: selectedMonth, created_by: user.id,
      });
      await auditLog('client_created', 'client', newClient.id, { name: form.name, service: form.service, month: selectedMonth });
      navigate(`${basePath}/clients/${newClient.id}`);
    }
  };

  const handleBulkFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    Papa.parse(file, {
      header: true,
      complete: (results) => {
        const errors: string[] = [];
        const valid = results.data.filter((row: any, i: number) => {
          if (!row.name || !row.mobile) { errors.push(`Row ${i + 1}: Missing name or mobile`); return false; }
          return true;
        });
        setBulkData(valid);
        setBulkErrors(errors);
      },
    });
  };

  const handleBulkImport = async () => {
    if (!user) return;
    let created = 0;
    for (const row of bulkData) {
      const displayId = await generateDisplayId('CLT');
      const svcDisplayId = await generateDisplayId('SVC');
      const { data: newClient } = await supabase.from('clients').insert({
        display_id: displayId, name: row.name, mobile: row.mobile, email: row.email || null,
        passport_no: row.passportNo || null, client_type: form.clientType || 'Individual',
        service: form.service, service_subcategory: form.serviceSubcategory || null,
        lead_source: form.leadSource || 'Bulk Upload', nationality: row.nationality || null,
        service_details: row as any, documents: [] as any,
        important_dates: { passportExpiry: row.passportExpiry || '', travelDate: row.travelDate || '', dob: row.dob || '', passportNo: row.passportNo || '' } as any,
        family_members: [] as any, status: 'New' as const,
        assigned_to: user.id, created_by: user.id,
      }).select('id').single();

      if (newClient) {
        await supabase.from('client_services').insert({
          display_id: svcDisplayId, client_id: newClient.id, service: form.service,
          service_subcategory: form.serviceSubcategory || null, service_details: row as any,
          status: 'New' as const, request_month: selectedMonth, created_by: user.id,
        });
        created++;
      }
    }
    alert(`${created} new clients created.`);
    navigate(`${basePath}/clients`);
  };

  const downloadTemplate = () => {
    const templateHeaders: Record<string, string> = {
      'Air Ticket': 'name,mobile,email,passportNo,nationality,travelDate,departureCity,arrivalCity,flightNumber,returnDate,dob,passportExpiry',
      'UAE Visa': 'name,mobile,email,passportNo,nationality,visaType,applicationType,entryType,dob,passportExpiry',
      'Global Visa': 'name,mobile,email,passportNo,nationality,country,applicantType,dob,passportExpiry',
      default: 'name,mobile,email,passportNo,nationality',
    };
    const headers = templateHeaders[form.service] || templateHeaders.default;
    const blob = new Blob([headers], { type: 'text/csv' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${form.service.replace(/\s/g, '_')}_template.csv`;
    link.click();
  };

  const Field = ({ label, k, type = 'text', required = false }: { label: string; k: string; type?: string; required?: boolean }) => (
    <div>
      <label className="block text-sm font-medium mb-1">{label} {required && <span className="text-destructive">*</span>}</label>
      <input type={type} value={form.serviceDetails[k] || ''} onChange={(e) => updateSD(k, e.target.value)} className="input-nawi" />
    </div>
  );
  const SelectField = ({ label, k, options }: { label: string; k: string; options: string[] }) => (
    <div>
      <label className="block text-sm font-medium mb-1">{label}</label>
      <select value={form.serviceDetails[k] || ''} onChange={(e) => updateSD(k, e.target.value)} className="input-nawi">
        <option value="">Select</option>
        {options.map(o => <option key={o}>{o}</option>)}
      </select>
    </div>
  );

  const selectedServiceObj = SERVICES.find(s => s.key === form.service);
  const hasSubcategories = selectedServiceObj && 'subcategories' in selectedServiceObj;
  const isFamilyService = form.serviceSubcategory === 'Family Visa' || form.service === 'Holiday Package';

  const steps = addingNewService
    ? ['Select Service', 'Service Details', 'Documents & Dates', 'Review']
    : ['Type & Service', 'Client Details', 'Documents & Dates', 'Review'];

  const canProceedStep0 = addingNewService
    ? (form.service && (!hasSubcategories || form.serviceSubcategory))
    : (form.clientType && form.leadSource && form.service && (!hasSubcategories || form.serviceSubcategory));
  const canProceedStep1 = form.name && form.mobile;

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
      {!addingNewService && step === 0 && (
        <div className="card-nawi bg-secondary/5 border-secondary/20">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold flex items-center gap-2"><Link2 className="w-4 h-4 text-secondary" /> Returning Client?</h3>
            <button onClick={() => setShowClientPicker(!showClientPicker)} className="btn-outline text-xs">
              {showClientPicker ? 'New Client' : 'Search Existing'}
            </button>
          </div>
          {showClientPicker && (
            <div className="space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input value={clientSearch} onChange={e => setClientSearch(e.target.value)} className="input-nawi pl-9" placeholder="Search by name, mobile, ID..." />
              </div>
              {searchedClients.length > 0 && (
                <div className="border border-border rounded-xl overflow-hidden divide-y divide-border max-h-64 overflow-y-auto">
                  {searchedClients.map((c: any) => (
                    <button key={c.id} onClick={() => linkToExistingClient(c)}
                      className="w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">{c.name}</p>
                        <p className="text-xs text-muted-foreground">{c.display_id} • {c.mobile} • {c.service || 'N/A'}</p>
                      </div>
                      <Plus className="w-4 h-4 text-secondary" />
                    </button>
                  ))}
                </div>
              )}
              {clientSearch.length >= 2 && searchedClients.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-3">No matching clients. Continue below to add new.</p>
              )}
            </div>
          )}
        </div>
      )}

      {addingNewService && existingClient && (
        <div className="card-nawi bg-secondary/5 border-secondary/20">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-secondary/10 flex items-center justify-center text-secondary font-bold text-lg">
              {existingClient.name?.charAt(0)}
            </div>
            <div className="flex-1">
              <p className="font-semibold text-foreground">{existingClient.name}</p>
              <p className="text-xs text-muted-foreground">{existingClient.display_id} • {existingClient.mobile}</p>
            </div>
          </div>
        </div>
      )}

      <div className="card-nawi flex items-center gap-4">
        <Calendar className="w-5 h-5 text-primary" />
        <div>
          <label className="block text-xs text-muted-foreground">Request Month</label>
          <input type="month" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} className="input-nawi w-auto text-sm mt-0.5" />
        </div>
        <p className="text-xs text-muted-foreground flex-1">All service requests are tracked by month for reporting.</p>
      </div>

      <div className="card-nawi">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium">Step {step + 1} of {steps.length}</span>
          <span className="text-sm text-muted-foreground">{steps[step]}</span>
        </div>
        <div className="flex gap-1">
          {steps.map((_, i) => <div key={i} className={`h-1.5 flex-1 rounded-full transition-colors ${i <= step ? 'bg-primary' : 'bg-muted'}`} />)}
        </div>
      </div>

      {duplicates.length > 0 && step >= 1 && !addingNewService && (
        <div className="bg-warning/10 border border-warning/20 p-4 rounded-xl">
          <div className="flex items-center gap-2 mb-2"><AlertTriangle className="w-5 h-5 text-warning" /><span className="font-medium text-warning">⚠️ Possible Duplicate</span></div>
          {duplicates.slice(0, 3).map((d: any) => (
            <div key={d.id} className="flex items-center justify-between p-2 bg-card rounded-lg border border-border mb-1">
              <div>
                <span className="text-sm font-medium">{d.name}</span>
                <span className="text-xs text-muted-foreground ml-2">{d.mobile} • {d.display_id}</span>
              </div>
              <button onClick={() => navigate(`${basePath}/clients/new?existingClient=${d.id}`)} className="btn-outline text-xs"><Plus className="w-3 h-3" /> Add Service</button>
            </div>
          ))}
        </div>
      )}

      <div className="card-nawi">
        {step === 0 && (
          <div className="space-y-6">
            {!addingNewService && (
              <>
                <h2 className="text-lg font-bold font-display">1. Client Type</h2>
                <div className="grid grid-cols-3 gap-3">
                  {[{ key: 'Individual', icon: '👤', desc: 'Single person' }, { key: 'B2B', icon: '🏢', desc: 'Business partner' }, { key: 'Corporate', icon: '🏗️', desc: 'Company/Group' }].map(({ key, icon, desc }) => (
                    <button key={key} onClick={() => updateForm({ clientType: key })} className={`p-4 rounded-xl border-2 text-center transition-all ${form.clientType === key ? 'border-primary bg-primary/5' : 'border-border hover:border-secondary'}`}>
                      <span className="text-2xl block mb-1">{icon}</span><span className="text-sm font-medium">{key}</span>
                      <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
                    </button>
                  ))}
                </div>
                {(form.clientType === 'B2B' || form.clientType === 'Corporate') && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-border">
                    <div><label className="block text-sm font-medium mb-1">Company Name *</label><input value={form.companyName} onChange={(e) => updateForm({ companyName: e.target.value })} className="input-nawi" /></div>
                    <div><label className="block text-sm font-medium mb-1">Company Reg. No.</label><input value={form.companyNumber} onChange={(e) => updateForm({ companyNumber: e.target.value })} className="input-nawi" /></div>
                    <div><label className="block text-sm font-medium mb-1">Payment Type</label>
                      <div className="flex gap-3 mt-1">{['Cash', 'Credit'].map(t => <label key={t} className="flex items-center gap-2 cursor-pointer"><input type="radio" name="paymentType" value={t} checked={form.paymentType === t} onChange={(e) => updateForm({ paymentType: e.target.value })} className="w-4 h-4" /><span className="text-sm">{t}</span></label>)}</div>
                    </div>
                  </div>
                )}
                <h2 className="text-lg font-bold font-display pt-4">2. Lead Source</h2>
                <div className="flex flex-wrap gap-2">
                  {LEAD_SOURCES.map(s => (
                    <button key={s} onClick={() => updateForm({ leadSource: s })} className={`px-4 py-2 rounded-full text-sm font-medium border transition-colors ${form.leadSource === s ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:border-secondary'}`}>{s}</button>
                  ))}
                </div>
              </>
            )}

            <h2 className="text-lg font-bold font-display pt-4">{addingNewService ? 'Select New Service' : '3. Select Service'}</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {SERVICES.map(({ key, emoji }) => (
                <button key={key} onClick={() => updateForm({ service: key, serviceSubcategory: '', serviceDetails: {} })} className={`p-4 rounded-xl border-2 text-center transition-all ${form.service === key ? 'border-primary bg-primary/5' : 'border-border hover:border-secondary'}`}>
                  <span className="text-2xl block mb-2">{emoji}</span><span className="text-sm font-medium">{key}</span>
                </button>
              ))}
            </div>

            {hasSubcategories && form.service && (
              <div className="pt-4 border-t border-border">
                <h3 className="text-sm font-semibold mb-3">{form.service} — Select Type</h3>
                <div className="flex flex-wrap gap-2">
                  {(selectedServiceObj as any).subcategories.map((sub: string) => (
                    <button key={sub} onClick={() => updateForm({ serviceSubcategory: sub })}
                      className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${form.serviceSubcategory === sub ? 'bg-secondary text-secondary-foreground border-secondary' : 'border-border hover:border-secondary'}`}>
                      {sub}
                    </button>
                  ))}
                </div>
                {form.service === 'Global Visa' && form.serviceSubcategory && (
                  <div className="mt-4 border-t border-border pt-4">
                    <h4 className="text-sm font-semibold mb-3">Visa Processing Mode</h4>
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { key: 'eVisa', icon: '💻', title: 'eVisa', desc: 'Online application — processed digitally' },
                        { key: 'Sticker Visa', icon: '🏛️', title: 'Sticker Visa', desc: 'Direct embassy submission — physical stamp' },
                      ].map(({ key, icon, title, desc }) => (
                        <button key={key} onClick={() => updateSD('visaMode', key)}
                          className={`p-3 rounded-xl border-2 text-left transition-all ${form.serviceDetails.visaMode === key ? 'border-primary bg-primary/5' : 'border-border hover:border-secondary'}`}>
                          <span className="text-xl">{icon}</span>
                          <p className="text-sm font-medium mt-1">{title}</p>
                          <p className="text-xs text-muted-foreground">{desc}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {form.service && (!hasSubcategories || form.serviceSubcategory) && (
              <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                <FileUp className="w-5 h-5 text-secondary" />
                <span className="text-sm flex-1">Have multiple clients for {form.service}?</span>
                <button onClick={() => setShowBulkUpload(!showBulkUpload)} className="btn-outline text-xs">{showBulkUpload ? 'Manual Entry' : 'Bulk Upload'}</button>
              </div>
            )}

            {showBulkUpload && form.service && (
              <div className="space-y-4 border-t border-border pt-4">
                <div className="flex items-center gap-3">
                  <button onClick={downloadTemplate} className="btn-outline text-sm">Download {form.service} Template</button>
                </div>
                <div className="border-2 border-dashed border-border rounded-xl p-6 text-center">
                  <Upload className="w-6 h-6 text-muted-foreground mx-auto mb-2" />
                  <label className="btn-outline cursor-pointer text-sm">Upload CSV<input type="file" accept=".csv" className="hidden" onChange={handleBulkFile} /></label>
                </div>
                {bulkErrors.length > 0 && <div className="bg-destructive/10 p-3 rounded-lg">{bulkErrors.map((e, i) => <p key={i} className="text-xs text-destructive">{e}</p>)}</div>}
                {bulkData.length > 0 && (
                  <div>
                    <p className="text-sm font-medium mb-2">{bulkData.length} valid records</p>
                    <button onClick={handleBulkImport} className="btn-primary mt-3 w-full">Import {bulkData.length} Clients for {selectedMonth}</button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {step === 1 && (
          <div className="space-y-6">
            <h2 className="text-lg font-bold font-display">
              Client Information — {form.service}{form.serviceSubcategory ? ` (${form.serviceSubcategory})` : ''}
            </h2>
            {!addingNewService && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium mb-1">Full Name <span className="text-destructive">*</span></label><input value={form.name} onChange={(e) => updateForm({ name: e.target.value })} className="input-nawi" required /></div>
                <div><label className="block text-sm font-medium mb-1">Mobile <span className="text-destructive">*</span></label><input value={form.mobile} onChange={(e) => updateForm({ mobile: e.target.value })} className="input-nawi" required /></div>
                <div><label className="block text-sm font-medium mb-1">Email</label><input type="email" value={form.email} onChange={(e) => updateForm({ email: e.target.value })} className="input-nawi" /></div>
                <div><label className="block text-sm font-medium mb-1">Nationality</label><input value={form.nationality} onChange={(e) => updateForm({ nationality: e.target.value })} className="input-nawi" /></div>
                <div><label className="block text-sm font-medium mb-1">Date of Birth</label><input type="date" value={form.dob} onChange={(e) => updateForm({ dob: e.target.value })} className="input-nawi" /></div>
                <div><label className="block text-sm font-medium mb-1">Passport Number</label><input value={form.passportNo} onChange={(e) => updateForm({ passportNo: e.target.value })} className="input-nawi" /></div>
              </div>
            )}
            <div className={addingNewService ? '' : 'border-t border-border pt-4'}>
              <h3 className="text-base font-semibold font-display mb-4">{form.service} Details</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {form.service === 'Air Ticket' && <><Field label="Travel Date" k="travelDate" type="date" required /><Field label="Departure City" k="departureCity" required /><Field label="Arrival City" k="arrivalCity" required /><Field label="Flight Number" k="flightNumber" /><Field label="PNR" k="pnr" /><Field label="Return Date" k="returnDate" type="date" /><SelectField label="Class" k="travelClass" options={['Economy', 'Premium Economy', 'Business', 'First Class']} /></>}
                {form.service === 'UAE Visa' && <>
                  <SelectField label="Visa Type" k="visaType" options={['30 days', '60 days', '90 days', '1 Year', '2 Year', '5 Year', '10 Year Golden', 'Extension']} />
                  <SelectField label="Application Type" k="applicationType" options={['Inside UAE', 'Outside UAE']} />
                  <SelectField label="Entry Type" k="entryType" options={['Single', 'Multiple']} />
                  <Field label="Nationality" k="nationality" />
                  {form.serviceSubcategory === 'Family Visa' && <><Field label="Sponsor Name" k="sponsorName" required /><Field label="Sponsor UID" k="sponsorUid" /><Field label="Sponsor Salary" k="sponsorSalary" /></>}
                  {form.serviceSubcategory === 'Abscond' && <><Field label="Last Known Location" k="lastLocation" /><Field label="Abscond Date" k="abscondDate" type="date" /><Field label="Case Reference" k="caseReference" /></>}
                </>}
                {form.service === 'Global Visa' && <><Field label="Country" k="country" required /><SelectField label="Applicant Type" k="applicantType" options={['Employed', 'Self-Employed', 'Unemployed', 'Retired']} /><Field label="Travel Date" k="travelDate" type="date" /><Field label="Return Date" k="returnDate" type="date" />{form.serviceDetails.visaMode === 'eVisa' && <><Field label="Online Portal Reference" k="eVisaRef" /><Field label="Application URL" k="applicationUrl" /></>}{form.serviceDetails.visaMode === 'Sticker Visa' && <><Field label="Embassy Name" k="embassyName" /><Field label="Appointment Date" k="appointmentDate" type="date" /></>}</>}
                {form.service === 'Holiday Package' && <><Field label="Travel Date" k="travelDate" type="date" /><Field label="Return Date" k="returnDate" type="date" /><Field label="Adults" k="adults" /><Field label="Children" k="children" /><Field label="Destination" k="destination" /></>}
                {form.service === 'Travel Insurance' && <><Field label="Travel Date" k="travelDate" type="date" /><Field label="Return Date" k="returnDate" type="date" /><SelectField label="Coverage Type" k="coverageType" options={['Individual', 'Family', 'Group', 'Annual Multi-Trip']} /><Field label="Destination" k="destination" /></>}
                {form.service === 'Pilgrimage' && <><SelectField label="Type" k="pilgrimageType" options={['Hajj', 'Umrah']} /><Field label="Season/Year" k="season" /><Field label="Group Name" k="groupName" /><Field label="No. of Persons" k="persons" /></>}
                {form.service === 'Meet & Assist' && <><Field label="Flight Number" k="flightNumber" /><SelectField label="Type" k="maType" options={['Arrival', 'Departure', 'Transit']} /><Field label="Airport" k="airport" /><Field label="Date/Time" k="dateTime" type="datetime-local" /></>}
                {form.service === 'Hotel Booking' && <><Field label="Check-in" k="checkinDate" type="date" /><Field label="Check-out" k="checkoutDate" type="date" /><Field label="City" k="city" /><Field label="Rooms" k="rooms" /><SelectField label="Room Type" k="roomType" options={['Standard', 'Deluxe', 'Suite', 'Villa']} /></>}
              </div>
            </div>
            {isFamilyService && (
              <div className="border-t border-border pt-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-base font-semibold font-display flex items-center gap-2"><Users className="w-4 h-4" /> Family Members</h3>
                  <button onClick={addFamilyMember} className="btn-outline text-sm"><Plus className="w-4 h-4" /> Add Member</button>
                </div>
                {form.familyMembers.map((fm, i) => (
                  <div key={i} className="p-4 border border-border rounded-xl mb-3">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-semibold">Member {i + 1}</span>
                      <button onClick={() => removeFamilyMember(i)} className="text-muted-foreground hover:text-destructive"><Trash2 className="w-4 h-4" /></button>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      <div><label className="block text-xs font-medium mb-1">Full Name *</label><input value={fm.name} onChange={(e) => updateFamilyMember(i, { name: e.target.value })} className="input-nawi" /></div>
                      <div><label className="block text-xs font-medium mb-1">Relation *</label>
                        <select value={fm.relation} onChange={(e) => updateFamilyMember(i, { relation: e.target.value })} className="input-nawi">
                          <option value="">Select</option>
                          {['Spouse', 'Son', 'Daughter', 'Father', 'Mother', 'Brother', 'Sister'].map(r => <option key={r}>{r}</option>)}
                        </select>
                      </div>
                      <div><label className="block text-xs font-medium mb-1">DOB</label><input type="date" value={fm.dob} onChange={(e) => updateFamilyMember(i, { dob: e.target.value })} className="input-nawi" /></div>
                      <div><label className="block text-xs font-medium mb-1">Passport No.</label><input value={fm.passportNo} onChange={(e) => updateFamilyMember(i, { passportNo: e.target.value })} className="input-nawi" /></div>
                      <div><label className="block text-xs font-medium mb-1">Passport Expiry</label><input type="date" value={fm.passportExpiry} onChange={(e) => updateFamilyMember(i, { passportExpiry: e.target.value })} className="input-nawi" /></div>
                      <div><label className="block text-xs font-medium mb-1">Nationality</label><input value={fm.nationality} onChange={(e) => updateFamilyMember(i, { nationality: e.target.value })} className="input-nawi" /></div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <h2 className="text-lg font-bold font-display">Documents & Important Dates</h2>
            <div>
              <h3 className="text-sm font-semibold mb-3">Required Documents for {form.service}{form.serviceSubcategory ? ` (${form.serviceSubcategory})` : ''}</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {getRequiredDocs().map((doc: string) => {
                  const uploaded = form.documents.find(d => d.docType === doc);
                  return (
                    <div key={doc} className={`p-3 rounded-lg border ${uploaded ? 'border-success/30 bg-success/5' : 'border-border'}`}>
                      <div className="flex items-center justify-between">
                        <span className="text-sm">{doc} {uploaded && <Check className="w-4 h-4 text-success inline ml-1" />}</span>
                        <label className="btn-outline cursor-pointer text-xs py-1">
                          <Upload className="w-3 h-3" /> {uploaded ? 'Replace' : 'Upload'}
                          <input type="file" className="hidden" onChange={(e) => { if (e.target.files?.[0]) handleDocUpload(doc, e.target.files[0]); }} />
                        </label>
                      </div>
                      {uploaded && <p className="text-xs text-muted-foreground mt-1">{uploaded.name}</p>}
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="border-t border-border pt-4">
              <h3 className="text-sm font-semibold mb-3">Important Dates</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[
                  { key: 'dob', label: '🎂 Date of Birth' },
                  { key: 'passportExpiry', label: '📕 Passport Expiry' },
                  { key: 'visaExpiry', label: '🪪 Visa Expiry' },
                  { key: 'travelDate', label: '✈️ Travel Date' },
                  { key: 'weddingAnniversary', label: '💍 Wedding Anniversary' },
                  { key: 'emiratesIdExpiry', label: '🆔 Emirates ID Expiry' },
                  { key: 'medicalExpiry', label: '🏥 Medical Report Expiry' },
                  { key: 'contractEndDate', label: '📄 Contract End Date' },
                ].map(({ key, label }) => (
                  <div key={key}>
                    <label className="block text-sm font-medium mb-1">{label}</label>
                    <input type="date" value={form.importantDates[key] || ''} onChange={(e) => updateForm({ importantDates: { ...form.importantDates, [key]: e.target.value } })} className="input-nawi" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-6">
            <h2 className="text-lg font-bold font-display">Review & Submit</h2>
            {addingNewService && existingClient && (
              <div className="p-3 bg-secondary/5 border border-secondary/20 rounded-lg">
                <p className="text-sm font-medium text-secondary">Adding new "{form.service}" request to existing client: {existingClient.name}</p>
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Client</h3>
                <div className="space-y-1">
                  {[['Name', form.name], ['Mobile', form.mobile], ['Email', form.email], ['Nationality', form.nationality], ['Client Type', form.clientType], ['Lead Source', form.leadSource], ['Request Month', selectedMonth]].map(([l, v]) => v && (
                    <div key={l} className="flex justify-between text-sm"><span className="text-muted-foreground">{l}</span><span className="font-medium">{v}</span></div>
                  ))}
                </div>
              </div>
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Service</h3>
                <div className="space-y-1">
                  <div className="flex justify-between text-sm"><span className="text-muted-foreground">Service</span><span className="font-medium">{form.service}</span></div>
                  {form.serviceSubcategory && <div className="flex justify-between text-sm"><span className="text-muted-foreground">Type</span><span className="font-medium">{form.serviceSubcategory}</span></div>}
                  {Object.entries(form.serviceDetails).filter(([_, v]) => v).map(([k, v]) => (
                    <div key={k} className="flex justify-between text-sm"><span className="text-muted-foreground capitalize">{k.replace(/([A-Z])/g, ' $1')}</span><span className="font-medium">{v}</span></div>
                  ))}
                </div>
              </div>
            </div>
            {Object.entries(form.importantDates).filter(([_, v]) => v).length > 0 && (
              <div className="border-t border-border pt-4">
                <h3 className="text-sm font-semibold mb-2">📅 Important Dates</h3>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(form.importantDates).filter(([_, v]) => v).map(([k, v]) => (
                    <span key={k} className="text-xs bg-primary/10 text-primary px-2 py-1 rounded-full capitalize">
                      {k.replace(/([A-Z])/g, ' $1')}: {formatDate(v)}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {form.documents.length > 0 && (
              <div className="border-t border-border pt-4">
                <h3 className="text-sm font-semibold mb-2">📎 Documents ({form.documents.length})</h3>
                <div className="flex flex-wrap gap-2">
                  {form.documents.map((d, i) => (
                    <span key={i} className="text-xs bg-success/10 text-success px-2 py-1 rounded-full flex items-center gap-1"><Check className="w-3 h-3" />{d.docType || d.name}</span>
                  ))}
                </div>
              </div>
            )}
            {form.familyMembers.length > 0 && (
              <div className="border-t border-border pt-4">
                <h3 className="text-sm font-semibold mb-2">👨‍👩‍👧‍👦 Family Members ({form.familyMembers.length})</h3>
                {form.familyMembers.map((fm, i) => (
                  <p key={i} className="text-sm">{fm.name} ({fm.relation}) — {fm.passportNo || 'No passport'}</p>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex justify-between pt-6 border-t border-border">
          <button onClick={() => step > 0 ? setStep(step - 1) : navigate(`${basePath}/clients`)} className="btn-outline">
            <ChevronLeft className="w-4 h-4" /> {step === 0 ? 'Cancel' : 'Back'}
          </button>
          {step < steps.length - 1 ? (
            <button onClick={() => setStep(step + 1)} disabled={step === 0 ? !canProceedStep0 : step === 1 ? !canProceedStep1 : false}
              className="btn-primary disabled:opacity-50">
              Next <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button onClick={handleSubmit} className="btn-primary">
              <Check className="w-4 h-4" /> {addingNewService ? 'Add Service Request' : 'Create Client'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
