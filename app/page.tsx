"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Shield, Lock, User, Eye, EyeOff } from "lucide-react";
import { generateAndWrapKeys, unwrapAndStorePrivateKey } from "@/utils/crypto";

type Mode = "login" | "register";

export default function AuthPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    setError("");
    if (!username || !password) return;
    if (mode === "register" && !displayName) return;
    setLoading(true);

    try {
      if (mode === "register") {
        // 1. Generate RSA keypair, wrap private key with password
        const { publicKeyJwk, wrappedPrivateKey, pbkdf2Salt } = await generateAndWrapKeys(password);

        // 2. Register with server
        const res = await fetch("https://whisperbox.koyeb.app/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username: username.trim(),
            display_name: displayName.trim(),
            password,
            public_key: JSON.stringify(publicKeyJwk),
            wrapped_private_key: wrappedPrivateKey,
            pbkdf2_salt: pbkdf2Salt,
          }),
        });

        if (!res.ok) {
          const err = await res.json();
          setError(err.detail?.[0]?.msg || err.detail || "Registration failed.");
          return;
        }

        const data = await res.json();
        // After register, unwrap private key into memory
        await unwrapAndStorePrivateKey(password, data.user.wrapped_private_key, data.user.pbkdf2_salt);
        storeSession(data);
        router.push("/chat");

      } else {
        // Login
        const res = await fetch("https://whisperbox.koyeb.app/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: username.trim(), password }),
        });

        if (!res.ok) {
          const err = await res.json();
          setError(err.detail?.[0]?.msg || err.detail || "Invalid credentials.");
          return;
        }

        const data = await res.json();
        // Unwrap private key into memory using password + server-stored salt
        await unwrapAndStorePrivateKey(password, data.user.wrapped_private_key, data.user.pbkdf2_salt);
        storeSession(data);
        router.push("/chat");
      }
    } catch (err: any) {
      setError(err.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-screen bg-[#050505] flex flex-col items-center justify-center p-6 font-sans">
      <div className="w-full max-w-sm space-y-8">
        {/* Logo */}
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="w-16 h-16 rounded-2xl bg-purple-600/10 flex items-center justify-center border border-purple-500/20 shadow-[0_0_30px_rgba(168,85,247,0.15)]">
            <Shield className="w-8 h-8 text-purple-400" />
          </div>
          <div>
            <h1 className="text-4xl font-black tracking-tighter text-white italic">KRYPT</h1>
            <p className="text-zinc-600 text-[10px] uppercase tracking-widest mt-1">End-to-End Encrypted</p>
          </div>
        </div>

        {/* Mode Toggle */}
        <div className="flex bg-zinc-900/60 rounded-xl p-1 border border-white/5">
          {(["login", "register"] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => { setMode(m); setError(""); }}
              className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-all
                ${mode === m ? "bg-white text-black" : "text-zinc-500 hover:text-zinc-300"}`}
            >
              {m}
            </button>
          ))}
        </div>

        {/* Form */}
        <div className="space-y-3">
          {mode === "register" && (
            <div className="relative">
              <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
              <input
                type="text"
                placeholder="Display name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full bg-zinc-900/50 border border-white/5 rounded-xl py-3.5 pl-11 pr-4 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-purple-500/40 transition-all"
              />
            </div>
          )}

          <div className="relative">
            <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
            <input
              type="text"
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-zinc-900/50 border border-white/5 rounded-xl py-3.5 pl-11 pr-4 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-purple-500/40 transition-all"
            />
          </div>

          <div className="relative">
            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
            <input
              type={showPassword ? "text" : "password"}
              placeholder={mode === "register" ? "Password (min 8 chars)" : "Password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              className="w-full bg-zinc-900/50 border border-white/5 rounded-xl py-3.5 pl-11 pr-11 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-purple-500/40 transition-all"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-400"
            >
              {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>

          {error && (
            <p className="text-red-400 text-xs px-1 font-mono">{error}</p>
          )}

          {mode === "register" && (
            <p className="text-zinc-600 text-[10px] px-1 leading-relaxed">
              Your password encrypts your private key. If you forget it, your messages cannot be recovered.
            </p>
          )}

          <button
            onClick={handleSubmit}
            disabled={loading}
            className="w-full bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-bold py-3.5 rounded-xl transition-all text-sm tracking-wide"
          >
            {loading
              ? mode === "register" ? "Creating Account..." : "Signing In..."
              : mode === "register" ? "Create Account" : "Sign In"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Session helpers (non-sensitive data only) ───────────────────────────────
function storeSession(data: any) {
  localStorage.setItem("wb_access_token", data.access_token);
  localStorage.setItem("wb_refresh_token", data.refresh_token);
  localStorage.setItem("wb_user_id", data.user.id);
  localStorage.setItem("wb_username", data.user.username);
  localStorage.setItem("wb_display_name", data.user.display_name);
  localStorage.setItem("wb_public_key", data.user.public_key);
  // expires_in is in seconds
  const expiresAt = Date.now() + data.expires_in * 1000;
  localStorage.setItem("wb_token_expires_at", String(expiresAt));
}