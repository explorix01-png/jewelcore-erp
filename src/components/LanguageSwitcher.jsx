import React from "react";
import { useI18n } from "@/lib/i18n";
import { Globe } from "lucide-react";

export default function LanguageSwitcher() {
  const { lang, setLang } = useI18n();
  return (
    <div className="flex items-center gap-1">
      <Globe className="w-3.5 h-3.5 text-muted-foreground" />
      <select
        value={lang}
        onChange={(e) => setLang(e.target.value)}
        className="text-xs border rounded px-2 py-1 bg-background cursor-pointer"
      >
        <option value="en">English</option>
        <option value="hi">हिंदी</option>
        <option value="mr">मराठी</option>
      </select>
    </div>
  );
}