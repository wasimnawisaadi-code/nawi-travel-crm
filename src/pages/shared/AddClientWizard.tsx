import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Check, ChevronLeft, ChevronRight, Upload, AlertTriangle, FileUp, X, Users, Plus, Trash2, Search, Link2, History, Calendar } from 'lucide-react';
import { storage, KEYS, generateId, getCurrentUser, auditLog, isAdmin, formatDate } from '@/lib/storage';
import Papa from 'papaparse';

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
    'Employment Visa': ['Passport', 'Photo', 'Offer Letter', 'Medical Report'],
    'Freelancer Visa': ['Passport', 'Photo', 'Bank Statement', 'Business Plan'],
    'Business Visa': ['Passport', 'Photo', 'Trade License', 'Company Letter'],
    'Student Visa': ['Passport', 'Photo', 'Admission Letter', 'Sponsor Passport'],
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

const simulateOCR = (docType: string, fileName: string) => {
  const fields: Record<string, string> = {};
  if (docType.toLowerCase().includes('passport')) {
    fields.passportExtracted = 'Yes';
    fields.documentName = fileName;
  }
  if (docType.toLowerCase().includes('emirates')) {
    fields.emiratesIdExtracted = 'Yes';
  }
  return fields;
};

interface FamilyMember {
  name: string; relation: string; dob: string; passportNo: string; passportExpiry: string; nationality: string; documents: any[];
}

