import { createContext, useContext } from "react";
import { en } from "./i18n/en";
import { hi } from "./i18n/hi";
import { mr } from "./i18n/mr";

// Centralized i18n system for English / Hindi / Marathi.
// All UI strings use translation keys. Database/business values are never translated.
// Translation dictionaries live in ./i18n/{en,hi,mr}.js

export const translations = {
  en,
  hi,
  mr,
};

export const I18nContext = createContext({ lang: "en", t: (k) => k });

export function useI18n() {
  return useContext(I18nContext);
}

export function useT() {
  const { t } = useI18n();
  return t;
}