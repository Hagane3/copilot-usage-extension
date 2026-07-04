import * as vscode from 'vscode';
import { UsageEvent } from './usageParser';

export interface ChartData {
  allEvents: UsageEvent[];
  currentYear: number;
  currentMonth: number;
  logFileCount: number;
  monthlyBudgetAiu: number;
}

function generateNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length: 32 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function safeJsonEmbed(obj: unknown): string {
  return JSON.stringify(obj).replace(/<\//g, '<\\/');
}

function buildHtml(data: ChartData, nonce: string): string {
  const payload = safeJsonEmbed({
    currentYear: data.currentYear,
    currentMonth: data.currentMonth,
    logFileCount: data.logFileCount,
    monthlyBudgetAiu: data.monthlyBudgetAiu,
    events: data.allEvents.map((e) => ({
      ts: e.ts,
      nanoAiu: e.nanoAiu,
      model: e.model,
      sid: e.sid ?? null,
      isAgent: e.isAgent ?? false,
      dur: e.dur ?? null,
    })),
  });

  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <title>Copilot Usage</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body {
      font-family: var(--vscode-font-family, sans-serif);
      font-size: var(--vscode-font-size, 13px);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      margin: 0; padding: 20px 24px 40px;
    }
    /* ── nav ── */
    .nav { display:flex; align-items:center; gap:10px; margin-bottom:18px; }
    .nav h2 { margin:0; font-size:1.1em; font-weight:600; flex:1; }
    .nav button {
      background: var(--vscode-button-secondaryBackground,transparent);
      color: var(--vscode-button-secondaryForeground,var(--vscode-foreground));
      border: 1px solid var(--vscode-widget-border,#555);
      border-radius:4px; padding:3px 10px; cursor:pointer; font-size:1.1em; line-height:1.4;
    }
    .nav button:disabled { opacity:.35; cursor:default; }
    .nav button:not(:disabled):hover { background:var(--vscode-button-secondaryHoverBackground,rgba(255,255,255,.07)); }

    /* ── summary ── */
    .summary { display:flex; gap:28px; flex-wrap:wrap; margin-bottom:6px; }
    .stat-value { font-size:1.85em; font-weight:700; line-height:1; }
    .stat-label { font-size:.78em; opacity:.55; margin-top:3px; }
    .stat-delta { font-size:.75em; margin-top:4px; }
    .delta-up   { color:var(--vscode-charts-red,#f14c4c); }
    .delta-down { color:var(--vscode-charts-green,#89d185); }
    .delta-neu  { opacity:.5; }

    /* ── budget bar ── */
    .budget-row { display:flex; align-items:center; gap:10px; margin:10px 0 18px; flex-wrap:wrap; }
    .budget-track {
      flex:1; min-width:120px; max-width:360px; height:8px;
      background:var(--vscode-widget-border,#444); border-radius:4px; overflow:hidden;
    }
    .budget-fill { height:100%; border-radius:4px; transition:width .3s; }
    .budget-fill.ok     { background:var(--vscode-charts-blue,#0078d4); }
    .budget-fill.warn   { background:var(--vscode-charts-yellow,#cca700); }
    .budget-fill.over   { background:var(--vscode-charts-red,#f14c4c); }
    .budget-label { font-size:.8em; opacity:.7; white-space:nowrap; }
    .budget-input-wrap { display:flex; align-items:center; gap:5px; font-size:.8em; opacity:.65; }
    .budget-input-wrap input {
      width:72px; background:var(--vscode-input-background,#3c3c3c);
      color:var(--vscode-input-foreground,#ccc);
      border:1px solid var(--vscode-widget-border,#555); border-radius:3px;
      padding:2px 5px; font-size:inherit; font-family:inherit;
    }

    /* ── section headers ── */
    .section-title {
      font-size:.78em; font-weight:600; text-transform:uppercase;
      letter-spacing:.06em; opacity:.5; margin:22px 0 8px;
    }

    /* ── SVG daily chart ── */
    #daily-svg { width:100%; overflow:visible; display:block; }
    .day-bar  { cursor:pointer; opacity:.75; transition:opacity .1s; }
    .day-bar:hover  { opacity:1; }
    .day-bar.today  { fill:var(--vscode-charts-orange,#f38518); }
    .day-bar.normal { fill:var(--vscode-charts-blue,#0078d4); }
    .day-bar.selected { opacity:1; stroke:var(--vscode-focusBorder,#007fd4); stroke-width:1.5; }
    .trend-line { fill:none; stroke:var(--vscode-charts-yellow,#cca700); stroke-width:1.5; opacity:.8; stroke-dasharray:none; }
    .axis-label { font-size:9px; fill:currentColor; opacity:.4; }

    /* ── table-header ── */
    .table-header { display:flex; align-items:baseline; gap:10px; margin:22px 0 8px; }
    .table-header .section-title { margin:0; flex:1; }
    #clear-btn {
      font-size:.8em; background:none;
      border:1px solid var(--vscode-widget-border,#555);
      border-radius:4px; color:var(--vscode-foreground);
      padding:2px 8px; cursor:pointer; opacity:.7;
    }
    #clear-btn:hover { opacity:1; }

    /* ── tables ── */
    table { width:100%; border-collapse:collapse; font-size:.9em; }
    th {
      text-align:left; padding:5px 8px;
      border-bottom:1px solid var(--vscode-widget-border,#454545);
      font-weight:600; opacity:.6; white-space:nowrap;
    }
    td { padding:5px 8px; border-bottom:1px solid color-mix(in srgb,var(--vscode-widget-border,#454545) 30%,transparent); white-space:nowrap; }
    .mini-bar { height:5px; background:var(--vscode-charts-blue,#0078d4); border-radius:3px; min-width:2px; }

    /* ── yearly calendar ── */
    .mo-bar rect { transition:opacity .1s; }
    .mo-bar:hover rect:first-child { opacity:1 !important; }

    /* ── hour heatmap ── */
    .heatmap-wrap { overflow-x:auto; }
    .heatmap-svg { display:block; }
    .hm-cell { rx:1; }

    /* ── footer ── */
    .footer { margin-top:24px; font-size:.72em; opacity:.38; line-height:1.5; }
  </style>
</head>
<body>

<div class="nav">
  <button id="prev">&#8249;</button>
  <h2 id="month-label"></h2>
  <button id="next">&#8250;</button>
</div>

<div class="summary" id="summary"></div>

<div class="budget-row" id="budget-row"></div>

<div class="section-title">Daily usage</div>
<svg id="daily-svg"></svg>

<div style="display:flex;align-items:center;gap:8px;margin:22px 0 8px">
  <div class="section-title" style="margin:0;flex:1">Yearly activity</div>
  <button id="cal-prev" style="background:none;border:1px solid var(--vscode-widget-border,#555);border-radius:3px;color:var(--vscode-foreground);padding:1px 8px;cursor:pointer;font-size:.9em;opacity:.7">&#8249;</button>
  <span id="year-label" style="font-size:.85em;opacity:.65;min-width:34px;text-align:center"></span>
  <button id="cal-next" style="background:none;border:1px solid var(--vscode-widget-border,#555);border-radius:3px;color:var(--vscode-foreground);padding:1px 8px;cursor:pointer;font-size:.9em;opacity:.7">&#8250;</button>
</div>
<svg id="cal-svg" style="width:100%;display:block;overflow:visible"></svg>

<div class="section-title">Hour-of-day heatmap</div>
<div class="heatmap-wrap"><svg id="hm-svg" class="heatmap-svg"></svg></div>

<div class="table-header">
  <div class="section-title" id="table-label">By model — full month</div>
  <button id="clear-btn" style="display:none">Show all &times;</button>
</div>
<table>
  <thead><tr>
    <th>Model</th><th>AIU</th><th>Cost</th><th>Share</th><th>Req</th><th>AIU/req</th><th>Avg resp</th><th style="width:80px"></th>
  </tr></thead>
  <tbody id="model-tbody"></tbody>
</table>

<div class="section-title" style="margin-top:22px">Model efficiency &amp; recommendation</div>
<div id="recommendation"></div>

<div class="section-title" style="margin-top:18px">Agent vs direct</div>
<div id="agent-bar-wrap"></div>

<div class="section-title">Top expensive sessions — <span id="sessions-month-label"></span></div>
<table>
  <thead><tr>
    <th>#</th><th>Date &amp; time</th><th>Dominant model</th><th>AIU</th><th>Cost</th><th>Requests</th>
  </tr></thead>
  <tbody id="sessions-tbody"></tbody>
</table>

<div class="footer" id="footer"></div>

<script nonce="${nonce}">
'use strict';
const DATA = ${payload};
const MONTH_NAMES = ['January','February','March','April','May','June',
                     'July','August','September','October','November','December'];
const DOW_SHORT = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

let currentYear  = DATA.currentYear;
let currentMonth = DATA.currentMonth;
let calYear      = DATA.currentYear;   // year shown in the yearly overview
let selectedDay  = null;
let budget       = DATA.monthlyBudgetAiu;
let availableMonths = [];

// Acquire VS Code API once — calling it multiple times throws in newer versions
const vscodeApi = (typeof acquireVsCodeApi === 'function') ? acquireVsCodeApi() : null;

// ── helpers ──────────────────────────────────────────────────────────────────
function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
                  .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function fmtDate(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString(undefined,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
}
function fmtDur(ms) {
  if(ms>=60000) return (ms/60000).toFixed(1)+'m';
  if(ms>=1000)  return (ms/1000).toFixed(1)+'s';
  return ms+'ms';
}
function daysInMonth(y,m){ return new Date(y,m,0).getDate(); }

function eventsForMonth(y,m) {
  return DATA.events.filter(e=>{ const d=new Date(e.ts); return d.getFullYear()===y && d.getMonth()+1===m; });
}
function eventsForDay(y,m,day) {
  return eventsForMonth(y,m).filter(e=>new Date(e.ts).getDate()===day);
}
function totalAiu(evts){ return evts.reduce((s,e)=>s+e.nanoAiu/1e9,0); }

function aggregateByModel(evts) {
  const map=new Map(); let tot=0;
  for(const e of evts){
    const aiu=e.nanoAiu/1e9; tot+=aiu;
    const p=map.get(e.model)||{aiu:0,count:0,durSum:0,durCount:0};
    p.aiu+=aiu; p.count++;
    if(e.dur){ p.durSum+=e.dur; p.durCount++; }
    map.set(e.model,p);
  }
  return { models:[...map.entries()].sort((a,b)=>b[1].aiu-a[1].aiu), total:tot };
}

function aggregateByDay(y,m) {
  const n=daysInMonth(y,m);
  const days=Array.from({length:n},(_,i)=>({day:i+1,aiu:0,count:0}));
  for(const e of eventsForMonth(y,m)){
    const d=new Date(e.ts).getDate()-1;
    days[d].aiu+=e.nanoAiu/1e9; days[d].count++;
  }
  return days;
}

function trendLine(days, window=7) {
  return days.map((_,i)=>{
    const half=Math.floor(window/2);
    const s=Math.max(0,i-half), en=Math.min(days.length-1,i+half);
    const slice=days.slice(s,en+1);
    return slice.reduce((a,d)=>a+d.aiu,0)/slice.length;
  });
}

function prevMonthOf(y,m){ return m===1?{year:y-1,month:12}:{year:y,month:m-1}; }

function monthDelta() {
  const cur=totalAiu(eventsForMonth(currentYear,currentMonth));
  const prev=prevMonthOf(currentYear,currentMonth);
  const pre=totalAiu(eventsForMonth(prev.year,prev.month));
  if(pre===0) return null;
  return Math.round(((cur-pre)/pre)*100);
}

// ── RENDER ───────────────────────────────────────────────────────────────────
function render() {
  const idx=availableMonths.findIndex(m=>m.year===currentYear&&m.month===currentMonth);
  document.getElementById('prev').disabled = idx<=0;
  document.getElementById('next').disabled = idx>=availableMonths.length-1;
  document.getElementById('month-label').textContent = MONTH_NAMES[currentMonth-1]+' '+currentYear;
  document.getElementById('year-label').textContent = String(calYear);
  document.getElementById('sessions-month-label').textContent = MONTH_NAMES[currentMonth-1]+' '+currentYear;

  renderSummary();
  renderBudget();
  renderDailyChart(aggregateByDay(currentYear,currentMonth));
  renderYearlyCalendar(calYear);
  renderHourHeatmap(currentYear,currentMonth);
  renderTable(selectedDay);
  renderModelRecommendation();
  renderAgentBar();
  renderTopSessions(currentYear,currentMonth);

  document.getElementById('footer').innerHTML =
    'Events persisted in extension globalStorage — data is not lost when VS Code cleans up workspace logs. '+
    'Sessions before first install may be missing. Scanned '+DATA.logFileCount+' log file(s) this refresh.<br>'+
    '1 AIU = $0.01 &nbsp;·&nbsp; orange = today &nbsp;·&nbsp; yellow line = 7-day trend';
}

function renderSummary() {
  const evts=eventsForMonth(currentYear,currentMonth);
  const aiu=totalAiu(evts);
  const delta=monthDelta();
  const direct=evts.filter(e=>!e.isAgent).length;
  const agent=evts.filter(e=>e.isAgent).length;
  const withDur=evts.filter(e=>e.dur);
  const avgDur=withDur.length?Math.round(withDur.reduce((s,e)=>s+e.dur,0)/withDur.length):null;

  let deltaHtml='';
  if(delta!==null){
    const sign=delta>0?'+':''; const cls=delta>0?'delta-up':delta<0?'delta-down':'delta-neu';
    deltaHtml='<div class="stat-delta '+cls+'">'+sign+delta+'% vs prev month</div>';
  }

  const agentHtml=agent>0
    ? '<div class="stat-delta" style="opacity:.55">'+direct+' direct · '+agent+' agent</div>'
    : '';

  const durHtml=avgDur!==null
    ? '<div><div class="stat-value">'+fmtDur(avgDur)+'</div><div class="stat-label">avg response</div></div>'
    : '';

  document.getElementById('summary').innerHTML=
    '<div><div class="stat-value">'+Math.round(aiu)+'</div><div class="stat-label">AIU used</div>'+deltaHtml+'</div>'+
    '<div><div class="stat-value">$'+(aiu*0.01).toFixed(2)+'</div><div class="stat-label">est. cost</div></div>'+
    '<div><div class="stat-value">'+evts.length+'</div><div class="stat-label">requests</div>'+agentHtml+'</div>'+
    durHtml;
}

/** Updates only the progress bar + label — never touches the input element. */
function updateBudgetBar() {
  const evts = eventsForMonth(currentYear, currentMonth);
  const aiu  = totalAiu(evts);
  const bar  = document.getElementById('budget-bar-inner');
  const lbl  = document.getElementById('budget-bar-label');
  if (!bar || !lbl) return;
  if (budget > 0) {
    const pct = Math.min(100, Math.round((aiu / budget) * 100));
    const cls = pct >= 100 ? 'over' : pct >= 80 ? 'warn' : 'ok';
    bar.className = 'budget-fill ' + cls;
    bar.style.width = pct + '%';
    lbl.textContent = Math.round(aiu) + ' / ' + Math.round(budget) + ' AIU (' + pct + '%)';
    bar.parentElement.style.display = '';
    lbl.style.display = '';
  } else {
    bar.parentElement.style.display = 'none';
    lbl.style.display = 'none';
  }
}

function renderBudget() {
  // Only rebuild DOM on first call (elements don't exist yet)
  if (!document.getElementById('budget-bar-inner')) {
    const row = document.getElementById('budget-row');
    row.innerHTML =
      '<div class="budget-track" style="display:none"><div id="budget-bar-inner" class="budget-fill ok" style="width:0%"></div></div>' +
      '<span id="budget-bar-label" class="budget-label" style="display:none"></span>' +
      '<div class="budget-input-wrap">Budget:&nbsp;' +
        '<input id="budget-input" type="number" min="0" step="100" value="' + (budget || '') + '" placeholder="0 = off">' +
      '&nbsp;AIU/mo</div>';

    const input = document.getElementById('budget-input');

    // Live bar update on every keystroke
    input.addEventListener('input', e => {
      budget = parseFloat(e.target.value) || 0;
      updateBudgetBar();
    });

    // Persist to VS Code config only on commit (blur / Enter)
    input.addEventListener('change', e => {
      const v = parseFloat(e.target.value) || 0;
      budget = v;
      if (vscodeApi) vscodeApi.postMessage({ command: 'setBudget', value: v });
      updateBudgetBar();
    });
  }

  updateBudgetBar();
}

// ── DAILY CHART (SVG) ─────────────────────────────────────────────────────────
function renderDailyChart(days) {
  const today=new Date();
  const todayDay=(today.getFullYear()===currentYear&&today.getMonth()+1===currentMonth)?today.getDate():-1;
  const maxAiu=Math.max(...days.map(d=>d.aiu),0.001);
  const W=600, H=120, PAD_B=16, BAR_AREA=H-PAD_B;
  const bw=Math.max(2,(W-2)/days.length-1);
  const step=W/days.length;
  const trend=trendLine(days);
  const svg=document.getElementById('daily-svg');

  // bars
  const bars=days.map((d,i)=>{
    const bh=Math.max(1,(d.aiu/maxAiu)*BAR_AREA);
    const x=i*step+(step-bw)/2, y=BAR_AREA-bh;
    const isToday=d.day===todayDay, isSel=d.day===selectedDay;
    let cls='day-bar '+(isToday?'today':'normal')+(isSel?' selected':'');
    const tip='Day '+d.day+': '+d.aiu.toFixed(2)+' AIU, '+d.count+' req';
    let lbl='';
    if(d.day%5===0||d.day===1||isToday)
      lbl='<text class="axis-label" x="'+(x+bw/2)+'" y="'+(H-2)+'" text-anchor="middle">'+d.day+'</text>';
    return '<rect class="'+cls+'" data-day="'+d.day+'" x="'+x+'" y="'+y+'" width="'+bw+'" height="'+bh+'" rx="1"><title>'+esc(tip)+'</title></rect>'+lbl;
  }).join('');

  // trend polyline
  const pts=trend.map((v,i)=>{
    const x=i*step+step/2, y=BAR_AREA-(v/maxAiu)*BAR_AREA;
    return x+','+y;
  }).join(' ');
  const trendEl='<polyline class="trend-line" points="'+pts+'"/>';

  svg.setAttribute('viewBox','0 0 '+W+' '+H);
  svg.innerHTML=bars+trendEl;

  svg.querySelectorAll('.day-bar').forEach(el=>{
    el.addEventListener('click',()=>{
      const day=parseInt(el.dataset.day,10);
      selectedDay=selectedDay===day?null:day;
      renderDailyChart(days);
      renderTable(selectedDay);
    });
  });
}

// ── YEARLY OVERVIEW (monthly bar chart) ──────────────────────────────────────
function renderYearlyCalendar(year) {
  // Aggregate total AIU per month for the given year
  const months = Array.from({length:12}, (_,i) => ({
    month: i+1,
    aiu: totalAiu(eventsForMonth(year, i+1)),
    req: eventsForMonth(year, i+1).length,
  }));

  const maxAiu = Math.max(...months.map(m=>m.aiu), 0.001);
  const W=600, H=140, PAD_B=32, BAR_AREA=H-PAD_B;
  const step=W/12, bw=Math.max(4, step*0.6);
  const today = new Date();

  const bars = months.map((m,i) => {
    const bh = Math.max(m.aiu>0?2:0, (m.aiu/maxAiu)*BAR_AREA);
    const x = i*step + (step-bw)/2;
    const y = BAR_AREA - bh;
    const isCurrent = year===currentYear && m.month===currentMonth;
    const isCalYear = year===today.getFullYear() && m.month===today.getMonth()+1;
    const fill = isCalYear
      ? 'var(--vscode-charts-orange,#f38518)'
      : isCurrent
        ? 'var(--vscode-charts-blue,#0078d4)'
        : 'var(--vscode-charts-blue,#0078d4)';
    const opacity = isCurrent ? '1' : m.aiu>0 ? '0.65' : '0.15';
    const lbl = MONTH_NAMES[i].slice(0,3);
    const tip = MONTH_NAMES[i]+' '+year+': '+m.aiu.toFixed(1)+' AIU, '+m.req+' req';
    // AIU label above bar (only if visible)
    const valLabel = m.aiu>0
      ? '<text x="'+(x+bw/2)+'" y="'+(y-4)+'" text-anchor="middle" font-size="9" fill="currentColor" opacity=".6">'+Math.round(m.aiu)+'</text>'
      : '';
    // selected indicator ring
    const ring = isCurrent
      ? '<rect x="'+x+'" y="'+y+'" width="'+bw+'" height="'+bh+'" rx="2" fill="none" stroke="var(--vscode-focusBorder,#007fd4)" stroke-width="1.5" pointer-events="none"/>'
      : '';
    return (
      '<g class="mo-bar" data-month="'+m.month+'" style="cursor:pointer">'+
        '<rect x="'+x+'" y="'+y+'" width="'+bw+'" height="'+bh+
          '" rx="2" fill="'+fill+'" opacity="'+opacity+'">'+
          '<title>'+esc(tip)+'</title></rect>'+
        ring+valLabel+
        '<text x="'+(x+bw/2)+'" y="'+(H-PAD_B+14)+'" text-anchor="middle" font-size="9" fill="currentColor" opacity="'+(isCurrent?'1':'.5')+'">'+lbl+'</text>'+
        '<text x="'+(x+bw/2)+'" y="'+(H-PAD_B+26)+'" text-anchor="middle" font-size="8" fill="currentColor" opacity=".35">'+year+'</text>'+
      '</g>'
    );
  }).join('');

  // Baseline
  const baseline = '<line x1="0" y1="'+BAR_AREA+'" x2="'+W+'" y2="'+BAR_AREA+'" stroke="currentColor" opacity=".12" stroke-width="1"/>';

  const svg = document.getElementById('cal-svg');
  svg.setAttribute('viewBox','0 0 '+W+' '+H);
  svg.style.width = '100%';
  svg.style.height = H+'px';
  svg.innerHTML = baseline + bars;

  svg.querySelectorAll('.mo-bar').forEach(el=>{
    el.addEventListener('click',()=>{
      const m = parseInt(el.dataset.month,10);
      currentYear = calYear;
      currentMonth = m;
      selectedDay = null;
      render();
    });
  });
}

// Helper: prev/next year for the yearly overview
function setupYearNav() {
  const prevY = document.getElementById('cal-prev');
  const nextY = document.getElementById('cal-next');
  if (!prevY || !nextY) return;
  prevY.onclick = () => { calYear--; document.getElementById('year-label').textContent=calYear; renderYearlyCalendar(calYear); };
  nextY.onclick = () => { calYear++; document.getElementById('year-label').textContent=calYear; renderYearlyCalendar(calYear); };
}

// ── HOUR HEATMAP ─────────────────────────────────────────────────────────────
function renderHourHeatmap(y,m) {
  const evts=eventsForMonth(y,m);
  const grid=Array.from({length:7},()=>new Array(24).fill(0));
  for(const e of evts){
    const d=new Date(e.ts);
    const dow=(d.getDay()+6)%7; // 0=Mon
    grid[dow][d.getHours()]+=e.nanoAiu/1e9;
  }
  const maxVal=Math.max(...grid.flat(),0.001);
  const CS=14, GS=2, OX=28, OY=18;
  const W=OX+24*(CS+GS)+4, H=OY+7*(CS+GS)+4;

  let cells='', hLabels='', dLabels='';
  for(let h=0;h<24;h++){
    hLabels+='<text x="'+(OX+h*(CS+GS)+CS/2)+'" y="'+(OY-3)+'" font-size="8" fill="currentColor" opacity=".4" text-anchor="middle">'+h+'</text>';
  }
  for(let d=0;d<7;d++){
    dLabels+='<text x="'+(OX-3)+'" y="'+(OY+d*(CS+GS)+CS*0.8)+'" font-size="8" fill="currentColor" opacity=".4" text-anchor="end">'+DOW_SHORT[d]+'</text>';
    for(let h=0;h<24;h++){
      const v=grid[d][h];
      const alpha=v===0?0.04:0.1+0.85*(Math.log1p(v)/Math.log1p(maxVal));
      const x=OX+h*(CS+GS), ys=OY+d*(CS+GS);
      cells+='<rect class="hm-cell" x="'+x+'" y="'+ys+'" width="'+CS+'" height="'+CS+
        '" fill="var(--vscode-charts-blue,#0078d4)" fill-opacity="'+alpha.toFixed(2)+'">'+
        '<title>'+DOW_SHORT[d]+' '+h+':00 — '+v.toFixed(2)+' AIU</title></rect>';
    }
  }
  const svg=document.getElementById('hm-svg');
  svg.setAttribute('viewBox','0 0 '+W+' '+H);
  svg.style.width=W+'px'; svg.style.height=H+'px';
  svg.innerHTML=hLabels+dLabels+cells;
}

// ── MODEL TABLE ───────────────────────────────────────────────────────────────
function renderTable(filterDay) {
  const evts=filterDay?eventsForDay(currentYear,currentMonth,filterDay):eventsForMonth(currentYear,currentMonth);
  const {models,total}=aggregateByModel(evts);
  document.getElementById('table-label').textContent=
    filterDay?'By model — day '+filterDay:'By model — full month';
  document.getElementById('clear-btn').style.display=filterDay?'':'none';

  const tbody=document.getElementById('model-tbody');
  if(!models.length){
    tbody.innerHTML='<tr><td colspan="7" style="opacity:.5;text-align:center;padding:12px">No data</td></tr>';
    return;
  }
  tbody.innerHTML=models.map(([model,d])=>{
    const pct=total>0?Math.round((d.aiu/total)*100):0;
    const avgReq=d.count>0?(d.aiu/d.count).toFixed(2):'-';
    const avgDur=d.durCount>0?fmtDur(Math.round(d.durSum/d.durCount)):'-';
    return '<tr>'+
      '<td>'+esc(model)+'</td>'+
      '<td>'+Math.round(d.aiu)+' AIU</td>'+
      '<td>$'+(d.aiu*0.01).toFixed(2)+'</td>'+
      '<td>'+pct+'%</td>'+
      '<td>'+d.count+'</td>'+
      '<td>'+avgReq+'</td>'+
      '<td>'+avgDur+'</td>'+
      '<td><div class="mini-bar" style="width:'+pct+'%"></div></td>'+
      '</tr>';
  }).join('');
}

// ── MODEL RECOMMENDATION ──────────────────────────────────────────────────────
function renderModelRecommendation() {
  const wrap = document.getElementById('recommendation');
  // Use last 30 days for a broader signal
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const evts = DATA.events.filter(e => e.ts >= cutoff);
  const {models} = aggregateByModel(evts);

  // Only consider models with >= 3 requests
  const ranked = models
    .filter(([, d]) => d.count >= 3)
    .map(([model, d]) => ({ model, aiu: d.aiu, count: d.count, avgPerReq: d.aiu / d.count }))
    .sort((a, b) => b.avgPerReq - a.avgPerReq);

  if (ranked.length < 2) {
    wrap.innerHTML = '<div style="opacity:.4;font-size:.85em">Need at least 2 models with ≥3 requests for comparison.</div>';
    return;
  }

  const expensive = ranked[0];
  const cheapest  = ranked[ranked.length - 1];
  const ratio     = expensive.avgPerReq / cheapest.avgPerReq;

  // Efficiency table
  const tableRows = ranked.map((m, i) => {
    const relCost = (m.avgPerReq / cheapest.avgPerReq).toFixed(1);
    const badge = i === 0
      ? '<span style="font-size:.75em;background:var(--vscode-charts-red,#f14c4c);opacity:.75;border-radius:3px;padding:1px 5px;margin-left:6px;color:#fff">most expensive</span>'
      : i === ranked.length - 1
        ? '<span style="font-size:.75em;background:var(--vscode-charts-green,#89d185);opacity:.85;border-radius:3px;padding:1px 5px;margin-left:6px;color:#000">cheapest</span>'
        : '';
    return '<tr>'+
      '<td>'+esc(m.model)+badge+'</td>'+
      '<td style="text-align:right">'+m.avgPerReq.toFixed(2)+' AIU</td>'+
      '<td style="text-align:right">'+relCost+'×</td>'+
      '<td style="text-align:right">'+m.count+'</td>'+
      '</tr>';
  }).join('');

  const table =
    '<table style="margin-bottom:10px">'+
    '<thead><tr>'+
      '<th>Model</th>'+
      '<th style="text-align:right">AIU/req</th>'+
      '<th style="text-align:right">vs cheapest</th>'+
      '<th style="text-align:right">Req (30d)</th>'+
    '</tr></thead>'+
    '<tbody>'+tableRows+'</tbody>'+
    '</table>';

  // Recommendation callout (only when difference is meaningful)
  let callout = '';
  if (ratio >= 2) {
    const switchable = Math.floor(expensive.count * 0.5);
    const saving     = Math.round(switchable * (expensive.avgPerReq - cheapest.avgPerReq));
    callout =
      '<div style="border-left:3px solid var(--vscode-charts-yellow,#cca700);padding:8px 12px;border-radius:0 4px 4px 0;'+
          'background:color-mix(in srgb,var(--vscode-charts-yellow,#cca700) 8%,transparent);margin-bottom:6px;font-size:.88em">'+
        '💡 <b>'+esc(expensive.model)+'</b> costs <b>'+ratio.toFixed(1)+'×</b> more per request than '+
        '<b>'+esc(cheapest.model)+'</b> ('+expensive.avgPerReq.toFixed(2)+' vs '+cheapest.avgPerReq.toFixed(2)+' AIU/req). '+
        'Replacing half those requests with '+esc(cheapest.model)+' could save roughly '+
        '<b>~'+saving+' AIU</b> over the next 30 days ($'+(saving*0.01).toFixed(2)+').'+
      '</div>';
  }

  wrap.innerHTML = callout + table;
}

// ── AGENT vs DIRECT ───────────────────────────────────────────────────────────
function renderAgentBar() {
  const evts = eventsForMonth(currentYear, currentMonth);
  const wrap = document.getElementById('agent-bar-wrap');
  if (!evts.length) { wrap.innerHTML = '<div style="opacity:.4;font-size:.85em">No data</div>'; return; }

  const directEvts = evts.filter(e=>!e.isAgent);
  const agentEvts  = evts.filter(e=>e.isAgent);
  const directAiu  = totalAiu(directEvts);
  const agentAiu   = totalAiu(agentEvts);
  const totalA     = directAiu + agentAiu;

  if(!agentEvts.length){
    wrap.innerHTML='<div style="opacity:.45;font-size:.85em">No agent-mode requests detected this month.</div>';
    return;
  }

  const dPct = totalA>0?Math.round(directAiu/totalA*100):0;
  const aPct = 100-dPct;

  // Avg durations
  const dDurs = directEvts.filter(e=>e.dur); const aDurs = agentEvts.filter(e=>e.dur);
  const dAvg  = dDurs.length ? fmtDur(Math.round(dDurs.reduce((s,e)=>s+e.dur,0)/dDurs.length)) : '—';
  const aAvg  = aDurs.length ? fmtDur(Math.round(aDurs.reduce((s,e)=>s+e.dur,0)/aDurs.length)) : '—';

  wrap.innerHTML=
    '<div style="display:flex;gap:0;border-radius:4px;overflow:hidden;height:20px;margin-bottom:8px">'+
      '<div style="width:'+dPct+'%;background:var(--vscode-charts-blue,#0078d4);opacity:.75"></div>'+
      '<div style="width:'+aPct+'%;background:var(--vscode-charts-purple,#b180d7);opacity:.75"></div>'+
    '</div>'+
    '<div style="display:flex;gap:24px;font-size:.82em">'+
      '<div><span style="display:inline-block;width:10px;height:10px;background:var(--vscode-charts-blue,#0078d4);border-radius:2px;margin-right:5px;opacity:.75"></span>'+
        '<b>Direct</b>&nbsp; '+directEvts.length+' req · '+Math.round(directAiu)+' AIU · avg '+dAvg+'</div>'+
      '<div><span style="display:inline-block;width:10px;height:10px;background:var(--vscode-charts-purple,#b180d7);border-radius:2px;margin-right:5px;opacity:.75"></span>'+
        '<b>Agent</b>&nbsp; '+agentEvts.length+' req · '+Math.round(agentAiu)+' AIU · avg '+aAvg+'</div>'+
    '</div>';
}

// ── TOP SESSIONS ──────────────────────────────────────────────────────────────
function renderTopSessions(y,m) {
  const evts=eventsForMonth(y,m);
  const sessions=new Map();
  for(const e of evts){
    // Use sid when available, fall back to grouping by 5-minute window
    const key=e.sid??(Math.floor(e.ts/300000)+'_'+e.model);
    const p=sessions.get(key)??{firstTs:e.ts,totalAiu:0,count:0,models:{}};
    p.totalAiu+=e.nanoAiu/1e9;
    p.count++;
    p.models[e.model]=(p.models[e.model]||0)+1;
    if(e.ts<p.firstTs) p.firstTs=e.ts;
    sessions.set(key,p);
  }
  const top=[...sessions.values()]
    .sort((a,b)=>b.totalAiu-a.totalAiu)
    .slice(0,10);

  const tbody=document.getElementById('sessions-tbody');
  if(!top.length){
    tbody.innerHTML='<tr><td colspan="6" style="opacity:.5;text-align:center;padding:12px">No data</td></tr>';
    return;
  }
  tbody.innerHTML=top.map((s,i)=>{
    const dominant=Object.entries(s.models).sort((a,b)=>b[1]-a[1])[0][0];
    return '<tr>'+
      '<td>'+(i+1)+'</td>'+
      '<td>'+esc(fmtDate(s.firstTs))+'</td>'+
      '<td>'+esc(dominant)+'</td>'+
      '<td>'+s.totalAiu.toFixed(2)+' AIU</td>'+
      '<td>$'+(s.totalAiu*0.01).toFixed(2)+'</td>'+
      '<td>'+s.count+'</td>'+
      '</tr>';
  }).join('');
}

// ── INIT ──────────────────────────────────────────────────────────────────────
function init() {
  const seen=new Set();
  for(const e of DATA.events){
    const d=new Date(e.ts);
    const k=d.getFullYear()+'-'+(d.getMonth()+1);
    if(!seen.has(k)){ seen.add(k); availableMonths.push({year:d.getFullYear(),month:d.getMonth()+1}); }
  }
  availableMonths.sort((a,b)=>a.year!==b.year?a.year-b.year:a.month-b.month);
  if(!availableMonths.find(m=>m.year===currentYear&&m.month===currentMonth))
    availableMonths.push({year:currentYear,month:currentMonth});
  availableMonths.sort((a,b)=>a.year!==b.year?a.year-b.year:a.month-b.month);

  document.getElementById('prev').addEventListener('click',()=>{
    const idx=availableMonths.findIndex(m=>m.year===currentYear&&m.month===currentMonth);
    if(idx>0){({year:currentYear,month:currentMonth}=availableMonths[idx-1]);selectedDay=null;render();}
  });
  document.getElementById('next').addEventListener('click',()=>{
    const idx=availableMonths.findIndex(m=>m.year===currentYear&&m.month===currentMonth);
    if(idx<availableMonths.length-1){({year:currentYear,month:currentMonth}=availableMonths[idx+1]);selectedDay=null;render();}
  });
  document.getElementById('clear-btn').addEventListener('click',()=>{selectedDay=null;render();});

  setupYearNav();
  render();
}

init();
</script>
</body>
</html>`;
}

let currentPanel: vscode.WebviewPanel | undefined;

export function showUsageChart(context: vscode.ExtensionContext, data: ChartData): void {
  const nonce = generateNonce();

  if (currentPanel) {
    currentPanel.reveal(vscode.ViewColumn.Beside);
    currentPanel.webview.html = buildHtml(data, nonce);
    setupMessageHandler(currentPanel, context);
    return;
  }

  currentPanel = vscode.window.createWebviewPanel(
    'copilotUsageChart',
    'Copilot Usage',
    vscode.ViewColumn.Beside,
    { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [] }
  );

  currentPanel.webview.html = buildHtml(data, nonce);
  setupMessageHandler(currentPanel, context);

  currentPanel.onDidDispose(() => { currentPanel = undefined; }, null, context.subscriptions);
}

function setupMessageHandler(
  panel: vscode.WebviewPanel,
  context: vscode.ExtensionContext
): void {
  panel.webview.onDidReceiveMessage(
    (msg: { command: string; value?: number }) => {
      if (msg.command === 'setBudget') {
        const cfg = vscode.workspace.getConfiguration('copilotCredits');
        cfg.update('monthlyBudgetAiu', msg.value ?? 0, vscode.ConfigurationTarget.Global);
      }
    },
    null,
    context.subscriptions
  );
}