export default function AddClientWizard() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const existingClientId = searchParams.get('existingClient');
  const session = getCurrentUser();
  const [step, setStep] = useState(0);
  const [duplicates, setDuplicates] = useState<any[]>([]);
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const [bulkData, setBulkData] = useState<any[]>([]);
  const [bulkErrors, setBulkErrors] = useState<string[]>([]);
  const [ocrFields, setOcrFields] = useState<Record<string, string>>({});
  const [existingClient, setExistingClient] = useState<any>(null);
  const [addingNewService, setAddingNewService] = useState(false);
  const [clientSearch, setClientSearch] = useState('');
  const [showClientPicker, setShowClientPicker] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;
  });
  const basePath = isAdmin() ? '/admin' : '/employee';

  const [form, setForm] = useState({
    name: '', mobile: '', email: '', passportNo: '',
    clientType: '', companyName: '', companyNumber: '', paymentType: '',
    service: '', serviceSubcategory: '', leadSource: '', nationality: '', dob: '',
    serviceDetails: {} as Record<string, string>,
    documents: [] as any[],
    importantDates: { dob: '', passportExpiry: '', visaExpiry: '', travelDate: '', weddingAnniversary: '', emiratesIdExpiry: '', medicalExpiry: '', contractEndDate: '' } as Record<string, string>,
    familyMembers: [] as FamilyMember[],
    requestMonth: '',
  });

  // Load existing client
  useEffect(() => {
    if (existingClientId) {
      const c = storage.getAll(KEYS.CLIENTS).find((cl: any) => cl.id === existingClientId);
      if (c) {
        setExistingClient(c);
        setAddingNewService(true);
        setForm(prev => ({
          ...prev, name: c.name, mobile: c.mobile, email: c.email || '',
          passportNo: c.importantDates?.passportNo || c.passportNo || '',
          clientType: c.clientType, companyName: c.companyName || '', companyNumber: c.companyNumber || '',
          nationality: c.nationality || '', dob: c.importantDates?.dob || '',
          leadSource: c.leadSource || '', importantDates: c.importantDates || {},
          familyMembers: c.familyMembers || [],
        }));
        setStep(0);
      }
    }
  }, [existingClientId]);

  const updateForm = (changes: any) => setForm(prev => ({ ...prev, ...changes }));
  const updateSD = (key: string, val: string) => setForm(prev => ({ ...prev, serviceDetails: { ...prev.serviceDetails, [key]: val } }));

  // Duplicate check with debounce
  useEffect(() => {
    if (addingNewService) return;
    if (!form.name && !form.mobile && !form.passportNo) { setDuplicates([]); return; }
    const timer = setTimeout(() => {
      const clients = storage.getAll(KEYS.CLIENTS);
      const dupes = clients.filter((c: any) =>
        (form.name.length >= 3 && c.name?.toLowerCase() === form.name.toLowerCase()) ||
        (form.mobile.length >= 5 && c.mobile === form.mobile) ||
        (form.passportNo.length >= 4 && (c.importantDates?.passportNo === form.passportNo || c.passportNo === form.passportNo))
      );
      setDuplicates(dupes);
    }, 300);
    return () => clearTimeout(timer);
  }, [form.name, form.mobile, form.passportNo, addingNewService]);

  // Auto-extract dates from service details
  useEffect(() => {
    const sd = form.serviceDetails;
    const dates = { ...form.importantDates };
    if (sd.travelDate) dates.travelDate = sd.travelDate;
    if (sd.returnDate && !dates.travelDate) dates.travelDate = sd.returnDate;
    if (sd.checkinDate) dates.travelDate = sd.checkinDate;
    if (form.dob) dates.dob = form.dob;
    updateForm({ importantDates: dates });
  }, [form.serviceDetails.travelDate, form.serviceDetails.returnDate, form.serviceDetails.checkinDate, form.dob]);

  // Existing client search for "link to existing"
  const searchedClients = useMemo(() => {
    if (!clientSearch || clientSearch.length < 2) return [];
    const q = clientSearch.toLowerCase();
    return storage.getAll(KEYS.CLIENTS).filter((c: any) =>
      c.name?.toLowerCase().includes(q) || c.mobile?.includes(q) || c.id?.toLowerCase().includes(q) || c.passportNo?.toLowerCase().includes(q)
    ).slice(0, 8);
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

  const handleDocUpload = (docType: string, file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const ocr = simulateOCR(docType, file.name);
      setOcrFields(prev => ({ ...prev, ...ocr }));
      updateForm({ documents: [...form.documents, { name: file.name, type: file.type, docType, base64: `NAWI_ENC::${reader.result}`, uploadedAt: new Date().toISOString(), ocrExtracted: true }] });
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

  const handleSubmit = () => {
    const serviceEntry = {
      id: generateId('SVC'), service: form.service, serviceSubcategory: form.serviceSubcategory,
      serviceDetails: form.serviceDetails, documents: form.documents,
      familyMembers: form.familyMembers, status: 'New',
      requestMonth: selectedMonth, createdAt: new Date().toISOString(), createdBy: session?.userId || '',
    };

    if (addingNewService && existingClient) {
      const existingServices = existingClient.serviceHistory || [];
      // Check if same service same month - warn but allow
      const sameSvcSameMonth = existingServices.filter((s: any) => s.service === form.service && s.requestMonth === selectedMonth);
      if (sameSvcSameMonth.length > 0) {
        if (!confirm(`This client already has ${sameSvcSameMonth.length} "${form.service}" request(s) in ${selectedMonth}. Add another?`)) return;
      }
      const updatedDates = { ...existingClient.importantDates, ...form.importantDates };
      storage.update(KEYS.CLIENTS, existingClient.id, {
        service: form.service, serviceSubcategory: form.serviceSubcategory,
        serviceDetails: form.serviceDetails,
        serviceHistory: [...existingServices, serviceEntry],
        documents: [...(existingClient.documents || []), ...form.documents],
        importantDates: updatedDates,
        familyMembers: form.familyMembers.length > 0 ? form.familyMembers : existingClient.familyMembers,
        updatedAt: new Date().toISOString(),
      });
      auditLog('service_added', 'client', existingClient.id, { service: form.service, month: selectedMonth });
      navigate(`${basePath}/clients/${existingClient.id}`);
      return;
    }

    const id = generateId('CLT');
    const client = {
      id, name: form.name, mobile: form.mobile, email: form.email, passportNo: form.passportNo,
      clientType: form.clientType, companyName: form.companyName, companyNumber: form.companyNumber,
      paymentType: form.paymentType, service: form.service, serviceSubcategory: form.serviceSubcategory,
      leadSource: form.leadSource, nationality: form.nationality,
      serviceDetails: form.serviceDetails, documents: form.documents,
      importantDates: { ...form.importantDates, dob: form.dob || form.importantDates.dob, passportNo: form.passportNo },
      familyMembers: form.familyMembers, serviceHistory: [serviceEntry],
      status: 'New', assignedTo: session?.userId || '', revenue: 0, profit: 0, notes: '',
      createdAt: new Date().toISOString(), createdBy: session?.userId || '', updatedAt: new Date().toISOString(), history: [],
    };
    storage.push(KEYS.CLIENTS, client);
    auditLog('client_created', 'client', id, { name: form.name, service: form.service, month: selectedMonth });
    navigate(`${basePath}/clients/${id}`);
  };

  // Bulk upload
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

  const handleBulkImport = () => {
    let created = 0, updated = 0;
    bulkData.forEach((row: any) => {
      const existing = storage.getAll(KEYS.CLIENTS).find((c: any) => c.mobile === row.mobile || (row.passportNo && (c.importantDates?.passportNo === row.passportNo || c.passportNo === row.passportNo)));
      const svcEntry = {
        id: generateId('SVC'), service: form.service, serviceSubcategory: form.serviceSubcategory,
        serviceDetails: row, status: 'New', requestMonth: selectedMonth,
        createdAt: new Date().toISOString(), createdBy: session?.userId || '',
      };
      if (existing) {
        const history = existing.serviceHistory || [];
        storage.update(KEYS.CLIENTS, existing.id, {
          service: form.service, serviceHistory: [...history, svcEntry], updatedAt: new Date().toISOString(),
        });
        updated++;
      } else {
        const id = generateId('CLT');
        storage.push(KEYS.CLIENTS, {
          id, name: row.name, mobile: row.mobile, email: row.email || '', passportNo: row.passportNo || '',
          clientType: row.clientType || form.clientType || 'Individual', service: form.service,
          serviceSubcategory: form.serviceSubcategory, leadSource: form.leadSource || '', nationality: row.nationality || '',
          serviceDetails: row, documents: [],
          importantDates: { passportExpiry: row.passportExpiry || '', travelDate: row.travelDate || '', dob: row.dob || '', passportNo: row.passportNo || '' },
          familyMembers: [], serviceHistory: [svcEntry],
          status: 'New', assignedTo: session?.userId || '', revenue: 0, profit: 0, notes: '',
          createdAt: new Date().toISOString(), createdBy: session?.userId || '', updatedAt: new Date().toISOString(), history: [],
        });
        created++;
      }
    });
    alert(`${created} new clients created, ${updated} existing clients updated with new service.`);
    navigate(`${basePath}/clients`);
  };

  const downloadTemplate = () => {
    const templateHeaders: Record<string, string> = {
      'Air Ticket': 'name,mobile,email,passportNo,nationality,travelDate,departureCity,arrivalCity,flightNumber,returnDate,dob,passportExpiry',
      'UAE Visa': 'name,mobile,email,passportNo,nationality,visaType,applicationType,entryType,dob,passportExpiry',
      'Global Visa': 'name,mobile,email,passportNo,nationality,country,applicantType,dob,passportExpiry',
      'Holiday Package': 'name,mobile,email,passportNo,nationality,travelDate,returnDate,destination,adults,children,dob',
      'Travel Insurance': 'name,mobile,email,passportNo,nationality,travelDate,returnDate,coverageType,destination,dob',
      'Pilgrimage': 'name,mobile,email,passportNo,nationality,pilgrimageType,season,groupName,persons,dob',
      'Meet & Assist': 'name,mobile,email,passportNo,nationality,flightNumber,maType,airport,dateTime',
      'Hotel Booking': 'name,mobile,email,nationality,checkinDate,checkoutDate,city,rooms,roomType,guests',
    };
    const headers = templateHeaders[form.service] || 'name,mobile,email,passportNo,nationality';
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
  const isFamilyService = form.serviceSubcategory === 'Family Visa' || form.serviceSubcategory === 'Family Reunion' || form.service === 'Holiday Package';

  const steps = addingNewService
    ? ['Select Service', 'Service Details', 'Documents & Dates', 'Review']
    : ['Type & Service', 'Client Details', 'Documents & Dates', 'Review'];

  const canProceedStep0 = addingNewService
    ? (form.service && (!hasSubcategories || form.serviceSubcategory))
    : (form.clientType && form.leadSource && form.service && (!hasSubcategories || form.serviceSubcategory));
  const canProceedStep1 = form.name && form.mobile;

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
      {/* Link to existing client option */}
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
                <input value={clientSearch} onChange={e => setClientSearch(e.target.value)} className="input-nawi pl-9" placeholder="Search by name, mobile, ID, passport..." />
              </div>
              {searchedClients.length > 0 && (
                <div className="border border-border rounded-xl overflow-hidden divide-y divide-border max-h-64 overflow-y-auto">
                  {searchedClients.map((c: any) => (
                    <button key={c.id} onClick={() => linkToExistingClient(c)}
                      className="w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">{c.name}</p>
                        <p className="text-xs text-muted-foreground">{c.id} • {c.mobile} • {c.service || 'N/A'}</p>
                        {c.serviceHistory?.length > 0 && (
                          <p className="text-xs text-secondary mt-0.5 flex items-center gap-1">
                            <History className="w-3 h-3" /> {c.serviceHistory.length} previous service(s): {c.serviceHistory.map((s: any) => s.service).slice(-3).join(', ')}
                          </p>
                        )}
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

      {/* Existing client banner */}
      {addingNewService && existingClient && (
        <div className="card-nawi bg-secondary/5 border-secondary/20">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-secondary/10 flex items-center justify-center text-secondary font-bold text-lg">
              {existingClient.name?.charAt(0)}
            </div>
            <div className="flex-1">
              <p className="font-semibold text-foreground">{existingClient.name}</p>
              <p className="text-xs text-muted-foreground">{existingClient.id} • {existingClient.mobile}</p>
              {existingClient.serviceHistory?.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {existingClient.serviceHistory.map((s: any, i: number) => (
                    <span key={i} className="text-xs bg-muted px-2 py-0.5 rounded-full">
                      {s.service} {s.requestMonth ? `(${s.requestMonth})` : ''} — <span className={s.status === 'Success' ? 'text-success' : s.status === 'Failed' ? 'text-destructive' : 'text-warning'}>{s.status}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Month selector */}
      <div className="card-nawi flex items-center gap-4">
        <Calendar className="w-5 h-5 text-primary" />
        <div>
          <label className="block text-xs text-muted-foreground">Request Month</label>
          <input type="month" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} className="input-nawi w-auto text-sm mt-0.5" />
        </div>
        <p className="text-xs text-muted-foreground flex-1">All service requests are tracked by month for reporting. Old entries can be back-dated.</p>
      </div>

      {/* Progress */}
      <div className="card-nawi">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium">Step {step + 1} of {steps.length}</span>
          <span className="text-sm text-muted-foreground">{steps[step]}</span>
        </div>
        <div className="flex gap-1">
          {steps.map((_, i) => <div key={i} className={`h-1.5 flex-1 rounded-full transition-colors ${i <= step ? 'bg-primary' : 'bg-muted'}`} />)}
        </div>
      </div>

      {/* Duplicate Warning */}
      {duplicates.length > 0 && step >= 1 && !addingNewService && (
        <div className="bg-warning/10 border border-warning/20 p-4 rounded-xl">
          <div className="flex items-center gap-2 mb-2"><AlertTriangle className="w-5 h-5 text-warning" /><span className="font-medium text-warning">⚠️ Possible Duplicate — Client may already exist!</span></div>
          <p className="text-xs text-muted-foreground mb-2">If this is the same person needing a new service, click "Add Service" to link it. This prevents data collision.</p>
          {duplicates.slice(0, 3).map((d: any) => (
            <div key={d.id} className="flex items-center justify-between p-2 bg-card rounded-lg border border-border mb-1">
              <div>
                <span className="text-sm font-medium">{d.name}</span>
                <span className="text-xs text-muted-foreground ml-2">{d.mobile} • {d.id}</span>
                {d.serviceHistory?.length > 0 && <span className="text-xs text-secondary ml-2">({d.serviceHistory.length} services)</span>}
              </div>
              <button onClick={() => navigate(`${basePath}/clients/new?existingClient=${d.id}`)} className="btn-outline text-xs"><Plus className="w-3 h-3" /> Add Service</button>
            </div>
          ))}
        </div>
      )}

      <div className="card-nawi">
        {/* STEP 0: Client Type + Service */}
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
                {form.serviceSubcategory === 'Family Visa' && (
                  <div className="mt-3 p-3 bg-secondary/5 rounded-lg text-xs text-muted-foreground">
                    <p className="font-medium text-foreground mb-1">🏠 Family Visa Procedure:</p>
                    <p>1. Sponsor must have valid residence visa & salary AED 4,000+</p>
                    <p>2. Each family member needs a separate application</p>
                    <p>3. Add family members in Step 2</p>
                  </div>
                )}
              </div>
            )}

            {/* Bulk Upload */}
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
                  <span className="text-xs text-muted-foreground">CSV format with required columns</span>
                </div>
                <div className="border-2 border-dashed border-border rounded-xl p-6 text-center">
                  <Upload className="w-6 h-6 text-muted-foreground mx-auto mb-2" />
                  <label className="btn-outline cursor-pointer text-sm">Upload CSV<input type="file" accept=".csv" className="hidden" onChange={handleBulkFile} /></label>
                </div>
                {bulkErrors.length > 0 && <div className="bg-destructive/10 p-3 rounded-lg">{bulkErrors.map((e, i) => <p key={i} className="text-xs text-destructive">{e}</p>)}</div>}
                {bulkData.length > 0 && (
                  <div>
                    <p className="text-sm font-medium mb-2">{bulkData.length} valid records</p>
                    <div className="max-h-48 overflow-auto border border-border rounded-lg">
                      <table className="table-nawi w-full text-xs">
                        <thead><tr>{Object.keys(bulkData[0]).slice(0, 5).map(h => <th key={h}>{h}</th>)}</tr></thead>
                        <tbody>{bulkData.slice(0, 5).map((row, i) => <tr key={i}>{Object.values(row).slice(0, 5).map((v, j) => <td key={j}>{v as string}</td>)}</tr>)}</tbody>
                      </table>
                    </div>
                    <button onClick={handleBulkImport} className="btn-primary mt-3 w-full">Import {bulkData.length} Clients for {selectedMonth}</button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* STEP 1: Client Info + Service Details */}
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

            {/* Service-Specific Fields */}
            <div className={addingNewService ? '' : 'border-t border-border pt-4'}>
              <h3 className="text-base font-semibold font-display mb-4">{form.service} Details</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {form.service === 'Air Ticket' && <><Field label="Travel Date" k="travelDate" type="date" required /><Field label="Departure City" k="departureCity" required /><Field label="Arrival City" k="arrivalCity" required /><Field label="Flight Number" k="flightNumber" /><Field label="PNR" k="pnr" /><Field label="Ticket Number" k="ticketNumber" /><Field label="Return Date" k="returnDate" type="date" /><SelectField label="Class" k="travelClass" options={['Economy', 'Premium Economy', 'Business', 'First Class']} /><Field label="No. of Passengers" k="passengers" /></>}
                {form.service === 'UAE Visa' && <>
                  <SelectField label="Visa Type" k="visaType" options={['30 days', '60 days', '90 days', '1 Year', '2 Year', '5 Year', '10 Year Golden', 'Extension']} />
                  <SelectField label="Application Type" k="applicationType" options={['Inside UAE', 'Outside UAE']} />
                  <SelectField label="Entry Type" k="entryType" options={['Single', 'Multiple']} />
                  <Field label="Nationality" k="nationality" />
                  {form.serviceSubcategory === 'Family Visa' && <><Field label="Sponsor Name" k="sponsorName" required /><Field label="Sponsor UID" k="sponsorUid" /><Field label="Sponsor Salary" k="sponsorSalary" /><SelectField label="Relationship" k="relationship" options={['Spouse', 'Son', 'Daughter', 'Father', 'Mother']} /></>}
                  {form.serviceSubcategory === 'Freelancer Visa' && <><Field label="Freelance Category" k="freelanceCategory" /><SelectField label="Free Zone" k="freeZone" options={['Dubai South', 'RAKEZ', 'Ajman Free Zone', 'Sharjah Media City', 'IFZA', 'Other']} /></>}
                  {form.serviceSubcategory === 'Business Visa' && <><Field label="Business Activity" k="businessActivity" /><Field label="Trade License No." k="tradeLicenseNo" /></>}
                </>}
                {form.service === 'Global Visa' && <><Field label="Country" k="country" required /><SelectField label="Applicant Type" k="applicantType" options={['Employed', 'Self-Employed', 'Unemployed', 'Student', 'Retired']} /><Field label="Travel Date" k="travelDate" type="date" /><Field label="Return Date" k="returnDate" type="date" /><SelectField label="Visa Type" k="globalVisaType" options={['Tourist', 'Business', 'Student', 'Work Permit', 'Transit', 'Family Reunion', 'Medical']} /></>}
                {form.service === 'Holiday Package' && <><SelectField label="Package Type" k="packageType" options={['Inbound', 'Outbound', 'Domestic']} /><Field label="Travel Date" k="travelDate" type="date" /><Field label="Return Date" k="returnDate" type="date" /><Field label="Adults" k="adults" /><Field label="Children" k="children" /><Field label="Infants" k="infants" /><Field label="Destination" k="destination" /><SelectField label="Star Rating" k="starRating" options={['3 Star', '4 Star', '5 Star', 'Luxury']} /></>}
                {form.service === 'Travel Insurance' && <><Field label="Travel Date" k="travelDate" type="date" /><Field label="Return Date" k="returnDate" type="date" /><SelectField label="Coverage Type" k="coverageType" options={['Individual', 'Family', 'Group', 'Annual Multi-Trip']} /><Field label="Destination" k="destination" /><Field label="Sum Insured" k="sumInsured" /></>}
                {form.service === 'Pilgrimage' && <><SelectField label="Type" k="pilgrimageType" options={['Hajj', 'Umrah']} /><Field label="Season/Year" k="season" /><Field label="Group Name" k="groupName" /><Field label="No. of Persons" k="persons" /><SelectField label="Package" k="pilgrimagePackage" options={['Economy', 'Standard', 'Premium', 'VIP']} /></>}
                {form.service === 'Meet & Assist' && <><Field label="Flight Number" k="flightNumber" /><SelectField label="Type" k="maType" options={['Arrival', 'Departure', 'Transit']} /><Field label="Airport" k="airport" /><Field label="Date/Time" k="dateTime" type="datetime-local" /><Field label="No. of Passengers" k="passengers" /></>}
                {form.service === 'Hotel Booking' && <><Field label="Check-in" k="checkinDate" type="date" /><Field label="Check-out" k="checkoutDate" type="date" /><Field label="City" k="city" /><Field label="Rooms" k="rooms" /><SelectField label="Room Type" k="roomType" options={['Standard', 'Deluxe', 'Suite', 'Villa']} /><Field label="Guests" k="guests" /><SelectField label="Star Rating" k="hotelStars" options={['3 Star', '4 Star', '5 Star']} /><Field label="Special Requests" k="specialRequests" /></>}
              </div>
            </div>

            {/* Family Members */}
            {isFamilyService && (
              <div className="border-t border-border pt-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-base font-semibold font-display flex items-center gap-2"><Users className="w-4 h-4" /> Family Members</h3>
                  <button onClick={addFamilyMember} className="btn-outline text-sm"><Plus className="w-4 h-4" /> Add Member</button>
                </div>
                {form.familyMembers.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">No family members. Click "Add Member" to include.</p>
                )}
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

        {/* STEP 2: Documents & Dates */}
        {step === 2 && (
          <div className="space-y-6">
            <h2 className="text-lg font-bold font-display">Documents & Important Dates</h2>

            {/* Required docs */}
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

            {/* Additional documents */}
            <div className="border-t border-border pt-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold">Additional Documents</h3>
                <label className="btn-outline cursor-pointer text-sm">
                  <Upload className="w-4 h-4" /> Upload More
                  <input type="file" className="hidden" onChange={(e) => { if (e.target.files?.[0]) handleDocUpload('Additional', e.target.files[0]); }} />
                </label>
              </div>
              {form.documents.filter(d => !getRequiredDocs().includes(d.docType)).map((d, i) => (
                <div key={i} className="flex items-center gap-2 text-sm p-2 bg-muted/50 rounded mb-1">
                  <Check className="w-3 h-3 text-success" />
                  <span>{d.docType}: {d.name}</span>
                  <button onClick={() => updateForm({ documents: form.documents.filter((_, j) => j !== form.documents.indexOf(d)) })} className="ml-auto text-muted-foreground hover:text-destructive"><X className="w-3 h-3" /></button>
                </div>
              ))}
            </div>

            {/* OCR status */}
            {Object.keys(ocrFields).length > 0 && (
              <div className="p-3 bg-success/5 border border-success/20 rounded-lg">
                <p className="text-sm font-medium text-success mb-1">📋 OCR Data Extracted</p>
                {Object.entries(ocrFields).map(([k, v]) => (
                  <p key={k} className="text-xs text-muted-foreground">{k}: {v}</p>
                ))}
              </div>
            )}

            {/* Important Dates - Expanded */}
            <div className="border-t border-border pt-4">
              <h3 className="text-sm font-semibold mb-3">Important Dates (Auto-reminders will be generated)</h3>
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

        {/* STEP 3: Review */}
        {step === 3 && (
          <div className="space-y-6">
            <h2 className="text-lg font-bold font-display">Review & Submit</h2>

            {/* Collision warning */}
            {addingNewService && existingClient && (
              <div className="p-3 bg-secondary/5 border border-secondary/20 rounded-lg">
                <p className="text-sm font-medium text-secondary">Adding new "{form.service}" request to existing client: {existingClient.name}</p>
                <p className="text-xs text-muted-foreground">This will be added as service #{(existingClient.serviceHistory?.length || 0) + 1} for month {selectedMonth}</p>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Client</h3>
                <div className="space-y-1">
                  {[['Name', form.name], ['Mobile', form.mobile], ['Email', form.email], ['Nationality', form.nationality], ['Passport', form.passportNo], ['Client Type', form.clientType], ['Lead Source', form.leadSource], ['Request Month', selectedMonth]].map(([l, v]) => v && (
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

            {/* Dates summary */}
            {Object.entries(form.importantDates).filter(([_, v]) => v).length > 0 && (
              <div className="border-t border-border pt-4">
                <h3 className="text-sm font-semibold mb-2">📅 Important Dates Collected</h3>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(form.importantDates).filter(([_, v]) => v).map(([k, v]) => (
                    <span key={k} className="text-xs bg-primary/10 text-primary px-2 py-1 rounded-full capitalize">
                      {k.replace(/([A-Z])/g, ' $1')}: {formatDate(v)}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Documents summary */}
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

            {/* Family summary */}
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

        {/* Navigation */}
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
