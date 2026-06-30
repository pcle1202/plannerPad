import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import * as Y from 'yjs';
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

/* ── Remote editor cursors (inside the note) ── */

function RemoteEditorCursors({ editorRef, cursors, domVersion }) {
  const [rects, setRects] = useState([]);

  // Recompute positions when cursor data changes OR when editor content changes (domVersion)
  useEffect(() => {
    const el = editorRef.current;
    if (!el || !cursors.length) { setRects([]); return; }
    const box = el.getBoundingClientRect();
    const next = cursors.map(c => {
      const r = getCaretRect(el, c.offset);
      if (!r || !r.height) return null;
      return { clientId: c.clientId, name: c.name, color: c.color,
        x: Math.round(r.left - box.left), y: Math.round(r.top - box.top), h: Math.round(r.height) };
    }).filter(Boolean);
    setRects(next);
  }, [cursors, domVersion]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!rects.length) return null;
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden', zIndex: 5 }}>
      {rects.map(p => (
        <div key={p.clientId} style={{
          position: 'absolute', left: p.x, top: p.y,
          width: 2, height: p.h, background: p.color, pointerEvents: 'none',
        }}>
          <div style={{
            position: 'absolute', bottom: '100%', left: 0,
            fontFamily: "'Nunito', sans-serif", fontSize: '10px', fontWeight: 700, lineHeight: 1.4,
            background: p.color, color: hexBrightness(p.color) > 128 ? '#111' : '#fff',
            padding: '1px 4px', borderRadius: '2px 2px 2px 0', whiteSpace: 'nowrap',
          }}>
            {p.name}
          </div>
        </div>
      ))}
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

function injectDragHandles(el) {
  // Checklist items: drag handle (left) + checkbox
  el.querySelectorAll('.ck-item').forEach(li => {
    if (!li.querySelector('.ck-drag')) {
      const handle = document.createElement('span');
      handle.className = 'ck-drag';
      handle.contentEditable = 'false';
      handle.setAttribute('aria-hidden', 'true');
      handle.draggable = true;
      handle.textContent = '⠿';
      li.insertBefore(handle, li.firstChild);
    }
    if (!li.querySelector('.ck-box')) {
      const box = document.createElement('span');
      box.className = 'ck-box';
      box.contentEditable = 'false';
      const handle = li.querySelector('.ck-drag');
      li.insertBefore(box, handle ? handle.nextSibling : li.firstChild);
    }
  });
  // Bullet and numbered list items: drag handle at end (right side)
  el.querySelectorAll('ul:not(.ck) > li, ol > li').forEach(li => {
    if (!li.querySelector('.ck-drag')) {
      const handle = document.createElement('span');
      handle.className = 'ck-drag';
      handle.contentEditable = 'false';
      handle.setAttribute('aria-hidden', 'true');
      handle.draggable = true;
      handle.textContent = '⠿';
      li.appendChild(handle);
    }
  });
}

function getCleanHtml(el) {
  const clone = el.cloneNode(true);
  clone.querySelectorAll('.ck-drag, .ck-box').forEach(n => n.remove());
  // Normalize browser-generated presentational tags to semantic equivalents so
  // yXml stores consistent HTML that matches the explicit CSS rules, and so
  // remote users always receive <strong>/<em> which are explicitly styled.
  clone.querySelectorAll('b').forEach(b => {
    const s = document.createElement('strong');
    while (b.firstChild) s.appendChild(b.firstChild);
    b.replaceWith(s);
  });
  clone.querySelectorAll('i').forEach(i => {
    const em = document.createElement('em');
    while (i.firstChild) em.appendChild(i.firstChild);
    i.replaceWith(em);
  });
  return clone.innerHTML;
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

function htmlToMarkdown(html) {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  function walk(n) {
    if (n.nodeType===3) return n.textContent;
    if (n.nodeType!==1) return '';
    const tag = n.tagName.toLowerCase();
    const kids = [...n.childNodes].map(walk).join('');
    switch (tag) {
      case 'h1': return `# ${kids}\n\n`;
      case 'h2': return `## ${kids}\n\n`;
      case 'h3': return `### ${kids}\n\n`;
      case 'p':  return kids ? kids+'\n\n' : '';
      case 'br': return '\n';
      case 'strong': case 'b': return `**${kids}**`;
      case 'em':     case 'i': return `*${kids}*`;
      case 'u':    return `__${kids}__`;
      case 's':    return `~~${kids}~~`;
      case 'ul': {
        return [...n.querySelectorAll(':scope > li')].map(li => {
          const t = [...li.childNodes].map(walk).join('');
          return li.classList.contains('ck-item')
            ? `- [${li.dataset.checked==='true'?'x':' '}] ${t}\n`
            : `- ${t}\n`;
        }).join('')+'\n';
      }
      case 'ol': return [...n.querySelectorAll(':scope > li')].map((li,i)=>`${i+1}. ${[...li.childNodes].map(walk).join('')}\n`).join('')+'\n';
      case 'li':  return kids;
      case 'img': return `![image]()\n`;
      case 'div': return kids+'\n';
      default:    return kids;
    }
  }
  return [...tmp.childNodes].map(walk).join('').replace(/\n{3,}/g,'\n\n').trim();
}

/* ── Cursor helpers ── */

const SKIP_NON_EDITABLE = { acceptNode: n => n.contentEditable === 'false' ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT };

function saveCaretPos(root) {
  const sel = window.getSelection();
  if (!sel||!sel.rangeCount||!root.contains(sel.getRangeAt(0).startContainer)) return null;
  const range = sel.getRangeAt(0);
  let chars = 0;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT|NodeFilter.SHOW_ELEMENT, SKIP_NON_EDITABLE);
  let node;
  while ((node=walker.nextNode())) {
    if (node.nodeType===1) {
      if (node.nodeName==='BR') { if(node===range.startContainer) return chars; chars++; }
      else if (node===range.startContainer) return chars; // cursor at start of a block element (e.g. new paragraph after Enter)
      continue;
    }
    if (node===range.startContainer) return chars+range.startOffset;
    chars += node.length;
  }
  return chars;
}

function restoreCaretPos(root, target) {
  if (target===null) return;
  let chars = 0;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT|NodeFilter.SHOW_ELEMENT, SKIP_NON_EDITABLE);
  let node;
  while ((node=walker.nextNode())) {
    if (node.nodeType===1) {
      if (node.nodeName==='BR') {
        if (chars===target) { const r=document.createRange(); r.setStartBefore(node); r.collapse(true); const s=window.getSelection(); s.removeAllRanges(); s.addRange(r); return; }
        chars++;
      }
      continue;
    }
    if (chars+node.length>=target) {
      const r=document.createRange(); r.setStart(node,target-chars); r.collapse(true);
      const s=window.getSelection(); s.removeAllRanges(); s.addRange(r); return;
    }
    chars += node.length;
  }
  const r=document.createRange(); r.selectNodeContents(root); r.collapse(false);
  const s=window.getSelection(); s.removeAllRanges(); s.addRange(r);
}

