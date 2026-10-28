// components/UnauthorizedDomainModal.tsx
'use client';

import React, { useState } from 'react';
import { X, ExternalLink, Copy, Check, ShieldAlert, Key } from 'lucide-react';
import firebaseConfig from '@/firebase-applet-config.json';

interface UnauthorizedDomainModalProps {
  domain: string;
  onClose: () => void;
  lang?: string;
}

export default function UnauthorizedDomainModal({
  domain,
  onClose,
  lang = 'ar',
}: UnauthorizedDomainModalProps) {
  const [copied, setCopied] = useState(false);
  const isAr = lang === 'ar';

  const projectId = firebaseConfig.projectId || 'climbing-inscriber-9lcf1';
  const consoleUrl = `https://console.firebase.google.com/project/${projectId}/authentication/settings`;

  const handleCopy = () => {
    if (navigator?.clipboard) {
      navigator.clipboard.writeText(domain);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in"
    >
      <div
        className="relative w-full max-w-lg bg-[#0e111a] border border-amber-500/30 rounded-2xl shadow-2xl p-6 sm:p-7 text-white overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Glow effect */}
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 left-4 p-2 rounded-full bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition"
          aria-label="Close"
        >
          <X size={18} />
        </button>

        {/* Icon & Header */}
        <div className="flex items-start gap-4 mb-5">
          <div className="p-3 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-400 flex-shrink-0">
            <ShieldAlert size={26} />
          </div>
          <div>
            <h3 className="text-lg sm:text-xl font-black text-white">
              {isAr ? 'تفعيل نطاق المصادقة في Firebase' : 'Authorize Domain in Firebase'}
            </h3>
            <p className="text-xs text-amber-300/90 font-medium mt-0.5">
              {isAr ? 'Firebase Authentication: auth/unauthorized-domain' : 'Firebase Authentication: auth/unauthorized-domain'}
            </p>
          </div>
        </div>

        {/* Explanation */}
        <p className="text-xs sm:text-sm text-gray-300 leading-relaxed mb-4">
          {isAr
            ? 'نطاق التشغيل الحالي غير مدرج في قائمة النطاقات المعتمدة (Authorized Domains) بمشروع Firebase الخاص بك، لذلك تم منع عملية تسجيل الدخول بواسطة سياسات أمان Firebase.'
            : 'The current domain is not yet on the Authorized Domains list in your Firebase project settings, so Google Sign-in was blocked by Firebase security.'}
        </p>

        {/* Current Domain Box with Copy */}
        <div className="bg-[#151926] border border-white/10 rounded-xl p-3 mb-5">
          <div className="flex items-center justify-between text-[11px] text-gray-400 mb-1.5 font-medium">
            <span>{isAr ? 'النطاق الحالي المراد اعتماده:' : 'Domain to authorize:'}</span>
            {copied && (
              <span className="text-emerald-400 flex items-center gap-1 font-bold">
                <Check size={12} /> {isAr ? 'تم النسخ!' : 'Copied!'}
              </span>
            )}
          </div>
          <div className="flex items-center justify-between gap-2 bg-black/50 border border-white/10 rounded-lg px-3 py-2">
            <code className="text-xs sm:text-sm font-mono text-amber-400 truncate select-all">
              {domain}
            </code>
            <button
              onClick={handleCopy}
              className="flex items-center gap-1 text-xs bg-white/10 hover:bg-white/20 text-white px-2.5 py-1 rounded-md transition flex-shrink-0 cursor-pointer"
            >
              {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
              <span>{copied ? (isAr ? 'تم النسخ' : 'Copied') : isAr ? 'نسخ' : 'Copy'}</span>
            </button>
          </div>
        </div>

        {/* 3-Step Quick Guide */}
        <div className="space-y-2 text-xs text-gray-300 mb-6 bg-white/[0.02] p-3.5 rounded-xl border border-white/5">
          <p className="font-bold text-white text-[13px] mb-1">
            {isAr ? 'خطوات التفعيل السريعة (خلال 30 ثانية):' : 'Quick 30-Second Setup:'}
          </p>
          <div className="flex items-start gap-2">
            <span className="w-5 h-5 rounded-full bg-red-600/20 text-red-400 flex items-center justify-center font-bold text-[10px] flex-shrink-0 mt-0.5">1</span>
            <span>{isAr ? 'انقر فوق "فتح إعدادات Firebase" بالأسفل.' : 'Click "Open Firebase Settings" below.'}</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="w-5 h-5 rounded-full bg-red-600/20 text-red-400 flex items-center justify-center font-bold text-[10px] flex-shrink-0 mt-0.5">2</span>
            <span>{isAr ? 'انتقل إلى تبويب "Authorized domains" واضغط "Add domain".' : 'Scroll down to "Authorized domains" and click "Add domain".'}</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="w-5 h-5 rounded-full bg-red-600/20 text-red-400 flex items-center justify-center font-bold text-[10px] flex-shrink-0 mt-0.5">3</span>
            <span>{isAr ? 'الصق النطاق المنسوخ واحفظ، ثم أعد المحاولة فوراً.' : 'Paste the copied domain, save, and retry login.'}</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center gap-3">
          <a
            href={consoleUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full sm:flex-1 flex items-center justify-center gap-2 bg-[#ff1e27] hover:bg-red-700 text-white font-bold py-2.5 px-4 rounded-xl text-xs sm:text-sm transition shadow-lg shadow-red-600/30 text-center"
          >
            <ExternalLink size={15} />
            <span>{isAr ? 'فتح إعدادات Firebase Console' : 'Open Firebase Settings'}</span>
          </a>

          <button
            onClick={onClose}
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-gray-300 hover:text-white text-xs sm:text-sm font-semibold transition"
          >
            {isAr ? 'استمرار كضيف (Guest)' : 'Continue as Guest'}
          </button>
        </div>
      </div>
    </div>
  );
}
