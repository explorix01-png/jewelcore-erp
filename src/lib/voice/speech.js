// Web Speech API wrapper for the Voice Assistant.
// Handles speech recognition (input) and speech synthesis (output).
// Gracefully degrades: if the browser has no SpeechRecognition, the UI falls
// back to a text input — the assistant never becomes unusable.

export const VOICE_LANGS = [
  { code: "en", label: "English", bcp47: "en-IN" },
  { code: "hi", label: "हिंदी", bcp47: "hi-IN" },
  { code: "mr", label: "मराठी", bcp47: "mr-IN" },
];

export function bcp47For(code) {
  const found = VOICE_LANGS.find((l) => l.code === code);
  return found ? found.bcp47 : "en-IN";
}

export function recognitionSupported() {
  return typeof window !== "undefined" &&
    !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}

export function synthesisSupported() {
  return typeof window !== "undefined" && !!window.speechSynthesis;
}

// Create a configured SpeechRecognition instance. Returns null if unsupported.
export function createRecognition(langCode) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return null;
  const rec = new SR();
  rec.lang = bcp47For(langCode);
  rec.continuous = false;
  rec.interimResults = false;
  rec.maxAlternatives = 1;
  return rec;
}

// Speak text using the browser TTS, picking a voice matching the language.
// Resolves when speech ends (or immediately if unsupported).
export function speak(text, langCode) {
  return new Promise((resolve) => {
    if (!synthesisSupported() || !text) { resolve(); return; }
    try {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = bcp47For(langCode);
      const voices = window.speechSynthesis.getVoices() || [];
      const match = voices.find((v) => (v.lang || "").toLowerCase().startsWith(langCode)) ||
                    voices.find((v) => (v.lang || "").toLowerCase().startsWith("en"));
      if (match) utter.voice = match;
      utter.rate = 1;
      utter.onend = () => resolve();
      utter.onerror = () => resolve();
      window.speechSynthesis.speak(utter);
    } catch { resolve(); }
  });
}

export function stopSpeaking() {
  if (synthesisSupported()) { try { window.speechSynthesis.cancel(); } catch {} }
}