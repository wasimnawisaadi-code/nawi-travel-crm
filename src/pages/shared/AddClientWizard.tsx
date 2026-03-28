import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Check, ChevronLeft, ChevronRight, Upload, AlertTriangle, FileUp, X, Users, Plus, Trash2 } from 'lucide-react';
import { storage, KEYS, generateId, getCurrentUser, auditLog, isAdmin } from '@/lib/storage';
import Papa from 'papaparse';

const SERVICES = [
  { key: 'Air Ticket', emoji: '✈️' },
  { key: 'UAE Visa', emoji: '🪪', subcategories: ['Tourist Visa', 'Visit Visa', 'Transit Visa', 'Family Visa', 'Employment Visa', 'Freelancer Visa', 'Business Visa', 'Student Visa', 'Extension', 'Status Change', 'Visa Cancellation'] },
  { key: 'Global Visa', emoji: '🌍', subcategories: ['Tourist', 'Business', 'Student', 'Work Permit', 'Transit', 'Family Reunion', 'Medical'] },
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
  name: string;
  relation: string;
  dob: string;
  passportNo: string;
  passportExpiry: string;
  nationality: string;
  documents: any[];
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
  const basePath = isAdmin() ? '/admin' : '/employee';

  const [form, setForm] = useState({
    name: '', mobile: '', email: '', passportNo: '',
    clientType: '', companyName: '', companyNumber: '', paymentType: '',
    service: '', serviceSubcategory: '', leadSource: '', nationality: '', dob: '',
    serviceDetails: {} as Record<string, string>,
    documents: [] as any[],
    importantDates: { dob: '', passportExpiry: '', visaExpiry: '', travelDate: '', weddingAnniversary: '' } as Record<string, string>,
    familyMembers: [] as FamilyMember[],
  });

  // Load existing client if adding new service
  useEffect(() => {
    if (existingClientId) {
      const c = storage.getAll(KEYS.CLIENTS).find((cl: any) => cl.id === existingClientId);
      if (c) {
        setExistingClient(c);
        setAddingNewService(true);
        setForm(prev => ({
          ...prev,
          name: c.name, mobile: c.mobile, email: c.email || '', passportNo: c.importantDates?.passportNo || c.passportNo || '',
          clientType: c.clientType, companyName: c.companyName || '', companyNumber: c.companyNumber || '',
          nationality: c.nationality || '', dob: c.importantDates?.dob || '',
          leadSource: c.leadSource || '',
          importantDates: c.importantDates || {},
        }));
        setStep(0); // Go to service selection
      }
    }
  }, [existingClientId]);

  const updateForm = (changes: any) => setForm(prev => ({ ...prev, ...changes }));
  const updateSD = (key: string, val: string) => setForm(prev => ({ ...prev, serviceDetails: { ...prev.serviceDetails, [key]: val } }));

  // Auto duplicate check
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

  // Auto-extract important dates from service details
  useEffect(() => {
    const sd = form.serviceDetails;
    const dates = { ...form.importantDates };
    if (sd.travelDate) dates.travelDate = sd.travelDate;
    if (sd.returnDate && !dates.travelDate) dates.travelDate = sd.returnDate;
    if (sd.checkinDate) dates.travelDate = sd.checkinDate;
    if (form.dob) dates.dob = form.dob;
    updateForm({ importantDates: dates });
  }, [form.serviceDetails.travelDate, form.serviceDetails.returnDate, form.serviceDetails.checkinDate, form.dob]);

  const getRequiredDocs = () => {
    const reqs = DOC_REQUIREMENTS[form.service];
    if (!reqs) return [];
    // Check subcategory first
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

  const removeFamilyMember = (index: number) => {
    updateForm({ familyMembers: form.familyMembers.filter((_, i) => i !== index) });
  };

  const handleSubmit = () => {
    if (addingNewService && existingClient) {
      // Add new service entry to existing client
      const serviceEntry = {
        id: generateId('SVC'),
        service: form.service,
        serviceSubcategory: form.serviceSubcategory,
        serviceDetails: form.serviceDetails,
        documents: form.documents,
        familyMembers: form.familyMembers,
        status: 'New',
        createdAt: new Date().toISOString(),
        createdBy: session?.userId || '',
      };
      const existingServices = existingClient.serviceHistory || [];
      const updatedDates = { ...existingClient.importantDates, ...form.importantDates };
      storage.update(KEYS.CLIENTS, existingClient.id, {
        service: form.service, // latest service
        serviceSubcategory: form.serviceSubcategory,
        serviceDetails: form.serviceDetails,
        serviceHistory: [...existingServices, serviceEntry],
        documents: [...(existingClient.documents || []), ...form.documents],
        importantDates: updatedDates,
        familyMembers: form.familyMembers.length > 0 ? form.familyMembers : existingClient.familyMembers,
        updatedAt: new Date().toISOString(),
      });
      auditLog('service_added', 'client', existingClient.id, { service: form.service });
      navigate(`${basePath}/clients/${existingClient.id}`);
      return;
    }

    const id = generateId('CLT');
    const serviceEntry = {
      id: generateId('SVC'),
      service: form.service,
      serviceSubcategory: form.serviceSubcategory,
      serviceDetails: form.serviceDetails,
      documents: form.documents,
      familyMembers: form.familyMembers,
      status: 'New',
      createdAt: new Date().toISOString(),
      createdBy: session?.userId || '',
    };
    const client = {
      id, name: form.name, mobile: form.mobile, email: form.email, passportNo: form.passportNo,
      clientType: form.clientType, companyName: form.companyName, companyNumber: form.companyNumber,
      paymentType: form.paymentType, service: form.service, serviceSubcategory: form.serviceSubcategory,
      leadSource: form.leadSource, nationality: form.nationality,
      serviceDetails: form.serviceDetails, documents: form.documents,
      importantDates: { ...form.importantDates, dob: form.dob || form.importantDates.dob, passportNo: form.passportNo },
      familyMembers: form.familyMembers,
      serviceHistory: [serviceEntry],
      status: 'New', assignedTo: session?.userId || '', revenue: 0, profit: 0, notes: '',
      createdAt: new Date().toISOString(), createdBy: session?.userId || '', updatedAt: new Date().toISOString(), history: [],
    };
    storage.push(KEYS.CLIENTS, client);
    auditLog('client_created', 'client', id, { name: form.name, service: form.service });
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
    let created = 0;
    let skipped = 0;
    bulkData.forEach((row: any) => {
      const existing = storage.getAll(KEYS.CLIENTS).find((c: any) => c.mobile === row.mobile || (row.passportNo && (c.importantDates?.passportNo === row.passportNo || c.passportNo === row.passportNo)));
      if (existing) {
        // Add as new service to existing client
        const serviceEntry = {
          id: generateId('SVC'), service: form.service, serviceSubcategory: form.serviceSubcategory,
          serviceDetails: row, status: 'New', createdAt: new Date().toISOString(), createdBy: session?.userId || '',
        };
        const history = existing.serviceHistory || [];
        storage.update(KEYS.CLIENTS, existing.id, {
          service: form.service, serviceHistory: [...history, serviceEntry], updatedAt: new Date().toISOString(),
        });
        skipped++;
        return;
      }
      const id = generateId('CLT');
      storage.push(KEYS.CLIENTS, {
        id, name: row.name, mobile: row.mobile, email: row.email || '', passportNo: row.passportNo || '',
        clientType: row.clientType || form.clientType || 'Individual', service: form.service,
        serviceSubcategory: form.serviceSubcategory, leadSource: form.leadSource || '', nationality: row.nationality || '',
        serviceDetails: row, documents: [],
        importantDates: { passportExpiry: row.passportExpiry || '', travelDate: row.travelDate || '', dob: row.dob || '', passportNo: row.passportNo || '' },
        familyMembers: [],
        serviceHistory: [{ id: generateId('SVC'), service: form.service, serviceSubcategory: form.serviceSubcategory, serviceDetails: row, status: 'New', createdAt: new Date().toISOString(), createdBy: session?.userId || '' }],
        status: 'New', assignedTo: session?.userId || '', revenue: 0, profit: 0, notes: '',
        createdAt: new Date().toISOString(), createdBy: session?.userId || '', updatedAt: new Date().toISOString(), history: [],
      });
      created++;
    });
    alert(`${created} new clients created, ${skipped} existing clients updated with new service.`);
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
      {/* Existing client banner */}
      {addingNewService && existingClient && (
        <div className="card-nawi bg-secondary/5 border-secondary/20">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-secondary/10 flex items-center justify-center text-secondary font-bold">
              {existingClient.name?.charAt(0)}
            </div>
            <div>
              <p className="font-semibold text-foreground">{existingClient.name}</p>
              <p className="text-xs text-muted-foreground">{existingClient.id} • {existingClient.mobile} • Adding new service request</p>
              {existingClient.serviceHistory?.length > 0 && (
                <p className="text-xs text-secondary mt-0.5">Previous services: {existingClient.serviceHistory.map((s: any) => s.service).join(', ')}</p>
              )}
            </div>
          </div>
        </div>
      )}

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
          <div className="flex items-center gap-2 mb-2"><AlertTriangle className="w-5 h-5 text-warning" /><span className="font-medium text-warning">⚠️ Client already exists!</span></div>
          {duplicates.slice(0, 3).map((d: any) => (
            <div key={d.id} className="flex items-center justify-between text-sm mb-1">
              <span>{d.name} — {d.mobile} — {d.id} ({d.service})</span>
              <button onClick={() => navigate(`${basePath}/clients/new?existingClient=${d.id}`)} className="text-xs text-secondary hover:underline">Add New Service →</button>
            </div>
          ))}
          <p className="text-xs text-muted-foreground mt-2">If this client needs a new service, click "Add New Service" to avoid duplicates.</p>
        </div>
      )}

      <div className="card-nawi">
        {/* STEP 0: Client Type + Service Selection */}
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

            {/* Service subcategory */}
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
                    <p className="font-medium text-foreground mb-1">Family Visa Procedure:</p>
                    <p>1. Sponsor must have valid residence visa & meet salary requirements (AED 4,000+)</p>
                    <p>2. Required for spouse, children, parents — each needs separate application</p>
                    <p>3. You can add family members in the next step</p>
                  </div>
                )}
              </div>
            )}

            {/* Bulk upload option */}
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
                  <span className="text-xs text-muted-foreground">CSV format with all required columns</span>
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
                    <button onClick={handleBulkImport} className="btn-primary mt-3 w-full">Import {bulkData.length} Clients</button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* STEP 1: Basic Info + Service-Specific Fields */}
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
                  {form.serviceSubcategory === 'Family Visa' && <>
                    <Field label="Sponsor Name" k="sponsorName" required />
                    <Field label="Sponsor UID" k="sponsorUid" />
                    <Field label="Sponsor Salary" k="sponsorSalary" />
                    <SelectField label="Relationship" k="relationship" options={['Spouse', 'Son', 'Daughter', 'Father', 'Mother']} />
                  </>}
                  {form.serviceSubcategory === 'Freelancer Visa' && <>
                    <Field label="Freelance Category" k="freelanceCategory" />
                    <SelectField label="Free Zone" k="freeZone" options={['Dubai South', 'RAKEZ', 'Ajman Free Zone', 'Sharjah Media City', 'IFZA', 'Other']} />
                  </>}
                  {form.serviceSubcategory === 'Business Visa' && <>
                    <Field label="Business Activity" k="businessActivity" />
                    <Field label="Trade License No." k="tradeLicenseNo" />
                  </>}
                </>}
                {form.service === 'Global Visa' && <><Field label="Country" k="country" required /><SelectField label="Applicant Type" k="applicantType" options={['Employed', 'Self-Employed', 'Unemployed', 'Student', 'Retired']} /><Field label="Travel Date" k="travelDate" type="date" /><Field label="Return Date" k="returnDate" type="date" /><SelectField label="Visa Type" k="globalVisaType" options={['Tourist', 'Business', 'Student', 'Work Permit', 'Transit', 'Family Reunion', 'Medical']} /></>}
                {form.service === 'Holiday Package' && <><SelectField label="Package Type" k="packageType" options={['Inbound', 'Outbound', 'Domestic']} /><Field label="Travel Date" k="travelDate" type="date" /><Field label="Return Date" k="returnDate" type="date" /><Field label="Adults" k="adults" /><Field label="Children" k="children" /><Field label="Infants" k="infants" /><Field label="Destination" k="destination" /><SelectField label="Star Rating" k="starRating" options={['3 Star', '4 Star', '5 Star', 'Luxury']} /></>}
                {form.service === 'Travel Insurance' && <><Field label="Travel Date" k="travelDate" type="date" /><Field label="Return Date" k="returnDate" type="date" /><SelectField label="Coverage Type" k="coverageType" options={['Individual', 'Family', 'Group', 'Annual Multi-Trip']} /><Field label="Destination" k="destination" /><Field label="Sum Insured" k="sumInsured" /></>}
                {form.service === 'Pilgrimage' && <><SelectField label="Type" k="pilgrimageType" options={['Hajj', 'Umrah']} /><Field label="Season/Year" k="season" /><Field label="Group Name" k="groupName" /><Field label="No. of Persons" k="persons" /><SelectField label="Package" k="pilgrimagePackage" options={['Economy', 'Standard', 'Premium', 'VIP']} /></>}
                {form.service === 'Meet & Assist' && <><Field label="Flight Number" k="flightNumber" /><SelectField label="Type" k="maType" options={['Arrival', 'Departure', 'Transit']} /><Field label="Airport" k="airport" /><Field label="Date/Time" k="dateTime" type="datetime-local" /><Field label="No. of Passengers" k="passengers" /></>}
                {form.service === 'Hotel Booking' && <><Field label="Check-in" k="checkinDate" type="date" /><Field label="Check-out" k="checkoutDate" type="date" /><Field label="City" k="city" /><Field label="Rooms" k="rooms" /><SelectField label="Room Type" k="roomType" options={['Standard', 'Deluxe', 'Suite', 'Villa']} /><Field label="Guests" k="guests" /><SelectField label="Star Rating" k="hotelStars" options={['3 Star', '4 Star', '5 Star']} /><Field label="Special Requests" k="specialRequests" /></>}
              </div>
            </div>

            {/* Family Members section for family services */}
            {isFamilyService && (
              <div className="border-t border-border pt-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-base font-semibold font-display flex items-center gap-2"><Users className="w-4 h-4" /> Family Members</h3>
                  <button onClick={addFamilyMember} className="btn-outline text-sm"><Plus className="w-4 h-4" /> Add Member</button>
                </div>
                {form.familyMembers.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">No family members added. Click "Add Member" to include family.</p>
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

        {/* STEP 2: Documents + Important Dates */}
        {step === 2 && (
          <div className="space-y-6">
            <h2 className="text-lg font-bold font-display">Documents & Important Dates</h2>

            {getRequiredDocs().length > 0 && (
              <div>
                <h3 className="text-sm font-semibold mb-3">Required Documents for {form.service}{form.serviceSubcategory ? ` — ${form.serviceSubcategory}` : ''}</h3>
                <p className="text-xs text-muted-foreground mb-3">Upload documents and we'll auto-extract information using OCR</p>
                <div className="space-y-2">
                  {getRequiredDocs().map((docName) => {
                    const uploaded = form.documents.find((d: any) => d.docType === docName);
                    return (
                      <div key={docName} className={`flex items-center justify-between p-3 rounded-lg border ${uploaded ? 'border-success/30 bg-success/5' : 'border-border'}`}>
                        <div className="flex items-center gap-2">
                          {uploaded ? <Check className="w-4 h-4 text-success" /> : <div className="w-4 h-4 rounded border border-border" />}
                          <span className="text-sm font-medium">{docName}</span>
                          {!uploaded && <span className="text-xs text-destructive">Required</span>}
                        </div>
                        {uploaded ? (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-success">✓ Uploaded & OCR Processed</span>
                            <button onClick={() => updateForm({ documents: form.documents.filter((d: any) => d.docType !== docName) })} className="text-muted-foreground hover:text-destructive"><X className="w-3 h-3" /></button>
                          </div>
                        ) : (
                          <label className="btn-outline text-xs cursor-pointer py-1">
                            Upload
                            <input type="file" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) handleDocUpload(docName, file); }} />
                          </label>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* OCR Results */}
            {form.documents.length > 0 && (
              <div className="p-4 bg-success/5 border border-success/20 rounded-xl">
                <h4 className="text-sm font-semibold text-success mb-2">📋 OCR Extracted Fields</h4>
                <p className="text-xs text-muted-foreground mb-3">Fields auto-detected from uploaded documents.</p>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="block text-xs text-muted-foreground mb-1">Name (from doc)</label><input value={form.name} onChange={(e) => updateForm({ name: e.target.value })} className="input-nawi bg-success/5 border-success/20 text-sm" /></div>
                  <div><label className="block text-xs text-muted-foreground mb-1">Passport No.</label><input value={form.passportNo} onChange={(e) => updateForm({ passportNo: e.target.value })} className="input-nawi bg-success/5 border-success/20 text-sm" /></div>
                  <div><label className="block text-xs text-muted-foreground mb-1">Passport Expiry</label><input type="date" value={form.importantDates.passportExpiry || ''} onChange={(e) => updateForm({ importantDates: { ...form.importantDates, passportExpiry: e.target.value } })} className="input-nawi bg-success/5 border-success/20 text-sm" /></div>
                  <div><label className="block text-xs text-muted-foreground mb-1">DOB</label><input type="date" value={form.dob || form.importantDates.dob || ''} onChange={(e) => updateForm({ dob: e.target.value })} className="input-nawi bg-success/5 border-success/20 text-sm" /></div>
                </div>
              </div>
            )}

            {/* Additional doc upload */}
            <div>
              <h3 className="text-sm font-semibold mb-2">Additional Documents</h3>
              <div className="border-2 border-dashed border-border rounded-xl p-6 text-center">
                <Upload className="w-6 h-6 text-muted-foreground mx-auto mb-2" />
                <label className="btn-outline cursor-pointer text-sm">Upload Files
                  <input type="file" multiple className="hidden" onChange={(e) => { Array.from(e.target.files || []).forEach(file => handleDocUpload('Additional', file)); }} />
                </label>
              </div>
            </div>

            {form.documents.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold mb-2">Uploaded Documents ({form.documents.length})</h3>
                <div className="space-y-1">{form.documents.map((d: any, i: number) => (
                  <div key={i} className="flex items-center justify-between text-sm p-2 bg-muted/50 rounded-lg">
                    <span>✓ {d.docType}: {d.name}</span>
                    <button onClick={() => updateForm({ documents: form.documents.filter((_: any, j: number) => j !== i) })} className="text-muted-foreground hover:text-destructive"><X className="w-3 h-3" /></button>
                  </div>
                ))}</div>
              </div>
            )}

            {/* Important Dates */}
            <div>
              <h3 className="text-sm font-semibold mb-3">Important Dates</h3>
              <p className="text-xs text-muted-foreground mb-3">These dates will be tracked for reminders and notifications</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  { label: 'Date of Birth', key: 'dob' }, { label: 'Passport Expiry', key: 'passportExpiry' },
                  { label: 'Visa Expiry', key: 'visaExpiry' }, { label: 'Travel Date', key: 'travelDate' },
                  { label: 'Wedding Anniversary', key: 'weddingAnniversary' },
                ].map(({ label, key }) => (
                  <div key={key}>
                    <label className="block text-sm font-medium mb-1">{label}</label>
                    <input type="date" value={form.importantDates[key] || (key === 'dob' ? form.dob : '')} onChange={(e) => updateForm({ importantDates: { ...form.importantDates, [key]: e.target.value } })} className="input-nawi" />
                  </div>
                ))}
              </div>
            </div>

            {/* Family member dates */}
            {form.familyMembers.length > 0 && (
              <div className="border-t border-border pt-4">
                <h3 className="text-sm font-semibold mb-3">Family Member Dates</h3>
                {form.familyMembers.map((fm, i) => (
                  <div key={i} className="flex items-center gap-4 mb-2 text-sm">
                    <span className="font-medium w-32 truncate">{fm.name || `Member ${i + 1}`}</span>
                    <span className="text-muted-foreground">{fm.relation}</span>
                    <span className="text-xs">DOB: {fm.dob || '—'}</span>
                    <span className="text-xs">PP Exp: {fm.passportExpiry || '—'}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* STEP 3: Review */}
        {step === 3 && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold font-display">Review & Confirm</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase">Client Details</h3>
                {[['Name', form.name], ['Mobile', form.mobile], ['Email', form.email], ['Type', form.clientType], ['Lead Source', form.leadSource], ['Nationality', form.nationality], ['DOB', form.dob], ['Passport', form.passportNo]].map(([l, v]) => (
                  <div key={l} className="flex justify-between text-sm"><span className="text-muted-foreground">{l}</span><span className="font-medium">{v || '—'}</span></div>
                ))}
                {form.companyName && <div className="flex justify-between text-sm"><span className="text-muted-foreground">Company</span><span className="font-medium">{form.companyName}</span></div>}
              </div>
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase">Service: {form.service}{form.serviceSubcategory ? ` — ${form.serviceSubcategory}` : ''}</h3>
                {Object.entries(form.serviceDetails).filter(([_, v]) => v).map(([k, v]) => (
                  <div key={k} className="flex justify-between text-sm"><span className="text-muted-foreground capitalize">{k.replace(/([A-Z])/g, ' $1')}</span><span className="font-medium">{v}</span></div>
                ))}
              </div>
            </div>

            {form.familyMembers.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase">Family Members ({form.familyMembers.length})</h3>
                {form.familyMembers.map((fm, i) => (
                  <div key={i} className="text-sm p-2 bg-muted/50 rounded-lg">
                    {fm.name} — {fm.relation} — PP: {fm.passportNo || '—'}
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase">Documents ({form.documents.length})</h3>
              {form.documents.map((d: any, i: number) => <p key={i} className="text-sm">✓ {d.docType}: {d.name}</p>)}
              {form.documents.length === 0 && <p className="text-sm text-muted-foreground">No documents uploaded</p>}
            </div>
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase">Important Dates</h3>
              {Object.entries(form.importantDates).filter(([_, v]) => v).map(([k, v]) => (
                <div key={k} className="flex justify-between text-sm"><span className="text-muted-foreground capitalize">{k.replace(/([A-Z])/g, ' $1')}</span><span className="font-medium">{v}</span></div>
              ))}
            </div>
            <button onClick={handleSubmit} className="btn-primary w-full py-3 text-base mt-6">
              {addingNewService ? '✨ Add New Service to Client' : '✨ Confirm & Create Client'}
            </button>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex justify-between">
        <button onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0} className="btn-outline disabled:opacity-40"><ChevronLeft className="w-4 h-4" /> Back</button>
        {step < steps.length - 1 && (
          <button onClick={() => setStep(step + 1)} disabled={(step === 0 && !canProceedStep0) || (step === 1 && !canProceedStep1 && !addingNewService)} className="btn-primary disabled:opacity-40">Next <ChevronRight className="w-4 h-4" /></button>
        )}
      </div>
    </div>
  );
}
