import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import * as Y from 'yjs';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCursor from '@tiptap/extension-collaboration-cursor';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Underline from '@tiptap/extension-underline';
import Image from '@tiptap/extension-image';
import ErrorScreen from './ErrorScreen.jsx';
import { useYjs } from '../hooks/useYjs.js';

/* ── Calendar helpers ── */

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const WEEKDAY_LABELS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

function buildCalendarGrid(year, month) {
  const firstDayOfWeek  = new Date(year, month, 1).getDay();
  const daysInMonth     = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();
  const prevYear  = month === 0 ? year - 1 : year;
  const prevMonth = month === 0 ? 11 : month - 1;
  const nextYear  = month === 11 ? year + 1 : year;
  const nextMonth = month === 11 ? 0 : month + 1;
  const cells = [];
  for (let i = firstDayOfWeek - 1; i >= 0; i--) {
    const d = daysInPrevMonth - i;
    cells.push({ day: d, type: 'prev',
      date: `${prevYear}-${String(prevMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}` });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, type: 'current',
      date: `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}` });
  }
  for (let d = 1; cells.length < 42; d++) {
    cells.push({ day: d, type: 'next',
      date: `${nextYear}-${String(nextMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}` });
  }
  return cells;
}

function genId() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }
function toDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function daysBetween(a, b) {
  return Math.round((new Date(b+'T00:00') - new Date(a+'T00:00')) / 86400000);
}
function addDays(dateStr, n) {
  const d = new Date(dateStr+'T00:00'); d.setDate(d.getDate()+n); return toDateStr(d);
}
function formatTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  return `${h%12||12}:${String(m).padStart(2,'0')} ${h>=12?'PM':'AM'}`;
}
function computeSpanSegments(multiDayEvents, cells) {
  if (!multiDayEvents.length || !cells.length) return [];
  const firstDate = cells[0].date, lastDate = cells[cells.length-1].date;
  const segments = [];
  const visible = [...multiDayEvents]
    .filter(ev => ev.endDate >= firstDate && ev.startDate <= lastDate)
    .sort((a,b) => a.startDate.localeCompare(b.startDate));
  visible.forEach((ev, globalLane) => {
    if (globalLane >= 2) return;
    let startIdx = cells.findIndex(c => c.date === ev.startDate);
    let endIdx   = cells.findIndex(c => c.date === ev.endDate);
    if (startIdx === -1) startIdx = 0;
    if (endIdx   === -1) endIdx   = cells.length - 1;
    const startRow = Math.floor(startIdx/7), endRow = Math.floor(endIdx/7);
    for (let row = startRow; row <= endRow; row++) {
      const rowStart = row * 7;
      const segColStart = Math.max(startIdx, rowStart) - rowStart + 1;
      const segColEnd   = Math.min(endIdx, rowStart+6) - rowStart + 1;
      segments.push({ key:`${ev.id}-${row}`, id:ev.id, title:ev.title, location:ev.location,
        row:row+1, colStart:segColStart, colEnd:segColEnd, lane:globalLane,
        isStart: Math.max(startIdx,rowStart)===startIdx, isEnd: Math.min(endIdx,rowStart+6)===endIdx });
    }
  });
  return segments;
}

/* ── Connection badge ── */

function ConnectionBadge({ status, online }) {
  // Use browser online state for instant feedback; WS status for reconnecting
  const effective = !online ? 'disconnected' : status;
  const LABELS = { connected: 'Connected', connecting: 'Reconnecting...', disconnected: 'Offline' };
  return (
    <div className={`conn conn--${effective}`}>
      <span className="conn__dot" />
      <span className="conn__label">{LABELS[effective] ?? effective}</span>
    </div>
  );
}

/* ── Offline / sync banner ── */

function OfflineBanner({ status }) {
  // navigator.onLine fires immediately; y-websocket status takes up to 30s to detect a dead WS
  const [online, setOnline]         = useState(navigator.onLine);
  const [savedFlash, setSavedFlash] = useState(false);
  const wasOffline = useRef(false);

  useEffect(() => {
    const goOnline  = () => setOnline(true);
    const goOffline = () => { setOnline(false); wasOffline.current = true; };
    window.addEventListener('online',  goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online',  goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  // Flash "saved" when fully recovered: browser online + WS reconnected
  useEffect(() => {
    if (online && status === 'connected' && wasOffline.current) {
      wasOffline.current = false;
      setSavedFlash(true);
      const t = setTimeout(() => setSavedFlash(false), 3000);
      return () => clearTimeout(t);
    }
  }, [online, status]);

  if (savedFlash) return <div className="offline-banner offline-banner--saved">All changes saved</div>;
  if (!online)    return <div className="offline-banner offline-banner--offline">Offline — changes will sync when reconnected</div>;
  if (status === 'connecting') return <div className="offline-banner offline-banner--syncing">Syncing changes...</div>;
  return null;
}

/* ── User presence ── */

function UserList({ users }) {
  if (!users.length) return null;
  return (
    <div className="users">
      {users.map((u,i) => (
        <span key={i} className="user-badge" style={{borderColor:u.color,color:u.color}}>
          <span className="user-badge__dot" style={{background:u.color}}/>{u.name}
        </span>
      ))}
    </div>
  );
}

/* ── Live cursors ── */

function hexBrightness(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (r * 299 + g * 587 + b * 114) / 1000;
}

function CursorOverlay({ cursors }) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!cursors.length) return;
    const id = setInterval(() => setTick(t => t + 1), 500);
    return () => clearInterval(id);
  }, [cursors.length]);

  if (!cursors.length) return null;
  const now = Date.now();

  return (
    <div style={{
      position: 'absolute', inset: 0,
      pointerEvents: 'none', overflow: 'hidden', zIndex: 999,
    }}>
      {cursors.map(c => {
        const opacity = now - c.updatedAt > 1500 ? 0.2 : 1;
        return (
          <div key={c.clientId} style={{
            position: 'absolute',
            left: `${c.x}%`,
            top: `${c.y}%`,
            transition: 'left 0.05s linear, top 0.05s linear, opacity 0.4s',
            opacity,
            pointerEvents: 'none',
            userSelect: 'none',
            transform: 'translate(-50%, -50%)',
          }}>
            <div style={{
              width: 10, height: 10, borderRadius: '50%',
              background: c.color, border: '2px solid #fff',
              boxShadow: `0 0 0 1px ${c.color}`,
            }} />
          </div>
        );
      })}
    </div>
  );
}

/* ── iCal export helpers ── */

function icsEscape(s) {
  return String(s)
    .replace(/\\/g, '\\\\')
    .replace(/;/g,  '\\;')
    .replace(/,/g,  '\\,')
    .replace(/\n/g, '\\n');
}

function icsDate(dateStr) {
  return dateStr.replace(/-/g, '');
}

function icsDateTime(dateStr, timeStr) {
  const d = dateStr.replace(/-/g, '');
  const t = timeStr ? timeStr.replace(':', '') + '00' : '000000';
  return `${d}T${t}`;
}

