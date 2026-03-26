import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, ChevronLeft, ChevronRight, Plane, FileText as VisaIcon, Globe, Palmtree, Shield, Building, Handshake, Hotel, Upload, AlertTriangle, FileUp } from 'lucide-react';
import { storage, KEYS, generateId, getCurrentUser, auditLog, isAdmin } from '@/lib/storage';
import Papa from 'papaparse';

const SERVICES = [
  { key: 'Air Ticket', icon: Plane, emoji: '✈️' },
  { key: 'UAE Visa', icon: VisaIcon, emoji: '🪪' },
  { key: 'Global Visa', icon: Globe, emoji: '🌍' },
  { key: 'Holiday Package', icon: Palmtree, emoji: '🏝️' },
  { key: 'Travel Insurance', icon: Shield, emoji: '🛡️' },
  { key: 'Pilgrimage', icon: Building, emoji: '🕌' },
  { key: 'Meet & Assist', icon: Handshake, emoji: '🤝' },
  { key: 'Hotel Booking', icon: Hotel, emoji: '🏨' },
];

const LEAD_SOURCES = ['Walk-in', 'Call', 'WhatsApp', 'Social Media', 'Reference'];

const DOC_REQUIREMENTS: Record<string, Record<string, string[]>> = {
  'Air Ticket': { default: ['Passport Copy'] },
  'UAE Visa': { Outside: ['Passport', 'Photo'], Inside: ['Passport', 'Photo', 'Emirates ID', 'Current Visa Copy'] },
  'Global Visa': {
    Employed: ['Passport', 'Photo', 'Emirates ID', 'Bank Statement', 'NOC'],
    'Self-Employed': ['Passport', 'Photo', 'Emirates ID', 'Bank Statement', 'Trade License'],
    Unemployed: ['Passport', 'Photo', 'Sponsor Passport', 'Sponsor Bank Statement', 'Sponsor Letter'],
  },
  'Holiday Package': { default: ['Passport Copy'] },
  'Travel Insurance': { default: ['Passport Copy'] },
  'Pilgrimage': { default: ['Passport', 'Photo'] },
  'Meet & Assist': { default: ['Passport Copy'] },
  'Hotel Booking': { default: [] },
};

