"use client";
import { useState } from "react";
import { generateUserKeys } from "@/utils/crypto";
import { registerUser } from "@/services/api";
import { Shield, ArrowRight } from "lucide-react";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setLoading(true);
    try {
      const publicJwk = await generateUserKeys();
      await registerUser(username, publicJwk);
      window.location.href = "/chat";
    } catch (error) {
      console.error("Login failed", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="relative min-h-screen bg-[#050505] flex items-center justify-center p-6 overflow-hidden">
      {/* Background Grid - Subtle and architectural */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]" />
      
      {/* Floating Orbs - Serene lighting */}
      <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-purple-900/20 blur-[120px] rounded-full" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[400px] h-[400px] bg-blue-900/10 blur-[100px] rounded-full" />
      
      <div className="relative z-10 w-full max-w-[400px]">
        <div className="flex flex-col items-center mb-10">
          <div className="w-12 h-12 bg-white/5 border border-white/10 rounded-xl flex items-center justify-center mb-4 backdrop-blur-sm">
            <Shield className="text-purple-400 w-6 h-6" />
          </div>
          <h1 className="text-4xl font-bold text-white tracking-tighter mb-2">KRYPT</h1>
          <p className="text-zinc-500 text-sm font-medium uppercase tracking-[0.2em]">Zero-Knowledge Protocol</p>
        </div>

        <div className="bg-zinc-900/40 border border-white/5 p-1 rounded-2xl backdrop-blur-xl shadow-2xl">
          <div className="p-6">
            <input 
              type="text" 
              placeholder="System Identifier"
              className="w-full bg-black/40 border border-white/5 rounded-xl p-4 text-white placeholder:text-zinc-700 focus:outline-none focus:border-purple-500/50 transition-all mb-4 text-sm"
              onChange={(e) => setUsername(e.target.value)}
            />
            
            <button 
              onClick={handleLogin}
              disabled={loading || !username}
              className="group w-full bg-white text-black font-bold py-4 rounded-xl flex items-center justify-center gap-2 hover:bg-zinc-200 transition-all disabled:opacity-30"
            >
              <span>{loading ? "ESTABLISHING IDENTITY..." : "ENTER VOID"}</span>
              {!loading && <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />}
            </button>
          </div>
        </div>
        
        <p className="mt-8 text-center text-zinc-600 text-[10px] uppercase tracking-widest">
          End-to-End Encrypted // Node-01
        </p>
      </div>
    </main>
  );
}