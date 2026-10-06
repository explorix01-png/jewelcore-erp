import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { usePermission } from "@/lib/permissions";
import { useT } from "@/lib/i18n";
import { createRecognition, recognitionSupported, speak, stopSpeaking } from "@/lib/voice/speech";
import { matchIntent } from "@/lib/voice/intents";

// Maps informational query types to the ERP module whose read permission is required.
const QUERY_MODULE = {
  today_sales: "dashboard", monthly_sales: "dashboard", recent_bills: "bills",
  due_bills: "bills", pending_payments: "bills",
  low_stock: "inventory", out_of_stock: "inventory", gold_item_count: "inventory", silver_item_count: "inventory",
  customer_count: "customers", supplier_outstanding: "suppliers",
};

const LANG_KEY = "jewelcore.voice.lang";

export function useVoiceAssistant() {
  const navigate = useNavigate();
  const { canAny } = usePermission();
  const t = useT();

  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState("idle"); // idle|listening|processing|speaking|error
  const [transcript, setTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [reply, setReply] = useState("");
  const [error, setError] = useState("");
  const [lang, setLang] = useState(() => localStorage.getItem(LANG_KEY) || "en");
  const [isMuted, setIsMuted] = useState(() => localStorage.getItem("jewelcore.voice.muted") === "true");
  const [disambiguation, setDisambiguation] = useState(null); // { matches, onSelect }
  const [confirm, setConfirm] = useState(null); // { target, action, name, matches, bill_number }

  const recRef = useRef(null);

  useEffect(() => { localStorage.setItem(LANG_KEY, lang); }, [lang]);
  useEffect(() => { localStorage.setItem("jewelcore.voice.muted", String(isMuted)); }, [isMuted]);
  useEffect(() => () => { stopSpeaking(); if (recRef.current) try { recRef.current.abort(); } catch {} }, []);

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      if (next) stopSpeaking();
      return next;
    });
  }, []);

  const say = useCallback(async (text) => {
    setReply(text);
    if (isMuted) {
      setStatus("idle");
      return;
    }
    setStatus("speaking");
    await speak(text, lang, { onEnd: () => setStatus("idle") });
  }, [lang, isMuted]);

  const replaySpeech = useCallback(async () => {
    if (!reply) return;
    setStatus("speaking");
    await speak(reply, lang, { onEnd: () => setStatus("idle") });
  }, [reply, lang]);

  const fail = useCallback((msg) => { setError(msg); setStatus("error"); }, []);

  // Execute a resolved navigation, enforcing module permission.
  const goNavigate = useCallback((path, module, labelKey) => {
    if (module && !canAny(module)) { say(t("voice.noAccess")); return; }
    navigate(path);
    say(`${t("voice.opening")} ${t(labelKey)}`);
  }, [canAny, navigate, t, say]);

  // Run an informational query via the backend (real ERP data).
  const runQuery = useCallback(async (queryType) => {
    const mod = QUERY_MODULE[queryType] || "dashboard";
    if (!canAny(mod)) { say(t("voice.noAccess")); return; }
    setStatus("processing");
    try {
      const res = await base44.functions.invoke("voiceAssistant", { action: "query", query_type: queryType, lang });
      await say(res.data?.reply || t("voice.noData"));
    } catch { await say(t("voice.noData")); }
  }, [canAny, t, say, lang]);

  // Dispatch the structured result returned by the backend `understand` action.
  const dispatchUnderstood = useCallback(async (data) => {
    const intent = data.intent;
    const params = data.params || {};
    if (intent === "NAVIGATE" && params.path) {
      const module = pathToModule(params.path);
      goNavigate(params.path, module, pathToLabel(params.path));
      return;
    }
    if (intent === "OPEN_CUSTOMER" || intent === "OPEN_CUSTOMER_BILLS") {
      const matches = data.matches?.matches || [];
      if (matches.length === 0) { await say(t("voice.customerNotFound")); return; }
      if (matches.length === 1) {
        navigate(`/customers/${matches[0].id}`);
        await say(data.reply || t("voice.openingCustomer"));
        return;
      }
      setDisambiguation({ matches, onSelect: (m) => { setDisambiguation(null); navigate(`/customers/${m.id}`); say(t("voice.openingCustomer")); } });
      setStatus("idle");
      return;
    }
    if (intent === "FIND_ITEM") {
      const matches = data.matches?.matches || [];
      if (matches.length === 0) { await say(t("voice.itemNotFound")); return; }
      const metal = matches[0].metal_type === "silver" ? "silver" : "gold";
      if (matches.length === 1) {
        if (canAny("inventory")) { navigate(`/inventory/${metal}`); await say(data.reply || t("voice.openingInventory")); }
        else await say(t("voice.noAccess"));
        return;
      }
      setDisambiguation({ matches, onSelect: (m) => {
        setDisambiguation(null);
        const mt = m.metal_type === "silver" ? "silver" : "gold";
        if (canAny("inventory")) { navigate(`/inventory/${mt}`); say(t("voice.openingInventory")); }
        else say(t("voice.noAccess"));
      } });
      setStatus("idle");
      return;
    }
    if (intent === "FIND_SUPPLIER") {
      const matches = data.matches?.matches || [];
      if (matches.length === 0) { await say(t("voice.supplierNotFound")); return; }
      if (canAny("suppliers")) { navigate("/suppliers"); await say(data.reply || t("voice.openingSuppliers")); }
      else await say(t("voice.noAccess"));
      return;
    }
    if (intent === "QUERY") {
      await say(data.query_result?.reply || t("voice.noData"));
      return;
    }
    if (intent === "OPEN_BILL_NUMBER") {
      if (canAny("bills")) { navigate("/bills"); await say(data.reply || t("voice.openingBills")); }
      else await say(t("voice.noAccess"));
      return;
    }
    if (intent === "DESTRUCTIVE") {
      const d = data.destructive || {};
      setConfirm({ target: d.target, action: d.action, name: d.name, matches: data.matches?.matches || [], bill_number: data.bill_number || "", reply: data.reply });
      setStatus("idle");
      return;
    }
    await say(data.reply || t("voice.unknown"));
  }, [canAny, navigate, goNavigate, say, t]);

  // Main entry: process a transcript (from mic or text input).
  const processCommand = useCallback(async (rawText) => {
    const text = String(rawText || "").trim();
    if (!text) { fail(t("voice.noSpeech")); return; }
    setTranscript(text);
    setInterimTranscript("");
    setError("");
    setDisambiguation(null);
    setStatus("processing");

    const matched = matchIntent(text);
    try {
      if (matched?.kind === "navigate") {
        goNavigate(matched.path, matched.module, pathToLabel(matched.path));
        return;
      }
      if (matched?.kind === "query") {
        await runQuery(matched.queryType);
        return;
      }
      if (matched?.kind === "entity") {
        const res = await base44.functions.invoke("voiceAssistant", {
          action: "resolve",
          resolve_type: matched.entityType,
          name: matched.name
        });
        const matches = res.data?.matches || [];
        if (matched.entityType === "customer") {
          if (matches.length === 0) { await say(t("voice.customerNotFound")); return; }
          if (matches.length === 1) {
            navigate(`/customers/${matches[0].id}`);
            await say(`${t("voice.openingCustomer")} ${matches[0].label}`);
            return;
          }
          setDisambiguation({ matches, onSelect: (m) => { setDisambiguation(null); navigate(`/customers/${m.id}`); say(`${t("voice.openingCustomer")} ${m.label}`); } });
          setStatus("idle");
          return;
        }
        if (matched.entityType === "item") {
          if (matches.length === 0) { await say(t("voice.itemNotFound")); return; }
          const metal = matches[0].metal_type === "silver" ? "silver" : "gold";
          if (matches.length === 1) {
            if (canAny("inventory")) { navigate(`/inventory/${metal}`); await say(`${t("voice.openingInventory")} ${matches[0].label}`); }
            else await say(t("voice.noAccess"));
            return;
          }
          setDisambiguation({ matches, onSelect: (m) => {
            setDisambiguation(null);
            const mt = m.metal_type === "silver" ? "silver" : "gold";
            if (canAny("inventory")) { navigate(`/inventory/${mt}`); say(`${t("voice.openingInventory")} ${m.label}`); }
            else say(t("voice.noAccess"));
          } });
          setStatus("idle");
          return;
        }
        if (matched.entityType === "supplier") {
          if (matches.length === 0) { await say(t("voice.supplierNotFound")); return; }
          if (canAny("suppliers")) { navigate("/suppliers"); await say(t("voice.openingSuppliers")); }
          else await say(t("voice.noAccess"));
          return;
        }
      }
      if (matched?.kind === "bill_number") {
        if (canAny("bills")) {
          navigate("/bills");
          await say(`${t("voice.openingBills")} #${matched.billNumber}`);
        } else {
          await say(t("voice.noAccess"));
        }
        return;
      }
      // destructive or arbitrary phrasing → backend understand
      const res = await base44.functions.invoke("voiceAssistant", { action: "understand", transcript: text, lang });
      if (!res.data) { await say(t("voice.unknown")); return; }
      await dispatchUnderstood(res.data);
    } catch (e) {
      fail(t("voice.error"));
    }
  }, [goNavigate, runQuery, dispatchUnderstood, say, fail, t, lang, canAny, navigate]);

  // --- Speech recognition ---
  const startListening = useCallback(() => {
    setError(""); setReply(""); setDisambiguation(null); setConfirm(null); setInterimTranscript("");
    if (!recognitionSupported()) { fail(t("voice.micUnsupported")); return; }
    const rec = createRecognition(lang);
    if (!rec) { fail(t("voice.micUnsupported")); return; }
    recRef.current = rec;
    setStatus("listening");

    rec.onresult = (e) => {
      let interim = "";
      let final = "";
      for (let i = 0; i < e.results.length; i++) {
        if (e.results[i].isFinal) {
          final += e.results[i][0].transcript;
        } else {
          interim += e.results[i][0].transcript;
        }
      }
      if (interim) setInterimTranscript(interim);
      if (final) {
        setInterimTranscript("");
        processCommand(final);
      }
    };
    rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") fail(t("voice.micDenied"));
      else if (e.error === "no-speech") fail(t("voice.noSpeech"));
      else fail(t("voice.error"));
    };
    rec.onend = () => { if (recRef.current === rec) { /* status set by processCommand */ } };
    try { rec.start(); } catch { fail(t("voice.error")); }
  }, [lang, processCommand, fail, t]);

  const stopListening = useCallback(() => {
    if (recRef.current) { try { recRef.current.stop(); } catch {} }
    setStatus("idle");
    setInterimTranscript("");
  }, []);

  const submitText = useCallback((text) => { processCommand(text); }, [processCommand]);

  // --- Destructive confirmation: delegate to EXISTING authorized functions ---
  const confirmDestructive = useCallback(async () => {
    const c = confirm; if (!c) return;
    setConfirm(null);
    setStatus("processing");
    try {
      if ((c.target === "item" || c.target === "category" || c.target === "purity" || c.target === "gst") && c.matches[0]) {
        await base44.functions.invoke("manageMaster", { action: "delete", entity: c.target, id: c.matches[0].id });
        await say(t("voice.archived"));
      } else if (c.target === "supplier" && c.matches[0]) {
        await base44.functions.invoke("manageSupplier", { action: "delete", id: c.matches[0].id });
        await say(t("voice.archived"));
      } else if (c.target === "bill" && c.bill_number) {
        const bills = await base44.entities.Bill.filter({ bill_number: c.bill_number }, "-created_date", 1);
        if (bills[0]) { await base44.functions.invoke("cancelBill", { bill_id: bills[0].id, reason: "Voice assistant" }); await say(t("voice.cancelled")); }
        else await say(t("voice.billNotFound"));
      } else if (c.target === "stock") {
        if (canAny("inventory")) { navigate("/inventory/gold"); await say(t("voice.stockManual")); }
        else await say(t("voice.noAccess"));
      } else {
        await say(t("voice.cannotDo"));
      }
    } catch (e) {
      await say(t("voice.actionFailed"));
    }
  }, [confirm, navigate, canAny, say, t]);

  const cancelDestructive = useCallback(() => { setConfirm(null); setStatus("idle"); setReply(t("voice.cancelledByUser")); }, [t]);

  return {
    open, setOpen, status, transcript, interimTranscript, reply, error, lang, setLang,
    isMuted, toggleMute, replaySpeech,
    disambiguation, confirm,
    startListening, stopListening, submitText,
    confirmDestructive, cancelDestructive,
    supported: recognitionSupported(),
  };
}

function pathToModule(path) {
  if (path === "/") return "dashboard";
  if (path.startsWith("/inventory/")) return "inventory";
  return path.slice(1).split("/")[0];
}
function pathToLabel(path) {
  const map = {
    "/": "nav.dashboard", "/billing": "nav.billing", "/bills": "nav.bills",
    "/customers": "nav.customers", "/suppliers": "nav.suppliers", "/purchase": "nav.purchase",
    "/inventory/gold": "nav.goldInventory", "/inventory/silver": "nav.silverInventory",
    "/orders": "nav.orders", "/karagir": "nav.karagir", "/rates": "nav.rates",
    "/master": "nav.master", "/settings": "nav.settings", "/admin": "nav.admin", "/data": "nav.data",
  };
  return map[path] || "nav.dashboard";
}