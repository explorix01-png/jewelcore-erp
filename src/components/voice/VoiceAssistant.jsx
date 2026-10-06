import React, { useState } from "react";
import { Mic, X, Send, Loader2, Volume2, VolumeX, RotateCcw, AlertCircle, Check, Languages } from "lucide-react";
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
        <div className="fixed bottom-20 sm:bottom-24 right-3 sm:right-6 z-50 w-[calc(100vw-1.5rem)] sm:w-96 max-w-sm">
          <div className="rounded-2xl border bg-card shadow-2xl overflow-hidden backdrop-blur-md">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-amber-600 flex items-center justify-center shadow-sm">
                  <Mic className="w-4 h-4 text-white" />
                </div>
                <div>
                  <span className="font-display font-semibold text-sm block leading-none">{t("voice.title")}</span>
                  <span className="text-[10px] text-muted-foreground">JewelCore Multilingual AI</span>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={v.toggleMute}
                  className={cn("p-1.5 rounded-lg border transition-colors", v.isMuted ? "bg-red-50 text-red-600 border-red-200" : "hover:bg-accent text-muted-foreground border-transparent")}
                  title={v.isMuted ? "Audio muted (click to unmute)" : "Audio active (click to mute)"}
                  aria-label={v.isMuted ? "Unmute Assistant" : "Mute Assistant"}
                >
                  {v.isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                </button>
                <button onClick={() => v.setOpen(false)} className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="p-4 space-y-3 max-h-[calc(75vh-4rem)] overflow-y-auto">
              {/* Language selector */}
              <div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1.5">
                  <Languages className="w-3.5 h-3.5" /> {t("voice.language")}
                </div>
                <div className="flex gap-1.5">
                  {VOICE_LANGS.map((l) => (
                    <button key={l.code} onClick={() => v.setLang(l.code)}
                      className={cn("flex-1 py-1.5 rounded-lg text-xs font-medium border transition-colors text-center",
                        v.lang === l.code ? "bg-amber-600 text-white border-amber-600 shadow-xs" : "bg-background hover:bg-accent border-border")}>
                      {l.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Status */}
              <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-muted/40 text-xs">
                <div className="flex items-center gap-2">
                  {v.status === "processing" || v.status === "speaking" ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-600" />
                  ) : v.status === "listening" ? (
                    <span className="relative flex h-2.5 w-2.5"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" /><span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" /></span>
                  ) : v.status === "error" ? (
                    <AlertCircle className="w-3.5 h-3.5 text-red-500" />
                  ) : (
                    <Mic className="w-3.5 h-3.5 text-muted-foreground" />
                  )}
                  <span className="font-medium text-foreground">{statusLabel}</span>
                </div>
                {v.isMuted && <span className="text-[10px] text-amber-700 bg-amber-100/70 px-1.5 py-0.5 rounded">Muted</span>}
              </div>

              {/* Live Speech / Transcript */}
              {(v.transcript || v.interimTranscript) && (
                <div className="rounded-xl bg-muted/70 border px-3 py-2.5 shadow-2xs">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{t("voice.youSaid")}</p>
                  <p className="text-sm font-medium mt-0.5 break-words">
                    "{v.transcript || v.interimTranscript}"
                    {v.interimTranscript && !v.transcript && <span className="inline-block w-1.5 h-3.5 ml-1 bg-amber-600 animate-pulse align-middle" />}
                  </p>
                </div>
              )}

              {/* Assistant Reply Card with Replay Button */}
              {v.reply && (
                <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 px-3 py-2.5 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] uppercase tracking-wider text-amber-700 dark:text-amber-400 font-semibold flex items-center gap-1">
                      <Volume2 className="w-3 h-3" /> {t("voice.assistant")}
                    </p>
                    <button
                      onClick={v.replaySpeech}
                      disabled={v.status === "speaking"}
                      className="text-[10px] font-medium text-amber-700 hover:text-amber-900 dark:text-amber-300 flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500/15 hover:bg-amber-500/25 transition-colors disabled:opacity-50"
                      title="Replay Voice Response"
                    >
                      <RotateCcw className="w-2.5 h-2.5" /> Replay
                    </button>
                  </div>
                  <p className="text-sm mt-1 text-foreground leading-relaxed break-words">{v.reply}</p>
                </div>
              )}

              {/* Error */}
              {v.error && (
                <div className="rounded-xl bg-destructive/10 border border-destructive/20 px-3 py-2.5 text-sm text-destructive flex items-start gap-2">
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