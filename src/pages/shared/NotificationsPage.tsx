import { useState, useEffect } from 'react';
import { storage, KEYS, formatDate, getCurrentUser } from '@/lib/storage';
import { Bell, CheckCheck } from 'lucide-react';
import EmptyState from '@/components/ui/EmptyState';

export default function NotificationsPage() {
  const session = getCurrentUser();
  const [notifications, setNotifications] = useState<any[]>([]);
  const load = () => {
    const all = storage.getAll(KEYS.NOTIFICATIONS).filter((n: any) => n.userId === session?.userId);
    setNotifications(all.reverse());
  };
  useEffect(load, [session]);

  const markAllRead = () => {
    notifications.forEach((n: any) => storage.update(KEYS.NOTIFICATIONS, n.id, { isRead: true }));
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
            <div key={n.id} className={`card-nawi flex items-start gap-3 ${!n.isRead ? 'border-secondary/50 bg-secondary/5' : ''}`} onClick={() => { storage.update(KEYS.NOTIFICATIONS, n.id, { isRead: true }); load(); }}>
              <Bell className={`w-5 h-5 mt-0.5 flex-shrink-0 ${!n.isRead ? 'text-secondary' : 'text-muted-foreground'}`} />
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">{n.title}</p>
                <p className="text-sm text-muted-foreground">{n.message}</p>
                <p className="text-xs text-muted-foreground mt-1">{formatDate(n.createdAt)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
