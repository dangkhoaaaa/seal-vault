'use client';
import { useState, useMemo } from 'react';
import {
  useCurrentAccount, useSuiClientQuery, useSignAndExecuteTransaction,
  useSignPersonalMessage, useSuiClient,
} from '@mysten/dapp-kit';
import { PACKAGE_ID, VAULT_MODULE, vaultContract } from '@/lib/contract';
import { walrusApi } from '@/lib/walrus';
import { sealEncrypt, sealDecrypt, EncryptedObject } from '@/lib/seal';
import {
  checkStrength, generatePassword, getSiteEmoji, CATEGORIES,
  type Category, type GeneratorOptions,
} from '@/lib/passwordUtils';
import { useToast } from '@/components/Toast';
import { motion, AnimatePresence } from 'framer-motion';
import {
  KeyRound, Plus, Eye, EyeOff, Trash2, Copy, Check,
  Search, RefreshCw, ShieldCheck, AlertTriangle, Lock,
  Sparkles, BarChart3,
} from 'lucide-react';
import { clsx } from 'clsx';

// ─── Types ────────────────────────────────────────────────────────────────────
interface VaultEntry {
  entry_id: string;
  site_name: string;
  username_hint: string;
  blob_id: string;
  category: string;
  notes: string;
  created_at: string;
}

// ─── StrengthBar ──────────────────────────────────────────────────────────────
function StrengthBar({ password }: { password: string }) {
  const s = checkStrength(password);
  if (!password) return null;
  return (
    <div className="mt-2">
      <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
        <motion.div
          animate={{ width: `${s.score}%` }}
          className="h-full rounded-full transition-all"
          style={{ backgroundColor: s.color }}
        />
      </div>
      <div className="flex items-center justify-between mt-1">
        <span className="text-xs" style={{ color: s.color }}>{s.label}</span>
        {s.suggestions[0] && <span className="text-xs text-gray-500">{s.suggestions[0]}</span>}
      </div>
    </div>
  );
}

