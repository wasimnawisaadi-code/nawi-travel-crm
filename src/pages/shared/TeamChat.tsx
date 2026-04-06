import { useState, useEffect, useRef } from 'react';
import { Send, Plus, Users, X, Hash, User } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth-context';

export default function TeamChat() {
  const { user, profile } = useAuth();
  const [activeChat, setActiveChat] = useState<string>('');
  const [activeChatType, setActiveChatType] = useState<'group' | 'direct'>('group');
  const [message, setMessage] = useState('');
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [showNewDM, setShowNewDM] = useState(false);
  const [groupForm, setGroupForm] = useState({ name: '', members: [] as string[] });
  const [groups, setGroups] = useState<any[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [dmConversations, setDmConversations] = useState<string[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load users
  useEffect(() => {
    const fetchUsers = async () => {
      const { data } = await supabase.from('profiles').select('user_id, name, photo_url').eq('status', 'active');
      setAllUsers(data || []);
    };
    fetchUsers();
  }, []);

  // Load groups
  useEffect(() => {
    if (!user) return;
    const fetchGroups = async () => {
      const { data } = await supabase.from('chat_groups').select('*').contains('members', [user.id]);
      setGroups(data || []);

      // Ensure general group exists
      if (data && !data.find(g => g.name === 'General')) {
        const allUserIds = allUsers.map(u => u.user_id);
        const { data: newGroup } = await supabase.from('chat_groups').insert([{
          name: 'General', members: allUserIds, created_by: user.id,
        }]).select().single();
        if (newGroup) {
          setGroups(prev => [newGroup, ...prev]);
          setActiveChat(newGroup.id);
        }
      } else if (data && data.length > 0 && !activeChat) {
        setActiveChat(data[0].id);
      }
    };
    fetchGroups();
  }, [user, allUsers.length]);

  // Load messages for active chat
  useEffect(() => {
    if (!activeChat || !user) return;

    const fetchMessages = async () => {
      let query = supabase.from('chat_messages').select('*').order('created_at', { ascending: true });
      if (activeChatType === 'group') {
        query = query.eq('group_id', activeChat).eq('message_type', 'group' as any);
      } else {
        query = query.eq('message_type', 'direct' as any)
          .or(`and(sender_id.eq.${user.id},recipient_id.eq.${activeChat}),and(sender_id.eq.${activeChat},recipient_id.eq.${user.id})`);
      }
      const { data } = await query;
      setMessages(data || []);
    };
    fetchMessages();

    // Realtime subscription
    const channel = supabase
      .channel(`chat-${activeChat}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, (payload) => {
        const msg = payload.new as any;
        if (activeChatType === 'group' && msg.group_id === activeChat) {
          setMessages(prev => [...prev, msg]);
        } else if (activeChatType === 'direct' &&
          ((msg.sender_id === user.id && msg.recipient_id === activeChat) ||
           (msg.sender_id === activeChat && msg.recipient_id === user.id))) {
          setMessages(prev => [...prev, msg]);
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [activeChat, activeChatType, user]);

  // Load DM conversations
  useEffect(() => {
    if (!user) return;
    const fetchDMs = async () => {
      const { data } = await supabase.from('chat_messages').select('sender_id, recipient_id')
        .eq('message_type', 'direct' as any)
        .or(`sender_id.eq.${user.id},recipient_id.eq.${user.id}`);
      const others = new Set<string>();
      (data || []).forEach((m: any) => {
        const otherId = m.sender_id === user.id ? m.recipient_id : m.sender_id;
        if (otherId) others.add(otherId);
      });
      setDmConversations(Array.from(others));
    };
    fetchDMs();
  }, [user]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const sendMessage = async () => {
    if (!message.trim() || !user || !profile) return;
    const msg: any = {
      sender_id: user.id,
      sender_name: profile.name,
      sender_photo: profile.photo_url,
      message_type: activeChatType,
      text: message.trim(),
    };
    if (activeChatType === 'group') {
      msg.group_id = activeChat;
    } else {
      msg.recipient_id = activeChat;
    }
    await supabase.from('chat_messages').insert([msg]);

    // Push notifications
    if (activeChatType === 'group') {
      const group = groups.find(g => g.id === activeChat);
      const recipients = (group?.members || []).filter((m: string) => m !== user.id);
      const notifs = recipients.map((memberId: string) => ({
        user_id: memberId, title: `New message in ${group?.name}`,
        message: `${profile.name}: ${message.trim().slice(0, 80)}`,
        type: 'chat',
      }));
      if (notifs.length > 0) await supabase.from('notifications').insert(notifs);
    } else {
      await supabase.from('notifications').insert([{
        user_id: activeChat, title: `New message from ${profile.name}`,
        message: message.trim().slice(0, 80), type: 'chat',
      }]);
    }

    setMessage('');
  };

  const createGroup = async () => {
    if (!groupForm.name.trim() || !user) return;
    const { data } = await supabase.from('chat_groups').insert([{
      name: groupForm.name,
      members: [...groupForm.members, user.id],
      created_by: user.id,
    }]).select().single();
    if (data) {
      setGroups(prev => [...prev, data]);
      setActiveChat(data.id);
      setActiveChatType('group');
    }
    setShowNewGroup(false);
    setGroupForm({ name: '', members: [] });
  };

  const startDM = (userId: string) => {
    setActiveChat(userId);
    setActiveChatType('direct');
    setShowNewDM(false);
    if (!dmConversations.includes(userId)) {
      setDmConversations(prev => [...prev, userId]);
    }
  };

  const getActiveName = () => {
    if (activeChatType === 'group') return groups.find(g => g.id === activeChat)?.name || 'General';
    return allUsers.find(u => u.user_id === activeChat)?.name || 'Chat';
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
          <div className="px-3 py-2 border-t border-border">
            <p className="text-xs font-medium text-muted-foreground mb-1">Direct Messages</p>
            {dmConversations.map((userId) => {
              const u = allUsers.find(au => au.user_id === userId);
              if (!u) return null;
              return (
                <button key={userId} onClick={() => startDM(userId)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center gap-2 transition-colors ${activeChat === userId && activeChatType === 'direct' ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-muted text-foreground'}`}>
                  {u.photo_url ? (
                    <img src={u.photo_url} alt="" className="w-5 h-5 rounded-full object-cover" />
                  ) : (
                    <div className="w-5 h-5 rounded-full bg-secondary flex items-center justify-center text-[8px] font-bold text-secondary-foreground">
                      {u.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                    </div>
                  )}
                  <span className="truncate">{u.name}</span>
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
          {messages.length === 0 && (
            <p className="text-center text-sm text-muted-foreground py-16">No messages yet. Start the conversation!</p>
          )}
          {messages.map((msg: any, i: number) => {
            const isMe = msg.sender_id === user?.id;
            const showDate = i === 0 || formatDay(messages[i - 1].created_at) !== formatDay(msg.created_at);
            return (
              <div key={msg.id}>
                {showDate && (
                  <div className="text-center my-4"><span className="text-xs text-muted-foreground bg-muted px-3 py-1 rounded-full">{formatDay(msg.created_at)}</span></div>
                )}
                <div className={`flex items-end gap-2 ${isMe ? 'justify-end' : 'justify-start'}`}>
                  {!isMe && (
                    msg.sender_photo ? (
                      <img src={msg.sender_photo} alt="" className="w-7 h-7 rounded-full object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center text-[9px] font-bold text-secondary-foreground flex-shrink-0">
                        {msg.sender_name.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                      </div>
                    )
                  )}
                  <div className={`max-w-[70%] ${isMe ? 'order-first' : ''}`}>
                    {!isMe && <p className="text-xs text-muted-foreground mb-1 ml-1">{msg.sender_name}</p>}
                    <div className={`px-3 py-2 rounded-2xl text-sm ${isMe ? 'bg-primary text-primary-foreground rounded-br-md' : 'bg-muted text-foreground rounded-bl-md'}`}>
                      {msg.text}
                    </div>
                    <p className={`text-[10px] text-muted-foreground mt-0.5 ${isMe ? 'text-right mr-1' : 'ml-1'}`}>{formatTime(msg.created_at)}</p>
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
                  {allUsers.filter(u => u.user_id !== user?.id).map((u) => (
                    <label key={u.user_id} className="flex items-center gap-2 p-2 hover:bg-muted rounded-lg cursor-pointer">
                      <input type="checkbox" checked={groupForm.members.includes(u.user_id)} onChange={(e) => {
                        setGroupForm({ ...groupForm, members: e.target.checked ? [...groupForm.members, u.user_id] : groupForm.members.filter(m => m !== u.user_id) });
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
              {allUsers.filter(u => u.user_id !== user?.id).map((u) => (
                <button key={u.user_id} onClick={() => startDM(u.user_id)} className="w-full text-left p-3 hover:bg-muted rounded-lg flex items-center gap-3 transition-colors">
                  {u.photo_url ? (
                    <img src={u.photo_url} alt="" className="w-8 h-8 rounded-full object-cover" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-xs font-bold text-secondary-foreground">
                      {u.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
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
