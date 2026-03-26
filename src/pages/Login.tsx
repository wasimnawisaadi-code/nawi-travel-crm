import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Plane, Globe, Hotel, Shield } from 'lucide-react';
import { storage, KEYS, generateId, generateDailyNotifications } from '@/lib/storage';
import logo from '@/assets/logo.png';

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    setTimeout(() => {
      const admin = storage.get<any>(KEYS.ADMIN);
      const employees = storage.getAll(KEYS.EMPLOYEES);

      let user: any = null;
      let role: 'admin' | 'employee' = 'employee';

      if (admin && admin.email === email && admin.passwordHash === password) {
        user = admin;
        role = 'admin';
      } else {
        const emp = employees.find((e: any) => e.email === email && e.password === password && e.status === 'active');
        if (emp) {
          user = emp;
          role = 'employee';
        }
      }

      if (!user) {
        setError('Invalid email or password');
        setLoading(false);
        return;
      }

      const session = {
        userId: user.id,
        userName: user.name,
        role,
        loginTime: new Date().toISOString(),
        token: crypto.randomUUID(),
      };
      storage.set(KEYS.SESSION, session);

      // Record attendance
      const today = new Date().toISOString().split('T')[0];
      const attendance = storage.getAll(KEYS.ATTENDANCE);
      const existing = attendance.find((a: any) => a.employeeId === user.id && a.date === today);
      if (!existing) {
        const now = new Date();
        const isLate = now.getHours() > 9 || (now.getHours() === 9 && now.getMinutes() > 0);
        storage.push(KEYS.ATTENDANCE, {
          id: generateId('ATT'),
          employeeId: user.id,
          date: today,
          loginTime: now.toISOString(),
          logoutTime: '',
          hoursWorked: 0,
          status: isLate ? 'Late' : 'Present',
        });
      }

      generateDailyNotifications(user.id, role);
      navigate(role === 'admin' ? '/admin/dashboard' : '/employee/dashboard');
      setLoading(false);
    }, 600);
  };

  return (
    <div className="min-h-screen flex">
      {/* Left Panel */}
      <div className="hidden lg:flex lg:w-1/2 bg-primary flex-col items-center justify-center relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-20"><Plane className="w-16 h-16 text-primary-foreground" /></div>
          <div className="absolute top-40 right-32"><Globe className="w-20 h-20 text-primary-foreground" /></div>
          <div className="absolute bottom-32 left-40"><Hotel className="w-14 h-14 text-primary-foreground" /></div>
          <div className="absolute bottom-20 right-20"><Shield className="w-18 h-18 text-primary-foreground" /></div>
        </div>
        <div className="relative z-10 text-center px-12">
          <img src={logo} alt="Nawi Saadi" className="w-48 h-48 mx-auto mb-6 object-contain" />
          <h1 className="text-4xl font-bold text-primary-foreground font-display mb-2">NAWI SAADI</h1>
          <p className="text-xl text-primary-foreground/80 font-display mb-4">Travel & Tourism</p>
          <div className="w-16 h-0.5 bg-primary-foreground/30 mx-auto mb-6" />
          <p className="text-lg text-primary-foreground/60 italic">Powering Travel Excellence</p>
        </div>
      </div>

      {/* Right Panel */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-background">
        <div className="w-full max-w-md">
          <div className="lg:hidden text-center mb-8">
            <img src={logo} alt="Nawi Saadi" className="w-24 h-24 mx-auto mb-4 object-contain" />
            <h1 className="text-2xl font-bold text-primary font-display">NAWI SAADI</h1>
            <p className="text-sm text-muted-foreground">Travel & Tourism</p>
          </div>

          <h2 className="text-2xl font-bold text-foreground font-display mb-1">Welcome back</h2>
          <p className="text-muted-foreground mb-8">Sign in to your account</p>

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Email Address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-nawi"
                placeholder="you@nawisaadi.com"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Password</label>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input-nawi pr-10"
                  placeholder="••••••••"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="remember"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="w-4 h-4 rounded border-border text-primary"
              />
              <label htmlFor="remember" className="text-sm text-muted-foreground">Remember me</label>
            </div>

            {error && (
              <div className="bg-destructive/10 text-destructive text-sm px-4 py-2.5 rounded-lg">{error}</div>
            )}

            <button type="submit" disabled={loading} className="btn-primary w-full py-2.5">
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
