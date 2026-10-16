"use client";
import { FormEvent, useEffect, useMemo, useState } from "react";

type Record = { id:number; kind:string; client:string; contact:string; owner:string; amount:number; stage:string; dueDate:string; notes:string; invoiceName:string };
const money = new Intl.NumberFormat("en-IN", { style:"currency", currency:"INR", maximumFractionDigits:0 });
const tabs = ["Overview", "Clients", "Pipeline", "Visits", "Invoices"];

export default function Home() {
  const [records, setRecords] = useState<Record[]>([]); const [tab, setTab] = useState("Overview");
  const [message, setMessage] = useState("");
  const load = async () => { const r = await fetch("/api/records"); const d = await r.json(); if (r.ok) setRecords(d.records); else setMessage("Set up is still running: " + d.error); };
  useEffect(() => { load(); }, []);
  const metrics = useMemo(() => ({ pipeline:records.filter(r=>r.kind==="pipeline").reduce((a,r)=>a+r.amount,0), mtd:records.filter(r=>r.kind==="invoice" && r.stage==="Paid").reduce((a,r)=>a+r.amount,0), outstanding:records.filter(r=>r.kind==="invoice" && r.stage!=="Paid").reduce((a,r)=>a+r.amount,0), visits:records.filter(r=>r.kind==="visit").length }),[records]);
  const shown = tab === "Overview" ? records.slice(0,6) : records.filter(r => r.kind === (tab === "Clients" ? "client" : tab === "Pipeline" ? "pipeline" : tab === "Visits" ? "visit" : "invoice"));
  const submit = async (e:FormEvent<HTMLFormElement>) => { e.preventDefault(); const fd=new FormData(e.currentTarget); const file=fd.get("invoice") as File; const payload=Object.fromEntries(fd.entries()); payload.invoiceName=file?.name || ""; delete payload.invoice; const r=await fetch("/api/records",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)}); const d=await r.json(); if(r.ok){setRecords(x=>[d.record,...x]);e.currentTarget.reset();setMessage("Saved — the team dashboard is updated.");}else setMessage(d.error); };
  return <main className="portal">
    <aside className="sidebar"><div className="logo"><span>↗</span>Team<br/>Pulse</div><div className="nav">{tabs.map(x=><button className={tab===x?"active":""} onClick={()=>setTab(x)} key={x}>{x}</button>)}</div><div className="side-note"><b>October goal</b><strong>₹13,00,000</strong><small>Keep the pipeline moving.</small></div></aside>
    <section className="content"><header><div><p className="eyebrow">TEAM PERFORMANCE</p><h1>{tab === "Overview" ? "Good morning, team." : tab}</h1><p className="sub">A single place for every client, opportunity, visit and payment.</p></div><button className="add" onClick={()=>document.getElementById("entry")?.scrollIntoView({behavior:"smooth"})}>+ Add a record</button></header>
    <div className="metrics"><Metric label="Pipeline value" value={money.format(metrics.pipeline)} accent="purple"/><Metric label="MTD collected" value={money.format(metrics.mtd)} accent="green"/><Metric label="Outstanding" value={money.format(metrics.outstanding)} accent="orange"/><Metric label="Client visits" value={String(metrics.visits)} accent="blue"/></div>
    <section className="work"><div className="panel records"><div className="panel-head"><div><p className="eyebrow">LIVE WORKSPACE</p><h2>{tab === "Overview" ? "Recent activity" : tab + " records"}</h2></div><span>{shown.length} items</span></div><div className="table"><div className="thead"><span>CLIENT / RECORD</span><span>OWNER</span><span>VALUE</span><span>STATUS</span></div>{shown.length ? shown.map(r=><div className="row" key={r.id}><div><b>{r.client}</b><small>{r.kind === "visit" ? `Visit · ${r.dueDate || "Date to confirm"}` : r.contact || r.notes || "New record"}</small></div><span>{r.owner || "—"}</span><span>{r.amount ? money.format(r.amount) : "—"}</span><em className={r.stage.toLowerCase().replaceAll(" ","-")}>{r.stage}</em></div>) : <div className="empty">No records here yet. Add the first one using the form.</div>}</div></div>
      <form className="panel form" id="entry" onSubmit={submit}><p className="eyebrow">NEW ENTRY</p><h2>Add team activity</h2><label>Record type<select name="kind" defaultValue={tab === "Overview" ? "client" : tab === "Clients" ? "client" : tab === "Pipeline" ? "pipeline" : tab === "Visits" ? "visit" : "invoice"}><option value="client">Client profile</option><option value="pipeline">Pipeline opportunity</option><option value="visit">Client visit</option><option value="invoice">Invoice / payment</option></select></label><label>Client / company<input name="client" required placeholder="e.g. Meridian Health"/></label><div className="two"><label>Contact<input name="contact" placeholder="Name or phone"/></label><label>Owner<input name="owner" placeholder="Staff member"/></label></div><div className="two"><label>Value (₹)<input name="amount" type="number" min="0" placeholder="0"/></label><label>Date<select name="dueDate"><option value="">Not set</option><option value="15 Oct 2026">15 Oct 2026</option><option value="20 Oct 2026">20 Oct 2026</option><option value="31 Oct 2026">31 Oct 2026</option></select></label></div><label>Status<select name="stage"><option>New</option><option>In discussion</option><option>Visit fixed</option><option>Invoice sent</option><option>Paid</option><option>Overdue</option></select></label><label>Notes<textarea name="notes" placeholder="Meeting notes, next action or payment details"/></label><label className="upload">Attach invoice <input name="invoice" type="file" accept=".pdf,.png,.jpg,.jpeg"/><small>PDF or image · attachment name is saved with the invoice record</small></label><button className="save">Save record</button>{message&&<p className="message">{message}</p>}</form></section></section></main>;
}
function Metric({label,value,accent}:{label:string;value:string;accent:string}){return <article className={'metric '+accent}><span>{label === "Client visits" ? "◉" : label === "Outstanding" ? "₹" : label === "MTD collected" ? "↗" : "◌"}</span><div><small>{label}</small><strong>{value}</strong></div></article>}
      <header
        aria-hidden="true"
        className="grid h-[76px] grid-cols-[1fr_auto_1fr] items-center border-b border-stone-200 bg-white/95 px-6 sm:px-14"
      >
        <div className="flex items-center gap-3">
          <span className="h-9 w-9 rounded-full bg-stone-100" />
          <span className="h-3.5 w-28 rounded-full bg-stone-100" />
        </div>
        <span className="hidden h-9 w-[min(30vw,420px)] rounded-xl bg-stone-100 sm:block" />
        <div className="flex items-center justify-end gap-3">
          <span className="hidden h-9 w-9 rounded-full bg-stone-100 sm:block" />
          <span className="h-9 w-24 rounded-xl bg-stone-100" />
        </div>
      </header>

      <div
        aria-hidden="true"
        className="grid h-[calc(100%-76px)] grid-cols-[180px_minmax(0,1fr)_260px] gap-10 px-6 pb-24 pt-10 opacity-55 max-lg:grid-cols-[150px_minmax(0,1fr)] max-sm:grid-cols-1 sm:px-14"
      >
        <aside className="hidden border-r border-stone-200 pr-7 sm:block">
          <div className="mb-6 h-2.5 w-16 rounded-full bg-stone-200" />
          <div className="space-y-4">
            {sidebarWidths.map((width) => (
              <div key={width} className="flex items-center gap-3">
                <span className="h-4 w-4 rounded bg-stone-200" />
                <span
                  className="h-2.5 rounded-full bg-stone-200"
                  style={{ width: `${width}%` }}
                />
              </div>
            ))}
          </div>
          <div className="mb-6 mt-9 h-2.5 w-24 rounded-full bg-stone-200" />
          <div className="space-y-4">
            {sidebarWidths.slice(0, 3).map((width) => (
              <span
                key={width}
                className="block h-2.5 rounded-full bg-stone-200"
                style={{ width: `${width}%` }}
              />
            ))}
          </div>
        </aside>

        <article className="mx-auto flex w-full max-w-3xl flex-col gap-6">
          <div className="space-y-3">
            <div className="h-2.5 w-28 rounded-full bg-stone-200" />
            <div className="h-7 w-4/5 rounded-lg bg-stone-200" />
            <div className="h-7 w-3/5 rounded-lg bg-stone-200" />
          </div>
          <div className="min-h-[240px] flex-1 rounded-2xl bg-stone-200" />
          <div className="flex items-center gap-3">
            <span className="h-9 w-9 rounded-full bg-stone-200" />
            <span className="h-2.5 w-28 rounded-full bg-stone-200" />
          </div>
          <div className="space-y-2">
            {articleWidths.map((width) => (
              <span
                key={width}
                className="block h-2.5 rounded-full bg-stone-200"
                style={{ width: `${width}%` }}
              />
            ))}
          </div>
        </article>

        <aside className="space-y-5 max-lg:hidden">
          {[0, 1].map((card) => (
            <div
              key={card}
              className="space-y-4 rounded-2xl border border-stone-200 bg-white/70 p-6"
            >
              <span className="block h-10 w-10 rounded-full bg-stone-200" />
              <span className="block h-3 w-3/5 rounded-full bg-stone-200" />
              <span className="block h-2.5 w-full rounded-full bg-stone-200" />
              <span className="block h-2.5 w-4/5 rounded-full bg-stone-200" />
              <span className="block h-8 w-24 rounded-lg bg-stone-200" />
            </div>
          ))}
        </aside>
      </div>

      <output
        aria-live="polite"
        aria-atomic="true"
        className="absolute left-1/2 top-[clamp(96px,13vh,122px)] w-[min(620px,calc(100%-40px))] -translate-x-1/2 rounded-[18px] border border-stone-200 bg-white/95 px-5 py-5 shadow-[0_18px_50px_rgb(24_24_27/9%)] backdrop-blur-sm"
      >
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.09em] text-stone-500">
          Building your site
        </p>
        <h1 className="text-xl font-semibold tracking-tight">
          Your site is taking shape
        </h1>
        <p className="mt-1 text-sm text-stone-500">
          Your first version will appear here automatically when it’s ready.
        </p>
      </output>
    </main>
  );
}
