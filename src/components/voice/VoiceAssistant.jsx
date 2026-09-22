import React, { useState } from "react";
import { Mic, X, Send, Loader2, Volume2, AlertCircle, Check, Languages } from "lucide-react";
import { useVoiceAssistant } from "@/hooks/useVoiceAssistant";
import { VOICE_LANGS } from "@/lib/voice/speech";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

// Floating, persistent Voice Assistant button + panel.
// Mounted once in Layout so it is available across the entire ERP.
// The assistant is a controlled interface: it navigates, runs read-only
// informational queries, and asks for confirmation before any destructive
// action — which is then delegated to the existing authorized business functions.
export default function VoiceAssistant() {
  const t = useT();
  const v = useVoiceAssistant();
  const [text, setText] = useState("");

  const statusLabel = {
    idle: t("voice.idle"),
    listening: t("voice.listening"),
    processing: t("voice.processing"),
    speaking: t("voice.speaking"),
    error: t("voice.errorState"),
  }[v.status] || t("voice.idle");

  const onSend = () => { const s = text.trim(); if (!s) return; setText(""); v.submitText(s); };

  return (
    <>
      {/* Panel */}
      {v.open && (
        <div className="fixed bottom-24 right-4 sm:right-6 z-50 w-[92vw] max-w-sm">
          <div className="rounded-2xl border bg-card shadow-xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b bg-gradient-to-r from-amber-50 to-amber-100/50">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-amber-600 flex items-center justify-center">
                  <Mic className="w-4 h-4 text-white" />
                </div>
                <span className="font-display font-semibold text-sm">{t("voice.title")}</span>
              </div>
              <button onClick={() => v.setOpen(false)} className="p-1 rounded-md hover:bg-black/5 text-muted-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-3 max-h-[60vh] overflow-y-auto">
              {/* Language selector */}
              <div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1.5">
                  <Languages className="w-3.5 h-3.5" /> {t("voice.language")}
                </div>
                <div className="flex gap-1.5">
                  {VOICE_LANGS.map((l) => (
                    <button key={l.code} onClick={() => v.setLang(l.code)}
                      className={cn("px-2.5 py-1 rounded-md text-xs font-medium border transition-colors",
                        v.lang === l.code ? "bg-amber-600 text-white border-amber-600" : "bg-background hover:bg-accent border-border")}>
                      {l.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Status */}
              <div className="flex items-center gap-2 text-sm">
                {v.status === "processing" || v.status === "speaking" ? (
                  <Loader2 className="w-4 h-4 animate-spin text-amber-600" />
                ) : v.status === "listening" ? (
                  <span className="relative flex h-3 w-3"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" /><span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" /></span>
                ) : v.status === "error" ? (
                  <AlertCircle className="w-4 h-4 text-red-500" />
                ) : (
                  <Mic className="w-4 h-4 text-muted-foreground" />
                )}
                <span className="text-muted-foreground">{statusLabel}</span>
              </div>

              {/* Transcript */}
              {v.transcript && (
                <div className="rounded-lg bg-muted/60 px-3 py-2">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{t("voice.youSaid")}</p>
                  <p className="text-sm font-medium mt-0.5">"{v.transcript}"</p>
                </div>
              )}

              {/* Reply */}
              {v.reply && (
                <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
                  <p className="text-[10px] uppercase tracking-wider text-amber-700 flex items-center gap-1"><Volume2 className="w-3 h-3" /> {t("voice.assistant")}</p>
                  <p className="text-sm mt-0.5">{v.reply}</p>
                </div>
              )}

              {/* Error */}
              {v.error && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /><span>{v.error}</span>
                </div>
              )}

              {/* Disambiguation */}
              {v.disambiguation && (
                <div className="rounded-lg border px-3 py-2">
                  <p className="text-xs font-medium mb-1.5">{t("voice.disambiguation")}</p>
                  <div className="space-y-1">
                    {v.disambiguation.matches.map((m) => (
                      <button key={m.id} onClick={() => v.disambiguation.onSelect(m)}
                        className="w-full text-left px-2.5 py-1.5 rounded-md hover:bg-accent text-sm border border-transparent hover:border-border">
                        <span className="font-medium">{m.label}</span>
                        {m.meta && <span className="text-xs text-muted-foreground block">{m.meta}</span>}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Destructive confirmation */}
              {v.confirm && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5">
                  <p className="text-sm text-red-800">{v.confirm.reply || t("voice.confirmDestructive")}</p>
                  <div className="flex gap-2 mt-2">
                    <button onClick={v.confirmDestructive} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-red-600 text-white text-xs font-medium hover:bg-red-700">
                      <Check className="w-3.5 h-3.5" /> {t("voice.confirm")}
                    </button>
                    <button onClick={v.cancelDestructive} className="inline-flex items-center px-3 py-1.5 rounded-md bg-background border text-xs font-medium hover:bg-accent">
                      {t("voice.cancel")}
                    </button>
                  </div>
                </div>
              )}

              {/* Text input fallback */}
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">{t("voice.typeFallback")}</p>
                <div className="flex gap-1.5">
                  <input
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") onSend(); }}
                    placeholder={t("voice.typePlaceholder")}
                    className="flex-1 h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                  <button onClick={onSend} className="inline-flex items-center justify-center h-9 w-9 rounded-md bg-primary text-primary-foreground hover:bg-primary/90">
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Floating button */}
      <button
        onClick={() => { if (!v.open) { v.setOpen(true); if (v.supported) v.startListening(); } else v.setOpen(false); }}
        className={cn("fixed bottom-4 right-4 sm:right-6 z-50 h-14 w-14 rounded-full shadow-lg flex items-center justify-center transition-all",
          v.status === "listening" ? "bg-red-500 hover:bg-red-600" : "bg-amber-600 hover:bg-amber-700")}
        title={t("voice.idle")}
        aria-label={t("voice.title")}
      >
        {v.status === "listening" ? (
          <span className="relative flex h-5 w-5"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-60" /><Mic className="relative w-5 h-5 text-white" /></span>
        ) : v.status === "processing" ? (
          <Loader2 className="w-5 h-5 text-white animate-spin" />
        ) : (
          <Mic className="w-5 h-5 text-white" />
        )}
      </button>
    </>
  );
}