export default function AddClientWizard() {
  const navigate = useNavigate();
  const session = getCurrentUser();
  const [step, setStep] = useState(0);
  const [duplicates, setDuplicates] = useState<any[]>([]);
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const [bulkData, setBulkData] = useState<any[]>([]);
  const [bulkErrors, setBulkErrors] = useState<string[]>([]);
  const basePath = isAdmin() ? '/admin' : '/employee';

  const [form, setForm] = useState({
    name: '', mobile: '', email: '', passportNo: '',
    clientType: '', companyName: '', companyNumber: '', paymentType: '',
    service: '', leadSource: '', nationality: '', dob: '',
    serviceDetails: {} as Record<string, string>,
    documents: [] as any[],
    importantDates: { dob: '', passportExpiry: '', visaExpiry: '', travelDate: '', weddingAnniversary: '' } as Record<string, string>,
  });

  const updateForm = (changes: any) => setForm({ ...form, ...changes });
  const updateSD = (key: string, val: string) => setForm({ ...form, serviceDetails: { ...form.serviceDetails, [key]: val } });

  // Auto duplicate check (debounced)
  useEffect(() => {
    if (!form.name && !form.mobile && !form.passportNo) { setDuplicates([]); return; }
    const timer = setTimeout(() => {
      const clients = storage.getAll(KEYS.CLIENTS);
      const dupes = clients.filter((c: any) =>
        (form.name.length >= 3 && c.name?.toLowerCase().includes(form.name.toLowerCase())) ||
        (form.mobile.length >= 5 && c.mobile?.includes(form.mobile)) ||
        (form.passportNo.length >= 4 && c.importantDates?.passportNo === form.passportNo)
      );
      setDuplicates(dupes);
    }, 300);
    return () => clearTimeout(timer);
  }, [form.name, form.mobile, form.passportNo]);

  // Auto-extract important dates from service details
  useEffect(() => {
    const sd = form.serviceDetails;
    const dates = { ...form.importantDates };
    if (sd.travelDate) dates.travelDate = sd.travelDate;
    if (sd.returnDate && !dates.travelDate) dates.travelDate = sd.returnDate;
    if (sd.checkinDate) dates.travelDate = sd.checkinDate;
    if (form.dob) dates.dob = form.dob;
    setForm(prev => ({ ...prev, importantDates: dates }));
  }, [form.serviceDetails.travelDate, form.serviceDetails.returnDate, form.serviceDetails.checkinDate, form.dob]);

  const getRequiredDocs = () => {
    const reqs = DOC_REQUIREMENTS[form.service];
    if (!reqs) return [];
    const sd = form.serviceDetails;
    if (form.service === 'UAE Visa') return reqs[sd.applicationType || 'Outside'] || reqs.Outside || [];
    if (form.service === 'Global Visa') return reqs[sd.applicantType || 'Employed'] || reqs.Employed || [];
    return reqs.default || [];
  };

  const handleSubmit = () => {
    const id = generateId('CLT');
    const client = {
      id, name: form.name, mobile: form.mobile, email: form.email,
      clientType: form.clientType, companyName: form.companyName, companyNumber: form.companyNumber,
      paymentType: form.paymentType, service: form.service, leadSource: form.leadSource,
      serviceDetails: form.serviceDetails, documents: form.documents,
      importantDates: { ...form.importantDates, dob: form.dob || form.importantDates.dob },
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
    bulkData.forEach((row: any) => {
      const existing = storage.getAll(KEYS.CLIENTS).find((c: any) => c.mobile === row.mobile || (row.passportNo && c.importantDates?.passportNo === row.passportNo));
      if (existing) return;
      const id = generateId('CLT');
      storage.push(KEYS.CLIENTS, {
        id, name: row.name, mobile: row.mobile, email: row.email || '',
        clientType: row.clientType || 'Individual', service: form.service,
        serviceDetails: row, documents: [], importantDates: { passportExpiry: row.passportExpiry || '', travelDate: row.travelDate || '' },
        status: 'New', assignedTo: session?.userId || '', revenue: 0, profit: 0, notes: '',
        createdAt: new Date().toISOString(), createdBy: session?.userId || '', updatedAt: new Date().toISOString(), history: [],
      });
      created++;
    });
    alert(`${created} clients imported successfully!`);
    navigate(`${basePath}/clients`);
  };

  const downloadTemplate = () => {
    const headers = form.service === 'Air Ticket'
      ? 'name,mobile,email,passportNo,travelDate,departureCity,arrivalCity,flightNumber'
      : 'name,mobile,email,passportNo,visaType,nationality,applicationType';
    const blob = new Blob([headers], { type: 'text/csv' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${form.service}_template.csv`;
    link.click();
  };

  const Field = ({ label, k, type = 'text' }: { label: string; k: string; type?: string }) => (
    <div>
      <label className="block text-sm font-medium mb-1">{label}</label>
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

  const steps = ['Basic Info', 'Service & Details', 'Documents & Dates', 'Review'];

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
      {/* Progress */}
      <div className="card-nawi">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium text-foreground">Step {step + 1} of {steps.length}</span>
          <span className="text-sm text-muted-foreground">{steps[step]}</span>
        </div>
        <div className="flex gap-1">
          {steps.map((_, i) => <div key={i} className={`h-1.5 flex-1 rounded-full transition-colors ${i <= step ? 'bg-primary' : 'bg-muted'}`} />)}
        </div>
      </div>

      {/* Auto Duplicate Warning */}
      {duplicates.length > 0 && step < 3 && (
        <div className="bg-warning/10 border border-warning/20 p-4 rounded-xl">
          <div className="flex items-center gap-2 mb-2"><AlertTriangle className="w-5 h-5 text-warning" /><span className="font-medium text-warning">Potential duplicate(s) found</span></div>
          {duplicates.slice(0, 3).map((d: any) => (
            <p key={d.id} className="text-sm text-foreground">{d.name} — {d.mobile} — {d.id} ({d.service})</p>
          ))}
        </div>
      )}

      <div className="card-nawi">
        {/* STEP 0: Basic Info + Client Type */}
        {step === 0 && (
          <div className="space-y-6">
            <h2 className="text-lg font-bold font-display">Client Information</h2>

            {/* Client Type */}
            <div>
              <label className="block text-sm font-medium mb-2">Client Type *</label>
              <div className="grid grid-cols-3 gap-3">
                {[{ key: 'Individual', icon: '👤' }, { key: 'B2B', icon: '🏢' }, { key: 'Corporate', icon: '🏗️' }].map(({ key, icon }) => (
                  <button key={key} onClick={() => updateForm({ clientType: key })} className={`p-4 rounded-xl border-2 text-center transition-all ${form.clientType === key ? 'border-primary bg-primary/5' : 'border-border hover:border-secondary'}`}>
                    <span className="text-2xl block mb-1">{icon}</span>
                    <span className="text-sm font-medium">{key}</span>
                  </button>
                ))}
              </div>
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

            {/* Basic Details */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div><label className="block text-sm font-medium mb-1">Full Name *</label><input value={form.name} onChange={(e) => updateForm({ name: e.target.value })} className="input-nawi" required /></div>
              <div><label className="block text-sm font-medium mb-1">Mobile Number *</label><input value={form.mobile} onChange={(e) => updateForm({ mobile: e.target.value })} className="input-nawi" required /></div>
              <div><label className="block text-sm font-medium mb-1">Email</label><input type="email" value={form.email} onChange={(e) => updateForm({ email: e.target.value })} className="input-nawi" /></div>
              <div><label className="block text-sm font-medium mb-1">Nationality</label><input value={form.nationality} onChange={(e) => updateForm({ nationality: e.target.value })} className="input-nawi" /></div>
              <div><label className="block text-sm font-medium mb-1">Date of Birth</label><input type="date" value={form.dob} onChange={(e) => updateForm({ dob: e.target.value })} className="input-nawi" /></div>
              <div><label className="block text-sm font-medium mb-1">Passport Number</label><input value={form.passportNo} onChange={(e) => updateForm({ passportNo: e.target.value })} className="input-nawi" /></div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Lead Source *</label>
              <div className="flex flex-wrap gap-2">
                {LEAD_SOURCES.map(s => (
                  <button key={s} onClick={() => updateForm({ leadSource: s })} className={`px-4 py-2 rounded-full text-sm font-medium border transition-colors ${form.leadSource === s ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-foreground hover:border-secondary'}`}>{s}</button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* STEP 1: Service Selection + Service-Specific Fields */}
        {step === 1 && (
          <div className="space-y-6">
            <h2 className="text-lg font-bold font-display">Select Service</h2>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {SERVICES.map(({ key, emoji }) => (
                <button key={key} onClick={() => updateForm({ service: key })} className={`p-4 rounded-xl border-2 text-center transition-all ${form.service === key ? 'border-primary bg-primary/5' : 'border-border hover:border-secondary'}`}>
                  <span className="text-2xl block mb-2">{emoji}</span>
                  <span className="text-sm font-medium">{key}</span>
                </button>
              ))}
            </div>

            {/* Bulk upload option for Visa/Air Ticket */}
            {(form.service === 'Air Ticket' || form.service === 'UAE Visa') && (
              <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                <FileUp className="w-5 h-5 text-secondary" />
                <span className="text-sm text-foreground flex-1">Have multiple clients?</span>
                <button onClick={() => setShowBulkUpload(!showBulkUpload)} className="btn-outline text-xs">{showBulkUpload ? 'Manual Entry' : 'Bulk Upload'}</button>
              </div>
            )}

            {showBulkUpload ? (
              <div className="space-y-4 border-t border-border pt-4">
                <div className="flex items-center gap-3">
                  <button onClick={downloadTemplate} className="btn-outline text-sm">Download Template</button>
                </div>
                <div className="border-2 border-dashed border-border rounded-xl p-6 text-center">
                  <Upload className="w-6 h-6 text-muted-foreground mx-auto mb-2" />
                  <label className="btn-outline cursor-pointer text-sm">
                    Upload CSV
                    <input type="file" accept=".csv" className="hidden" onChange={handleBulkFile} />
                  </label>
                </div>
                {bulkErrors.length > 0 && (
                  <div className="bg-destructive/10 p-3 rounded-lg">
                    {bulkErrors.map((e, i) => <p key={i} className="text-xs text-destructive">{e}</p>)}
                  </div>
                )}
                {bulkData.length > 0 && (
                  <div>
                    <p className="text-sm font-medium mb-2">{bulkData.length} valid records</p>
                    <div className="max-h-48 overflow-auto border border-border rounded-lg">
                      <table className="table-nawi w-full text-xs">
                        <thead><tr>{Object.keys(bulkData[0]).slice(0, 4).map(h => <th key={h}>{h}</th>)}</tr></thead>
                        <tbody>{bulkData.slice(0, 5).map((row, i) => <tr key={i}>{Object.values(row).slice(0, 4).map((v, j) => <td key={j}>{v as string}</td>)}</tr>)}</tbody>
                      </table>
                    </div>
                    <button onClick={handleBulkImport} className="btn-primary mt-3 w-full">Import {bulkData.length} Clients</button>
                  </div>
                )}
              </div>
            ) : form.service && (
              <div className="border-t border-border pt-4">
                <h3 className="text-base font-semibold font-display mb-4">{form.service} Details</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {form.service === 'Air Ticket' && <><Field label="Travel Date" k="travelDate" type="date" /><Field label="Departure City" k="departureCity" /><Field label="Arrival City" k="arrivalCity" /><Field label="Flight Number" k="flightNumber" /><Field label="PNR" k="pnr" /><Field label="Ticket Number" k="ticketNumber" /><Field label="Return Date" k="returnDate" type="date" /></>}
                  {form.service === 'UAE Visa' && <><SelectField label="Visa Type" k="visaType" options={['30 days', '60 days', '90 days', 'Extension']} /><SelectField label="Application Type" k="applicationType" options={['Inside UAE', 'Outside UAE']} /><SelectField label="Entry Type" k="entryType" options={['Single', 'Multiple']} /><Field label="Nationality" k="nationality" /></>}
                  {form.service === 'Global Visa' && <><Field label="Country" k="country" /><SelectField label="Applicant Type" k="applicantType" options={['Employed', 'Self-Employed', 'Unemployed']} /></>}
                  {form.service === 'Holiday Package' && <><SelectField label="Package Type" k="packageType" options={['Inbound', 'Outbound']} /><Field label="Travel Date" k="travelDate" type="date" /><Field label="Return Date" k="returnDate" type="date" /><Field label="Adults" k="adults" /><Field label="Children" k="children" /><Field label="Destination" k="destination" /></>}
                  {form.service === 'Travel Insurance' && <><Field label="Travel Date" k="travelDate" type="date" /><Field label="Return Date" k="returnDate" type="date" /><Field label="Coverage Type" k="coverageType" /><Field label="Destination" k="destination" /></>}
                  {form.service === 'Pilgrimage' && <><SelectField label="Type" k="pilgrimageType" options={['Hajj', 'Umrah']} /><Field label="Season/Year" k="season" /><Field label="Group Name" k="groupName" /><Field label="No. of Persons" k="persons" /></>}
                  {form.service === 'Meet & Assist' && <><Field label="Flight Number" k="flightNumber" /><SelectField label="Type" k="maType" options={['Arrival', 'Departure']} /><Field label="Airport" k="airport" /><Field label="Date/Time" k="dateTime" type="datetime-local" /></>}
                  {form.service === 'Hotel Booking' && <><Field label="Check-in" k="checkinDate" type="date" /><Field label="Check-out" k="checkoutDate" type="date" /><Field label="City" k="city" /><Field label="Rooms" k="rooms" /><SelectField label="Room Type" k="roomType" options={['Standard', 'Deluxe', 'Suite']} /><Field label="Guests" k="guests" /></>}
                </div>
              </div>
            )}
          </div>
        )}

        {/* STEP 2: Documents + Important Dates */}
        {step === 2 && (
          <div className="space-y-6">
            <h2 className="text-lg font-bold font-display">Documents & Important Dates</h2>

            {/* Required Documents Checklist */}
            {getRequiredDocs().length > 0 && (
              <div>
                <h3 className="text-sm font-semibold mb-3">Required Documents for {form.service}</h3>
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
                          <span className="text-xs text-success">Uploaded</span>
                        ) : (
                          <label className="btn-outline text-xs cursor-pointer py-1">
                            Upload
                            <input type="file" className="hidden" onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              const reader = new FileReader();
                              reader.onload = () => {
                                updateForm({ documents: [...form.documents, { name: file.name, type: file.type, docType: docName, base64: `NAWI_ENC::${reader.result}`, uploadedAt: new Date().toISOString() }] });
                              };
                              reader.readAsDataURL(file);
                            }} />
                          </label>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* OCR Simulation */}
            {form.documents.length > 0 && (
              <div className="p-4 bg-success/5 border border-success/20 rounded-xl">
                <h4 className="text-sm font-semibold text-success mb-2">📋 OCR Extracted Fields</h4>
                <p className="text-xs text-muted-foreground mb-3">Auto-detected from uploaded documents. Verify and edit if needed.</p>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="block text-xs text-muted-foreground mb-1">Name (from doc)</label><input value={form.name} readOnly className="input-nawi bg-success/5 border-success/20 text-sm" /></div>
                  <div><label className="block text-xs text-muted-foreground mb-1">Passport No.</label><input value={form.passportNo} onChange={(e) => updateForm({ passportNo: e.target.value })} className="input-nawi bg-success/5 border-success/20 text-sm" /></div>
                </div>
              </div>
            )}

            {/* Additional doc upload */}
            <div>
              <h3 className="text-sm font-semibold mb-2">Additional Documents</h3>
              <div className="border-2 border-dashed border-border rounded-xl p-6 text-center">
                <Upload className="w-6 h-6 text-muted-foreground mx-auto mb-2" />
                <label className="btn-outline cursor-pointer text-sm">
                  Upload Files
                  <input type="file" multiple className="hidden" onChange={(e) => {
                    const files = Array.from(e.target.files || []);
                    files.forEach(file => {
                      const reader = new FileReader();
                      reader.onload = () => {
                        updateForm({ documents: [...form.documents, { name: file.name, type: file.type, docType: 'Additional', base64: `NAWI_ENC::${reader.result}`, uploadedAt: new Date().toISOString() }] });
                      };
                      reader.readAsDataURL(file);
                    });
                  }} />
                </label>
              </div>
            </div>

            {/* Important Dates */}
            <div>
              <h3 className="text-sm font-semibold mb-3">Important Dates</h3>
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
          </div>
        )}

        {/* STEP 3: Review */}
        {step === 3 && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold font-display">Review & Confirm</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase">Client Details</h3>
                {[['Name', form.name], ['Mobile', form.mobile], ['Email', form.email], ['Type', form.clientType], ['Lead Source', form.leadSource], ['Nationality', form.nationality]].map(([l, v]) => (
                  <div key={l} className="flex justify-between text-sm"><span className="text-muted-foreground">{l}</span><span className="font-medium">{v || '—'}</span></div>
                ))}
              </div>
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase">Service</h3>
                <div className="flex justify-between text-sm"><span className="text-muted-foreground">Service</span><span className="font-medium">{form.service}</span></div>
                {Object.entries(form.serviceDetails).filter(([_, v]) => v).map(([k, v]) => (
                  <div key={k} className="flex justify-between text-sm"><span className="text-muted-foreground capitalize">{k.replace(/([A-Z])/g, ' $1')}</span><span className="font-medium">{v}</span></div>
                ))}
              </div>
            </div>
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

            <button onClick={handleSubmit} className="btn-primary w-full py-3 text-base mt-6">✨ Confirm & Create Client</button>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex justify-between">
        <button onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0} className="btn-outline disabled:opacity-40"><ChevronLeft className="w-4 h-4" /> Back</button>
        {step < steps.length - 1 && (
          <button onClick={() => setStep(step + 1)} disabled={step === 0 && (!form.name || !form.mobile || !form.clientType)} className="btn-primary disabled:opacity-40">Next <ChevronRight className="w-4 h-4" /></button>
        )}
      </div>
    </div>
  );
}
