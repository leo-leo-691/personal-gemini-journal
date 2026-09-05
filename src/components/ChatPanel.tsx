'use client';

import { useState, useRef, useEffect } from 'react';
import { JournalMessage, JournalSession } from '@/server/firestore-db';
import { authenticatedFetch } from '@/lib/firebase-client';
import { Send, Sparkles, FileText, Brain, Trash2, Bot, User } from 'lucide-react';

interface ChatPanelProps {
  session: JournalSession;
  messages: JournalMessage[];
  onNewMessage: (msg: JournalMessage) => void;
  onOpenSummary: () => void;
  onOpenActionPlan: () => void;
  onRequestDelete: () => void;
}

export default function ChatPanel({
  session,
  messages,
  onNewMessage,
  onOpenSummary,
  onOpenActionPlan,
  onRequestDelete,
}: ChatPanelProps) {
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, sending]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || sending) return;

    const userText = input.trim();
    setInput('');
    setSending(true);

    // Optimistic UI update
    const tempMsg: JournalMessage = {
      messageId: `temp-${Date.now()}`,
      role: 'user',
      text: userText,
      ts: new Date().toISOString(),
    };
    onNewMessage(tempMsg);

    try {
      const res = await authenticatedFetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: session.sessionId,
          message: userText,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.message) {
          onNewMessage(data.message);
        }
      } else {
        const errData = await res.json();
        alert(errData.error || 'Failed to send message');
      }
    } catch (err) {
      console.error('Chat error:', err);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-900">
      {/* Top Bar */}
      <header className="p-4 border-b border-slate-800 bg-slate-950/40 flex items-center justify-between">
        <div>
          <h1 className="font-semibold text-sm text-slate-100">{session.title}</h1>
          <p className="text-[11px] text-slate-500">
            Session ID: <code className="text-slate-400 font-mono">{session.sessionId}</code>
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Explicit Summarize Trigger */}
          <button
            onClick={onOpenSummary}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition-all"
          >
            <FileText className="w-3.5 h-3.5 text-indigo-400" />
            Summarize
          </button>

          {/* AI Action Plan Trigger */}
          <button
            onClick={onOpenActionPlan}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-indigo-900/60 to-purple-900/60 hover:from-indigo-800/80 hover:to-purple-800/80 text-indigo-200 text-xs font-medium border border-indigo-700/50 transition-all"
          >
            <Brain className="w-3.5 h-3.5 text-purple-400" />
            Action Intelligence
          </button>

          {/* Delete Session Button */}
          <button
            onClick={onRequestDelete}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-red-950/60 hover:text-red-400 text-slate-400 border border-slate-700 hover:border-red-800/60 transition-all"
            title="Delete Session"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Messages Window */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-8 text-slate-500 space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-slate-800/60 flex items-center justify-center text-slate-400">
              <Sparkles className="w-6 h-6 text-indigo-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-300">Start your reflection</p>
              <p className="text-xs text-slate-500 max-w-xs mt-1">
                Type a message below to begin multi-turn dialogue with Gemini.
              </p>
            </div>
          </div>
        ) : (
          messages.map((msg) => {
            const isUser = msg.role === 'user';
            return (
              <div
                key={msg.messageId}
                className={`flex gap-3 max-w-2xl ${isUser ? 'ml-auto flex-row-reverse' : ''}`}
              >
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-xs shrink-0 ${
                    isUser
                      ? 'bg-indigo-600 text-white'
                      : 'bg-gradient-to-tr from-purple-600 to-pink-600 text-white'
                  }`}
                >
                  {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                </div>

                <div
                  className={`p-4 rounded-2xl text-xs leading-relaxed ${
                    isUser
                      ? 'bg-indigo-600 text-white rounded-tr-none shadow-md shadow-indigo-600/10'
                      : 'bg-slate-800/90 text-slate-200 border border-slate-700/60 rounded-tl-none'
                  }`}
                >
                  <p className="whitespace-pre-wrap">{msg.text}</p>
                  <span
                    className={`block text-[10px] mt-2 ${
                      isUser ? 'text-indigo-200/70' : 'text-slate-500'
                    }`}
                  >
                    {new Date(msg.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            );
          })
        )}

        {sending && (
          <div className="flex gap-3 max-w-2xl">
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-purple-600 to-pink-600 text-white flex items-center justify-center shrink-0">
              <Bot className="w-4 h-4" />
            </div>
            <div className="p-4 rounded-2xl bg-slate-800/90 border border-slate-700/60 text-slate-400 text-xs rounded-tl-none flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
              Gemini is reflecting...
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Form */}
      <div className="p-4 border-t border-slate-800 bg-slate-950/40">
        <form onSubmit={handleSend} className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your journal entry or thoughts..."
            disabled={sending}
            className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={sending || !input.trim()}
            className="bg-indigo-600 hover:bg-indigo-500 text-white px-5 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-600/20 transition-all disabled:opacity-50"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