// Convert character offset back to a viewport DOMRect (for remote cursor rendering)
function getCaretRect(root, offset) {
  let chars = 0;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, SKIP_NON_EDITABLE);
  let node;
  while ((node = walker.nextNode())) {
    if (node.nodeType === 1) {
      if (node.nodeName === 'BR') {
        if (chars === offset) {
          const r = document.createRange(); r.setStartBefore(node); r.collapse(true);
          return r.getBoundingClientRect();
        }
        chars++;
      }
      continue;
    }
    if (chars + node.length >= offset) {
      const r = document.createRange(); r.setStart(node, offset - chars); r.collapse(true);
      return r.getBoundingClientRect();
    }
    chars += node.length;
  }
  const r = document.createRange(); r.selectNodeContents(root); r.collapse(false);
  return r.getBoundingClientRect();
}

// Returns the visible text content of `root` as a string where each text
// character maps to one index and each <br> maps to '\x00'. This matches the
// character-counting scheme used by saveCaretPos / restoreCaretPos, letting us
// compare old vs new DOM text to compute remote-insertion cursor adjustments.
function getDomTextRepr(root) {
  let result = '';
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, SKIP_NON_EDITABLE);
  let node;
  while ((node = walker.nextNode())) {
    if (node.nodeType === 1) {
      if (node.nodeName === 'BR') result += '\x00';
    } else {
      result += node.textContent;
    }
  }
  return result;
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

/* ── Unified editor ── */

