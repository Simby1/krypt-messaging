"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Shield, Send, Lock, Search, LogOut, CheckCheck, AlertTriangle, Loader2 } from "lucide-react";
import { encryptMessage, decryptMessage, clearPrivateKey, loadPrivateKey } from "@/utils/crypto";
import {
  getConversations,
  getMessages,
  getUserPublicKey,
  searchUsers,
  sendMessageRest,
  logout,
} from "@/services/api";
import { useWebSocket } from "@/hooks/useWebSocket";

interface Message {
  id: string;
  from_user_id: string;
  to_user_id: string;
  payload: any;
  created_at: string;
  _text?: string;
  _secure?: boolean;
  _pending?: boolean;
}

interface Conversation {
  user_id: string;
  display_name: string;
  username: string;
  last_message_at: string;
}

interface SearchResult {
  id: string;
  username: string;
  display_name: string;
}

function extractPayload(raw: any) {
  try {
    const p = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (p?.ciphertext && p?.iv && p?.encryptedKey && p?.encryptedKeyForSelf) return p;
    console.warn("[payload] missing fields:", p);
    return null;
  } catch (e) {
    console.error("[payload] parse failed:", raw, e);
    return null;
  }
}

export default function ChatPage() {
  const router = useRouter();
  const [myUserId, setMyUserId] = useState("");
  const [myPublicKey, setMyPublicKey] = useState("");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvo, setActiveConvo] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  // Keep activeConvo accessible inside WS callback without stale closure
  const activeConvoRef = useRef<Conversation | null>(null);
  const myUserIdRef = useRef("");

  // ─── Auth Guard ────────────────────────────────────────────────────────────
  useEffect(() => {
    const token = localStorage.getItem("wb_access_token");
    if (!token) { router.push("/"); return; }
    loadPrivateKey().then((key) => { if (!key) router.push("/"); });

    const uid = localStorage.getItem("wb_user_id") || "";
    setMyUserId(uid);
    myUserIdRef.current = uid;
    setMyPublicKey(localStorage.getItem("wb_public_key") || "");
    setDisplayName(localStorage.getItem("wb_display_name") || "");
  }, [router]);

  // ─── WebSocket ─────────────────────────────────────────────────────────────
  const handleWsMessage = useCallback((data: any) => {
    console.log("[WS] frame:", data);

    // Server uses "event" not "type"
    const event = data.event || data.type;

    if (event === "message.receive" && data.message) {
      const msg: Message = data.message;
      const isMine = msg.from_user_id === myUserIdRef.current;
      const convo = activeConvoRef.current;

      if (
        convo &&
        (msg.from_user_id === convo.user_id || msg.to_user_id === convo.user_id)
      ) {
        decryptAndAppend(msg, isMine);
      }

      // Always refresh sidebar so new convo appears
      loadConversations();
    }
  }, []);

  const { sendFrame } = useWebSocket(handleWsMessage);

  // ─── Conversations ─────────────────────────────────────────────────────────
  const loadConversations = useCallback(async () => {
    try {
      const data = await getConversations();
      console.log("[conversations]", data);
      setConversations(Array.isArray(data) ? data : []);
    } catch (e) { console.error("[conversations] error", e); }
  }, []);

  useEffect(() => {
    if (myUserId) loadConversations();
  }, [myUserId, loadConversations]);

  // ─── Open conversation ─────────────────────────────────────────────────────
  const openConversation = useCallback(async (convo: Conversation) => {
    setActiveConvo(convo);
    activeConvoRef.current = convo;
    setMessages([]);
    setLoadingMessages(true);
    try {
      const raw: Message[] = await getMessages(convo.user_id);
      console.log(`[messages] ${raw.length} loaded, sample:`, raw[0]);
      const ordered = [...raw].reverse(); // API returns newest-first
      const decrypted = await Promise.all(
        ordered.map((m) => decryptOne(m, m.from_user_id === myUserIdRef.current))
      );
      setMessages(decrypted);
    } catch (e) {
      console.error("[messages] load error", e);
    } finally {
      setLoadingMessages(false);
    }
  }, []);

  // ─── Decrypt helpers ───────────────────────────────────────────────────────
  async function decryptOne(msg: Message, isMine: boolean): Promise<Message> {
    try {
      const payload = extractPayload(msg.payload);
      if (!payload) throw new Error("Bad payload shape");
      const text = await decryptMessage(payload, isMine);
      return { ...msg, _text: text, _secure: true };
    } catch (e) {
      console.error("[decrypt] failed msg:", msg.id, "isMine:", isMine, e);
      return { ...msg, _text: "[Encrypted — unreadable on this device]", _secure: false };
    }
  }

  function decryptAndAppend(msg: Message, isMine: boolean) {
    decryptOne(msg, isMine).then((decrypted) => {
      setMessages((prev) => {
        if (prev.find((m) => m.id === decrypted.id)) return prev;
        return [...prev, decrypted];
      });
    });
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ─── Send ──────────────────────────────────────────────────────────────────
  const transmit = async () => {
    if (!input.trim() || !activeConvoRef.current || sending) return;
    const convo = activeConvoRef.current;
    setSending(true);
    try {
      const recipientPublicKey = await getUserPublicKey(convo.user_id);
      const payload = await encryptMessage(input.trim(), recipientPublicKey, myPublicKey);

      const optimistic: Message = {
        id: `pending-${Date.now()}`,
        from_user_id: myUserIdRef.current,
        to_user_id: convo.user_id,
        payload,
        created_at: new Date().toISOString(),
        _text: input.trim(),
        _secure: true,
        _pending: true,
      };
      setMessages((prev) => [...prev, optimistic]);
      setInput("");

      const sent = sendFrame({ type: "message.send", to: convo.user_id, payload });
      console.log("[send] via WS:", sent);
      if (!sent) {
        console.log("[send] REST fallback");
        await sendMessageRest(convo.user_id, payload);
      }

      setMessages((prev) =>
        prev.map((m) => (m.id === optimistic.id ? { ...m, _pending: false } : m))
      );
      loadConversations();
    } catch (e: any) {
      console.error("[send] error", e);
      alert("Send failed: " + (e.message || "Unknown error"));
    } finally {
      setSending(false);
    }
  };

  // ─── Search ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!searchQuery.trim()) { setSearchResults([]); return; }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const results = await searchUsers(searchQuery);
        setSearchResults(
          Array.isArray(results)
            ? results.filter((u: SearchResult) => u.id !== myUserIdRef.current)
            : []
        );
      } catch { setSearchResults([]); }
      finally { setSearching(false); }
    }, 400);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const startConvo = (u: SearchResult) => {
    setSearchQuery("");
    setSearchResults([]);
    openConversation({
      user_id: u.id,
      display_name: u.display_name,
      username: u.username,
      last_message_at: "",
    });
  };

  // ─── Logout ────────────────────────────────────────────────────────────────
  const handleLogout = async () => {
    await clearPrivateKey();
    await logout();
    router.push("/");
  };

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-screen bg-[#050505] text-zinc-300 font-sans overflow-hidden">
      {/* Sidebar */}
      <aside className="w-72 shrink-0 border-r border-white/5 bg-zinc-900/20 flex flex-col">
        <div className="p-5 border-b border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="text-purple-500 w-5 h-5" />
            <span className="font-black text-white tracking-tighter italic text-lg">KRYPT</span>
          </div>
          <button onClick={handleLogout} className="text-zinc-600 hover:text-zinc-400 transition-colors">
            <LogOut size={15} />
          </button>
        </div>

        <div className="px-5 py-3 border-b border-white/5">
          <p className="text-[10px] text-zinc-600 uppercase tracking-widest">Signed in as</p>
          <p className="text-sm text-white font-semibold mt-0.5">{displayName}</p>
        </div>

        <div className="px-4 py-3 border-b border-white/5">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-600" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Find user..."
              className="w-full bg-zinc-900/60 border border-white/5 rounded-lg py-2 pl-9 pr-3 text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-purple-500/30 transition-all"
            />
          </div>
          {searchResults.length > 0 && (
            <div className="mt-2 space-y-1">
              {searchResults.map((u) => (
                <button key={u.id} onClick={() => startConvo(u)}
                  className="w-full text-left px-3 py-2 rounded-lg bg-purple-500/10 hover:bg-purple-500/20 transition-all">
                  <p className="text-xs text-white font-medium">{u.display_name}</p>
                  <p className="text-[10px] text-zinc-500">@{u.username}</p>
                </button>
              ))}
            </div>
          )}
          {searching && (
            <div className="mt-2 flex items-center gap-2 px-2">
              <Loader2 size={12} className="animate-spin text-zinc-600" />
              <span className="text-[10px] text-zinc-600">Searching...</span>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto py-2">
          {conversations.length === 0 ? (
            <p className="text-[10px] text-zinc-700 text-center mt-8 px-4 leading-relaxed">
              No conversations yet.<br />Search for a user above to start.
            </p>
          ) : (
            conversations.map((c) => (
              <button key={c.user_id} onClick={() => openConversation(c)}
                className={`w-full flex items-center gap-3 px-4 py-3 transition-all text-left
                  ${activeConvo?.user_id === c.user_id ? "bg-white/5" : "hover:bg-white/[0.02]"}`}>
                <div className="w-9 h-9 rounded-xl bg-purple-600/20 border border-purple-500/20 flex items-center justify-center text-purple-300 text-xs font-bold shrink-0">
                  {c.display_name[0]?.toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-sm text-white font-medium truncate">{c.display_name}</p>
                  <p className="text-[10px] text-zinc-600 truncate">@{c.username}</p>
                </div>
              </button>
            ))
          )}
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col min-w-0">
        {activeConvo ? (
          <>
            <header className="h-14 border-b border-white/5 flex items-center justify-between px-6 bg-black/30 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-purple-600/20 border border-purple-500/20 flex items-center justify-center text-purple-300 text-xs font-bold">
                  {activeConvo.display_name[0]?.toUpperCase()}
                </div>
                <div>
                  <p className="text-sm text-white font-semibold">{activeConvo.display_name}</p>
                  <p className="text-[10px] text-zinc-600">@{activeConvo.username}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-[10px] text-emerald-500 font-mono uppercase tracking-widest">
                <Lock size={10} />
                End-to-end encrypted
              </div>
            </header>

            <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4">
              {loadingMessages ? (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="animate-spin text-zinc-600" size={24} />
                </div>
              ) : messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
                  <div className="w-12 h-12 rounded-xl bg-purple-600/10 border border-purple-500/20 flex items-center justify-center">
                    <Lock size={20} className="text-purple-400" />
                  </div>
                  <p className="text-zinc-600 text-sm">No messages yet. Send the first one.</p>
                  <p className="text-zinc-700 text-[10px]">All messages are end-to-end encrypted.</p>
                </div>
              ) : (
                messages.map((m, i) => {
                  const isMine = m.from_user_id === myUserId;
                  return (
                    <div key={m.id || i} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                      <div className="max-w-xs lg:max-w-md space-y-1">
                        <div className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed
                          ${isMine
                            ? "bg-purple-600 text-white rounded-br-sm"
                            : "bg-zinc-900/70 border border-white/5 text-zinc-200 rounded-bl-sm"}
                          ${!m._secure ? "opacity-60" : ""}`}>
                          {!m._secure && <AlertTriangle size={12} className="inline mr-1 text-yellow-400" />}
                          {m._text}
                        </div>
                        <div className={`flex items-center gap-1.5 ${isMine ? "justify-end" : "justify-start"}`}>
                          <span className="text-[9px] text-zinc-600 font-mono">
                            {new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </span>
                          {isMine && (
                            m._pending
                              ? <Loader2 size={9} className="animate-spin text-zinc-600" />
                              : <CheckCheck size={10} className="text-emerald-500" />
                          )}
                          {m._secure && <Lock size={8} className="text-zinc-700" />}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={bottomRef} />
            </div>

            <footer className="px-6 py-4 border-t border-white/5 bg-black/20 shrink-0">
              <div className="flex gap-3 items-center">
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && transmit()}
                  placeholder="Encrypted message..."
                  className="flex-1 bg-zinc-900/50 border border-white/5 rounded-xl py-3 px-4 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-purple-500/30 transition-all"
                />
                <button onClick={transmit} disabled={sending || !input.trim()}
                  className="bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed text-white p-3 rounded-xl transition-all">
                  {sending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                </button>
              </div>
            </footer>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center p-8">
            <div className="w-20 h-20 rounded-2xl bg-purple-600/10 border border-purple-500/20 flex items-center justify-center">
              <Shield size={36} className="text-purple-400" />
            </div>
            <div>
              <h2 className="text-white font-bold text-lg">Your messages are private</h2>
              <p className="text-zinc-600 text-sm mt-1">Select a conversation or search for a user to start.</p>
            </div>
            <div className="flex items-center gap-2 text-[10px] text-emerald-600 font-mono uppercase tracking-widest border border-emerald-900/50 rounded-lg px-3 py-1.5">
              <Lock size={10} />
              End-to-end encrypted · Server sees only ciphertext
            </div>
          </div>
        )}
      </main>
    </div>
  );
}