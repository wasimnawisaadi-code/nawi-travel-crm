import { useState } from 'react';
import { getCurrentUser, storage, KEYS, formatDate } from '@/lib/storage';
import StatusBadge from '@/components/ui/StatusBadge';
import { LogOut, Clock, Camera, MapPin, Upload } from 'lucide-react';

export default function AttendancePage() {
  const session = getCurrentUser();
  const [yearMonth, setYearMonth] = useState(() => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`; });
  const [showCheckout, setShowCheckout] = useState(false);
  const [workSummary, setWorkSummary] = useState('');
  const [fieldPhoto, setFieldPhoto] = useState<any>(null);
  const [fieldLocation, setFieldLocation] = useState('');

  const emp = storage.getAll(KEYS.EMPLOYEES).find((e: any) => e.id === session?.userId);
  const isSales = emp?.profileType === 'sales';
  const attendance = storage.getAll(KEYS.ATTENDANCE).filter((a: any) => a.employeeId === session?.userId && a.date?.startsWith(yearMonth));
  const today = new Date().toISOString().split('T')[0];
  const todayRecord = storage.getAll(KEYS.ATTENDANCE).find((a: any) => a.employeeId === session?.userId && a.date === today);

  const present = attendance.filter((a: any) => a.status === 'Present').length;
  const late = attendance.filter((a: any) => a.status === 'Late').length;
  const totalHours = attendance.reduce((s: number, a: any) => s + (a.hoursWorked || 0), 0);

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setFieldPhoto({ base64: reader.result, name: file.name });
    reader.readAsDataURL(file);
  };

  const handleCheckout = () => {
    if (todayRecord && !todayRecord.logoutTime) {
      const logoutTime = new Date().toISOString();
      const loginDate = new Date(todayRecord.loginTime);
      const logoutDate = new Date(logoutTime);
      const hoursWorked = Math.round(((logoutDate.getTime() - loginDate.getTime()) / 3600000) * 10) / 10;
      const updates: any = { logoutTime, hoursWorked, workSummary: workSummary.trim() || undefined };
      if (isSales && fieldPhoto) {
        updates.fieldPhotos = [...(todayRecord.fieldPhotos || []), { base64: fieldPhoto.base64, location: fieldLocation, uploadedAt: new Date().toISOString() }];
      }
      storage.update(KEYS.ATTENDANCE, todayRecord.id, updates);
      setShowCheckout(false);
      setWorkSummary('');
      setFieldPhoto(null);
      setFieldLocation('');
      window.location.reload();
    }
  };

  const handleUploadFieldPhoto = () => {
    if (!todayRecord || !fieldPhoto) return;
    const photos = todayRecord.fieldPhotos || [];
    photos.push({ base64: fieldPhoto.base64, location: fieldLocation, uploadedAt: new Date().toISOString() });
    storage.update(KEYS.ATTENDANCE, todayRecord.id, { fieldPhotos: photos });
    setFieldPhoto(null);
    setFieldLocation('');
    window.location.reload();
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold font-display">My Attendance</h2>
        <input type="month" value={yearMonth} onChange={(e) => setYearMonth(e.target.value)} className="input-nawi w-auto" />
      </div>

      {/* Today's Status */}
      {todayRecord && (
        <div className="card-nawi">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center"><Clock className="w-5 h-5 text-primary" /></div>
              <div>
                <p className="text-sm font-semibold">Today's Session</p>
                <p className="text-xs text-muted-foreground">
                  Login: {new Date(todayRecord.loginTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                  {todayRecord.logoutTime && ` → Logout: ${new Date(todayRecord.logoutTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`}
                  {todayRecord.hoursWorked > 0 && ` (${todayRecord.hoursWorked}h)`}
                </p>
                {todayRecord.workSummary && <p className="text-xs text-secondary mt-1">📝 {todayRecord.workSummary}</p>}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <StatusBadge status={todayRecord.status} />
              {!todayRecord.logoutTime && (
                <button onClick={() => setShowCheckout(true)} className="btn-outline text-sm"><LogOut className="w-4 h-4" /> Check Out</button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Sales person field photo upload */}
      {isSales && todayRecord && !todayRecord.logoutTime && (
        <div className="card-nawi bg-warning/5 border-warning/20">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><MapPin className="w-4 h-4 text-warning" /> Field Visit Photo</h3>
          <p className="text-xs text-muted-foreground mb-3">Upload a photo of where you're working today</p>
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <input value={fieldLocation} onChange={e => setFieldLocation(e.target.value)} className="input-nawi mb-2" placeholder="Location description (e.g., ABC Company Office)" />
              <label className="btn-outline cursor-pointer text-sm w-full justify-center">
                <Camera className="w-4 h-4" /> {fieldPhoto ? fieldPhoto.name : 'Take/Upload Photo'}
                <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhotoUpload} />
              </label>
            </div>
            {fieldPhoto && (
              <button onClick={handleUploadFieldPhoto} className="btn-primary"><Upload className="w-4 h-4" /> Submit</button>
            )}
          </div>
          {todayRecord.fieldPhotos?.length > 0 && (
            <div className="mt-3 grid grid-cols-3 gap-2">
              {todayRecord.fieldPhotos.map((p: any, i: number) => (
                <div key={i} className="rounded-lg overflow-hidden border border-border">
                  <img src={p.base64} alt="" className="w-full h-20 object-cover" />
                  <p className="text-xs text-muted-foreground p-1 truncate">{p.location}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-3 gap-4">
        <div className="stat-card"><div className="stat-card-icon bg-success"><span className="text-primary-foreground font-bold">{present}</span></div><div><p className="text-xs text-muted-foreground">Present</p></div></div>
        <div className="stat-card"><div className="stat-card-icon bg-warning"><span className="text-primary-foreground font-bold">{late}</span></div><div><p className="text-xs text-muted-foreground">Late</p></div></div>
        <div className="stat-card"><div className="stat-card-icon bg-primary"><span className="text-primary-foreground font-bold">{Math.round(totalHours)}</span></div><div><p className="text-xs text-muted-foreground">Total Hours</p></div></div>
      </div>

      <div className="card-nawi p-0 overflow-x-auto">
        <table className="table-nawi w-full">
          <thead><tr><th>Date</th><th>Login</th><th>Logout</th><th>Hours</th><th>Work Summary</th><th>Status</th></tr></thead>
          <tbody>
            {attendance.length === 0 ? <tr><td colSpan={6} className="text-center text-muted-foreground py-8">No records</td></tr> :
              attendance.sort((a: any, b: any) => b.date.localeCompare(a.date)).map((a: any) => (
                <tr key={a.id}>
                  <td>{formatDate(a.date)}</td>
                  <td>{a.loginTime ? new Date(a.loginTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                  <td>{a.logoutTime ? new Date(a.logoutTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                  <td>{a.hoursWorked || 0}h</td>
                  <td className="max-w-[200px] truncate text-xs">{a.workSummary || '—'}</td>
                  <td><StatusBadge status={a.status} /></td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {/* Checkout Modal */}
      {showCheckout && (
        <div className="fixed inset-0 bg-foreground/50 z-50 flex items-center justify-center p-4" onClick={() => setShowCheckout(false)}>
          <div className="bg-card rounded-xl shadow-elevated w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold font-display mb-4">📝 Daily Check Out</h2>
            <p className="text-sm text-muted-foreground mb-4">Please describe what you worked on today:</p>
            <textarea value={workSummary} onChange={e => setWorkSummary(e.target.value)} className="input-nawi" rows={4} placeholder="e.g., Processed 5 visa applications, followed up with 3 clients..." />
            {isSales && (
              <div className="mt-4">
                <label className="block text-sm font-medium mb-1">Final Location Photo (optional)</label>
                <input value={fieldLocation} onChange={e => setFieldLocation(e.target.value)} className="input-nawi mb-2" placeholder="Where are you now?" />
                <label className="btn-outline cursor-pointer text-sm w-full justify-center">
                  <Camera className="w-4 h-4" /> {fieldPhoto ? fieldPhoto.name : 'Upload Photo'}
                  <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
                </label>
              </div>
            )}
            <div className="flex justify-end gap-3 mt-4">
              <button onClick={() => setShowCheckout(false)} className="btn-outline">Cancel</button>
              <button onClick={handleCheckout} className="btn-primary"><LogOut className="w-4 h-4" /> Check Out</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
