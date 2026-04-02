import { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation, Link } from 'react-router-dom';
import {
  LayoutDashboard, Users, Briefcase, Calendar, FileText,
  DollarSign, BarChart3, Shield, LogOut, Menu,
  Search, ChevronLeft, Clock, PlaneTakeoff, MessageCircle, CalendarDays, Bell
} from 'lucide-react';
import { getCurrentUser, isAdmin, logout, storage, KEYS } from '@/lib/storage';
import logo from '@/assets/logo.png';

const adminLinks = [
  { to: '/admin/dashboard', label: 'Dashboard & Reports', icon: LayoutDashboard },
  { to: '/admin/employees', label: 'Employees', icon: Users },
  { to: '/admin/clients', label: 'Clients', icon: Briefcase },
  { to: '/admin/calendar', label: 'Calendar', icon: Calendar },
  { to: '/admin/important-dates', label: 'Important Dates', icon: CalendarDays },
  { to: '/admin/attendance', label: 'Attendance', icon: Clock },
  { to: '/admin/leave', label: 'Leave & HR', icon: FileText },
  { to: '/admin/payroll', label: 'Payroll', icon: DollarSign },
  { to: '/admin/audit-log', label: 'Audit Log', icon: Shield },
  { to: '/admin/chat', label: 'Team Chat', icon: MessageCircle },
];

const employeeLinks = [
  { to: '/employee/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/employee/clients', label: 'My Clients', icon: Briefcase },
  { to: '/employee/calendar', label: 'Calendar', icon: Calendar },
  { to: '/employee/important-dates', label: 'Important Dates', icon: CalendarDays },
  { to: '/employee/attendance', label: 'Attendance', icon: Clock },
  { to: '/employee/leave', label: 'Leave', icon: FileText },
  { to: '/employee/chat', label: 'Team Chat', icon: MessageCircle },
];

export default function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [showSearch, setShowSearch] = useState(false);
  const session = getCurrentUser();

  useEffect(() => {
    if (!session) navigate('/login');
  }, [session, navigate]);

  if (!session) return null;

  const links = session.role === 'admin' ? adminLinks : employeeLinks;
  const unreadChats = storage.getAll(KEYS.CHAT)
    .filter((m: any) => m.to === session.userId && !m.read).length;
  const unreadNotifications = storage.getAll(KEYS.NOTIFICATIONS)
    .filter((n: any) => n.userId === session.userId && !n.isRead).length;

  const handleSearch = (q: string) => {
    setSearchQuery(q);
    if (q.length < 2) { setSearchResults([]); setShowSearch(false); return; }
    const results = storage.search(KEYS.CLIENTS, q, ['name', 'id', 'mobile', 'passportNo']);
    setSearchResults(results.slice(0, 5));
    setShowSearch(true);
  };

  const handleLogout = () => { logout(); navigate('/login'); };

  const today = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  // Get employee photo
  const getPhoto = () => {
    if (session.role === 'admin') return null;
    const emp = storage.getAll(KEYS.EMPLOYEES).find((e: any) => e.id === session.userId);
    return emp?.photo || null;
  };
  const photo = getPhoto();

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {mobileOpen && (
        <div className="fixed inset-0 bg-foreground/50 z-40 lg:hidden" onClick={() => setMobileOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed lg:static inset-y-0 left-0 z-50 flex flex-col bg-sidebar transition-all duration-200
        ${collapsed ? 'w-[72px]' : 'w-[260px]'}
        ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        <div className="flex items-center gap-3 px-4 py-5 border-b border-sidebar-border">
          <div className="w-10 h-10 rounded-full bg-sidebar-accent flex items-center justify-center flex-shrink-0">
            <img src={logo} alt="NS" className="w-8 h-8 object-contain" />
          </div>
          {!collapsed && (
            <div className="overflow-hidden">
              <h1 className="text-sm font-bold text-sidebar-foreground font-display truncate">Nawi Saadi</h1>
              <p className="text-xs text-sidebar-muted">Travel & Tourism</p>
            </div>
          )}
          <button onClick={() => setCollapsed(!collapsed)} className="ml-auto text-sidebar-muted hover:text-sidebar-foreground hidden lg:block">
            <ChevronLeft className={`w-4 h-4 transition-transform ${collapsed ? 'rotate-180' : ''}`} />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-1">
          {links.map((link) => {
            const active = location.pathname === link.to || location.pathname.startsWith(link.to + '/');
            return (
              <Link key={link.to} to={link.to} onClick={() => setMobileOpen(false)}
                className={active ? 'sidebar-link-active' : 'sidebar-link'}
                title={collapsed ? link.label : undefined}>
                <link.icon className="w-5 h-5 flex-shrink-0" />
                {!collapsed && <span>{link.label}</span>}
                {link.label === 'Team Chat' && (unreadChats + unreadNotifications) > 0 && !collapsed && (
                  <span className="ml-auto bg-destructive text-destructive-foreground text-xs px-1.5 py-0.5 rounded-full">{unreadChats + unreadNotifications}</span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-sidebar-border p-3">
          <div className="flex items-center gap-3">
            {photo ? (
              <img src={photo} alt="" className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
            ) : (
              <div className="w-9 h-9 rounded-full bg-sidebar-accent flex items-center justify-center text-sm font-bold text-sidebar-foreground flex-shrink-0">
                {session.userName.split(' ').map(n => n[0]).join('').slice(0, 2)}
              </div>
            )}
            {!collapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-sidebar-foreground truncate">{session.userName}</p>
                <p className="text-xs text-sidebar-muted capitalize">{session.role}</p>
              </div>
            )}
            {!collapsed && (
              <button onClick={handleLogout} className="text-sidebar-muted hover:text-destructive transition-colors" title="Logout">
                <LogOut className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-14 border-b border-border bg-background flex items-center px-4 gap-4 flex-shrink-0">
          <button onClick={() => setMobileOpen(true)} className="lg:hidden text-foreground">
            <Menu className="w-5 h-5" />
          </button>
          <h2 className="text-lg font-semibold text-foreground font-display hidden sm:block">
            {links.find(l => location.pathname.startsWith(l.to))?.label || 'Dashboard'}
          </h2>

          <div className="flex-1 max-w-md mx-auto relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input type="text" value={searchQuery} onChange={(e) => handleSearch(e.target.value)}
              onBlur={() => setTimeout(() => setShowSearch(false), 200)}
              className="input-nawi pl-9 py-1.5 text-sm" placeholder="Search clients..." />
            {showSearch && searchResults.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-xl shadow-elevated overflow-hidden z-50">
                {searchResults.map((c: any) => (
                  <Link key={c.id} to={`/${session.role === 'admin' ? 'admin' : 'employee'}/clients/${c.id}`}
                    className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted transition-colors">
                    <PlaneTakeoff className="w-4 h-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium text-foreground">{c.name}</p>
                      <p className="text-xs text-muted-foreground font-mono">{c.id} • {c.service || 'N/A'}</p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          <Link to={`/${session.role === 'admin' ? 'admin' : 'employee'}/notifications`} className="relative p-2 hover:bg-muted rounded-lg transition-colors" title="Notifications">
            <Bell className="w-5 h-5 text-muted-foreground" />
            {unreadNotifications > 0 && (
              <span className="absolute -top-0.5 -right-0.5 bg-destructive text-destructive-foreground text-[10px] w-4 h-4 rounded-full flex items-center justify-center">{unreadNotifications > 9 ? '9+' : unreadNotifications}</span>
            )}
          </Link>
          <span className="text-xs text-muted-foreground hidden md:block">{today}</span>
        </header>

        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
