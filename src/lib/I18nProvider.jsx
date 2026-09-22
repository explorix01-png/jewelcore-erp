import React, { useState, useEffect, useCallback } from "react";
import { I18nContext, translations } from "@/lib/i18n";

export function I18nProvider({ children }) {
  const [lang, setLang] = useState(() => {
    return localStorage.getItem("app_lang") || "en";
  });

  useEffect(() => {
    localStorage.setItem("app_lang", lang);
  }, [lang]);

  const t = useCallback((key) => {
    const dict = translations[lang] || translations.en;
    if (dict[key]) return dict[key];
    if (translations.en[key]) return translations.en[key];
    // Human-readable fallback: "namespace.keyName" → "Key Name"
    const parts = key.split(".");
    const last = parts[parts.length - 1];
    return last
      .replace(/_/g, " ")
      .replace(/([A-Z])/g, " $1")
      .replace(/^./, (c) => c.toUpperCase())
      .trim();
  }, [lang]);

  return (
    <I18nContext.Provider value={{ lang, setLang, t }}>
      {children}
    </I18nContext.Provider>
  );
}