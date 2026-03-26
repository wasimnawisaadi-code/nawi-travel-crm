import { useState } from 'react';
import { Upload, Download, AlertTriangle, Check } from 'lucide-react';
import { storage, KEYS, generateId, getCurrentUser, auditLog } from '@/lib/storage';
import Papa from 'papaparse';

const TEMPLATES: Record<string, string[]> = {
  'Air Ticket': ['Name', 'Mobile', 'Email', 'PassportNo', 'TravelDate', 'DepartureCity', 'ArrivalCity'],
  'UAE Visa': ['Name', 'Mobile', 'Email', 'PassportNo', 'VisaType', 'ApplicationType', 'Nationality'],
};

export default function BulkUpload() {
  const session = getCurrentUser();
  const [service, setService] = useState('Air Ticket');
  const [step, setStep] = useState(0);
  const [rows, setRows] = useState<any[]>([]);
  const [errors, setErrors] = useState<number[]>([]);
  const [imported, setImported] = useState(0);

  const downloadTemplate = () => {
    const csv = TEMPLATES[service].join(',') + '\n';
    const blob = new Blob([csv], { type: 'text/csv' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${service.replace(/ /g, '_')}_template.csv`;
    link.click();
  };

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    Papa.parse(file, {
      header: true,
      complete: (results) => {
        const clients = storage.getAll(KEYS.CLIENTS);
        const errs: number[] = [];
        results.data.forEach((row: any, i: number) => {
          if (!row.Name || !row.Mobile) errs.push(i);
          if (clients.some((c: any) => c.mobile === row.Mobile)) row._duplicate = true;
        });
        setRows(results.data.filter((r: any) => r.Name));
        setErrors(errs);
        setStep(1);
      }
    });
  };

  const handleImport = () => {
    let count = 0;
    rows.forEach((row: any, i: number) => {
      if (errors.includes(i) || row._duplicate) return;
      const id = generateId('CLT');
      storage.push(KEYS.CLIENTS, {
        id, name: row.Name, mobile: row.Mobile, email: row.Email || '',
        clientType: 'Individual', service, leadSource: 'Bulk Upload',
        serviceDetails: row, documents: [],
        importantDates: { dob: '', passportExpiry: '', visaExpiry: '', travelDate: row.TravelDate || '', weddingAnniversary: '' },
        status: 'New', assignedTo: session?.userId || '', revenue: 0, profit: 0, notes: '',
        createdAt: new Date().toISOString(), createdBy: session?.userId || '', updatedAt: new Date().toISOString(), history: [],
      });
      count++;
    });
    auditLog('bulk_import', 'client', '', { count, service });
    setImported(count);
    setStep(2);
  };

  return (
    <div className="max-w-3xl mx-auto space-y-4 animate-fade-in">
      <h2 className="text-lg font-bold font-display">Bulk Upload</h2>
      <div className="flex gap-1 mb-4">{[0, 1, 2].map(s => <div key={s} className={`h-1.5 flex-1 rounded-full ${s <= step ? 'bg-primary' : 'bg-muted'}`} />)}</div>

      {step === 0 && (
        <div className="card-nawi space-y-4">
          <div><label className="block text-sm font-medium mb-1">Service Type</label>
            <select value={service} onChange={(e) => setService(e.target.value)} className="input-nawi w-auto">{Object.keys(TEMPLATES).map(s => <option key={s}>{s}</option>)}</select>
          </div>
          <button onClick={downloadTemplate} className="btn-outline"><Download className="w-4 h-4" /> Download Template</button>
          <div className="border-2 border-dashed border-border rounded-xl p-8 text-center">
            <Upload className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground mb-3">Upload your CSV file</p>
            <label className="btn-primary cursor-pointer">Choose File<input type="file" accept=".csv" className="hidden" onChange={handleUpload} /></label>
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="card-nawi space-y-4">
          <p className="text-sm text-muted-foreground">{rows.length} rows found • {errors.length} errors • {rows.filter((r: any) => r._duplicate).length} duplicates</p>
          <div className="overflow-x-auto max-h-96">
            <table className="table-nawi w-full text-xs">
              <thead><tr>{TEMPLATES[service].map(h => <th key={h}>{h}</th>)}<th>Status</th></tr></thead>
              <tbody>{rows.map((r: any, i: number) => (
                <tr key={i} className={errors.includes(i) ? 'bg-destructive/10' : r._duplicate ? 'bg-warning/10' : ''}>
                  {TEMPLATES[service].map(h => <td key={h}>{r[h] || '—'}</td>)}
                  <td>{errors.includes(i) ? <span className="text-destructive text-xs">Error</span> : r._duplicate ? <span className="text-warning text-xs">Duplicate</span> : <span className="text-success text-xs">OK</span>}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <div className="flex justify-between"><button onClick={() => setStep(0)} className="btn-outline">Back</button><button onClick={handleImport} className="btn-primary">Import {rows.length - errors.length - rows.filter((r: any) => r._duplicate).length} Clients</button></div>
        </div>
      )}

      {step === 2 && (
        <div className="card-nawi text-center py-12">
          <Check className="w-16 h-16 text-success mx-auto mb-4" />
          <h3 className="text-xl font-bold font-display mb-2">Import Complete!</h3>
          <p className="text-muted-foreground">{imported} clients successfully imported.</p>
          <button onClick={() => { setStep(0); setRows([]); setErrors([]); }} className="btn-primary mt-4">Upload More</button>
        </div>
      )}
    </div>
  );
}
