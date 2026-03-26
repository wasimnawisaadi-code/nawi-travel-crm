import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, ChevronLeft, ChevronRight, Plane, FileText as VisaIcon, Globe, Palmtree, Shield, Building, Handshake, Hotel, Upload, AlertTriangle } from 'lucide-react';
import { storage, KEYS, generateId, getCurrentUser, auditLog, isAdmin } from '@/lib/storage';

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

const steps = ['Duplicate Check', 'Client Type', 'Select Service', 'Details', 'Service Fields', 'Documents', 'Dates', 'Review'];

export default function AddClientWizard() {
  const navigate = useNavigate();
  const session = getCurrentUser();
  const [step, setStep] = useState(0);
  const [duplicateChecked, setDuplicateChecked] = useState(false);
  const [duplicates, setDuplicates] = useState<any[]>([]);
  const basePath = isAdmin() ? '/admin' : '/employee';

  const [form, setForm] = useState({
    name: '', mobile: '', email: '', passportNo: '',
    clientType: '', companyName: '', companyNumber: '', paymentType: '',
    service: '', leadSource: '', nationality: '', dob: '',
    serviceDetails: {} as Record<string, string>,
    documents: [] as any[],
    importantDates: { dob: '', passportExpiry: '', visaExpiry: '', travelDate: '', weddingAnniversary: '' },
  });

  const updateForm = (changes: any) => setForm({ ...form, ...changes });
  const updateServiceDetail = (key: string, value: string) => setForm({ ...form, serviceDetails: { ...form.serviceDetails, [key]: value } });

  const checkDuplicates = () => {
    const clients = storage.getAll(KEYS.CLIENTS);
    const dupes = clients.filter((c: any) =>
      (form.name && c.name?.toLowerCase() === form.name.toLowerCase()) ||
      (form.passportNo && c.importantDates?.passportNo === form.passportNo) ||
      (form.mobile && c.mobile === form.mobile)
    );
    setDuplicates(dupes);
    setDuplicateChecked(true);
  };

  const handleSubmit = () => {
    const id = generateId('CLT');
    const client = {
      id, name: form.name, mobile: form.mobile, email: form.email,
      clientType: form.clientType, companyName: form.companyName, companyNumber: form.companyNumber,
      paymentType: form.paymentType, service: form.service, leadSource: form.leadSource,
      serviceDetails: form.serviceDetails, documents: form.documents,
      importantDates: { ...form.importantDates, dob: form.dob },
      status: 'New', assignedTo: session?.userId || '', revenue: 0, profit: 0, notes: '',
      createdAt: new Date().toISOString(), createdBy: session?.userId || '', updatedAt: new Date().toISOString(), history: [],
    };
    storage.push(KEYS.CLIENTS, client);
    auditLog('client_created', 'client', id, { name: form.name, service: form.service });
    navigate(`${basePath}/clients/${id}`);
  };

  const canNext = () => {
    switch (step) {
      case 0: return duplicateChecked;
      case 1: return !!form.clientType;
      case 2: return !!form.service;
      case 3: return !!form.name && !!form.mobile;
      default: return true;
    }
  };

  const renderServiceFields = () => {
    const sd = form.serviceDetails;
    const Field = ({ label, key }: { label: string; key: string }) => (
      <div>
        <label className="block text-sm font-medium mb-1">{label}</label>
        <input value={sd[key] || ''} onChange={(e) => updateServiceDetail(key, e.target.value)} className="input-nawi" />
      </div>
    );

    switch (form.service) {
      case 'Air Ticket':
        return <><Field label="Passport Number" key="passportNo" /><Field label="Travel Date" key="travelDate" /><Field label="Departure City" key="departureCity" /><Field label="Arrival City" key="arrivalCity" /><Field label="Flight Number" key="flightNumber" /><Field label="PNR" key="pnr" /><Field label="Ticket Number" key="ticketNumber" /><Field label="Return Date" key="returnDate" /></>;
      case 'UAE Visa':
        return (
          <>
            <div><label className="block text-sm font-medium mb-1">Visa Type</label><select value={sd.visaType || ''} onChange={(e) => updateServiceDetail('visaType', e.target.value)} className="input-nawi"><option value="">Select</option><option>30 days</option><option>60 days</option><option>90 days</option><option>Extension</option></select></div>
            <div><label className="block text-sm font-medium mb-1">Application Type</label><select value={sd.applicationType || ''} onChange={(e) => updateServiceDetail('applicationType', e.target.value)} className="input-nawi"><option value="">Select</option><option>Inside UAE</option><option>Outside UAE</option></select></div>
            <div><label className="block text-sm font-medium mb-1">Entry Type</label><select value={sd.entryType || ''} onChange={(e) => updateServiceDetail('entryType', e.target.value)} className="input-nawi"><option value="">Select</option><option>Single</option><option>Multiple</option></select></div>
            <Field label="Nationality" key="nationality" />
          </>
        );
      case 'Global Visa':
        return (
          <>
            <Field label="Country Applying For" key="country" />
            <div><label className="block text-sm font-medium mb-1">Applicant Type</label><select value={sd.applicantType || ''} onChange={(e) => updateServiceDetail('applicantType', e.target.value)} className="input-nawi"><option value="">Select</option><option>Employed</option><option>Self-Employed</option><option>Unemployed</option></select></div>
          </>
        );
      case 'Holiday Package':
        return <><div><label className="block text-sm font-medium mb-1">Package Type</label><select value={sd.packageType || ''} onChange={(e) => updateServiceDetail('packageType', e.target.value)} className="input-nawi"><option value="">Select</option><option>Inbound</option><option>Outbound</option></select></div><Field label="Travel Date" key="travelDate" /><Field label="Return Date" key="returnDate" /><Field label="Adults" key="adults" /><Field label="Children" key="children" /><Field label="Destination" key="destination" /></>;
      case 'Travel Insurance':
        return <><Field label="Travel Date" key="travelDate" /><Field label="Return Date" key="returnDate" /><Field label="Coverage Type" key="coverageType" /><Field label="Destination" key="destination" /></>;
      case 'Pilgrimage':
        return <><div><label className="block text-sm font-medium mb-1">Type</label><select value={sd.pilgrimageType || ''} onChange={(e) => updateServiceDetail('pilgrimageType', e.target.value)} className="input-nawi"><option value="">Select</option><option>Hajj</option><option>Umrah</option></select></div><Field label="Season/Year" key="season" /><Field label="Group Name" key="groupName" /><Field label="No. of Persons" key="persons" /></>;
      case 'Meet & Assist':
        return <><Field label="Flight Number" key="flightNumber" /><div><label className="block text-sm font-medium mb-1">Type</label><select value={sd.maType || ''} onChange={(e) => updateServiceDetail('maType', e.target.value)} className="input-nawi"><option value="">Select</option><option>Arrival</option><option>Departure</option></select></div><Field label="Airport" key="airport" /><Field label="Service Type" key="serviceType" /><Field label="Date/Time" key="dateTime" /></>;
      case 'Hotel Booking':
        return <><Field label="Check-in Date" key="checkinDate" /><Field label="Check-out Date" key="checkoutDate" /><Field label="City" key="city" /><Field label="No. of Rooms" key="rooms" /><Field label="Room Type" key="roomType" /><Field label="No. of Guests" key="guests" /></>;
      default:
        return <p className="text-sm text-muted-foreground">Select a service first.</p>;
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-fade-in">
      {/* Progress */}
      <div className="card-nawi">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium text-foreground">Step {step + 1} of {steps.length}</span>
          <span className="text-sm text-muted-foreground">{steps[step]}</span>
        </div>
        <div className="flex gap-1">
          {steps.map((_, i) => (
            <div key={i} className={`h-1.5 flex-1 rounded-full transition-colors ${i <= step ? 'bg-primary' : 'bg-muted'}`} />
          ))}
        </div>
      </div>

      {/* Step Content */}
      <div className="card-nawi">
        {step === 0 && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold font-display">Duplicate Check</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div><label className="block text-sm font-medium mb-1">Full Name</label><input value={form.name} onChange={(e) => updateForm({ name: e.target.value })} className="input-nawi" /></div>
              <div><label className="block text-sm font-medium mb-1">Passport Number</label><input value={form.passportNo} onChange={(e) => updateForm({ passportNo: e.target.value })} className="input-nawi" /></div>
              <div><label className="block text-sm font-medium mb-1">Mobile Number</label><input value={form.mobile} onChange={(e) => updateForm({ mobile: e.target.value })} className="input-nawi" /></div>
            </div>
            <button onClick={checkDuplicates} className="btn-primary">Check for Duplicates</button>
            {duplicateChecked && (
              duplicates.length > 0 ? (
                <div className="bg-warning/10 border border-warning/20 p-4 rounded-lg">
                  <div className="flex items-center gap-2 mb-2"><AlertTriangle className="w-5 h-5 text-warning" /><span className="font-medium text-warning">Potential duplicates found</span></div>
                  {duplicates.map((d: any) => <p key={d.id} className="text-sm text-foreground">{d.name} — {d.mobile} — {d.id}</p>)}
                  <button onClick={() => setStep(1)} className="btn-outline mt-3">Continue as New</button>
                </div>
              ) : (
                <div className="bg-success/10 border border-success/20 p-4 rounded-lg flex items-center gap-2">
                  <Check className="w-5 h-5 text-success" /><span className="text-success font-medium">No duplicates found</span>
                </div>
              )
            )}
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold font-display">Client Type</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[{ key: 'Individual', icon: '👤' }, { key: 'B2B', icon: '🏢' }, { key: 'Corporate', icon: '🏗️' }].map(({ key, icon }) => (
                <button key={key} onClick={() => updateForm({ clientType: key })} className={`p-6 rounded-xl border-2 text-center transition-all ${form.clientType === key ? 'border-primary bg-primary/5' : 'border-border hover:border-secondary'}`}>
                  <span className="text-3xl block mb-2">{icon}</span>
                  <span className="font-medium text-foreground">{key}</span>
                </button>
              ))}
            </div>
            {(form.clientType === 'B2B' || form.clientType === 'Corporate') && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-border">
                <div><label className="block text-sm font-medium mb-1">Company Name *</label><input value={form.companyName} onChange={(e) => updateForm({ companyName: e.target.value })} className="input-nawi" /></div>
                <div><label className="block text-sm font-medium mb-1">Company Reg. Number</label><input value={form.companyNumber} onChange={(e) => updateForm({ companyNumber: e.target.value })} className="input-nawi" /></div>
                <div><label className="block text-sm font-medium mb-1">Payment Type</label>
                  <div className="flex gap-3 mt-1">{['Cash', 'Credit'].map((t) => <label key={t} className="flex items-center gap-2 cursor-pointer"><input type="radio" name="paymentType" value={t} checked={form.paymentType === t} onChange={(e) => updateForm({ paymentType: e.target.value })} className="w-4 h-4 text-primary" /><span className="text-sm">{t}</span></label>)}</div>
                </div>
              </div>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold font-display">Select Service</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {SERVICES.map(({ key, icon: Icon, emoji }) => (
                <button key={key} onClick={() => updateForm({ service: key })} className={`p-4 rounded-xl border-2 text-center transition-all ${form.service === key ? 'border-primary bg-primary/5' : 'border-border hover:border-secondary'}`}>
                  <span className="text-2xl block mb-2">{emoji}</span>
                  <span className="text-sm font-medium text-foreground">{key}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold font-display">Common Details</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div><label className="block text-sm font-medium mb-1">Full Name *</label><input value={form.name} onChange={(e) => updateForm({ name: e.target.value })} className="input-nawi" required /></div>
              <div><label className="block text-sm font-medium mb-1">Mobile Number *</label><input value={form.mobile} onChange={(e) => updateForm({ mobile: e.target.value })} className="input-nawi" required /></div>
              <div><label className="block text-sm font-medium mb-1">Email Address</label><input type="email" value={form.email} onChange={(e) => updateForm({ email: e.target.value })} className="input-nawi" /></div>
              <div><label className="block text-sm font-medium mb-1">Nationality</label><input value={form.nationality} onChange={(e) => updateForm({ nationality: e.target.value })} className="input-nawi" /></div>
              <div><label className="block text-sm font-medium mb-1">Date of Birth</label><input type="date" value={form.dob} onChange={(e) => updateForm({ dob: e.target.value })} className="input-nawi" /></div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Lead Source *</label>
              <div className="flex flex-wrap gap-2">
                {LEAD_SOURCES.map((s) => (
                  <button key={s} onClick={() => updateForm({ leadSource: s })} className={`px-4 py-2 rounded-full text-sm font-medium border transition-colors ${form.leadSource === s ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-foreground hover:border-secondary'}`}>{s}</button>
                ))}
              </div>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold font-display">Service Details — {form.service}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{renderServiceFields()}</div>
          </div>
        )}

        {step === 5 && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold font-display">Document Upload</h2>
            <div className="border-2 border-dashed border-border rounded-xl p-8 text-center">
              <Upload className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground mb-3">Drag and drop or click to upload</p>
              <label className="btn-outline cursor-pointer">
                Choose Files
                <input type="file" multiple className="hidden" onChange={(e) => {
                  const files = Array.from(e.target.files || []);
                  files.forEach((file) => {
                    const reader = new FileReader();
                    reader.onload = () => {
                      updateForm({ documents: [...form.documents, { name: file.name, type: file.type, base64: `NAWI_ENC::${reader.result}`, uploadedAt: new Date().toISOString() }] });
                    };
                    reader.readAsDataURL(file);
                  });
                }} />
              </label>
            </div>
            {form.documents.length > 0 && (
              <div className="space-y-2">
                {form.documents.map((d: any, i: number) => (
                  <div key={i} className="flex items-center justify-between p-3 border border-border rounded-lg">
                    <span className="text-sm font-medium">{d.name}</span>
                    <button onClick={() => updateForm({ documents: form.documents.filter((_: any, j: number) => j !== i) })} className="text-destructive text-sm">Remove</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {step === 6 && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold font-display">Important Dates</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                { label: 'Date of Birth', key: 'dob' }, { label: 'Passport Expiry', key: 'passportExpiry' },
                { label: 'Visa Expiry', key: 'visaExpiry' }, { label: 'Travel Date', key: 'travelDate' },
                { label: 'Wedding Anniversary', key: 'weddingAnniversary' },
              ].map(({ label, key }) => (
                <div key={key}>
                  <label className="block text-sm font-medium mb-1">{label}</label>
                  <input type="date" value={(form.importantDates as any)[key] || (key === 'dob' ? form.dob : '')} onChange={(e) => updateForm({ importantDates: { ...form.importantDates, [key]: e.target.value } })} className="input-nawi" />
                </div>
              ))}
            </div>
          </div>
        )}

        {step === 7 && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold font-display">Review & Confirm</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 bg-muted/50 rounded-lg"><p className="text-xs text-muted-foreground">Name</p><p className="font-medium">{form.name}</p></div>
              <div className="p-4 bg-muted/50 rounded-lg"><p className="text-xs text-muted-foreground">Mobile</p><p className="font-medium">{form.mobile}</p></div>
              <div className="p-4 bg-muted/50 rounded-lg"><p className="text-xs text-muted-foreground">Client Type</p><p className="font-medium">{form.clientType}</p></div>
              <div className="p-4 bg-muted/50 rounded-lg"><p className="text-xs text-muted-foreground">Service</p><p className="font-medium">{form.service}</p></div>
              <div className="p-4 bg-muted/50 rounded-lg"><p className="text-xs text-muted-foreground">Lead Source</p><p className="font-medium">{form.leadSource || '—'}</p></div>
              <div className="p-4 bg-muted/50 rounded-lg"><p className="text-xs text-muted-foreground">Documents</p><p className="font-medium">{form.documents.length} uploaded</p></div>
              <div className="p-4 bg-muted/50 rounded-lg"><p className="text-xs text-muted-foreground">Assigned To</p><p className="font-medium">{session?.userName}</p></div>
            </div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex justify-between">
        <button onClick={() => step > 0 ? setStep(step - 1) : navigate(`${basePath}/clients`)} className="btn-outline"><ChevronLeft className="w-4 h-4" /> {step === 0 ? 'Cancel' : 'Back'}</button>
        {step < steps.length - 1 ? (
          <button onClick={() => setStep(step + 1)} disabled={!canNext()} className="btn-primary disabled:opacity-40">Next <ChevronRight className="w-4 h-4" /></button>
        ) : (
          <button onClick={handleSubmit} className="btn-primary w-40">Confirm & Create Client</button>
        )}
      </div>
    </div>
  );
}