function UnifiedEditor({ doc, tabId, synced, editorCursors, setEditorCursor, exportRef }) {
  const editorRef       = useRef(null);
  const isApplying      = useRef(false);
  const undoMgrRef      = useRef(null);
  const dragStateRef    = useRef(null);
  const syncFnRef       = useRef(null);

  const [activeFormats, setActiveFormats] = useState({});
  const [activeStyle,   setActiveStyle]   = useState('p');
  const [wordCount,     setWordCount]     = useState({ words:0, chars:0 });
  const [canUndo,       setCanUndo]       = useState(false);
  const [canRedo,       setCanRedo]       = useState(false);
  const [domVersion,    setDomVersion]    = useState(0);

  const [activeList,   setActiveList]  = useState(null);

  const yXml = doc.getText(`tab-xml-${tabId}`);

  /* ── Undo manager ── */
  useEffect(() => {
    const mgr = new Y.UndoManager(yXml);
    undoMgrRef.current = mgr;
    const upd = () => { setCanUndo(mgr.undoStack.length>0); setCanRedo(mgr.redoStack.length>0); };
    mgr.on('stack-item-added', upd);
    mgr.on('stack-item-popped', upd);
    return () => { mgr.off('stack-item-added',upd); mgr.off('stack-item-popped',upd); mgr.destroy(); };
  }, [yXml]);

  /* ── Migrate old data on first sync ── */
  useEffect(() => {
    if (!synced || yXml.length > 0) return;
    const yArray   = doc.getArray(`tab-list-${tabId}`);
    const yOldText = doc.getText(`tab-text-${tabId}`);

    if (yArray.length > 0) {
      const items = yArray.toArray().map(m => ({ text:m.get('text')||'', checked:!!m.get('checked') }));
      const html = `<ul class="ck">${items.map(i =>
        `<li class="ck-item"${i.checked?' data-checked="true"':''}>${escHtml(i.text)||'<br>'}</li>`
      ).join('')}</ul>`;
      doc.transact(() => { yXml.insert(0, html); });
      return;
    }
    if (yOldText.length > 0) {
      const html = legacyDeltaToHtml(yOldText.toDelta());
      if (html) doc.transact(() => { yXml.insert(0, html); });
    }
  }, [synced, tabId]);

  /* ── Yjs → DOM ── */
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    if (yXml.length > 0) {
      el.innerHTML = yXml.toString();
      injectDragHandles(el);
    }
    updateStats();

    const observer = () => {
      if (isApplying.current) return;
      const hasFocus = document.activeElement === el;
      let savedOffset = hasFocus ? saveCaretPos(el) : null;

      isApplying.current = true;

      if (hasFocus && savedOffset !== null) {
        // Capture the old visible-text representation while the DOM still has
        // pre-change content, then apply the remote update, then compare to
        // find how many characters were inserted/deleted before the cursor.
        const oldRepr = getDomTextRepr(el);
        el.innerHTML = yXml.toString() || '';
        injectDragHandles(el);
        const newRepr = getDomTextRepr(el);

        // Compute common prefix and suffix of the two text representations.
        let pre = 0;
        const minLen = Math.min(oldRepr.length, newRepr.length);
        while (pre < minLen && oldRepr[pre] === newRepr[pre]) pre++;
        let suf = 0;
        while (
          suf < oldRepr.length - pre &&
          suf < newRepr.length - pre &&
          oldRepr[oldRepr.length - 1 - suf] === newRepr[newRepr.length - 1 - suf]
        ) suf++;

        const oldEnd = oldRepr.length - suf; // end of changed region in old text
        const newEnd = newRepr.length - suf; // end of changed region in new text

        if (savedOffset <= pre) {
          // Cursor is before the change — no adjustment needed.
        } else if (savedOffset >= oldEnd) {
          // Cursor is after the change — shift by the net character delta.
          savedOffset = Math.max(pre, savedOffset + (newRepr.length - oldRepr.length));
        } else {
          // Cursor is inside the changed region — place it at the end of the
          // inserted content so it doesn't land in the middle of new markup.
          savedOffset = newEnd;
        }
      } else {
        el.innerHTML = yXml.toString() || '';
        injectDragHandles(el);
      }

      isApplying.current = false;
      if (hasFocus && savedOffset !== null) {
        // Chrome drops the selection (but not focus) when innerHTML is replaced.
        // Restore the range directly — calling el.focus() here would reset the
        // blink timer and cause a visible cursor flash on every remote keystroke.
        restoreCaretPos(el, savedOffset);
      }
      updateStats();
      setDomVersion(v => v + 1);
    };
    yXml.observe(observer);
    return () => yXml.unobserve(observer);
  }, [yXml]);

  /* ── Broadcast selection as editor cursor via awareness (100ms throttle) ── */
  useEffect(() => {
    const el = editorRef.current;
    if (!el || !setEditorCursor) return;
    let last = 0;
    const onSelection = () => {
      const now = Date.now();
      if (now - last < 100) return;
      last = now;
      const sel = window.getSelection();
      if (!sel?.rangeCount) return;
      if (!el.contains(sel.getRangeAt(0).startContainer)) return;
      const offset = saveCaretPos(el);
      if (offset !== null) setEditorCursor(tabId, offset);
    };
    document.addEventListener('selectionchange', onSelection);
    return () => document.removeEventListener('selectionchange', onSelection);
  }, [tabId, setEditorCursor]);

  /* ── DOM → Yjs ── */
  function syncToYjs() {
    const el = editorRef.current;
    if (!el) return;
    isApplying.current = true;
    const html    = getCleanHtml(el);
    const current = yXml.toString();
    if (html !== current) {
      // Minimal diff: find common prefix + suffix, only replace the changed middle.
      // This lets Yjs CRDT merge concurrent character-level edits correctly instead
      // of concatenating two full-document replacements.
      let pre = 0;
      const minLen = Math.min(html.length, current.length);
      while (pre < minLen && html[pre] === current[pre]) pre++;
      let suf = 0;
      while (suf < html.length - pre && suf < current.length - pre &&
             html[html.length - 1 - suf] === current[current.length - 1 - suf]) suf++;
      const delLen = current.length - pre - suf;
      const ins    = html.slice(pre, html.length - suf);
      doc.transact(() => {
        if (delLen > 0) yXml.delete(pre, delLen);
        if (ins)        yXml.insert(pre, ins);
      });
    }
    // Keep isApplying = true during injectDragHandles: DOM mutations there fire
    // native `input` events in Chrome which would re-enter handleInput unnecessarily.
    injectDragHandles(el);
    isApplying.current = false;
    updateStats();
    setDomVersion(v => v + 1);
  }
  syncFnRef.current = syncToYjs;

  function updateStats() {
    const el = editorRef.current;
    if (!el) return;
    const text = el.innerText || '';
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    setWordCount({ words, chars: text.replace(/\s/g,'').length });
  }

  function updateActiveFormats() {
    setActiveFormats({
      bold:      document.queryCommandState('bold'),
      italic:    document.queryCommandState('italic'),
      underline: document.queryCommandState('underline'),
      strike:    document.queryCommandState('strikethrough'),
    });
    const raw = document.queryCommandValue('formatBlock').toLowerCase();
    setActiveStyle(['h1','h2','h3','pre'].includes(raw) ? raw : 'p');

    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      const node = sel.getRangeAt(0).startContainer;
      const el = node.nodeType === 3 ? node.parentElement : node;
      if (el?.closest?.('.ck-item')) setActiveList('checklist');
      else if (el?.closest?.('ol'))  setActiveList('numbered');
      else if (el?.closest?.('ul'))  setActiveList('bullet');
      else                           setActiveList(null);
    } else {
      setActiveList(null);
    }
  }

  /* ── Formatting actions ── */

  function toggleFormat(fmt) {
    const cmd = { bold:'bold', italic:'italic', underline:'underline', strike:'strikethrough' }[fmt];
    // Ensure execCommand produces semantic tags (<strong>, <em>) rather than
    // CSS spans (<span style="font-weight:bold">), which varies by browser.
    document.execCommand('styleWithCSS', false, false);
    document.execCommand(cmd, false, null);
    syncToYjs();
    updateActiveFormats();
  }

  function applyStyle(tag) {
    editorRef.current?.focus();
    document.execCommand('formatBlock', false, tag);
    syncToYjs();
    updateActiveFormats();
  }

  function exitCkItem(li) {
    const clone = li.cloneNode(true);
    clone.querySelectorAll('.ck-drag,.ck-box').forEach(n => n.remove());
    const p = document.createElement('p');
    p.innerHTML = clone.innerHTML || '<br>';
    const list = li.parentElement;
    list.after(p);
    li.remove();
    if (!list.querySelector('li')) list.remove();
    const r = document.createRange(); r.setStart(p, 0); r.collapse(true);
    const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
  }

  // When a non-collapsed selection spans any list content, first normalize everything
  // back to plain paragraphs. Returns true if normalization happened (caller should
  // return early so the user clicks a second time to apply the target list type).
  function normalizeSelectedListsIfNeeded() {
    const editor = editorRef.current;
    const sel = window.getSelection();
    if (!editor || !sel || !sel.rangeCount || sel.isCollapsed) return false;
    const range = sel.getRangeAt(0);
    const affectedLis = [...editor.querySelectorAll('li')].filter(li => range.intersectsNode(li));
    if (affectedLis.length === 0) return false;

    affectedLis.forEach(li => {
      const clone = li.cloneNode(true);
      clone.querySelectorAll('.ck-drag,.ck-box').forEach(n => n.remove());
      const p = document.createElement('p');
      p.innerHTML = clone.innerHTML || '<br>';
      li.replaceWith(p);
    });
    editor.querySelectorAll('ul,ol').forEach(list => {
      if (!list.querySelector('li')) list.remove();
    });
    syncToYjs(); updateActiveFormats();
    return true;
  }

  function insertBulletList() {
    if (normalizeSelectedListsIfNeeded()) return;
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    const node = sel.getRangeAt(0).startContainer;
    const el = node.nodeType === 3 ? node.parentElement : node;
    const ckLi = el?.closest?.('.ck-item');
    if (ckLi) exitCkItem(ckLi);
    document.execCommand('insertUnorderedList', false, null);
    syncToYjs(); updateActiveFormats();
  }

  function insertNumberedList() {
    if (normalizeSelectedListsIfNeeded()) return;
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    const node = sel.getRangeAt(0).startContainer;
    const el = node.nodeType === 3 ? node.parentElement : node;
    const ckLi = el?.closest?.('.ck-item');
    if (ckLi) exitCkItem(ckLi);
    document.execCommand('insertOrderedList', false, null);
    syncToYjs(); updateActiveFormats();
  }

  function insertCheckboxList() {
    if (normalizeSelectedListsIfNeeded()) return;
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    const node = sel.getRangeAt(0).startContainer;
    const el = node.nodeType === 3 ? node.parentElement : node;

    // Toggle off if already a checklist item
    const ckLi = el?.closest?.('.ck-item');
    if (ckLi) { exitCkItem(ckLi); syncToYjs(); updateActiveFormats(); return; }

    // If in a plain ul/ol, toggle it off first so the next execCommand creates fresh
    if (el?.closest?.('ul:not(.ck)')) document.execCommand('insertUnorderedList', false, null);
    else if (el?.closest?.('ol'))     document.execCommand('insertOrderedList',   false, null);

    // Use execCommand to create <ul><li> — preserves text, handles bare nodes & selections
    document.execCommand('insertUnorderedList', false, null);

    // Post-process: stamp the created <ul><li> with ck class names
    // and capture a reference to the active <li> so we can restore cursor after sync
    let targetLi = null;
    const sel2 = window.getSelection();
    if (sel2 && sel2.rangeCount) {
      const n2 = sel2.getRangeAt(0).startContainer;
      const e2 = n2.nodeType === 3 ? n2.parentElement : n2;
      const ul = e2?.closest?.('ul');
      if (ul && !ul.classList.contains('ck')) {
        ul.classList.add('ck');
        ul.querySelectorAll('li').forEach(item => {
          item.className = 'ck-item';
          item.dataset.checked = 'false';
        });
        targetLi = e2?.closest?.('li') || ul.lastElementChild;
      }
    }

    syncToYjs(); updateActiveFormats();

    // syncToYjs calls injectDragHandles which prepends .ck-drag/.ck-box spans,
    // shifting the cursor to the start. Explicitly restore it to end of text content.
    if (targetLi) {
      editorRef.current?.focus();
      // Walk backward past any trailing injected spans to find the last real content node
      let lastContent = null;
      for (let i = targetLi.childNodes.length - 1; i >= 0; i--) {
        const n = targetLi.childNodes[i];
        if (!(n instanceof Element && (n.classList.contains('ck-drag') || n.classList.contains('ck-box')))) {
          lastContent = n; break;
        }
      }
      const r = document.createRange();
      if (lastContent?.nodeType === 3) {
        r.setStart(lastContent, lastContent.textContent.length);
      } else if (lastContent?.nodeName === 'BR') {
        r.setStartBefore(lastContent);
      } else if (lastContent) {
        r.setStartAfter(lastContent);
      } else {
        r.selectNodeContents(targetLi); r.collapse(false);
      }
      r.collapse(true);
      window.getSelection()?.removeAllRanges();
      window.getSelection()?.addRange(r);
    }
  }

  /* ── Undo / Redo ── */

  function undo() {
    const mgr = undoMgrRef.current;
    if (!mgr || mgr.undoStack.length === 0) return;
    isApplying.current = true;
    mgr.undo();
    if (editorRef.current) { editorRef.current.innerHTML = yXml.toString()||''; injectDragHandles(editorRef.current); }
    isApplying.current = false;
    if (editorRef.current) updateStats();
    setDomVersion(v => v + 1);
    setCanUndo(mgr.undoStack.length>0); setCanRedo(mgr.redoStack.length>0);
  }

  function redo() {
    const mgr = undoMgrRef.current;
    if (!mgr || mgr.redoStack.length === 0) return;
    isApplying.current = true;
    mgr.redo();
    if (editorRef.current) { editorRef.current.innerHTML = yXml.toString()||''; injectDragHandles(editorRef.current); }
    isApplying.current = false;
    if (editorRef.current) updateStats();
    setDomVersion(v => v + 1);
    setCanUndo(mgr.undoStack.length>0); setCanRedo(mgr.redoStack.length>0);
  }

  /* ── Image insertion ── */

  function insertImageFile(file) {
    if (file.size > 500 * 1024) {
      alert('Image too large (max 500 KB). Please use a smaller image.');
      return;
    }
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
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        editorRef.current?.focus();
        document.execCommand('insertHTML', false, `<img class="editor-img" src="${dataUrl}"><br>`);
        syncToYjs();
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  }

  /* ── Export ── */

  function handleExport(fmt) {
    const el = editorRef.current;
    if (!el) return;
    const cleanHtml = getCleanHtml(el);
    let content;
    if (fmt === 'md') {
      content = htmlToMarkdown(cleanHtml);
    } else {
      const tmp = document.createElement('div');
      tmp.innerHTML = cleanHtml;
      content = tmp.innerText;
    }
    const blob = new Blob([content], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `notes.${fmt}`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // Expose latest handleExport to parent via ref (stays fresh with closure over editorRef)
  useEffect(() => { if (exportRef) exportRef.current = handleExport; });

  /* ── Event handlers ── */

  const handleInput = useCallback(() => {
    // Bail out if we're the source of the DOM change (e.g. injectDragHandles firing
    // a native `input` event on the contentEditable in Chrome).
    if (isApplying.current) return;
    syncToYjs();
    updateActiveFormats();
  }, [yXml]);

  function handleKeyDown(e) {
    const mod = e.metaKey || e.ctrlKey;

    // Inline formats
    if (mod && !e.shiftKey && e.key==='b') { e.preventDefault(); toggleFormat('bold'); return; }
    if (mod && !e.shiftKey && e.key==='i') { e.preventDefault(); toggleFormat('italic'); return; }
    if (mod && !e.shiftKey && e.key==='u') { e.preventDefault(); toggleFormat('underline'); return; }
    if (mod && e.shiftKey && (e.key==='x'||e.key==='X')) { e.preventDefault(); toggleFormat('strike'); return; }

    // Block styles: Cmd+Alt+1/2/3
    if (mod && e.altKey) {
      if (e.key==='1') { e.preventDefault(); applyStyle('h1'); return; }
      if (e.key==='2') { e.preventDefault(); applyStyle('h2'); return; }
      if (e.key==='3') { e.preventDefault(); applyStyle('p');  return; }
    }

    // Checkbox list: Cmd+Shift+L
    if (mod && e.shiftKey && (e.key==='l'||e.key==='L')) { e.preventDefault(); insertCheckboxList(); return; }

    // Undo/Redo
    if (mod && !e.shiftKey && e.key==='z') { e.preventDefault(); undo(); return; }
    if (mod && e.shiftKey  && e.key==='z') { e.preventDefault(); redo(); return; }

    if (e.key==='Enter' && !e.shiftKey) {
      const sel = window.getSelection();
      if (!sel||!sel.rangeCount) return;
      const node = sel.getRangeAt(0).startContainer;
      const el = node.nodeType === 1 ? node : node.parentElement;

      // .ck-item: handle enter ourselves (create next item or exit)
      const ckLi = el?.closest?.('.ck-item');
      if (ckLi) {
        e.preventDefault();
        const liText = [...ckLi.childNodes]
          .filter(n => !(n instanceof Element && (n.classList.contains('ck-drag') || n.classList.contains('ck-box'))))
          .map(n => n.textContent).join('').trim();
        if (!liText) {
          const p = document.createElement('p'); p.innerHTML = '<br>';
          const list = ckLi.parentElement;
          list.after(p);
          ckLi.remove();
          if (!list.children.length) list.remove();
          syncToYjs();
          editorRef.current?.focus();
          const r = document.createRange(); r.setStart(p,0); r.collapse(true);
          window.getSelection().removeAllRanges(); window.getSelection().addRange(r);
        } else {
          const newLi = document.createElement('li');
          newLi.className = 'ck-item';
          newLi.dataset.checked = 'false';
          newLi.innerHTML = '<br>';
          ckLi.after(newLi);
          syncToYjs();
          editorRef.current?.focus();
          const br = newLi.querySelector('br');
          const r = document.createRange();
          if (br) { r.setStartBefore(br); } else { r.selectNodeContents(newLi); r.collapse(false); }
          r.collapse(true);
          window.getSelection().removeAllRanges(); window.getSelection().addRange(r);
        }
        return;
      }

      // ul/ol li: empty item → exit list to paragraph
      const ulLi = el?.closest?.('li');
      if (ulLi) {
        const ulLiText = [...ulLi.childNodes]
          .filter(n => !(n instanceof Element && (n.classList.contains('ck-drag') || n.classList.contains('ck-box'))))
          .map(n => n.textContent).join('').trim();
        if (!ulLiText) {
          e.preventDefault();
          const p = document.createElement('p'); p.innerHTML = '<br>';
          const list = ulLi.parentElement;
          list.after(p);
          ulLi.remove();
          if (!list.querySelector('li')) list.remove();
          syncToYjs();
          editorRef.current?.focus();
          const r = document.createRange(); r.setStart(p, 0); r.collapse(true);
          window.getSelection().removeAllRanges(); window.getSelection().addRange(r);
          return;
        }
        // Non-empty: browser creates next <li>, sync afterward
        requestAnimationFrame(() => { syncToYjs(); updateActiveFormats(); editorRef.current?.focus(); });
        return;
      }

      // Heading: browser creates another heading; convert it to body paragraph
      if (el?.closest?.('h1,h2,h3')) {
        requestAnimationFrame(() => {
          const s2 = window.getSelection();
          if (!s2 || !s2.rangeCount) return;
          const n2 = s2.getRangeAt(0).startContainer;
          const e2 = n2.nodeType === 1 ? n2 : n2.parentElement;
          if (e2?.closest?.('h1,h2,h3')) document.execCommand('formatBlock', false, 'p');
          syncToYjs(); updateActiveFormats();
        });
        return;
      }

      // Regular block: browser handles, just keep focus
      requestAnimationFrame(() => editorRef.current?.focus());
    }
  }

  function handleMouseDown(e) {
    // Checkbox toggle — detect click on .ck-box span
    const box = e.target instanceof Element ? e.target.closest('.ck-box') : null;
    if (box) {
      const li = box.closest('.ck-item');
      if (!li) return;
      e.preventDefault();
      li.dataset.checked = li.dataset.checked === 'true' ? 'false' : 'true';
      syncToYjs();
    }
  }

  function handleDragStart(e) {
    const handle = e.target instanceof Element ? e.target.closest('.ck-drag') : null;
    if (!handle) return;
    const li = handle.closest('li');
    if (!li) return;
    dragStateRef.current = { li };
    li.classList.add('ck-item--dragging');
    e.dataTransfer.effectAllowed = 'copyMove';
    // Text content excluding injected spans
    const text = [...li.childNodes]
      .filter(n => !(n instanceof Element && (n.classList.contains('ck-drag') || n.classList.contains('ck-box'))))
      .map(n => n.textContent).join('').trim();
    e.dataTransfer.setData('text/plain', 'ck-reorder');
    e.dataTransfer.setData('application/x-ck-item', text);
    e.dataTransfer.setData('application/json', JSON.stringify({ type: 'ck-item', text }));
    // Custom drag ghost: pill showing the item text
    const ghost = document.createElement('div');
    ghost.textContent = text || '•';
    ghost.style.cssText = [
      'position:fixed','top:-9999px','left:-9999px',
      'background:#F9A8D4','color:#1A0A0E',
      'font-family:Nunito,sans-serif','font-size:12px','font-weight:700',
      'padding:4px 10px','border-radius:3px','border:2px solid #1A0A0E',
      'box-shadow:2px 2px 0 #F472B6','white-space:nowrap',
      'max-width:200px','overflow:hidden','text-overflow:ellipsis',
      'pointer-events:none',
    ].join(';');
    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, 14, 14);
    requestAnimationFrame(() => document.body.removeChild(ghost));
  }

  function handleDragOver(e) {
    if (!dragStateRef.current) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const el = editorRef.current;
    if (!el) return;
    // Only show drop targets among siblings in the same parent list
    const parent = dragStateRef.current.li.parentElement;
    const siblings = parent ? [...parent.querySelectorAll(':scope > li')] : [];
    el.querySelectorAll('.ck-item--drop-above, .ck-item--drop-below')
      .forEach(li => li.classList.remove('ck-item--drop-above', 'ck-item--drop-below'));
    let found = false;
    for (const li of siblings) {
      if (li === dragStateRef.current.li) continue;
      const rect = li.getBoundingClientRect();
      if (e.clientY < rect.top + rect.height / 2) {
        li.classList.add('ck-item--drop-above');
        found = true;
        break;
      }
    }
    if (!found) {
      const last = [...siblings].reverse().find(li => li !== dragStateRef.current.li);
      if (last) last.classList.add('ck-item--drop-below');
    }
  }

  function handleDragEnd(e) {
    const state = dragStateRef.current;
    dragStateRef.current = null;
    if (state) state.li.classList.remove('ck-item--dragging');
    const el = editorRef.current;
    if (!el) return;
    el.querySelectorAll('.ck-item--drop-above, .ck-item--drop-below')
      .forEach(li => li.classList.remove('ck-item--drop-above', 'ck-item--drop-below'));
    injectDragHandles(el); // re-inject in case browser removed the dragged span
  }

  function handlePaste(e) {
    const items = [...(e.clipboardData?.items||[])];
    const img = items.find(i => i.type.startsWith('image/'));
    if (img) {
      e.preventDefault();
      insertImageFile(img.getAsFile());
      return;
    }
    // Always insert as plain text to strip external HTML formatting
    e.preventDefault();
    const text = e.clipboardData?.getData('text/plain') || '';
    document.execCommand('insertText', false, text);
    syncToYjs();
  }

  function handleDrop(e) {
    // Checklist item reorder
    if (dragStateRef.current) {
      e.preventDefault();
      const el = editorRef.current;
      if (el) {
        el.querySelectorAll('.ck-item--drop-above, .ck-item--drop-below')
          .forEach(li => li.classList.remove('ck-item--drop-above', 'ck-item--drop-below'));
      }
      const state = dragStateRef.current;
      dragStateRef.current = null;
      state.li.classList.remove('ck-item--dragging');
      if (el && el.contains(state.li)) {
        const parent = state.li.parentElement;
        const allLis = parent ? [...parent.querySelectorAll(':scope > li')] : [];
        let insertBefore = null;
        for (const li of allLis) {
          if (li === state.li) continue;
          const rect = li.getBoundingClientRect();
          if (e.clientY < rect.top + rect.height / 2) { insertBefore = li; break; }
        }
        if (parent) {
          let changed = false;
          if (insertBefore) {
            if (insertBefore !== state.li && insertBefore.previousElementSibling !== state.li) {
              parent.insertBefore(state.li, insertBefore);
              changed = true;
            }
          } else if (parent.lastElementChild !== state.li) {
            parent.appendChild(state.li);
            changed = true;
          }
          if (changed) syncFnRef.current?.();
        }
      }
      return;
    }
    // Image file drop
    const file = [...(e.dataTransfer?.files||[])].find(f => f.type.startsWith('image/'));
    if (file) { e.preventDefault(); insertImageFile(file); }
  }

  const myCursors = (editorCursors || []).filter(c => c.tabId === tabId);

  return (
    <div className="unified-editor-wrap">
      <FormatToolbar
        activeFormats={activeFormats}
        activeStyle={activeStyle}
        activeList={activeList}
        onFormat={toggleFormat}
        onStyle={applyStyle}
        onList={type => {
          if (type === 'bullet') insertBulletList();
          else if (type === 'numbered') insertNumberedList();
          else insertCheckboxList();
        }}
      />
      <div style={{ display: 'flex', position: 'relative', flex: 1, minHeight: 0, flexDirection: 'column' }}>
        <div
          ref={editorRef}
          className="unified-editor"
          contentEditable
          suppressContentEditableWarning
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          onSelect={updateActiveFormats}
          onMouseUp={updateActiveFormats}
          onMouseDown={handleMouseDown}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
          onPaste={handlePaste}
          onDrop={handleDrop}
          data-placeholder="Start writing..."
        />
        <RemoteEditorCursors editorRef={editorRef} cursors={myCursors} domVersion={domVersion} />
      </div>
      <div className="word-count">
        {wordCount.words} words · {wordCount.chars} chars
      </div>
    </div>
  );
}

/* ── Notes panel ── */

function NotesPanel({ doc, synced, editorCursors, setEditorCursor, exportRef }) {
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
          {!doc ? (
            <div className="notes-connecting">Connecting...</div>
          ) : !activeTab ? (
            <div className="notes-connecting">Loading...</div>
          ) : (
            <UnifiedEditor key={activeTab.id} doc={doc} tabId={activeTab.id} synced={synced} editorCursors={editorCursors} setEditorCursor={setEditorCursor} exportRef={exportRef} />
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
  const { status, users, cursors, editorCursors, doc, synced, displayName, setDisplayName, setCursor, setEditorCursor } = useYjs(roomId);
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
          <NotesPanel doc={doc} synced={synced} editorCursors={editorCursors} setEditorCursor={setEditorCursor} exportRef={txtRef}/>
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