function icsAddOneDay(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + 1);
  return toDateStr(d).replace(/-/g, '');
}

function icsFoldLine(line) {
  if (line.length <= 75) return line;
  const parts = [];
  while (line.length > 75) {
    parts.push(line.slice(0, 75));
    line = ' ' + line.slice(75);
  }
  parts.push(line);
  return parts.join('\r\n');
}

function generateIcs(events, slug) {
  const now = new Date().toISOString().replace(/[-:.]/g, '').slice(0, 15) + 'Z';
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//PlannerPad//PlannerPad//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:PlannerPad - ${slug}`,
  ];

  for (const ev of events) {
    if (!ev.startDate || !ev.title) continue;
    const endDate = ev.endDate && ev.endDate >= ev.startDate ? ev.endDate : ev.startDate;

    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${ev.id}@plannerpad`);
    lines.push(`DTSTAMP:${now}`);

    if (ev.allDay !== false) {
      lines.push(`DTSTART;VALUE=DATE:${icsDate(ev.startDate)}`);
      lines.push(`DTEND;VALUE=DATE:${icsAddOneDay(endDate)}`);
    } else {
      lines.push(`DTSTART:${icsDateTime(ev.startDate, ev.time)}`);
      lines.push(`DTEND:${icsDateTime(endDate, ev.time)}`);
    }

    lines.push(icsFoldLine(`SUMMARY:${icsEscape(ev.title)}`));
    if (ev.location) lines.push(icsFoldLine(`LOCATION:${icsEscape(ev.location)}`));
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}

/* ── Calendar panel ── */

function CalendarPanel({ doc, slug, setCursor, exportRef }) {
  const now = new Date();
  const [year,setYear]   = useState(now.getFullYear());
  const [month,setMonth] = useState(now.getMonth());
  const [events,setEvents]               = useState([]);
  const [form,setForm]                   = useState(null);
  const [draggingEventId,setDraggingEventId] = useState(null);
  const [dragOverDate,setDragOverDate]       = useState(null);
  const [foreignDrag,setForeignDrag]         = useState(false);
  const todayStr = toDateStr(now);
  const yEvents  = doc.getMap('events');

  useEffect(() => {
    const sync = () => {
      const evts = [];
      yEvents.forEach(m => {
        const startDate = m.get('startDate') || m.get('date') || '';
        evts.push({ id:m.get('id')||'', title:m.get('title')||'', startDate,
          endDate:m.get('endDate')||startDate, allDay:m.get('allDay')!==false,
          time:m.get('time')||'', location:m.get('location')||'', sourceNoteId:m.get('sourceNoteId')||'' });
      });
      setEvents(evts);
    };
    yEvents.observeDeep(sync); sync();
    return () => yEvents.unobserveDeep(sync);
  }, [yEvents]);

  const cells = buildCalendarGrid(year, month);
  function prev() { if(month===0){setMonth(11);setYear(y=>y-1);}else setMonth(m=>m-1); }
  function next() { if(month===11){setMonth(0);setYear(y=>y+1);}else setMonth(m=>m+1); }

  function openAddForm(date)  { if(draggingEventId) return; setCursor?.(null, null); setForm({mode:'add',title:'',startDate:date,endDate:date,allDay:true,time:'',location:''}); }
  function openEditForm(id,e) { e?.stopPropagation(); if(draggingEventId) return; const ev=events.find(ev=>ev.id===id); if(ev) { setCursor?.(null, null); setForm({mode:'edit',...ev}); } }

  function saveEvent() {
    if(!form?.title.trim()||!form.startDate) return;
    const endDate = form.endDate>=form.startDate?form.endDate:form.startDate;
    if(form.mode==='edit') {
      const m=yEvents.get(form.id); if(!m) return;
      m.set('title',form.title.trim()); m.set('startDate',form.startDate); m.set('endDate',endDate);
      m.set('allDay',form.allDay); m.set('time',form.allDay?'':form.time); m.set('location',form.location||''); m.set('date',form.startDate);
    } else {
      const id = genId();
      doc.transact(() => {
        const m = new Y.Map();
        yEvents.set(id, m);
        m.set('id', id); m.set('title', form.title.trim()); m.set('startDate', form.startDate); m.set('endDate', endDate);
        m.set('allDay', form.allDay); m.set('time', form.allDay ? '' : form.time); m.set('location', form.location || ''); m.set('sourceNoteId', ''); m.set('date', form.startDate);
      });
    }
    setForm(null);
  }

  function deleteEvent(id,e) { e?.stopPropagation(); yEvents.delete(id); if(form?.id===id) setForm(null); }

  function handleCellDrop(e,date) {
    e.preventDefault(); setDragOverDate(null); setForeignDrag(false);
    let data; try { data=JSON.parse(e.dataTransfer.getData('application/json')); } catch { return; }
    if(data.type==='cal-event') {
      const ev=events.find(ev=>ev.id===data.id); if(!ev) return;
      const span=daysBetween(ev.startDate,ev.endDate); const newEnd=addDays(date,span);
      const m=yEvents.get(data.id); if(m){m.set('startDate',date);m.set('endDate',newEnd);m.set('date',date);}
    }
    if(data.type==='ck-item' && data.text) {
      const id = genId();
      doc.transact(() => {
        const m = new Y.Map();
        yEvents.set(id, m);
        m.set('id', id); m.set('title', data.text.slice(0, 200)); m.set('startDate', date); m.set('endDate', date);
        m.set('allDay', true); m.set('time', ''); m.set('location', ''); m.set('sourceNoteId', ''); m.set('date', date);
      });
    }
    setDraggingEventId(null);
  }

  const multiDayEvts  = events.filter(ev=>ev.endDate&&ev.endDate!==ev.startDate);
  const singleDayEvts = events.filter(ev=>!ev.endDate||ev.endDate===ev.startDate);
  const spanSegments  = computeSpanSegments(multiDayEvts,cells);

  function handleExportIcs() {
    const ics = generateIcs(events, slug || 'room');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
    a.download = `calnote-${slug || 'room'}.ics`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // Expose latest handleExportIcs to parent via ref
  useEffect(() => { if (exportRef) exportRef.current = handleExportIcs; });

  return (
    <div className="calendar"
      onDragEnter={e=>{if(e.dataTransfer.types.includes('application/x-ck-item'))setForeignDrag(true);}}
      onDragLeave={e=>{if(!e.currentTarget.contains(e.relatedTarget))setForeignDrag(false);}}>
      <div className="calendar__month">
        <div className="calendar__month-nav">
          <button className="calendar__nav-btn" onClick={prev}>‹ PREV</button>
          <span>{MONTH_NAMES[month]} {year}</span>
          <button className="calendar__nav-btn" onClick={next}>NEXT ›</button>
        </div>
      </div>
      <div className="calendar__grid-wrap">
      <div className="calendar__weekdays">
        {WEEKDAY_LABELS.map(d=><div key={d} className="calendar__weekday">{d}</div>)}
      </div>
      <div className="calendar__body">
        <div className="calendar__grid">
          {cells.map((cell,i) => {
            const isToday=cell.date===todayStr;
            const cellEvts=singleDayEvts.filter(ev=>ev.startDate===cell.date);
            return (
              <div key={i} className={['cal-cell',cell.type!=='current'?'cal-cell--other':'',isToday?'cal-cell--today':'',dragOverDate===cell.date?'cal-cell--drag-over':''].filter(Boolean).join(' ')}
                onClick={()=>cell.type==='current'&&openAddForm(cell.date)}
                onDragOver={e=>{e.preventDefault();setDragOverDate(cell.date);}}
                onDragLeave={e=>{if(!e.currentTarget.contains(e.relatedTarget))setDragOverDate(null);}}
                onDrop={e=>handleCellDrop(e,cell.date)}>
                <span className={`cal-cell__day${isToday?' cal-cell__day--today':''}`}>{cell.day}</span>
                <div className="cal-cell__events">
                  {cellEvts.map(ev=>(
                    <div key={ev.id} className={`cal-event${draggingEventId===ev.id?' cal-event--dragging':''}`}
                      draggable onDragStart={e=>{e.stopPropagation();setDraggingEventId(ev.id);e.dataTransfer.setData('application/json',JSON.stringify({type:'cal-event',id:ev.id}));e.dataTransfer.effectAllowed='move';}}
                      onDragEnd={()=>setDraggingEventId(null)} onClick={e=>openEditForm(ev.id,e)} title={ev.title}>
                      {!ev.allDay&&ev.time&&<span className="cal-event__time">{formatTime(ev.time)}</span>}
                      {ev.location&&<span className="cal-event__loc">📍</span>}
                      <span className="cal-event__title">{ev.title}</span>
                      <button className="cal-event__delete" onClick={e=>deleteEvent(ev.id,e)}>×</button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        <div className="calendar__span-layer">
          {spanSegments.map(seg=>(
            <div key={seg.key} className={['cal-span-event',!seg.isEnd?'cal-span-event--r-open':'',!seg.isStart?'cal-span-event--l-open':'',draggingEventId===seg.id?'cal-event--dragging':''].filter(Boolean).join(' ')}
              style={{gridColumn:`${seg.colStart}/${seg.colEnd+1}`,gridRow:seg.row,marginTop:`${2+seg.lane*16}px`,pointerEvents:(draggingEventId||foreignDrag)?'none':'auto'}}
              draggable onDragStart={e=>{e.stopPropagation();setDraggingEventId(seg.id);e.dataTransfer.setData('application/json',JSON.stringify({type:'cal-event',id:seg.id}));e.dataTransfer.effectAllowed='move';}}
              onDragEnd={()=>setDraggingEventId(null)} onClick={e=>openEditForm(seg.id,e)} title={seg.title}>
              {seg.isStart&&<><span className="cal-span-event__title">{seg.title}</span></>}
            </div>
          ))}
        </div>
      </div>
      </div>
      {form&&(
        <div className="cal-form-backdrop" onClick={()=>setForm(null)}>
          <div className="cal-form" onClick={e=>e.stopPropagation()}>
            <div className="cal-form__header">
              <span className="cal-form__title-label">{form.mode==='edit'?'Edit Event':'New Event'}</span>
              <button className="cal-form__close" onClick={()=>setForm(null)}>×</button>
            </div>
            <input autoFocus type="text" className="cal-form__input" placeholder="Event title (required)"
              value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))}
              onKeyDown={e=>{if(e.key==='Enter')saveEvent();if(e.key==='Escape')setForm(null);}}/>
            <label className="cal-form__toggle-label">
              <input type="checkbox" className="cal-form__checkbox" checked={form.allDay}
                onChange={e=>setForm(f=>({...f,allDay:e.target.checked,time:e.target.checked?'':f.time}))}/>All day
            </label>
            <div className="cal-form__row">
              <span className="cal-form__label">Start</span>
              <input type="date" className="cal-form__date-input" value={form.startDate}
                onChange={e=>setForm(f=>({...f,startDate:e.target.value,endDate:f.endDate<e.target.value?e.target.value:f.endDate}))}/>
            </div>
            <div className="cal-form__row">
              <span className="cal-form__label">End</span>
              <input type="date" className="cal-form__date-input" value={form.endDate} min={form.startDate}
                onChange={e=>setForm(f=>({...f,endDate:e.target.value}))}/>
            </div>
            {!form.allDay&&<input type="time" className="cal-form__time" value={form.time} onChange={e=>setForm(f=>({...f,time:e.target.value}))}/>}
            <input type="text" className="cal-form__input" placeholder="Location (optional)"
              value={form.location} onChange={e=>setForm(f=>({...f,location:e.target.value}))}/>
            <div className="cal-form__actions">
              <button className="cal-form__btn cal-form__btn--add" onClick={saveEvent}>{form.mode==='edit'?'UPDATE':'ADD'}</button>
              {form.mode==='edit'&&<button className="cal-form__btn cal-form__btn--delete" onClick={()=>deleteEvent(form.id)}>DELETE</button>}
              <button className="cal-form__btn cal-form__btn--cancel" onClick={()=>setForm(null)}>CANCEL</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════
   UNIFIED EDITOR — helpers
   ══════════════════════════════════════ */

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// Migration: convert old Y.Text delta → HTML string
function legacyDeltaToHtml(delta) {
  return delta.map(op => {
    if (typeof op.insert !== 'string') return '';
    let t = escHtml(op.insert).replace(/\n/g,'<br>');
    const a = op.attributes||{};
    if (a.strike)    t = `<s>${t}</s>`;
    if (a.underline) t = `<u>${t}</u>`;
    if (a.italic)    t = `<em>${t}</em>`;
    if (a.bold)      t = `<strong>${t}</strong>`;
    return t;
  }).join('');
}

/* ── Format toolbar ── */

function FormatToolbar({ activeFormats, activeStyle, activeList, onFormat, onStyle, onList }) {
  const [aaOpen,   setAaOpen]   = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const aaRef   = useRef(null);
  const listRef = useRef(null);

  useEffect(() => {
    if (!aaOpen && !listOpen) return;
    const close = e => {
      if (aaOpen   && !aaRef.current?.contains(e.target))   setAaOpen(false);
      if (listOpen && !listRef.current?.contains(e.target)) setListOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [aaOpen, listOpen]);

  const listBtnLabel = activeList === 'bullet' ? '• ▾' : activeList === 'numbered' ? '1. ▾' : activeList === 'checklist' ? '☑ ▾' : '≡ ▾';

  return (
    <div className="format-toolbar">
      <button className={`tb-btn${activeFormats.bold      ? ' tb-btn--on' : ''}`}
        onMouseDown={e => { e.preventDefault(); onFormat('bold'); }}
        style={{ fontWeight: 900 }}>B</button>
      <button className={`tb-btn${activeFormats.italic    ? ' tb-btn--on' : ''}`}
        onMouseDown={e => { e.preventDefault(); onFormat('italic'); }}
        style={{ fontStyle: 'italic' }}>I</button>
      <button className={`tb-btn${activeFormats.underline ? ' tb-btn--on' : ''}`}
        onMouseDown={e => { e.preventDefault(); onFormat('underline'); }}
        style={{ textDecoration: 'underline' }}>U</button>
      <button className={`tb-btn${activeFormats.strike    ? ' tb-btn--on' : ''}`}
        onMouseDown={e => { e.preventDefault(); onFormat('strike'); }}
        style={{ textDecoration: 'line-through' }}>S</button>
      <div className="tb-sep" />
      <div className="tb-dd" ref={aaRef}>
        <button
          className={`tb-btn${aaOpen || (activeStyle && activeStyle !== 'p') ? ' tb-btn--on' : ''}`}
          onMouseDown={e => e.preventDefault()}
          onClick={() => { setAaOpen(o => !o); setListOpen(false); }}>Aa ▾</button>
        {aaOpen && (
          <div className="tb-popover">
            <button className={`tb-pop-item${activeStyle === 'h1'  ? ' tb-pop-item--active' : ''}`} style={{ font: '900 20px/1.3 Nunito,sans-serif' }}
              onMouseDown={e => { e.preventDefault(); onStyle('h1');  setAaOpen(false); }}>Title</button>
            <button className={`tb-pop-item${activeStyle === 'h2'  ? ' tb-pop-item--active' : ''}`} style={{ font: '800 16px/1.3 Nunito,sans-serif' }}
              onMouseDown={e => { e.preventDefault(); onStyle('h2');  setAaOpen(false); }}>Heading</button>
            <button className={`tb-pop-item${activeStyle === 'h3'  ? ' tb-pop-item--active' : ''}`} style={{ font: '700 14px/1.3 Nunito,sans-serif' }}
              onMouseDown={e => { e.preventDefault(); onStyle('h3');  setAaOpen(false); }}>Subheading</button>
            <button className={`tb-pop-item${activeStyle === 'p'   ? ' tb-pop-item--active' : ''}`} style={{ font: '400 13px/1.3 Nunito,sans-serif' }}
              onMouseDown={e => { e.preventDefault(); onStyle('p');   setAaOpen(false); }}>Body</button>
            <button className={`tb-pop-item${activeStyle === 'pre' ? ' tb-pop-item--active' : ''}`} style={{ font: '400 13px/1.3 monospace' }}
              onMouseDown={e => { e.preventDefault(); onStyle('pre'); setAaOpen(false); }}>Monospace</button>
          </div>
        )}
      </div>
      <div className="tb-dd" ref={listRef}>
        <button
          className={`tb-btn${listOpen || activeList ? ' tb-btn--on' : ''}`}
          onMouseDown={e => e.preventDefault()}
          onClick={() => { setListOpen(o => !o); setAaOpen(false); }}>{listBtnLabel}</button>
        {listOpen && (
          <div className="tb-popover">
            <button className={`tb-pop-item${activeList === 'bullet'    ? ' tb-pop-item--active' : ''}`}
              onMouseDown={e => { e.preventDefault(); onList('bullet');    setListOpen(false); }}>• Bullet list</button>
            <button className={`tb-pop-item${activeList === 'numbered'  ? ' tb-pop-item--active' : ''}`}
              onMouseDown={e => { e.preventDefault(); onList('numbered');  setListOpen(false); }}>1. Numbered list</button>
            <button className={`tb-pop-item${activeList === 'checklist' ? ' tb-pop-item--active' : ''}`}
              onMouseDown={e => { e.preventDefault(); onList('checklist'); setListOpen(false); }}>
              <span className="tb-check-preview" /> Checklist
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Unified editor (Tiptap) ── */

function UnifiedEditor({ doc, tabId, synced, exportRef, provider, displayName, myColor }) {
  const [activeFormats, setActiveFormats] = useState({ bold: false, italic: false, underline: false, strike: false });
  const [activeStyle,   setActiveStyle]   = useState('p');
  const [activeList,    setActiveList]    = useState(null);
  const [wordCount,     setWordCount]     = useState({ words: 0, chars: 0 });
  const imageInsertRef = useRef(null);
  const migratedRef    = useRef(false);

  const syncToolbar = useCallback(ed => {
    if (!ed) return;
    setActiveFormats({
      bold:      ed.isActive('bold'),
      italic:    ed.isActive('italic'),
      underline: ed.isActive('underline'),
      strike:    ed.isActive('strike'),
    });
    setActiveStyle(
      ed.isActive('heading', { level: 1 }) ? 'h1' :
      ed.isActive('heading', { level: 2 }) ? 'h2' :
      ed.isActive('heading', { level: 3 }) ? 'h3' :
      ed.isActive('codeBlock') ? 'pre' : 'p'
    );
    setActiveList(
      ed.isActive('taskList')    ? 'checklist' :
      ed.isActive('orderedList') ? 'numbered' :
      ed.isActive('bulletList')  ? 'bullet' : null
    );
  }, []);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ history: false }),
      Underline,
      TaskList,
      TaskItem.configure({ nested: false }),
      Image.configure({ inline: false, HTMLAttributes: { class: 'editor-img' } }),
      Collaboration.configure({ document: doc, field: `tab-tiptap-${tabId}` }),
      CollaborationCursor.configure({
        provider,
        user: { name: displayName, color: myColor },
        render(user) {
          const caret = document.createElement('span');
          caret.style.cssText = 'border-left:2px solid;display:inline;position:relative;word-break:normal;pointer-events:none;';
          caret.style.borderColor = user.color;
          const label = document.createElement('div');
          label.style.cssText = [
            'position:absolute', 'bottom:100%', 'left:-1px',
            "font-family:'Nunito',sans-serif", 'font-size:10px', 'font-weight:700',
            `background:${user.color}`,
            `color:${hexBrightness(user.color) > 128 ? '#111' : '#fff'}`,
            'padding:1px 4px', 'border-radius:2px 2px 2px 0',
            'white-space:nowrap', 'pointer-events:none', 'user-select:none', 'line-height:1.4',
          ].join(';');
          label.textContent = user.name;
          caret.appendChild(label);
          return caret;
        },
      }),
    ],
    editorProps: {
      attributes: { class: 'unified-editor' },
      handlePaste(view, event) {
        const items = [...(event.clipboardData?.items || [])];
        const imgItem = items.find(i => i.type.startsWith('image/'));
        if (imgItem) {
          imageInsertRef.current?.(imgItem.getAsFile());
          return true;
        }
        // Strip HTML from clipboard — paste plain text only
        const htmlData = event.clipboardData?.getData('text/html');
        if (htmlData && htmlData.trim()) {
          const text = event.clipboardData?.getData('text/plain') || '';
          const tr = view.state.tr;
          const { from, to, empty } = view.state.selection;
          if (!empty && text) view.dispatch(tr.replaceWith(from, to, view.state.schema.text(text)));
          else if (!empty)    view.dispatch(tr.delete(from, to));
          else if (text)      view.dispatch(tr.insertText(text, from));
          return true;
        }
        return false;
      },
      handleDrop(view, event) {
        const file = [...(event.dataTransfer?.files || [])].find(f => f.type.startsWith('image/'));
        if (file) { imageInsertRef.current?.(file); return true; }
        return false;
      },
    },
    onUpdate({ editor: ed }) {
      const text = ed.getText();
      const words = text.trim() ? text.trim().split(/\s+/).length : 0;
      setWordCount({ words, chars: text.replace(/\s/g, '').length });
      syncToolbar(ed);
    },
    onSelectionUpdate({ editor: ed }) {
      syncToolbar(ed);
    },
  });

  // Keep CollaborationCursor user info in sync when display name or color changes
  useEffect(() => {
    editor?.commands.updateUser({ name: displayName, color: myColor });
  }, [editor, displayName, myColor]);

  // On first sync: migrate old Y.Text / Y.Array content into the Tiptap Y.XmlFragment
  useEffect(() => {
    if (!editor || !synced || migratedRef.current) return;
    const xmlFrag = doc.getXmlFragment(`tab-tiptap-${tabId}`);
    if (xmlFrag.length > 0) { migratedRef.current = true; return; }

    let html = '';
    const yArray = doc.getArray(`tab-list-${tabId}`);
    if (yArray.length > 0) {
      const items = yArray.toArray().map(m => ({ text: m.get('text') || '', checked: !!m.get('checked') }));
      html = `<ul class="ck">${items.map(i =>
        `<li class="ck-item"${i.checked ? ' data-checked="true"' : ''}>${escHtml(i.text) || '<br>'}</li>`
      ).join('')}</ul>`;
    } else {
      const yText = doc.getText(`tab-xml-${tabId}`);
      if (yText.length > 0) {
        html = yText.toString();
      } else {
        const yOldText = doc.getText(`tab-text-${tabId}`);
        if (yOldText.length > 0) html = legacyDeltaToHtml(yOldText.toDelta());
      }
    }

    migratedRef.current = true;
    if (html) requestAnimationFrame(() => editor.commands.setContent(html, false));
  }, [editor, synced, tabId]); // eslint-disable-line react-hooks/exhaustive-deps

  function insertImageFromFile(file) {
    if (!file) return;
    if (file.size > 500 * 1024) { alert('Image too large (max 500 KB). Please use a smaller image.'); return; }
    const reader = new FileReader();
    reader.onload = ev => {
      const img = new Image();
      img.onload = () => {
        const maxW = 300;
        const scale = img.width > maxW ? maxW / img.width : 1;
        const canvas = document.createElement('canvas');
        canvas.width  = Math.round(img.width  * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        editor?.chain().focus().setImage({ src: canvas.toDataURL('image/jpeg', 0.85) }).run();
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  }
  imageInsertRef.current = insertImageFromFile;

  function handleExport() {
    if (!editor) return;
    const text = editor.getText();
    const blob = new Blob([text], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'notes.txt';
    a.click();
    URL.revokeObjectURL(a.href);
  }
  useEffect(() => { if (exportRef) exportRef.current = handleExport; });

  // Drag checklist items to calendar
  function handleDragStart(e) {
    const el = e.target instanceof Element ? e.target : null;
    if (!el) return;
    // In Tiptap v2, task items are <li data-checked> inside <ul data-type="taskList">
    const item = el.closest('ul[data-type="taskList"] > li, li[data-checked]');
    if (!item) return;
    const contentEl = item.querySelector('div > p') || item.querySelector('div');
    const text = (contentEl || item).textContent.trim();
    if (text) {
      e.dataTransfer.setData('application/json', JSON.stringify({ type: 'ck-item', text }));
      e.dataTransfer.effectAllowed = 'copyMove';
    }
  }

  return (
    <div className="unified-editor-wrap">
      <FormatToolbar
        activeFormats={activeFormats}
        activeStyle={activeStyle}
        activeList={activeList}
        onFormat={fmt => {
          if (!editor) return;
          const c = editor.chain().focus();
          if (fmt === 'bold')           c.toggleBold().run();
          else if (fmt === 'italic')    c.toggleItalic().run();
          else if (fmt === 'underline') c.toggleUnderline().run();
          else if (fmt === 'strike')    c.toggleStrike().run();
        }}
        onStyle={tag => {
          if (!editor) return;
          const c = editor.chain().focus();
          if (tag === 'h1')       c.toggleHeading({ level: 1 }).run();
          else if (tag === 'h2')  c.toggleHeading({ level: 2 }).run();
          else if (tag === 'h3')  c.toggleHeading({ level: 3 }).run();
          else if (tag === 'pre') c.toggleCodeBlock().run();
          else                    c.setParagraph().run();
        }}
        onList={type => {
          if (!editor) return;
          const c = editor.chain().focus();
          if (type === 'bullet')         c.toggleBulletList().run();
          else if (type === 'numbered')  c.toggleOrderedList().run();
          else if (type === 'checklist') c.toggleTaskList().run();
        }}
      />
      <div
        style={{ display: 'flex', flex: 1, minHeight: 0, flexDirection: 'column', position: 'relative' }}
        onDragStart={handleDragStart}
      >
        <EditorContent editor={editor} style={{ display: 'flex', flex: 1, minHeight: 0, flexDirection: 'column' }} />
      </div>
      <div className="word-count">
        {wordCount.words} words · {wordCount.chars} chars
      </div>
    </div>
  );
}



/* ── Notes panel ── */

function NotesPanel({ doc, synced, editorCursors, setEditorCursor, exportRef, provider, displayName, myColor }) {
  const [tabs,         setTabs]         = useState([]);
  const [activeTabId,  setActiveTabId]  = useState(null);
  const [renamingId,   setRenamingId]   = useState(null);
  const [renameText,   setRenameText]   = useState('');
  const [dropTarget,   setDropTarget]   = useState(null);
  const [collapsed,    setCollapsed]    = useState(false);
  const [panelWidth,   setPanelWidth]   = useState(300);
  const lastWidthRef = useRef(300);
  const panelRef     = useRef(null);
  const dragTabRef   = useRef(null);

  function startResize(e) {
    e.preventDefault();
    if (collapsed) return;
    const startX = e.clientX;
    const startW = panelRef.current?.offsetWidth ?? panelWidth;
    const onMove = ev => {
      const w = Math.max(0, Math.min(560, startW + (startX - ev.clientX)));
      if (w < 120) {
        setCollapsed(true);
      } else {
        setCollapsed(false);
        setPanelWidth(w);
        lastWidthRef.current = w;
      }
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  const yTabs = doc ? doc.getArray('tabs') : null;

  useEffect(() => {
    if (!yTabs) return;
    const sync = () => {
      const arr = yTabs.toArray().map(m => ({ id:m.get('id'), name:m.get('name') }));
      setTabs(arr);
      setActiveTabId(prev => {
        if (!arr.length) return null;
        return arr.find(t=>t.id===prev) ? prev : arr[0].id;
      });
    };
    yTabs.observeDeep(sync); sync();
    return () => yTabs.unobserveDeep(sync);
  }, [yTabs]);

  useEffect(() => {
    if (!yTabs || !synced || yTabs.length > 0) return;
    const id = genId(); const m = new Y.Map();
    m.set('id',id); m.set('name','Tab 1');
    yTabs.push([m]);
  }, [yTabs, synced]);

  const activeTab = tabs.find(t=>t.id===activeTabId) ?? tabs[0] ?? null;

  function addTab() {
    if (!yTabs || tabs.length >= 5) return;
    const id = genId(); const m = new Y.Map();
    m.set('id',id); m.set('name',`Tab ${tabs.length+1}`);
    yTabs.push([m]);
    setActiveTabId(id);
  }

  function deleteTab(id) {
    if (!yTabs || tabs.length <= 1) return;
    const tab = tabs.find(t=>t.id===id); if (!tab) return;
    const hasContent =
      doc.getText(`tab-xml-${id}`).length > 0 ||
      doc.getText(`tab-text-${id}`).length > 0 ||
      doc.getArray(`tab-list-${id}`).length > 0;
    if (hasContent && !window.confirm(`Delete "${tab.name}"? All content will be lost.`)) return;
    const idx = yTabs.toArray().findIndex(m=>m.get('id')===id);
    if (idx!==-1) yTabs.delete(idx,1);
    if (activeTabId===id) {
      const remaining = tabs.filter(t=>t.id!==id);
      setActiveTabId(remaining[Math.max(0,idx-1)]?.id ?? remaining[0]?.id ?? null);
    }
  }

  function reorderTabs(fromId, targetId, side) {
    dragTabRef.current = null; setDropTarget(null);
    if (!fromId || fromId===targetId || !yTabs) return;
    const all = yTabs.toArray().map(m=>({id:m.get('id'),name:m.get('name')}));
    const fromIdx=all.findIndex(t=>t.id===fromId); const toIdx=all.findIndex(t=>t.id===targetId);
    if (fromIdx===-1||toIdx===-1) return;
    let ins = side==='right' ? toIdx+1 : toIdx;
    if (fromIdx < ins) ins--;
    if (ins===fromIdx) return;
    const [moved] = all.splice(fromIdx,1); all.splice(ins,0,moved);
    doc.transact(() => {
      yTabs.delete(0,yTabs.length);
      all.forEach(t=>{ const m=new Y.Map(); m.set('id',t.id); m.set('name',t.name); yTabs.push([m]); });
    });
  }

  function startRename(tab) { setRenamingId(tab.id); setRenameText(tab.name); }
  function commitRename(id) {
    const name = renameText.trim();
    if (name) { const tab=yTabs?.toArray().find(m=>m.get('id')===id); if(tab) tab.set('name',name); }
    setRenamingId(null);
  }

  return (
    <div
      ref={panelRef}
      className={`notes-panel${collapsed ? ' notes-panel--collapsed' : ''}`}
      style={collapsed ? undefined : { width: panelWidth }}
    >
      <div className="notes-resize-handle" onMouseDown={startResize} />
      <div className="notes-tabs">
        {!collapsed && tabs.map(tab => (
          <div key={tab.id}
            className={['notes-tab', activeTabId===tab.id?'notes-tab--active':'',
              dropTarget?.id===tab.id&&dropTarget.side==='left'?'notes-tab--drop-left':'',
              dropTarget?.id===tab.id&&dropTarget.side==='right'?'notes-tab--drop-right':'',
            ].filter(Boolean).join(' ')}
            draggable
            onClick={()=>setActiveTabId(tab.id)}
            onDoubleClick={()=>startRename(tab)}
            onDragStart={e=>{dragTabRef.current=tab.id;e.dataTransfer.effectAllowed='move';}}
            onDragOver={e=>{e.preventDefault();const rect=e.currentTarget.getBoundingClientRect();setDropTarget({id:tab.id,side:e.clientX<rect.left+rect.width/2?'left':'right'});}}
            onDragLeave={e=>{if(!e.currentTarget.contains(e.relatedTarget))setDropTarget(null);}}
            onDrop={e=>{e.preventDefault();const rect=e.currentTarget.getBoundingClientRect();reorderTabs(dragTabRef.current,tab.id,e.clientX<rect.left+rect.width/2?'left':'right');}}
            onDragEnd={()=>{dragTabRef.current=null;setDropTarget(null);}}>
            {renamingId===tab.id ? (
              <input autoFocus className="notes-tab__rename" value={renameText}
                onChange={e=>setRenameText(e.target.value)}
                onBlur={()=>commitRename(tab.id)}
                onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();commitRename(tab.id);}if(e.key==='Escape')setRenamingId(null);}}
                onClick={e=>e.stopPropagation()}/>
            ) : (
              <span className="notes-tab__name">{tab.name}</span>
            )}
            {tabs.length>1&&(
              <button className="notes-tab__delete"
                onClick={e=>{e.stopPropagation();deleteTab(tab.id);}} title="Delete tab">×</button>
            )}
          </div>
        ))}
        {!collapsed && (
          <button className="notes-tabs__add" onClick={addTab} disabled={tabs.length>=5}
            title={tabs.length>=5?'Max 5 tabs':'Add tab'}>+</button>
        )}
        <button className="notes-collapse-btn" onClick={() => {
          if (collapsed) setPanelWidth(Math.max(220, lastWidthRef.current));
          setCollapsed(o => !o);
        }} title={collapsed ? 'Expand notes' : 'Collapse notes'}>
          {collapsed ? '›' : '‹'}
        </button>
      </div>

      {!collapsed && (
        <div className="panel__body">
          {!doc || !provider ? (
            <div className="notes-connecting">Connecting...</div>
          ) : !activeTab ? (
            <div className="notes-connecting">Loading...</div>
          ) : (
            <UnifiedEditor key={activeTab.id} doc={doc} tabId={activeTab.id} synced={synced} exportRef={exportRef} provider={provider} displayName={displayName} myColor={myColor} />
          )}
        </div>
      )}
    </div>
  );
}

/* ── Name editor (user display name) ── */

function NameEditor({ displayName, setDisplayName }) {
  const [editing,setEditing] = useState(false);
  const [draft,setDraft]     = useState('');
  function commit() { setDisplayName(draft); setEditing(false); }
  if (editing) return (
    <input autoFocus className="name-editor__input" value={draft}
      onChange={e=>setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={e=>{if(e.key==='Enter')commit();if(e.key==='Escape')setEditing(false);}}/>
  );
  return (
    <button className="name-editor__btn" onClick={()=>{setDraft(displayName);setEditing(true);}}>
      {displayName}<span className="name-editor__pencil">✎</span>
    </button>
  );
}

/* ── Room name editor (DB-authoritative, Yjs for real-time sync) ── */

function RoomNameEditor({ doc, roomId, currentSlug, initialName, renameRef }) {
  const navigate = useNavigate();
  const [name,setName]       = useState(initialName);
  const [editing,setEditing] = useState(false);
  const [draft,setDraft]     = useState('');

  const yName = doc?.getText('roomName');
  const ySlug = doc?.getText('roomSlug');

  // Keep display in sync when another client renames
  useEffect(() => {
    if (!yName) return;
    const sync = () => { const n = yName.toString(); if (n) setName(n); };
    yName.observe(sync);
    sync();
    return () => yName.unobserve(sync);
  }, [yName]);

  // Expose latest startEdit to parent via ref
  useEffect(() => { if (renameRef) renameRef.current = () => { setDraft(name); setEditing(true); }; });

  // Navigate all connected clients when slug changes (handles both local and remote renames)
  useEffect(() => {
    if (!ySlug) return;
    const sync = () => {
      const s = ySlug.toString();
      if (s && s !== currentSlug) navigate(`/room/${s}`, { replace: true });
    };
    ySlug.observe(sync);
    return () => ySlug.unobserve(sync);
  }, [ySlug, currentSlug]);

  async function commit(newName) {
    const trimmed = newName.trim() || initialName;
    setEditing(false);
    setName(trimmed);
    if (yName) doc.transact(() => { yName.delete(0, yName.length); yName.insert(0, trimmed); });
    try {
      const res = await fetch(`/api/rooms/${roomId}/name`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      });
      if (!res.ok) return;
      const { slug } = await res.json();
      if (slug && ySlug) {
        doc.transact(() => { ySlug.delete(0, ySlug.length); ySlug.insert(0, slug); });
        // ySlug observer handles navigation for all clients including this one
      }
    } catch {}
  }

  if (editing) return (
    <input autoFocus className="room-name__input" value={draft}
      onChange={e=>setDraft(e.target.value)}
      onBlur={()=>commit(draft)}
      onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();commit(draft);}if(e.key==='Escape')setEditing(false);}}/>
  );

  return (
    <div className="room-name" onClick={()=>{setDraft(name);setEditing(true);}} title="Click to rename">
      <span>{name}</span><span className="room-name__pencil">✎</span>
    </div>
  );
}

/* ── Delete modal ── */

function LeaveModal({ onConfirm, onCancel }) {
  return (
    <div className="modal-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="modal">
        <div className="modal__titlebar">← LEAVE ROOM</div>
        <div className="modal__body">
          <p className="modal__warning">
            You'll lose access to this room and all its notes unless you rejoin with the room link.
          </p>
          <div className="modal__actions">
            <button className="modal__btn" onClick={onCancel}>Cancel</button>
            <button className="modal__btn modal__btn--danger" onClick={onConfirm}>Leave Room</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function DeleteModal({ roomName, onConfirm, onCancel }) {
  const [typed, setTyped] = useState('');
  const expected = `delete ${roomName}`;
  const matches  = typed.trim().toLowerCase() === expected.toLowerCase();

  return (
    <div className="modal-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="modal">
        <div className="modal__titlebar">⚠ DELETE ROOM</div>
        <div className="modal__body">
          <p className="modal__warning">
            This will permanently delete <strong>{roomName}</strong> and all its data for everyone.
          </p>
          <p className="modal__prompt">
            Type <span className="modal__code">delete {roomName}</span> to confirm:
          </p>
          <input
            className="modal__input"
            value={typed}
            onChange={e => setTyped(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && matches) onConfirm(); if (e.key === 'Escape') onCancel(); }}
            autoFocus
            spellCheck={false}
          />
          <div className="modal__actions">
            <button className="modal__btn" onClick={onCancel}>Cancel</button>
            <button className="modal__btn modal__btn--danger" onClick={onConfirm} disabled={!matches}>
              Delete Room
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function RoomMenu({ onCopyLink, onExportIcs, onExportTxt, onRename, onLeave, onDelete }) {
  const [open,   setOpen]   = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const close = e => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  function handleCopyLink() {
    onCopyLink();
    setCopied(true);
    setTimeout(() => { setCopied(false); setOpen(false); }, 1500);
  }

  return (
    <div className="room-menu" ref={ref}>
      <button className="room-menu__trigger" onClick={() => setOpen(o => !o)} title="Room options">···</button>
      {open && (
        <div className="room-menu__dropdown">
          <button className="room-menu__item" onClick={handleCopyLink}>
            {copied ? '✓ Copied!' : '⎘ Copy Link'}
          </button>
          <button className="room-menu__item" onClick={() => { setOpen(false); onExportIcs(); }}>
            ↓ Export .ICS
          </button>
          <button className="room-menu__item" onClick={() => { setOpen(false); onExportTxt?.(); }}>
            ↓ Export .TXT
          </button>
          <button className="room-menu__item" onClick={() => { setOpen(false); onRename(); }}>
            ✎ Rename Room
          </button>
          <div className="room-menu__divider"/>
          <button className="room-menu__item" onClick={() => { setOpen(false); onLeave(); }}>
            ← Leave Room
          </button>
          <button className="room-menu__item room-menu__item--danger" onClick={() => { setOpen(false); onDelete(); }}>
            ✕ Delete Room
          </button>
        </div>
      )}
    </div>
  );
}

/* ── Room content ── */

function RoomContent({ roomId, currentSlug, initialName }) {
  const { status, users, cursors, editorCursors, doc, synced, displayName, setDisplayName, myColor, setCursor, setEditorCursor, wsProvider } = useYjs(roomId);
  const navigate = useNavigate();
  const [online, setOnline] = useState(navigator.onLine);
  const calendarRef = useRef(null);
  const throttleRef = useRef(0);
  const icsRef      = useRef(null);
  const renameRef   = useRef(null);
  const txtRef      = useRef(null);
  const menuRef     = useRef(null);

  const [menuOpen,    setMenuOpen]    = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameInput,   setNameInput]   = useState('');

  useEffect(() => {
    const on  = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online',  on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  const handleCalendarMouseMove = useCallback((e) => {
    const now = Date.now();
    if (now - throttleRef.current < 30) return;
    throttleRef.current = now;
    const rect = calendarRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setCursor(x, y);
  }, [setCursor]);

  const handleCalendarMouseLeave = useCallback(() => {
    setCursor(null, null);
  }, [setCursor]);

  // Observe the __meta map: any client that sets deleted=true causes all
  // connected clients (including the deleter) to navigate home.
  useEffect(() => {
    if (!doc) return;
    const meta = doc.getMap('__meta');
    const check = () => {
      if (meta.get('deleted')) navigate('/', { state: { deletedRoom: true } });
    };
    meta.observe(check);
    return () => meta.unobserve(check);
  }, [doc, navigate]);

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteRoomName,  setDeleteRoomName]  = useState('');
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);

  function handleLeave() { setLeaveConfirmOpen(true); }
  function confirmLeave() { navigate('/'); }

  function handleCopyLink() {
    navigator.clipboard.writeText(window.location.href).catch(() => {});
  }

  function openDeleteModal() {
    const name = doc?.getText('roomName').toString() || initialName || currentSlug;
    setDeleteRoomName(name);
    setDeleteModalOpen(true);
  }

  function confirmDeleteRoom() {
    setDeleteModalOpen(false);
    fetch(`/api/rooms/${roomId}`, { method: 'DELETE', keepalive: true }).catch(() => {});
    if (doc) { try { doc.getMap('__meta').set('deleted', true); } catch {} }
  }

  // Menu close on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const close = e => {
      if (!menuRef.current?.contains(e.target)) { setMenuOpen(false); setEditingName(false); }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menuOpen]);

  function saveName() {
    const t = nameInput.trim();
    if (t) setDisplayName(t);
    setEditingName(false);
    setMenuOpen(false);
  }

  const effective   = !online ? 'disconnected' : status;
  const dotColor    = effective === 'connected' ? '#22c55e' : effective === 'connecting' ? '#f59e0b' : '#ef4444';
  const statusLabel = effective === 'connected' ? 'Connected' : effective === 'connecting' ? 'Reconnecting...' : 'Offline';

  return (
    <div className="room-shell">
      <div className="room">

        {/* Header */}
        <div className="header">
          <div className="header__left">
            <span className="header__logo">PlannerPad</span>
            <div className="header__divider" />
            <RoomNameEditor doc={doc} roomId={roomId} currentSlug={currentSlug} initialName={initialName || currentSlug} renameRef={renameRef}/>
          </div>
          <div className="header__right">
            <UserList users={users}/>
            <div className="hbtn" ref={menuRef}>
              <button className="hbtn__trigger" onClick={() => setMenuOpen(o => !o)}>
                <span className="hbtn__status">
                  <span className="hbtn__dot" style={{ background: dotColor }} />
                  <span className="hbtn__label">{statusLabel}</span>
                </span>
                <span className="hbtn__sep" />
                <span className="hbtn__dots">···</span>
              </button>
              {menuOpen && (
                <div className="hbtn__dropdown">
                  {editingName ? (
                    <div className="hbtn__name-edit">
                      <div className="hbtn__name-label">CHANGE NAME</div>
                      <input
                        autoFocus
                        className="hbtn__name-input"
                        value={nameInput}
                        onChange={e => setNameInput(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') setEditingName(false); }}
                      />
                      <div className="hbtn__name-actions">
                        <button className="hbtn__name-save" onClick={saveName}>Save</button>
                        <button className="hbtn__name-cancel" onClick={() => setEditingName(false)}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <button className="hbtn__item" onClick={() => { setNameInput(displayName); setEditingName(true); }}>Change name</button>
                  )}
                  <div className="hbtn__divider" />
                  <button className="hbtn__item" onClick={() => { handleCopyLink(); setMenuOpen(false); }}>Copy room link</button>
                  <button className="hbtn__item" onClick={() => { setMenuOpen(false); icsRef.current?.(); }}>Export .ICS</button>
                  <button className="hbtn__item" onClick={() => { setMenuOpen(false); txtRef.current?.('txt'); }}>Export .TXT</button>
                  <div className="hbtn__divider" />
                  <button className="hbtn__item" onClick={() => { setMenuOpen(false); renameRef.current?.(); }}>Rename room</button>
                  <button className="hbtn__item" onClick={() => { setMenuOpen(false); handleLeave(); }}>Leave room</button>
                  <button className="hbtn__item hbtn__item--danger" onClick={() => { setMenuOpen(false); openDeleteModal(); }}>Delete room</button>
                </div>
              )}
            </div>
          </div>
        </div>

        <OfflineBanner status={status}/>

        {/* Panels */}
        <div className="panels">
          <div className="cal-panel"
            ref={calendarRef}
            onMouseMove={handleCalendarMouseMove}
            onMouseLeave={handleCalendarMouseLeave}
          >
            {doc ? <CalendarPanel doc={doc} slug={currentSlug} setCursor={setCursor} exportRef={icsRef}/> : <div className="notes-connecting">Connecting...</div>}
            <CursorOverlay cursors={cursors}/>
          </div>
          <NotesPanel doc={doc} synced={synced} editorCursors={editorCursors} setEditorCursor={setEditorCursor} exportRef={txtRef} provider={wsProvider} displayName={displayName} myColor={myColor}/>
        </div>
      </div>
      {leaveConfirmOpen && (
        <LeaveModal
          onConfirm={confirmLeave}
          onCancel={() => setLeaveConfirmOpen(false)}
        />
      )}
      {deleteModalOpen && (
        <DeleteModal
          roomName={deleteRoomName}
          onConfirm={confirmDeleteRoom}
          onCancel={() => setDeleteModalOpen(false)}
        />
      )}
    </div>
  );
}

/* ── Loading screen ── */

function LoadingScreen() {
  return (
    <div className="loading-screen">
      <div className="loading-screen__label">Loading room...</div>
      <div className="loading-screen__bar"><div className="loading-screen__bar-fill"/></div>
    </div>
  );
}

/* ── Route entry point ── */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function RoomScreen() {
  const { roomId: identifier } = useParams();
  const navigate = useNavigate();
  const [roomState, setRoomState] = useState('checking');
  const [roomData,  setRoomData]  = useState(null);

  useEffect(() => {
    if (!identifier) { setRoomState('not-found'); return; }
    setRoomState('checking');
    let cancelled = false;

    if (UUID_RE.test(identifier)) {
      fetch(`/api/rooms/${identifier}`)
        .then(r=>r.json())
        .then(data => {
          if (cancelled) return;
          if (!data.exists) { setRoomState('not-found'); return; }
          navigate(`/room/${data.slug}`, { replace:true });
        })
        .catch(()=>{ if(!cancelled) setRoomState('not-found'); });
    } else {
      fetch(`/api/rooms/by-slug/${identifier}`)
        .then(r=>{ if(!r.ok){setRoomState('not-found');return null;} return r.json(); })
        .then(data=>{ if(cancelled||!data) return; setRoomData({roomId:data.roomId,slug:identifier,name:data.name}); setRoomState('ready'); })
        .catch(()=>{ if(!cancelled) setRoomState('not-found'); });
    }
    return () => { cancelled = true; };
  }, [identifier]);

  if (roomState==='checking' && !roomData) return <LoadingScreen/>;
  if (roomState==='not-found') return <ErrorScreen roomId={identifier}/>;
  if (!roomData) return <LoadingScreen/>;

  return <RoomContent key={roomData.roomId} roomId={roomData.roomId} currentSlug={identifier} initialName={roomData.name}/>;
}
