import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Plus, Trash2, Download, Send, Save, MessageCircle } from 'lucide-react';
import { storage, KEYS, generateId, getCurrentUser, auditLog, formatCurrency } from '@/lib/storage';
import jsPDF from 'jspdf';

export default function QuotationGenerator() {
  const session = getCurrentUser();
  const clients = storage.getAll(KEYS.CLIENTS);
  const [clientId, setClientId] = useState('');
  const [lineItems, setLineItems] = useState([{ description: '', amount: 0 }]);
  const [payableAmount, setPayableAmount] = useState(0);
  const [notes, setNotes] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [saved, setSaved] = useState(false);

  const client = clients.find((c: any) => c.id === clientId);
  const quotedPrice = lineItems.reduce((s, li) => s + (li.amount || 0), 0);
  const profit = quotedPrice - payableAmount;

  const addLine = () => setLineItems([...lineItems, { description: '', amount: 0 }]);
  const removeLine = (i: number) => setLineItems(lineItems.filter((_, j) => j !== i));
  const updateLine = (i: number, field: string, value: any) => {
    const updated = [...lineItems];
    (updated[i] as any)[field] = field === 'amount' ? Number(value) : value;
    setLineItems(updated);
  };

  const generatePDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.setTextColor(5, 47, 89);
    doc.text('NAWI SAADI TRAVEL & TOURISM', 20, 25);
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text('Travel & Tourism Services', 20, 32);
    doc.line(20, 36, 190, 36);

    doc.setFontSize(14);
    doc.setTextColor(5, 47, 89);
    doc.text('QUOTATION', 20, 46);
    doc.setFontSize(10);
    doc.setTextColor(50);
    doc.text(`Date: ${new Date().toLocaleDateString('en-GB')}`, 140, 46);
    if (validUntil) doc.text(`Valid Until: ${new Date(validUntil).toLocaleDateString('en-GB')}`, 140, 52);

    if (client) {
      doc.setFontSize(10);
      doc.text('PREPARED FOR:', 20, 60);
      doc.setTextColor(0);
      doc.text(client.name, 20, 66);
      doc.text(client.mobile || '', 20, 72);
      doc.text(client.email || '', 20, 78);
      if (client.service) doc.text(`Service: ${client.service}`, 20, 84);
    }

    let y = 96;
    doc.setFillColor(5, 47, 89);
    doc.rect(20, y, 170, 8, 'F');
    doc.setTextColor(255);
    doc.setFontSize(9);
    doc.text('DESCRIPTION', 25, y + 5.5);
    doc.text('AMOUNT (AED)', 155, y + 5.5);
    y += 12;

    doc.setTextColor(0);
    lineItems.forEach((li) => {
      if (!li.description) return;
      doc.text(li.description, 25, y);
      doc.text(li.amount.toLocaleString(), 160, y, { align: 'right' });
      y += 7;
    });

    doc.line(20, y, 190, y);
    y += 8;
    doc.setFontSize(11);
    doc.setTextColor(5, 47, 89);
    doc.text(`TOTAL QUOTED PRICE: AED ${quotedPrice.toLocaleString()}`, 20, y);

    if (notes) { y += 12; doc.setFontSize(9); doc.setTextColor(100); doc.text(`Notes: ${notes}`, 20, y); }

    y += 16;
    doc.setFontSize(9);
    doc.text(`Authorized by: ${session?.userName}`, 20, y);
    doc.text('Nawi Saadi Travel & Tourism', 20, y + 6);

    doc.save(`Quotation_${client?.name || 'draft'}.pdf`);
  };

  const handleSave = () => {
    if (!clientId) return;
    const quo = {
      id: generateId('QUO'), clientId, clientName: client?.name || '', service: client?.service || '',
      lineItems, quotedPrice, payableAmount, profit, status: 'Draft',
      generatedBy: session?.userId || '', generatedAt: new Date().toISOString(), emailedAt: '',
    };
    storage.push(KEYS.QUOTATIONS, quo);
    auditLog('quotation_generated', 'quotation', quo.id, { clientId });
    setSaved(true);
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <h2 className="text-lg font-bold font-display">Quotation Generator</h2>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Form */}
        <div className="card-nawi space-y-4">
          <div><label className="block text-sm font-medium mb-1">Client *</label>
            <select value={clientId} onChange={(e) => setClientId(e.target.value)} className="input-nawi">
              <option value="">Select client...</option>
              {clients.map((c: any) => <option key={c.id} value={c.id}>{c.name} ({c.id})</option>)}
            </select>
          </div>
          {client && (
            <div className="grid grid-cols-2 gap-3 p-3 bg-muted/50 rounded-lg text-sm">
              <div><span className="text-muted-foreground">Service:</span> {client.service}</div>
              <div><span className="text-muted-foreground">Mobile:</span> {client.mobile}</div>
            </div>
          )}
          <div><label className="block text-sm font-medium mb-1">Valid Until</label><input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} className="input-nawi" /></div>

          <div>
            <div className="flex items-center justify-between mb-2"><label className="text-sm font-medium">Line Items</label><button onClick={addLine} className="btn-outline text-xs py-1"><Plus className="w-3 h-3" /> Add</button></div>
            {lineItems.map((li, i) => (
              <div key={i} className="flex gap-2 mb-2">
                <input value={li.description} onChange={(e) => updateLine(i, 'description', e.target.value)} className="input-nawi flex-1" placeholder="Description" />
                <input type="number" value={li.amount || ''} onChange={(e) => updateLine(i, 'amount', e.target.value)} className="input-nawi w-28" placeholder="Amount" />
                {lineItems.length > 1 && <button onClick={() => removeLine(i)} className="text-destructive p-1"><Trash2 className="w-4 h-4" /></button>}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-sm font-medium mb-1">Quoted Price (auto)</label><input value={quotedPrice} readOnly className="input-nawi bg-muted" /></div>
            <div><label className="block text-sm font-medium mb-1">Payable Amount</label><input type="number" value={payableAmount || ''} onChange={(e) => setPayableAmount(Number(e.target.value))} className="input-nawi" /></div>
          </div>
          <div className={`p-3 rounded-lg text-center font-bold font-display text-lg ${profit >= 0 ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'}`}>
            Profit: {formatCurrency(profit)}
          </div>
          <div><label className="block text-sm font-medium mb-1">Notes</label><textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="input-nawi" rows={2} /></div>

          <div className="flex gap-2 flex-wrap">
            <button onClick={handleSave} className="btn-primary flex-1" disabled={saved}><Save className="w-4 h-4" /> {saved ? 'Saved!' : 'Save'}</button>
            <button onClick={generatePDF} className="btn-secondary flex-1"><Download className="w-4 h-4" /> PDF</button>
            <button onClick={() => {
              if (!client) return;
              const text = `Dear ${client.name},%0A%0AThank you for your enquiry. Here is your quotation from *Nawi Saadi Travel & Tourism*:%0A%0A${lineItems.filter(li => li.description).map(li => `• ${li.description}: AED ${li.amount.toLocaleString()}`).join('%0A')}%0A%0A*Total: AED ${quotedPrice.toLocaleString()}*${validUntil ? `%0AValid Until: ${new Date(validUntil).toLocaleDateString('en-GB')}` : ''}${notes ? `%0A%0ANotes: ${notes}` : ''}%0A%0ARegards,%0ANawi Saadi Travel & Tourism`;
              const phone = client.mobile?.replace(/[^0-9]/g, '') || '';
              window.open(`https://wa.me/${phone}?text=${text}`, '_blank');
            }} className="btn-outline flex-1 text-green-600 border-green-600 hover:bg-green-50"><MessageCircle className="w-4 h-4" /> WhatsApp</button>
          </div>
        </div>

        {/* Preview */}
        <div className="card-nawi bg-muted/30">
          <div className="border border-border rounded-lg bg-background p-6 text-sm">
            <h3 className="text-lg font-bold text-primary font-display">NAWI SAADI TRAVEL & TOURISM</h3>
            <p className="text-xs text-muted-foreground mb-4">Travel & Tourism Services</p>
            <hr className="border-border mb-4" />
            <p className="font-bold text-primary mb-2">QUOTATION</p>
            <p className="text-xs text-muted-foreground">Date: {new Date().toLocaleDateString('en-GB')}</p>
            {validUntil && <p className="text-xs text-muted-foreground">Valid Until: {new Date(validUntil).toLocaleDateString('en-GB')}</p>}
            {client && (
              <div className="mt-3 mb-4">
                <p className="text-xs text-muted-foreground">PREPARED FOR:</p>
                <p className="font-medium">{client.name}</p>
                <p className="text-xs">{client.mobile} {client.email && `• ${client.email}`}</p>
              </div>
            )}
            <div className="bg-primary text-primary-foreground text-xs px-3 py-1.5 rounded-t flex justify-between"><span>Description</span><span>Amount</span></div>
            <div className="border border-t-0 border-border rounded-b divide-y divide-border">
              {lineItems.filter(li => li.description).map((li, i) => (
                <div key={i} className="flex justify-between px-3 py-1.5 text-xs"><span>{li.description}</span><span>AED {li.amount.toLocaleString()}</span></div>
              ))}
            </div>
            <div className="mt-3 text-right font-bold text-primary">Total: AED {quotedPrice.toLocaleString()}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
