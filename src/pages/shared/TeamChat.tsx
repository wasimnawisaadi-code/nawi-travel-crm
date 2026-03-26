import { useState, useEffect, useRef } from 'react';
import { Send, Plus, Users, X, Hash, User } from 'lucide-react';
import { storage, KEYS, getCurrentUser, isAdmin, generateId } from '@/lib/storage';

interface ChatMessage {
  id: string;
  from: string;
  fromName: string;
  fromPhoto?: string;
  to: string; // groupId or recipientId
  type: 'group' | 'direct';
  text: string;
  timestamp: string;
  read: boolean;
}

interface ChatGroup {
  id: string;
  name: string;
  members: string[];
  createdBy: string;
  createdAt: string;
}

export default function TeamChat() {
  const session = getCurrentUser();
  const [activeChat, setActiveChat] = useState<string>('general');
  const [activeChatType, setActiveChatType] = useState<'group' | 'direct'>('group');
  const [message, setMessage] = useState('');
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [showNewDM, setShowNewDM] = useState(false);
  const [groupForm, setGroupForm] = useState({ name: '', members: [] as string[] });
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const employees = storage.getAll(KEYS.EMPLOYEES).filter((e: any) => e.status === 'active');
  const admin = storage.get<any>(KEYS.ADMIN);
  const allUsers = [
    { id: admin?.id || 'ADM-001', name: admin?.name || 'Admin', photo: null },
    ...employees.map((e: any) => ({ id: e.id, name: e.name, photo: e.photo })),
  ];

  // Ensure general group exists
  useEffect(() => {
    const groups = storage.getAll(KEYS.CHAT_GROUPS);
    if (!groups.find((g: any) => g.id === 'general')) {
      storage.push(KEYS.CHAT_GROUPS, {
        id: 'general', name: 'General', members: allUsers.map(u => u.id),
        createdBy: 'ADM-001', createdAt: new Date().toISOString(),
      });
    }
  }, []);

  const groups = storage.getAll(KEYS.CHAT_GROUPS).filter((g: any) => g.members?.includes(session?.userId));
  const messages = storage.getAll(KEYS.CHAT);

  const currentMessages = messages.filter((m: any) => {
    if (activeChatType === 'group') return m.type === 'group' && m.to === activeChat;
    return m.type === 'direct' && (
      (m.from === session?.userId && m.to === activeChat) ||
      (m.from === activeChat && m.to === session?.userId)
    );
  }).sort((a: any, b: any) => a.timestamp.localeCompare(b.timestamp));

  // Get unique DM conversations
  const dmConversations = new Set<string>();
  messages.filter((m: any) => m.type === 'direct' && (m.from === session?.userId || m.to === session?.userId))
    .forEach((m: any) => {
      const otherId = m.from === session?.userId ? m.to : m.from;
      dmConversations.add(otherId);
    });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [currentMessages.length]);

  const sendMessage = () => {
    if (!message.trim() || !session) return;
    const user = allUsers.find(u => u.id === session.userId);
    const msg: ChatMessage = {
      id: generateId('MSG'),
      from: session.userId,
      fromName: session.userName,
      fromPhoto: user?.photo || undefined,
      to: activeChat,
      type: activeChatType,
      text: message.trim(),
      timestamp: new Date().toISOString(),
      read: false,
    };
    storage.push(KEYS.CHAT, msg);
    setMessage('');
  };

  const createGroup = () => {
    if (!groupForm.name.trim()) return;
    const group: ChatGroup = {
      id: generateId('GRP'),
      name: groupForm.name,
      members: [...groupForm.members, session?.userId || ''],
      createdBy: session?.userId || '',
      createdAt: new Date().toISOString(),
    };
    storage.push(KEYS.CHAT_GROUPS, group);
    setShowNewGroup(false);
    setGroupForm({ name: '', members: [] });
    setActiveChat(group.id);
    setActiveChatType('group');
  };

  const startDM = (userId: string) => {
    setActiveChat(userId);
    setActiveChatType('direct');
    setShowNewDM(false);
  };

  const getActiveName = () => {
    if (activeChatType === 'group') {
      return groups.find(g => g.id === activeChat)?.name || 'General';
    }
    return allUsers.find(u => u.id === activeChat)?.name || 'Chat';
  };

  const formatTime = (ts: string) => new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  const formatDay = (ts: string) => {
    const d = new Date(ts);
    const today = new Date();
    if (d.toDateString() === today.toDateString()) return 'Today';
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  };

  return (
    <div className="flex h-[calc(100vh-120px)] bg-background rounded-xl border border-border overflow-hidden animate-fade-in">
      {/* Sidebar */}
      <div className="w-64 border-r border-border flex flex-col flex-shrink-0">
        <div className="p-3 border-b border-border flex items-center justify-between">
          <h3 className="font-semibold font-display text-sm">Messages</h3>
          <div className="flex gap-1">
            <button onClick={() => setShowNewGroup(true)} className="p-1.5 hover:bg-muted rounded-lg text-muted-foreground hover:text-foreground" title="New Group"><Users className="w-4 h-4" /></button>
            <button onClick={() => setShowNewDM(true)} className="p-1.5 hover:bg-muted rounded-lg text-muted-foreground hover:text-foreground" title="New DM"><User className="w-4 h-4" /></button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Groups */}
          <div className="px-3 py-2">
            <p className="text-xs font-medium text-muted-foreground mb-1">Groups</p>
            {groups.map((g: any) => (
              <button key={g.id} onClick={() => { setActiveChat(g.id); setActiveChatType('group'); }}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center gap-2 transition-colors ${activeChat === g.id && activeChatType === 'group' ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-muted text-foreground'}`}>
                <Hash className="w-4 h-4 flex-shrink-0" />
                <span className="truncate">{g.name}</span>
              </button>
            ))}
          </div>

          {/* DMs */}
          <div className="px-3 py-2 border-t border-border">
            <p className="text-xs font-medium text-muted-foreground mb-1">Direct Messages</p>
            {Array.from(dmConversations).map((userId) => {
              const user = allUsers.find(u => u.id === userId);
              if (!user) return null;
              return (
                <button key={userId} onClick={() => startDM(userId)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center gap-2 transition-colors ${activeChat === userId && activeChatType === 'direct' ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-muted text-foreground'}`}>
                  {user.photo ? (
                    <img src={user.photo} alt="" className="w-5 h-5 rounded-full object-cover" />
                  ) : (
                    <div className="w-5 h-5 rounded-full bg-secondary flex items-center justify-center text-[8px] font-bold text-secondary-foreground">
                      {user.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                    </div>
                  )}
                  <span className="truncate">{user.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col">
        <div className="p-3 border-b border-border flex items-center gap-2">
          {activeChatType === 'group' ? <Hash className="w-5 h-5 text-muted-foreground" /> : <User className="w-5 h-5 text-muted-foreground" />}
          <h3 className="font-semibold text-sm">{getActiveName()}</h3>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {currentMessages.length === 0 && (
            <p className="text-center text-sm text-muted-foreground py-16">No messages yet. Start the conversation!</p>
          )}
          {currentMessages.map((msg: any, i: number) => {
            const isMe = msg.from === session?.userId;
            const showDate = i === 0 || formatDay(currentMessages[i - 1].timestamp) !== formatDay(msg.timestamp);
            return (
              <div key={msg.id}>
                {showDate && (
                  <div className="text-center my-4"><span className="text-xs text-muted-foreground bg-muted px-3 py-1 rounded-full">{formatDay(msg.timestamp)}</span></div>
                )}
                <div className={`flex items-end gap-2 ${isMe ? 'justify-end' : 'justify-start'}`}>
                  {!isMe && (
                    msg.fromPhoto ? (
                      <img src={msg.fromPhoto} alt="" className="w-7 h-7 rounded-full object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center text-[9px] font-bold text-secondary-foreground flex-shrink-0">
                        {msg.fromName.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                      </div>
                    )
                  )}
                  <div className={`max-w-[70%] ${isMe ? 'order-first' : ''}`}>
                    {!isMe && <p className="text-xs text-muted-foreground mb-1 ml-1">{msg.fromName}</p>}
                    <div className={`px-3 py-2 rounded-2xl text-sm ${isMe ? 'bg-primary text-primary-foreground rounded-br-md' : 'bg-muted text-foreground rounded-bl-md'}`}>
                      {msg.text}
                    </div>
                    <p className={`text-[10px] text-muted-foreground mt-0.5 ${isMe ? 'text-right mr-1' : 'ml-1'}`}>{formatTime(msg.timestamp)}</p>
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        <div className="p-3 border-t border-border">
          <div className="flex gap-2">
            <input value={message} onChange={(e) => setMessage(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
              className="input-nawi flex-1" placeholder={`Message ${getActiveName()}...`} />
            <button onClick={sendMessage} className="btn-primary px-3"><Send className="w-4 h-4" /></button>
          </div>
        </div>
      </div>

      {/* New Group Modal */}
      {showNewGroup && (
        <div className="fixed inset-0 bg-foreground/50 z-50 flex items-center justify-center p-4" onClick={() => setShowNewGroup(false)}>
          <div className="bg-card rounded-xl shadow-elevated w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold font-display mb-4">Create Group</h2>
            <div className="space-y-4">
              <div><label className="block text-sm font-medium mb-1">Group Name *</label><input value={groupForm.name} onChange={(e) => setGroupForm({ ...groupForm, name: e.target.value })} className="input-nawi" /></div>
              <div>
                <label className="block text-sm font-medium mb-2">Members</label>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {allUsers.filter(u => u.id !== session?.userId).map((u) => (
                    <label key={u.id} className="flex items-center gap-2 p-2 hover:bg-muted rounded-lg cursor-pointer">
                      <input type="checkbox" checked={groupForm.members.includes(u.id)} onChange={(e) => {
                        setGroupForm({ ...groupForm, members: e.target.checked ? [...groupForm.members, u.id] : groupForm.members.filter(m => m !== u.id) });
                      }} className="w-4 h-4 rounded" />
                      <span className="text-sm">{u.name}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex justify-end gap-3">
                <button onClick={() => setShowNewGroup(false)} className="btn-outline">Cancel</button>
                <button onClick={createGroup} className="btn-primary">Create</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* New DM Modal */}
      {showNewDM && (
        <div className="fixed inset-0 bg-foreground/50 z-50 flex items-center justify-center p-4" onClick={() => setShowNewDM(false)}>
          <div className="bg-card rounded-xl shadow-elevated w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold font-display mb-4">New Message</h2>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {allUsers.filter(u => u.id !== session?.userId).map((u) => (
                <button key={u.id} onClick={() => startDM(u.id)} className="w-full text-left p-3 hover:bg-muted rounded-lg flex items-center gap-3 transition-colors">
                  {u.photo ? (
                    <img src={u.photo} alt="" className="w-8 h-8 rounded-full object-cover" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-xs font-bold text-secondary-foreground">
                      {u.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                    </div>
                  )}
                  <span className="text-sm font-medium">{u.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