// ─── PasswordGeneratorPanel ────────────────────────────────────────────────────
function PasswordGeneratorPanel({ onUse }: { onUse: (pw: string) => void }) {
  const [opts, setOpts] = useState<GeneratorOptions>({
    length: 16, uppercase: true, lowercase: true, numbers: true, symbols: true,
  });
  const [generated, setGenerated] = useState('');
  const [copied, setCopied] = useState(false);

  const generate = () => setGenerated(generatePassword(opts));

  const copy = async () => {
    await navigator.clipboard.writeText(generated);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="bg-black/40 border border-white/10 rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium text-violet-300">
        <Sparkles size={14} /> Password Generator
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-500 w-16">Length: {opts.length}</span>
        <input type="range" min={8} max={32} value={opts.length}
          onChange={e => setOpts(o => ({ ...o, length: +e.target.value }))}
          className="flex-1 accent-violet-500" />
      </div>

      <div className="flex flex-wrap gap-2">
        {(['uppercase', 'lowercase', 'numbers', 'symbols'] as const).map(k => (
          <button key={k} onClick={() => setOpts(o => ({ ...o, [k]: !o[k] }))}
            className={clsx('text-xs px-3 py-1 rounded-lg border transition-colors',
              opts[k] ? 'bg-violet-600/30 border-violet-500/50 text-violet-300'
                      : 'border-white/10 text-gray-500 hover:border-white/20'
            )}>
            {k.charAt(0).toUpperCase() + k.slice(1)}
          </button>
        ))}
      </div>

      {generated && (
        <div className="bg-black/60 rounded-lg px-3 py-2 flex items-center justify-between">
          <span className="font-mono text-sm text-emerald-400 truncate">{generated}</span>
          <div className="flex gap-1 ml-2 flex-shrink-0">
            <button onClick={copy} className="p-1.5 rounded hover:bg-white/10 text-gray-400 hover:text-white transition-colors">
              {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
            </button>
            <button onClick={() => onUse(generated)} className="text-xs bg-violet-600 hover:bg-violet-500 px-2 py-1 rounded font-medium transition-colors">
              Use
            </button>
          </div>
        </div>
      )}

      <button onClick={generate}
        className="w-full flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg py-2 text-sm transition-colors">
        <RefreshCw size={13} /> Generate
      </button>
    </div>
  );
}

// ─── AddEntryModal ─────────────────────────────────────────────────────────────
function AddEntryModal({ vaultId, onClose, onSuccess }: { vaultId: string; onClose: () => void; onSuccess: () => void }) {
  const [siteName, setSiteName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [notes, setNotes] = useState('');
  const [category, setCategory] = useState('other');
  const [showPass, setShowPass] = useState(false);
  const [showGen, setShowGen] = useState(false);
  const [loading, setLoading] = useState(false);
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();
  const { mutateAsync: signPersonalMessage } = useSignPersonalMessage();
  const suiClient = useSuiClient();
  const account = useCurrentAccount();
  const toast = useToast();

  const handleSave = async () => {
    if (!siteName || !username || !password) return;
    setLoading(true);
    try {
      const payload = new TextEncoder().encode(JSON.stringify({ username, password }));
      const encrypted = await sealEncrypt(vaultId, payload);
      const blobId = await walrusApi.upload(encrypted);
      const tx = vaultContract.addEntryTx(vaultId, siteName, username, blobId, category, notes);
      const result = await signAndExecute({ transaction: tx });
      // Wait for the indexer to pick up the new chain state before refetching.
      await suiClient.waitForTransaction({ digest: result.digest });
      await new Promise(r => setTimeout(r, 1000));
      toast.success('Entry saved!', `${siteName} has been encrypted and stored.`);
      onSuccess();
      onClose();
      // Full reload so the new entry appears immediately.
      setTimeout(() => window.location.reload(), 800);
    } catch (e) {
      toast.error('Save failed', String(e));
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
        className="bg-[#111113] border border-white/10 rounded-2xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">

        <div className="flex items-center gap-3 mb-5">
          <div className="p-2 bg-violet-500/20 rounded-xl"><Lock size={18} className="text-violet-400" /></div>
          <h2 className="text-lg font-bold">New Password Entry</h2>
        </div>

        <div className="space-y-4">
          {/* Category */}
          <div>
            <label className="block text-xs text-gray-500 mb-2 uppercase tracking-wider">Category</label>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.filter(c => c.id !== 'all').map(c => (
                <button key={c.id} onClick={() => setCategory(c.id)}
                  className={clsx('flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors',
                    category === c.id ? 'bg-violet-600/30 border-violet-500/50 text-violet-300' : 'border-white/10 text-gray-400 hover:border-white/20'
                  )}>
                  {c.emoji} {c.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1.5 uppercase tracking-wider font-medium">Website / App</label>
            <input value={siteName} onChange={e => setSiteName(e.target.value)} placeholder="e.g. Facebook, Gmail..."
              className="w-full bg-[#1c1c1f] border border-white/15 rounded-xl px-4 py-3 text-sm text-white placeholder:text-gray-600 outline-none focus:border-violet-500 focus:bg-[#1e1e22] transition-colors" />
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1.5 uppercase tracking-wider font-medium">Username / Email</label>
            <input value={username} onChange={e => setUsername(e.target.value)} placeholder="your@email.com"
              className="w-full bg-[#1c1c1f] border border-white/15 rounded-xl px-4 py-3 text-sm text-white placeholder:text-gray-600 outline-none focus:border-violet-500 focus:bg-[#1e1e22] transition-colors" />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs text-gray-500 uppercase tracking-wider">Password</label>
              <button onClick={() => setShowGen(!showGen)} className="text-xs text-violet-400 hover:text-violet-300 flex items-center gap-1">
                <Sparkles size={11} /> Generator
              </button>
            </div>
            <div className="relative">
              <input type={showPass ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••"
                className="w-full bg-[#1c1c1f] border border-white/15 rounded-xl px-4 py-3 pr-12 text-sm text-white placeholder:text-gray-600 outline-none focus:border-violet-500 focus:bg-[#1e1e22] transition-colors" />
              <button onClick={() => setShowPass(!showPass)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition-colors">
                {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
            <StrengthBar password={password} />
          </div>

          <AnimatePresence>
            {showGen && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                <PasswordGeneratorPanel onUse={pw => { setPassword(pw); setShowPass(true); }} />
              </motion.div>
            )}
          </AnimatePresence>

          <div>
            <label className="block text-xs text-gray-400 mb-1.5 uppercase tracking-wider font-medium">Notes (optional)</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. https://facebook.com · Recovery email: ..."
              rows={2} className="w-full bg-[#1c1c1f] border border-white/15 rounded-xl px-4 py-3 text-sm text-white placeholder:text-gray-600 outline-none focus:border-violet-500 focus:bg-[#1e1e22] transition-colors resize-none" />
          </div>
        </div>

        <div className="mt-2 p-3 bg-violet-500/10 border border-violet-500/20 rounded-xl flex items-start gap-2">
          <ShieldCheck size={13} className="text-violet-400 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-violet-300">Encrypted with Seal · stored on Walrus · only your wallet can decrypt</p>
        </div>

        <div className="flex gap-3 mt-4">
          <button onClick={onClose} className="flex-1 border border-white/10 rounded-xl py-3 text-sm hover:bg-white/5 transition-colors">Cancel</button>
          <button onClick={handleSave} disabled={loading || !siteName || !username || !password}
            className="flex-1 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 rounded-xl py-3 text-sm font-bold transition-colors">
            {loading ? 'Saving...' : 'Save to Vault'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ─── VaultEntryCard ────────────────────────────────────────────────────────────
function VaultEntryCard({ entry, vaultId, vaultRef, onDelete }: {
  entry: VaultEntry;
  vaultId: string;
  vaultRef: { objectId: string; version: string; digest: string };
  onDelete: (id: number) => void;
}) {
  const [revealed, setRevealed] = useState<{ username: string; password: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const account = useCurrentAccount();
  const { mutateAsync: signPersonalMessage } = useSignPersonalMessage();
  const suiClient = useSuiClient();
  const toast = useToast();

  const catInfo = CATEGORIES.find(c => c.id === entry.category) ?? CATEGORIES[CATEGORIES.length - 1];

  const handleReveal = async () => {
    if (revealed) { setRevealed(null); return; }
    setLoading(true);
    try {
      const enc = await walrusApi.download(entry.blob_id);

      // Legacy entries saved before Seal integration use a plain-text mock prefix.
      const MOCK_PREFIX = 'SEAL_MOCK_';
      const mockPrefixBytes = new TextEncoder().encode(MOCK_PREFIX);
      const isLegacyMock =
        enc.length > mockPrefixBytes.length &&
        new TextDecoder().decode(enc.slice(0, mockPrefixBytes.length)) === MOCK_PREFIX;

      let dec: Uint8Array;
      if (isLegacyMock) {
        dec = enc.slice(mockPrefixBytes.length);
      } else {
        // Validate the blob is a well-formed Seal ciphertext before sending to key servers.
        try { EncryptedObject.parse(enc); } catch {
          throw new Error('This entry cannot be decrypted — it may have been saved with an incompatible config. Delete it and add a new entry.');
        }

        dec = await sealDecrypt(
          suiClient,
          vaultRef,
          enc,
          account?.address ?? '',
          async (msgBytes) => {
            const { signature } = await signPersonalMessage({ message: msgBytes });
            return signature;
          },
        );
      }

      setRevealed(JSON.parse(new TextDecoder().decode(dec)));
    } catch (e) {
      const msg = String(e);
      if (msg.includes('signature') || msg.includes('invalid') || msg.includes('InvalidSignature')) {
        toast.error('Decrypt failed', 'Entry was encrypted with a different server config. Delete it and add a new entry.');
      } else {
        toast.error('Decrypt failed', msg);
      }
    }
    finally { setLoading(false); }
  };


  const copyPw = async () => {
    if (!revealed) return;
    await navigator.clipboard.writeText(revealed.password);
    setCopied(true); setTimeout(() => setCopied(false), 1500);
  };

  const strength = revealed ? checkStrength(revealed.password) : null;

  return (
    <motion.div layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97 }}
      className="bg-[#111113] border border-white/10 rounded-2xl p-5 hover:border-violet-500/30 transition-colors group">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center text-xl flex-shrink-0">
            {getSiteEmoji(entry.site_name)}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-semibold truncate">{entry.site_name || '—'}</p>
              <span className="text-xs bg-white/5 border border-white/10 rounded-full px-2 py-0.5 text-gray-500 flex-shrink-0">
                {catInfo.emoji} {catInfo.label}
              </span>
            </div>
            <p className="text-sm text-gray-400 truncate">{entry.username_hint}</p>
          </div>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          <button onClick={handleReveal} className="p-2 rounded-lg text-gray-500 hover:text-violet-400 hover:bg-violet-500/10 transition-colors">
            {loading ? <div className="w-4 h-4 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
              : revealed ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
          <button onClick={() => onDelete(Number(entry.entry_id))} className="p-2 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-colors">
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      <AnimatePresence>
        {revealed && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
            className="mt-4 pt-4 border-t border-white/10 space-y-2 overflow-hidden">
            <div className="flex items-center justify-between bg-black/50 rounded-xl px-4 py-3">
              <span className="font-mono text-sm text-emerald-400 flex-1 truncate">{revealed.password}</span>
              <button onClick={copyPw} className="ml-2 p-1.5 rounded-lg hover:bg-white/10 transition-colors flex-shrink-0">
                {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} className="text-gray-400" />}
              </button>
            </div>
            {strength && (
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1 bg-white/10 rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${strength.score}%`, backgroundColor: strength.color }} />
                </div>
                <span className="text-xs" style={{ color: strength.color }}>{strength.label}</span>
              </div>
            )}
            {entry.notes && <p className="text-xs text-gray-500 px-1">{entry.notes}</p>}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── VaultPage ─────────────────────────────────────────────────────────────────
export default function VaultPage() {
  const account = useCurrentAccount();
  const [showModal, setShowModal] = useState(false);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<Category>('all');
  const [refresh, setRefresh] = useState(0);
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();
  const suiClient = useSuiClient();

  const { data: vaultData, isLoading } = useSuiClientQuery(
    'getOwnedObjects',
    {
      owner: account?.address ?? '',
      filter: { StructType: `${PACKAGE_ID}::${VAULT_MODULE}::VaultRegistry` },
      options: { showContent: true, showDisplay: true },
    },
    { enabled: !!account, queryKey: ['vault', account?.address, refresh] },
  );

  const vaultObj = vaultData?.data?.[0];
  const vaultId = vaultObj?.data?.objectId;
  const vaultRef = vaultId ? {
    objectId: vaultId,
    version: vaultObj?.data?.version ?? '',
    digest: vaultObj?.data?.digest ?? '',
  } : null;
  const vaultFields = vaultObj?.data?.content?.dataType === 'moveObject'
    ? (vaultObj.data.content.fields as any) : null;

  const allEntries: VaultEntry[] = (vaultFields?.entries ?? []).map((e: any) => ({
    entry_id:      e.fields?.entry_id      ?? e.entry_id      ?? '0',
    site_name:     e.fields?.site_name     ?? e.site_name     ?? '',
    username_hint: e.fields?.username_hint ?? e.username_hint ?? '',
    blob_id:       e.fields?.blob_id       ?? e.blob_id       ?? '',
    category:      e.fields?.category      ?? e.category      ?? 'other',
    notes:         e.fields?.notes         ?? e.notes         ?? '',
    created_at:    e.fields?.created_at    ?? e.created_at    ?? '0',
  }));

  const filtered = useMemo(() => allEntries.filter(e => {
    const matchCat = activeCategory === 'all' || e.category === activeCategory;
    const matchSearch = !search || e.site_name.toLowerCase().includes(search.toLowerCase()) || e.username_hint.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  }), [allEntries, activeCategory, search]);

  // Category counts for badges
  const counts = useMemo(() => {
    const m: Record<string, number> = { all: allEntries.length };
    allEntries.forEach(e => { m[e.category] = (m[e.category] ?? 0) + 1; });
    return m;
  }, [allEntries]);

  const toast = useToast();

  const handleCreate = async () => {
    try {
      await signAndExecute({ transaction: vaultContract.createVaultTx() });
      setRefresh(r => r + 1);
      toast.success('Vault created!', 'Your on-chain vault is ready.');
    } catch (e) { toast.error('Create vault failed', String(e)); }
  };

  const handleDelete = async (entryId: number) => {
    if (!vaultId) return;
    const ok = await toast.confirm('Delete entry?', 'This action is permanent and cannot be undone.');
    if (!ok) return;
    try {
      const result = await signAndExecute({ transaction: vaultContract.removeEntryTx(vaultId, entryId) });
      await suiClient.waitForTransaction({ digest: result.digest });
      await new Promise(r => setTimeout(r, 1000));
      setRefresh(r => r + 1);
      toast.success('Entry deleted');
    } catch (e) { toast.error('Delete failed', String(e)); }
  };

  // ── Render: unauthenticated ─────────────────────────────────────────────
  if (!account) return (
    <div className="py-32 text-center">
      <div className="w-20 h-20 rounded-2xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center mx-auto mb-6">
        <KeyRound size={36} className="text-violet-400" />
      </div>
      <h2 className="text-2xl font-bold mb-2">Vault is Locked</h2>
      <p className="text-gray-400">Connect your Sui wallet to access your vault.</p>
    </div>
  );

  // ── Render: loading ──────────────────────────────────────────────────────
  if (isLoading) return (
    <div className="py-32 flex flex-col items-center gap-4 text-gray-400">
      <div className="w-10 h-10 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
      <p>Loading vault...</p>
    </div>
  );

  // ── Render: vault not yet created ─────────────────────────────────────────
  if (!vaultId) return (
    <div className="py-32 text-center max-w-sm mx-auto">
      <div className="w-20 h-20 rounded-2xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center mx-auto mb-6">
        <KeyRound size={36} className="text-violet-400" />
      </div>
      <h2 className="text-2xl font-bold mb-3">Create Your Vault</h2>
      <p className="text-gray-400 mb-6 text-sm leading-relaxed">
        Initialize a personal on-chain vault. Only your wallet can ever access it.
      </p>
      <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 mb-6 text-left">
        <AlertTriangle size={14} className="text-amber-400 mt-0.5 flex-shrink-0" />
        <p className="text-xs text-amber-300">One-time transaction to create your vault object on Sui Testnet.</p>
      </div>
      <button onClick={handleCreate} className="bg-violet-600 hover:bg-violet-500 px-8 py-3 rounded-xl font-bold transition-colors">
        Initialize Vault
      </button>
    </div>
  );

  // ── Render: main vault ──────────────────────────────────────────────────
  return (
    <div className="py-8">
      {/* Header row */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-black bg-gradient-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-transparent">My Vault</h1>
          <p className="text-sm text-gray-500 mt-1 flex items-center gap-1.5">
            <ShieldCheck size={12} className="text-violet-400" />
            {allEntries.length} entries · encrypted with Seal · stored on Walrus
          </p>
        </div>
        <button onClick={() => setShowModal(true)}
          className="flex items-center gap-2 bg-violet-600 hover:bg-violet-500 px-4 py-2.5 rounded-xl font-semibold text-sm transition-all hover:scale-105">
          <Plus size={16} /> Add Entry
        </button>
      </div>

      {/* Stats */}
      {allEntries.length > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-6">
          {[
            { label: 'Total', value: allEntries.length, icon: BarChart3, color: 'text-violet-400' },
            { label: 'Categories', value: new Set(allEntries.map(e => e.category)).size, icon: Sparkles, color: 'text-fuchsia-400' },
            { label: 'Protected by Seal', value: allEntries.length, icon: ShieldCheck, color: 'text-emerald-400' },
          ].map(s => (
            <div key={s.label} className="bg-white/5 border border-white/10 rounded-xl p-4 flex items-center gap-3">
              <s.icon size={18} className={s.color} />
              <div>
                <p className="text-xl font-bold">{s.value}</p>
                <p className="text-xs text-gray-500">{s.label}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Search */}
      <div className="relative mb-4">
        <Search size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by site or username..."
          className="w-full bg-[#1c1c1f] border border-white/15 rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder:text-gray-600 outline-none focus:border-violet-500 transition-colors" />
      </div>

      {/* Category tabs */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {CATEGORIES.map(c => (
          <button key={c.id} onClick={() => setActiveCategory(c.id)}
            className={clsx('flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors',
              activeCategory === c.id ? 'bg-violet-600/30 border-violet-500/50 text-violet-300' : 'border-white/10 text-gray-400 hover:border-white/20 hover:text-white'
            )}>
            {c.emoji} {c.label}
            {counts[c.id] ? <span className="bg-white/10 rounded-full px-1.5 py-0.5 text-gray-400">{counts[c.id]}</span> : null}
          </button>
        ))}
      </div>

      {/* Entry list */}
      {filtered.length === 0 ? (
        <div className="py-20 text-center bg-white/[0.02] rounded-2xl border border-white/10">
          <KeyRound size={32} className="mx-auto mb-3 text-gray-600" />
          <p className="text-gray-500 text-sm">{allEntries.length === 0 ? 'Your vault is empty' : 'No entries match your search'}</p>
          {allEntries.length === 0 && (
            <button onClick={() => setShowModal(true)} className="mt-3 text-violet-400 text-sm hover:underline">+ Add your first password</button>
          )}
        </div>
      ) : (
        <div className="grid gap-3">
          <AnimatePresence mode="popLayout">
            {filtered.map(e => (
              <VaultEntryCard key={e.entry_id} entry={e} vaultId={vaultId!} vaultRef={vaultRef!} onDelete={handleDelete} />
            ))}
          </AnimatePresence>
        </div>
      )}

      <AnimatePresence>
        {showModal && <AddEntryModal vaultId={vaultId} onClose={() => setShowModal(false)} onSuccess={() => setRefresh(r => r + 1)} />}
      </AnimatePresence>
    </div>
  );
}
