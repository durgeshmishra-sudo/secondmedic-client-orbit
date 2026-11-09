"use client";

import { Component, ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Attachment = { file: File; clientId: string; entityType: string };
type PendingSave = { fingerprint: string; key: string; body: Record<string, unknown>; message: string; result?: any; attachment?: Attachment; onComplete?: () => void };
const names = ["clients", "revenue", "pipeline", "calls", "meetings", "invoices", "payments", "agreements", "documents", "vendors", "members", "teamSummary"];
async function boundedFetch(input: string, init: RequestInit) { const controller = new AbortController(); const timeout = window.setTimeout(() => controller.abort(), 30000); try { return await fetch(input, { ...init, signal: controller.signal }); } finally { window.clearTimeout(timeout); } }

export function useWorkspace<T>(initial: T) {
  const [data, setData] = useState<T>(initial);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [slow, setSlow] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [lastUpdated, setLastUpdated] = useState("");
  const [changed, setChanged] = useState(false);
  const activeLoad = useRef<AbortController | null>(null);
  const latest = useRef(initial);
  const initialized = useRef(false);
  const lock = useRef(false);
  const modalOpen = useRef(false);
  const pending = useRef<PendingSave | null>(null);
  const busyRef = useRef(false);

  const load = useCallback(async ({ background = false }: { background?: boolean } = {}) => {
    if (activeLoad.current || (background && (lock.current || modalOpen.current))) return;
    setLoadError("");
    setSlow(false);
    initialized.current ? setRefreshing(true) : setLoading(true);
    busyRef.current = true;
    const controller = new AbortController();
    activeLoad.current = controller;
    const slowTimer = window.setTimeout(() => setSlow(true), 10000);
    const timeout = window.setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch("/api/crm", { credentials: "same-origin", cache: "no-store", signal: controller.signal });
      const payload = await response.json() as Record<string, any>;
      if (!response.ok) throw new Error(payload.error || "Could not load CRM data.");
      for (const name of names) if (!Array.isArray(payload[name])) payload[name] = [];
      const different = initialized.current && JSON.stringify(latest.current) !== JSON.stringify(payload);
      latest.current = payload as T;
      initialized.current = true;
      setData(payload as T);
      setChanged(different);
      if (different && background) setNotice("Team updates received. You are viewing the latest records.");
      setLastUpdated(new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" }).format(new Date()));
    } catch (error) {
      if (!controller.signal.aborted || activeLoad.current === controller) setLoadError(controller.signal.aborted ? "The server took too long to respond. Please retry." : error instanceof Error ? error.message : "Could not load data.");
    } finally {
      clearTimeout(slowTimer);
      clearTimeout(timeout);
      if (activeLoad.current === controller) activeLoad.current = null;
      busyRef.current = false;
      setSlow(false);
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const refresh = () => { if (document.visibilityState === "visible" && !modalOpen.current && !lock.current && !busyRef.current) void load({ background: true }); };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    const interval = window.setInterval(refresh, 30000);
    return () => { clearInterval(interval); window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); activeLoad.current?.abort(); };
  }, [load]);
  useEffect(() => { if (!changed) return; const timer = window.setTimeout(() => setChanged(false), 1800); return () => clearTimeout(timer); }, [changed]);

  const perform = async (operation: PendingSave) => {
    if (lock.current) return null;
    lock.current = true;
    setSaving(true);
    setSaveError("");
    setNotice(operation.result ? "Retrying file upload…" : "Saving changes…");
    try {
      if (!operation.result) {
        const response = await boundedFetch("/api/crm", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json", "Idempotency-Key": operation.key }, body: JSON.stringify(operation.body) });
        const result = await response.json() as Record<string, any>;
        if (!response.ok) throw new Error(result.error || "Could not save record.");
        operation.result = result;
      }
      if (operation.attachment) {
        const { file, clientId, entityType } = operation.attachment;
        const upload = new FormData();
        upload.set("file", file);
        upload.set("clientId", clientId);
        upload.set("entityId", String(operation.result.id));
        upload.set("entityType", entityType);
        upload.set("uploadKey", operation.key);
        const response = await boundedFetch("/api/upload", { method: "POST", credentials: "same-origin", headers: { "Idempotency-Key": operation.key }, body: upload });
        const result = await response.json() as Record<string, any>;
        if (!response.ok) throw new Error(result.error || "File upload failed. Your saved record is kept; retry attaches only this file.");
      }
      const result = operation.result;
      pending.current = null;
      setNotice(operation.message);
      operation.onComplete?.();
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not save. Please retry.";
      setSaveError(operation.result && operation.attachment ? `Record saved. File upload needs attention: ${message}` : message);
      setNotice("");
      return null;
    } finally {
      lock.current = false;
      setSaving(false);
      if (!pending.current) void load();
    }
  };

  const save = async (body: Record<string, unknown>, message: string, attachment?: Attachment, onComplete?: () => void) => {
    if (lock.current) return null;
    if (attachment && (!new Set(["application/pdf", "image/png", "image/jpeg", "image/webp"]).has(attachment.file.type) || attachment.file.size > 10 * 1024 * 1024)) { setSaveError("Choose a PDF, PNG, JPG or WEBP under 10 MB."); return null; }
    const fingerprint = JSON.stringify(body) + (attachment ? `|${attachment.file.name}|${attachment.file.size}|${attachment.file.lastModified}` : "");
    if (pending.current?.result && pending.current.fingerprint !== fingerprint) {
      setSaveError("A record was saved but its file upload is incomplete. Retry that upload before starting another save.");
      return null;
    }
    if (!pending.current || pending.current.fingerprint !== fingerprint) pending.current = { fingerprint, key: crypto.randomUUID(), body, message, attachment, onComplete };
    return perform(pending.current);
  };
  return { data, loading, refreshing, slow, loadError, notice, setNotice, saving, saveError, lastUpdated, changed, load, save, retrySave: () => pending.current ? perform(pending.current) : Promise.resolve(null), setModalOpen: (open: boolean) => { modalOpen.current = open; } };
}

export function BrandLoader() {
  return <div className="brand-loader" role="status" aria-live="polite"><div className="brand-loader-mark"><span>SecondMedic</span><svg viewBox="0 0 200 44" fill="none" aria-hidden="true"><path d="M0 23h47l9-10 10 21 12-31 13 39 10-19h99"/></svg></div><p>Loading your workspace…</p><div className="skeleton-rows" aria-hidden="true"><i/><i/><i/></div></div>;
}

export function DialogSaveFeedback({ open, error, saving, onRetry }: { open: boolean; error: string; saving: boolean; onRetry: () => void }) {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  useEffect(() => { setTarget(open && error ? document.querySelector<HTMLElement>(".record-modal .form-actions, .side-panel .form-actions") : null); }, [open, error]);
  return target && open && error ? createPortal(<div className="workspace-error dialog-save-feedback" role="alert"><span>{error}</span><button type="button" className="ghost" disabled={saving} onClick={onRetry}>{saving ? "Retrying…" : "Retry save"}</button></div>, target) : null;
}

export class FormBoundary extends Component<{ children: ReactNode; onClose: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <div className="form-error" role="alert"><h3>This form could not open</h3><p>Your records are safe. Close the form and try again.</p><button className="ghost" onClick={this.props.onClose}>Close form</button></div> : this.props.children; }
}

export function useModalFocus(open: boolean, close: () => void) {
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const getDialog = () => document.querySelector<HTMLElement>(".record-modal, .side-panel");
    const timer = window.setTimeout(() => getDialog()?.querySelector<HTMLElement>("input:not([type=hidden]),select,textarea,button")?.focus(), 0);
    const trap = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); closeRef.current(); }
      if (event.key !== "Tab") return;
      const fields = [...(getDialog()?.querySelectorAll<HTMLElement>("a[href],button:not([disabled]),input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled]),[tabindex='0']") || [])].filter(el => el.offsetParent !== null);
      const first = fields[0], last = fields.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", trap);
    return () => { clearTimeout(timer); document.removeEventListener("keydown", trap); previous?.focus(); };
  }, [open]);
}
