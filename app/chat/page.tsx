"use client";
import { Shield, Send, User, Lock } from "lucide-react";

export default function ChatPage() {
  return (
    <div className="flex h-screen bg-[#050505] text-white overflow-hidden">
      {/* Sidebar - Hidden on mobile, visible on md+ */}
      <aside className="hidden md:flex w-80 flex-col border-r border-white/5 bg-zinc-900/20 backdrop-blur-xl">
        <div className="p-6 border-bottom border-white/5 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center">
            <Shield className="w-4 h-4 text-purple-400" />
          </div>
          <span className="font-bold tracking-tighter text-xl">KRYPT</span>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {/* User List */}
          <div className="p-3 rounded-xl bg-white/5 border border-white/10 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-zinc-800" />
            <div>
              <p className="text-sm font-medium">Simbiat</p>
              <p className="text-[10px] text-purple-400 uppercase tracking-widest">Online</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Chat Area */}
      <main className="flex-1 flex flex-col relative">
        {/* Header */}
        <header className="p-4 border-b border-white/5 flex items-center justify-between backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="md:hidden w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center">
              <Shield className="w-4 h-4 text-purple-400" />
            </div>
            <h2 className="font-semibold text-zinc-200">Secure Channel</h2>
          </div>
          <div className="flex items-center gap-2 text-[10px] text-zinc-500 uppercase tracking-widest">
            <Lock className="w-3 h-3 text-green-500" />
            <span>E2EE Active</span>
          </div>
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Example Message */}
            <div className="max-w-[80%] space-y-2">
                <div className="p-4 rounded-2xl bg-zinc-900/50 border border-white/5 text-sm leading-relaxed">
                    Yakubu, Manage! Almost there 😭
                </div>
                <span className="text-[10px] text-zinc-600 px-2 uppercase tracking-tight">19:20 // Decrypted</span>
            </div>
        </div>

        {/* Input Area */}
        <div className="p-6">
          <div className="max-w-4xl mx-auto relative">
            <input 
              type="text"
              placeholder="Transmit message..."
              className="w-full bg-zinc-900/80 border border-white/10 rounded-2xl p-4 pr-16 focus:outline-none focus:border-purple-500/50 transition-all text-sm"
            />
            <button className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 bg-white text-black rounded-xl flex items-center justify-center hover:bg-zinc-200 transition-colors">
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}