import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Plane, Globe, Hotel, Shield } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { recordLoginAttendance, generateDailyNotifications } from '@/lib/supabase-service';
import logo from '@/assets/logo.png';

export default function Login() {
  const navigate = useNavigate();
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const { error: loginError } = await signIn(email, password);
    if (loginError) {
      setError(loginError);
      setLoading(false);
      return;
    }

    // Wait for auth state to settle, then get user info
    const { supabase } = await import('@/integrations/supabase/client');
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setError('Login failed');
      setLoading(false);
      return;
    }

    // Check role
    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    const role = roleData?.role || 'employee';

    // Record attendance & generate notifications
    await recordLoginAttendance(user.id);
    await generateDailyNotifications(user.id, role === 'admin');

    navigate(role === 'admin' ? '/admin/dashboard' : '/employee/dashboard');
    setLoading(false);
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
