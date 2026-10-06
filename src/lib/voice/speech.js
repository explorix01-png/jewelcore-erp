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

// Create a configured SpeechRecognition instance with interim results enabled.
export function createRecognition(langCode, { onInterim } = {}) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return null;
  const rec = new SR();
  rec.lang = bcp47For(langCode);
  rec.continuous = false;
  rec.interimResults = true;
  rec.maxAlternatives = 1;
  return rec;
}

// Helper to get cached or loaded voices reliably across browsers
function getAvailableVoices() {
  if (!synthesisSupported()) return [];
  return window.speechSynthesis.getVoices() || [];
}

// Resolve best voice for selected language (Marathi, Hindi, or Indian/US English)
function findBestVoice(langCode) {
  const voices = getAvailableVoices();
  if (voices.length === 0) return null;

  const targetBcp = bcp47For(langCode).toLowerCase();
  const targetPrefix = langCode.toLowerCase();

  // 1. Exact BCP-47 match (e.g. mr-IN, hi-IN, en-IN)
  let voice = voices.find((v) => (v.lang || "").toLowerCase() === targetBcp);
  if (voice) return voice;

  // 2. Language prefix match (e.g. mr, hi, en)
  voice = voices.find((v) => (v.lang || "").toLowerCase().startsWith(targetPrefix));
  if (voice) return voice;

  // 3. For Marathi fallback to Hindi if available, otherwise Indian English
  if (langCode === "mr") {
    voice = voices.find((v) => (v.lang || "").toLowerCase().startsWith("hi"));
    if (voice) return voice;
  }

  // 4. English fallback
  return voices.find((v) => (v.lang || "").toLowerCase().startsWith("en")) || voices[0] || null;
}

// Speak text using browser TTS with selected language and voice
export function speak(text, langCode, { onStart, onEnd } = {}) {
  return new Promise((resolve) => {
    if (!synthesisSupported() || !text) {
      onEnd?.();
      resolve();
      return;
    }

    try {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = bcp47For(langCode);

      const voice = findBestVoice(langCode);
      if (voice) utter.voice = voice;

      utter.rate = 0.95; // Slightly measured rate for clear Indian/Devanagari pronunciation
      utter.pitch = 1.0;

      utter.onstart = () => onStart?.();
      utter.onend = () => {
        onEnd?.();
        resolve();
      };
      utter.onerror = () => {
        onEnd?.();
        resolve();
      };

      window.speechSynthesis.speak(utter);
    } catch {
      onEnd?.();
      resolve();
    }
  });
}

export function stopSpeaking() {
  if (synthesisSupported()) {
    try {
      window.speechSynthesis.cancel();
    } catch {}
  }
}