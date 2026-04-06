import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth-context';
import { formatDate } from '@/lib/supabase-service';
import { Bell, CheckCheck } from 'lucide-react';
import EmptyState from '@/components/ui/EmptyState';

export default function NotificationsPage() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<any[]>([]);

  const load = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    setNotifications(data || []);
  };
  useEffect(() => { load(); }, [user]);

  const markAllRead = async () => {
    if (!user) return;
    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', user.id)
      .eq('is_read', false);
    load();
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold font-display">Notifications</h2>
        <button onClick={markAllRead} className="btn-outline text-sm"><CheckCheck className="w-4 h-4" /> Mark all read</button>
      </div>
      {notifications.length === 0 ? (
        <EmptyState icon={<Bell className="w-8 h-8 text-muted-foreground" />} title="No notifications" description="You're all caught up!" />
      ) : (
        <div className="space-y-2">
          {notifications.map((n: any) => (
            <div key={n.id} className={`card-nawi flex items-start gap-3 cursor-pointer ${!n.is_read ? 'border-secondary/50 bg-secondary/5' : ''}`}
              onClick={async () => {
                await supabase.from('notifications').update({ is_read: true }).eq('id', n.id);
                load();
              }}>
              <Bell className={`w-5 h-5 mt-0.5 flex-shrink-0 ${!n.is_read ? 'text-secondary' : 'text-muted-foreground'}`} />
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">{n.title}</p>
                <p className="text-sm text-muted-foreground">{n.message}</p>
                <p className="text-xs text-muted-foreground mt-1">{formatDate(n.created_at)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
