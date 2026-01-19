
import React, { useState, useRef, useEffect } from 'react';
import { Message } from '../types';

interface ChatBoxProps {
  messages: Message[];
  onSendMessage: (text: string) => void;
}

const ChatBox: React.FC<ChatBoxProps> = ({ messages, onSendMessage }) => {
  const [inputValue, setInputValue] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim()) return;
    onSendMessage(inputValue);
    setInputValue('');
  };

  return (
    <div className="flex flex-col h-full glass-panel rounded-2xl p-4 overflow-hidden border border-white/10 shadow-2xl">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-2 h-2 rounded-full bg-green-400 pulsing"></div>
        <h3 className="font-semibold text-sm uppercase tracking-wider text-gray-400">Live Chat</h3>
      </div>
      
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto space-y-4 mb-4 pr-2 scrollbar-thin scrollbar-thumb-white/10"
      >
        {messages.map((msg) => (
          <div key={msg.id} className={`flex flex-col ${msg.isAI ? 'items-center py-2' : ''}`}>
            {msg.isAI ? (
              <div className="bg-blue-600/20 border border-blue-500/30 rounded-lg px-4 py-2 max-w-[90%] text-sm text-blue-100 italic shadow-lg shadow-blue-500/10">
                <span className="font-bold text-blue-400 block mb-1">🤖 AI DJ • Sonic</span>
                {msg.text}
              </div>
            ) : (
              <div className="flex flex-col">
                <span className="text-[10px] text-gray-500 mb-1 ml-1">{msg.sender} • {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                <div className="bg-white/5 rounded-2xl rounded-tl-none px-4 py-2 text-sm text-gray-200">
                  {msg.text}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="relative mt-auto">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="Type a message..."
          className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
        />
        <button 
          type="submit"
          className="absolute right-2 top-2 p-1.5 text-blue-400 hover:text-blue-300 transition-colors"
        >
          <i className="fas fa-paper-plane"></i>
        </button>
      </form>
    </div>
  );
};

export default ChatBox;
