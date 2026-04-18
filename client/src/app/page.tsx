'use client';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ShieldCheck, Layers, KeyRound, ArrowRight, Lock, Globe, Zap } from 'lucide-react';

const FEATURES = [
  {
    icon: Lock,
    title: 'Seal Encryption',
    desc: 'Your passwords are encrypted before they leave your device. Only your wallet signature can unlock them.',
    color: 'from-violet-500/20 to-violet-500/5',
    border: 'border-violet-500/20',
    iconColor: 'text-violet-400',
  },
  {
    icon: Globe,
    title: 'Walrus Storage',
    desc: 'Encrypted blobs live on decentralized Walrus storage — no central server, no single point of failure.',
    color: 'from-blue-500/20 to-blue-500/5',
    border: 'border-blue-500/20',
    iconColor: 'text-blue-400',
  },
  {
    icon: Zap,
    title: 'Sui Blockchain',
    desc: 'Your vault index is an on-chain owned object. Only your wallet address can read or modify it.',
    color: 'from-fuchsia-500/20 to-fuchsia-500/5',
    border: 'border-fuchsia-500/20',
    iconColor: 'text-fuchsia-400',
  },
];

export default function LandingPage() {
  return (
    <div className="py-20 max-w-4xl mx-auto">
      {/* Hero */}
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="text-center mb-24"
      >
        <div className="inline-flex items-center gap-2 bg-violet-500/10 border border-violet-500/20 rounded-full px-4 py-1.5 text-sm text-violet-300 mb-8">
          <ShieldCheck size={14} />
          Built on Sui · Walrus · Seal Protocol
        </div>

        <h1 className="text-6xl font-black mb-6 leading-tight">
          Your passwords,{' '}
          <span className="bg-gradient-to-r from-violet-400 via-fuchsia-400 to-pink-400 bg-clip-text text-transparent">
            on-chain.
          </span>
          <br />
          Only you can unlock.
        </h1>

        <p className="text-xl text-gray-400 max-w-2xl mx-auto mb-10 leading-relaxed">
          SealVault encrypts your credentials with Seal Protocol and stores them on
          Walrus — a decentralized storage network. No master password. No company.
          Just your wallet.
        </p>

        <Link
          href="/vault"
          className="inline-flex items-center gap-2 bg-violet-600 hover:bg-violet-500 text-white font-bold px-8 py-4 rounded-2xl text-lg transition-all hover:scale-105 hover:shadow-lg hover:shadow-violet-500/25"
        >
          <KeyRound size={20} />
          Open My Vault
          <ArrowRight size={18} />
        </Link>
      </motion.div>

      {/* Feature cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {FEATURES.map((f, i) => (
          <motion.div
            key={f.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 + i * 0.1 }}
            className={`bg-gradient-to-b ${f.color} border ${f.border} rounded-2xl p-6`}
          >
            <div className={`p-3 bg-white/5 rounded-xl inline-flex mb-4 ${f.iconColor}`}>
              <f.icon size={22} />
            </div>
            <h3 className="font-bold text-lg mb-2">{f.title}</h3>
            <p className="text-gray-400 text-sm leading-relaxed">{f.desc}</p>
          </motion.div>
        ))}
      </div>

      {/* Bottom CTA */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.7 }}
        className="mt-20 text-center"
      >
        <div className="inline-flex items-center gap-2 bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-gray-400 text-sm">
          <Layers size={16} className="text-violet-400" />
          Running on Sui Testnet · Zero fees for demo
        </div>
      </motion.div>
    </div>
  );
}
