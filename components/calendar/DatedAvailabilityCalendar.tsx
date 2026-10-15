"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { authenticatedFetch } from '@/src/auth/authenticated-fetch';
import { calendarWeek, calendarWeekStart } from '@/src/calendar/calendar-view-model';
import { copyDateState, localParts, localSlot, offeredSlots, parseEditorSnapshot, shiftDate, slotBlock, stageAvailability, type EditorSnapshot } from '@/src/calendar/availability-editor';
import styles from './schedule-editor.module.css';

type Props={semesterId:string;refreshKey:string|number;onSaved?:()=>void;disabled?:boolean;previewData?:EditorSnapshot};
type Block={date:string;start:number;end:number};
type Gesture={day:number;start:number;last:number};
const weekdays=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const clock=(m:number)=>`${Math.floor(m/60)%12||12}:${String(m%60).padStart(2,'0')} ${m<720?'AM':'PM'}`;
const dateFormatter=new Intl.DateTimeFormat('en-US',{weekday:'short',month:'short',day:'numeric',timeZone:'UTC'});
const label=(date:string)=>dateFormatter.format(new Date(date+'T12:00:00Z'));

export function DatedAvailabilityCalendar({semesterId,refreshKey,onSaved,disabled=false,previewData}:Props){
 const [data,setData]=useState<EditorSnapshot|null>(previewData??null),[draft,setDraft]=useState<Map<string,boolean>>(()=>new Map());
 const [week,setWeek]=useState<string|null>(null),[tool,setTool]=useState<'add'|'remove'>('add');
 const [source,setSource]=useState<Block|null>(null),[copyOpen,setCopyOpen]=useState(false),[month,setMonth]=useState(''),[copyDates,setCopyDates]=useState<Set<string>>(()=>new Set());
 const [review,setReview]=useState(false),[loading,setLoading]=useState(!previewData),[saving,setSaving]=useState(false),[error,setError]=useState<string|null>(null),[message,setMessage]=useState<string|null>(null),[reload,setReload]=useState(0),[stroke,setStroke]=useState<Gesture|null>(null);
 const gesture=useRef<Gesture|null>(null),lock=useRef(false),sourceDialog=useRef<HTMLDialogElement>(null),copyDialog=useRef<HTMLDialogElement>(null),reviewDialog=useRef<HTMLDialogElement>(null),scroller=useRef<HTMLDivElement>(null),initialScroll=useRef(false);
 useEffect(()=>{
  if(previewData)return;
  const controller=new AbortController();setLoading(true);
  const from=Math.ceil((Date.now()+1000)/900_000)*900_000;
  const range={from:new Date(from).toISOString(),until:new Date(from+90*86400_000).toISOString()};
  void authenticatedFetch(`/api/calendar/dated?${new URLSearchParams({semesterId,...range})}`,{signal:controller.signal}).then(async response=>{
   const value:unknown=await response.json();if(!response.ok)throw new Error(value&&typeof value==='object'&&'error'in value&&typeof value.error==='string'?value.error:'Calendar could not be loaded.');
   const next=parseEditorSnapshot(value);if(!controller.signal.aborted){setData(next);setError(null);}
  }).catch(cause=>{if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:'Calendar could not be loaded.');}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
  return()=>controller.abort();
 },[semesterId,refreshKey,reload,previewData]);
 useEffect(()=>{if(source&&!copyOpen)sourceDialog.current?.showModal();else sourceDialog.current?.close();},[source,copyOpen]);
 useEffect(()=>{if(copyOpen)copyDialog.current?.showModal();else copyDialog.current?.close();},[copyOpen]);
 useEffect(()=>{if(review)reviewDialog.current?.showModal();else reviewDialog.current?.close();},[review]);
 useEffect(()=>{if(data&&scroller.current&&!initialScroll.current){scroller.current.scrollTop=8*4*23;initialScroll.current=true;}},[data]);
 const saved=useMemo(()=>offeredSlots(data?.offered??[]),[data]);
 const effective=(stamp:string)=>draft.get(stamp)??saved.has(stamp);
 const blocked=disabled||saving||loading;
 const firstWeek=data?calendarWeekStart(localParts(data.from,data.timeZone).date):null,displayedWeek=week??firstWeek;
 const dates=useMemo(()=>displayedWeek?calendarWeek(displayedWeek):[],[displayedWeek]);
 const horizonDate=data?localParts(Date.parse(data.until)-1,data.timeZone).date:null;
 const lastDate=data&&horizonDate?(horizonDate<data.semesterEnd?horizonDate:data.semesterEnd):null,lastWeek=lastDate?calendarWeekStart(lastDate):null;
 const cells=useMemo(()=>!data?[]:Array.from({length:96},(_,row)=>dates.map((date,day)=>{const minute=row*15,slot=localSlot(date,minute,data.timeZone);return{date,day,minute,slot,reason:slot?slotBlock(data,slot):'Clock change: choose another time'};})).flat(),[data,dates]);
 function blockAt(date:string,minute:number):Block{
  let start=minute,end=minute+15;const enabled=(m:number)=>{const slot=data&&localSlot(date,m,data.timeZone);return!!slot&&!slotBlock(data!,slot)&&effective(slot.startsAt);};
  while(start>0&&enabled(start-15))start-=15;while(end<1440&&enabled(end))end+=15;return{date,start,end};
 }
 function edit(day:number,start:number,end=start){
  if(!data||blocked)return;const date=dates[day];if(!date)return;
  const first=localSlot(date,start,data.timeZone);if(tool==='add'&&start===end&&first&&effective(first.startsAt)){setSource(blockAt(date,start));return;}
  const next=new Map(draft);let added:number|null=null;
  for(let m=Math.min(start,end);m<=Math.max(start,end);m+=15){const slot=localSlot(date,m,data.timeZone);if(!slot||slotBlock(data,slot)||tool==='add'&&effective(slot.startsAt))continue;stageAvailability(next,saved,slot.startsAt,tool==='add');if(tool==='add'&&added===null)added=m;}
  if(next.size>512){setError('Save or discard the current changes before editing more than 128 hours.');return;}
  setDraft(next);setError(null);setMessage(null);
  // A source is contiguous and never crosses a protected cell in the painted range.
  if(added!==null){let finish=added+15;while(finish<=Math.max(start,end)){const slot=localSlot(date,finish,data.timeZone);if(!slot||slotBlock(data,slot)||!(next.get(slot.startsAt)??saved.has(slot.startsAt)))break;finish+=15;}setSource({date,start:added,end:finish});}
 }
 function begin(event:PointerEvent<HTMLButtonElement>,day:number,minute:number){if(blocked||event.button!==0)return;event.preventDefault();event.currentTarget.setPointerCapture(event.pointerId);const g={day,start:minute,last:minute};gesture.current=g;setStroke(g);}
 function move(event:PointerEvent<HTMLDivElement>){const g=gesture.current;if(!g)return;const el=document.elementFromPoint(event.clientX,event.clientY)?.closest<HTMLButtonElement>('button[data-minute]');if(el&&Number(el.dataset.day)===g.day){const next={...g,last:Number(el.dataset.minute)};gesture.current=next;setStroke(next);}}
 function finish(){const g=gesture.current;gesture.current=null;setStroke(null);if(g)edit(g.day,g.start,g.last);}
 function openCopy(){if(!source)return;setMonth(source.date.slice(0,7));setCopyDates(new Set());setCopyOpen(true);}
 function copy(){
  if(!source||!data||blocked||!copyDates.size)return;const next=new Map(draft);
  for(const date of copyDates){if(copyDateState(data,draft,date,source.start,source.end).kind!=='available'){setError('A selected time is no longer available. Review your dates.');return;}for(let m=source.start;m<source.end;m+=15){const slot=localSlot(date,m,data.timeZone)!;stageAvailability(next,saved,slot.startsAt,true);}}
  if(next.size>512){setError('Choose fewer dates, or save the current changes first.');return;}
  setDraft(next);setCopyOpen(false);setSource(null);setError(null);setMessage('Copies added to your draft. Review the exact dates and times before saving.');
 }
 function removeSource(){if(!source||!data||blocked)return;const next=new Map(draft);for(let m=source.start;m<source.end;m+=15){const slot=localSlot(source.date,m,data.timeZone);if(slot&&!slotBlock(data,slot))stageAvailability(next,saved,slot.startsAt,false);}setDraft(next);setSource(null);}
 async function save(){
  if(lock.current||!data||!draft.size)return;lock.current=true;setSaving(true);setError(null);
  try{
   const changes=[...draft].sort(([a],[b])=>a.localeCompare(b)).map(([startsAt,available])=>({startsAt,endsAt:new Date(Date.parse(startsAt)+900_000).toISOString(),available}));
   if(!previewData){const response=await authenticatedFetch('/api/calendar/dated',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({semesterId,changes})});const value:unknown=await response.json();if(!response.ok||!value||typeof value!=='object'||!('saved'in value)||value.saved!==true)throw new Error(value&&typeof value==='object'&&'error'in value&&typeof value.error==='string'?value.error:'Saving was not confirmed. Your draft is retained; reload to check saved availability before retrying.');}
   const values=new Set(saved);for(const change of changes)if(change.available)values.add(change.startsAt);else values.delete(change.startsAt);
   setData({...data,offered:[...values].map(startsAt=>({startsAt,endsAt:new Date(Date.parse(startsAt)+900_000).toISOString()}))});
   setDraft(new Map());setReview(false);setMessage(previewData?'Preview changes saved in this page only.':'Availability saved for the dates you chose.');if(!previewData){setReload(value=>value+1);onSaved?.();}
  }catch(cause){setError(cause instanceof Error?cause.message:'Availability could not be saved. Your draft is retained.');}finally{lock.current=false;setSaving(false);}
 }
 const changes=useMemo(()=>{
  if(!data)return[];const rows:{date:string;start:number;end:number;available:boolean}[]=[];
  for(const[stamp,available]of[...draft].sort(([a],[b])=>a.localeCompare(b))){const p=localParts(stamp,data.timeZone),last=rows.at(-1);if(last&&last.date===p.date&&last.available===available&&last.end===p.minute)last.end+=15;else rows.push({date:p.date,start:p.minute,end:p.minute+15,available});}return rows;
 },[data,draft]);
 const monthDates=useMemo(()=>{const values:string[]=[];if(month)for(let date=month+'-01';date.startsWith(month);date=shiftDate(date,1))values.push(date);return values;},[month]);
 function monthMove(amount:number){const date=new Date(month+'-01T12:00:00Z');date.setUTCMonth(date.getUTCMonth()+amount);setMonth(date.toISOString().slice(0,7));}
 const copies=[...copyDates].sort(),copySummary=source&&copies.length?`Add ${clock(source.start)}–${clock(source.end)} on ${copies.map(label).join('; ')}. No other dates change.`:'Choose at least one date. No dates are selected automatically.';
 return <section className={styles.editor} aria-label="Mentoring availability editor">
  <div className={styles.guide}><h5>Your schedule, in three steps</h5><ol><li><strong>Choose a week.</strong> Times apply only to the dates you see.</li><li><strong>Add or remove times.</strong> Choose a tool, then click or tap a slot, or drag down a day with a mouse.</li><li><strong>Copy when useful, then review &amp; save.</strong> Click an available block to copy it to specific dates. Review the exact dates and times before saving.</li></ol></div>
  {error&&<p role="alert" className={styles.error}>{error} {!saving&&<button className={styles.button} onClick={()=>setReload(value=>value+1)}>Reload calendar</button>}</p>}{message&&<p role="status" className={styles.message}>{message}</p>}{loading&&!data&&<p role="status">Loading your availability…</p>}
  {data&&displayedWeek&&<>
   {data.syncUnavailable&&data.mode==='synced'&&<p role="status" className={styles.warning}>Google Calendar needs a refresh. Your offered times remain editable; startups cannot book unverified availability.</p>}
   <div className={styles.heading}><div><h5>{label(dates[0]!)} – {label(dates[6]!)}</h5><p>{data.timeZone} · Editable dates through {label(lastDate!)}</p></div><div className={styles.actions}><button className={styles.button} aria-label="Previous week" disabled={blocked||displayedWeek<=firstWeek!} onClick={()=>setWeek(shiftDate(displayedWeek,-7))}>←</button><button className={styles.button} disabled={blocked} onClick={()=>setWeek(firstWeek)}>This week</button><button className={styles.button} aria-label="Next week" disabled={blocked||displayedWeek>=lastWeek!} onClick={()=>setWeek(shiftDate(displayedWeek,7))}>→</button></div></div>
   <div className={styles.toolbar}><div className={styles.actions}><button className={tool==='add'?styles.primary:styles.button} aria-pressed={tool==='add'} disabled={blocked} onClick={()=>setTool('add')}>＋ Add times</button><button className={tool==='remove'?styles.primary:styles.button} aria-pressed={tool==='remove'} disabled={blocked} onClick={()=>setTool('remove')}>− Remove times</button></div><p>Every new time applies to one date.</p></div>
   <p className={styles.hint}>{tool==='add'?'Drag to add times for one date. Click an available block to copy it to other dates.':'Drag across offered times to remove them for these dates only. Other weeks stay unchanged.'}</p>
   <div className={styles.scroller} ref={scroller}><div className={styles.grid} onPointerMove={move} onPointerUp={finish} onPointerCancel={()=>{gesture.current=null;setStroke(null);}}>
    <div className={styles.day}>Time</div>{dates.map(date=><div className={styles.day} key={date}><span>{weekdays[new Date(date+'T12:00:00Z').getUTCDay()]!.slice(0,3)}</span><strong>{Number(date.slice(-2))}</strong></div>)}
    {Array.from({length:96},(_,row)=><div key={row} style={{display:'contents'}}><div className={styles.time}>{row%4===0?clock(row*15):''}</div>{cells.slice(row*7,row*7+7).map(cell=>{
     const offered=cell.slot&&effective(cell.slot.startsAt),changed=cell.slot&&draft.has(cell.slot.startsAt),active=stroke&&stroke.day===cell.day&&cell.minute>=Math.min(stroke.start,stroke.last)&&cell.minute<=Math.max(stroke.start,stroke.last),prior=cell.minute?localSlot(cell.date,cell.minute-15,data.timeZone):null,first=offered&&(!prior||!effective(prior.startsAt));
     const classes=[styles.cell,row%4===0?styles.hour:'',offered?styles.offered:'',changed?styles.changed:'',cell.reason?.includes('Friday')?styles.reserved:cell.reason==='Confirmed meeting'?styles.booked:cell.reason==='Google Calendar busy'?styles.busy:'',active?styles.stroke:''].join(' ');
     return <button key={`${cell.date}|${cell.minute}`} type="button" className={classes} data-day={cell.day} data-minute={cell.minute} data-date={cell.date} disabled={blocked||!!cell.reason} aria-pressed={!!offered} aria-label={`${label(cell.date)} ${clock(cell.minute)}: ${cell.reason??(offered?'Already set. Click for details and copying.':'Not offered')}`} title={cell.reason??(offered?'Click to copy or remove this block':'Click or drag to add this time')} onPointerDown={event=>begin(event,cell.day,cell.minute)} onClick={event=>{if(event.detail===0)edit(cell.day,cell.minute);}}>{cell.reason&&cell.minute%60===0?cell.reason:first?'Offered · click':changed&&cell.minute%60===0&&!offered?'Removing':''}</button>;
    })}</div>)}
   </div></div>
   <div className={styles.legend}><span>🟩 Offered times (includes saved weekly hours)</span><span>🟪 Confirmed meeting</span><span>◻ Google busy</span><span>Friday Program reserved time · {data.programTimeZone}</span></div>
   <div className={styles.footer}><div><strong>{draft.size?`${draft.size} time slots changed`:'No unsaved changes'}</strong><p>Changes stay in your draft when you switch weeks. Existing weekly hours remain until you remove individual dates.</p></div><div className={styles.actions}><button className={styles.button} disabled={blocked||!draft.size} onClick={()=>{setDraft(new Map());setMessage('Draft changes discarded.');}}>Discard changes</button><button className={styles.primary} disabled={blocked||!draft.size} onClick={()=>setReview(true)}>Review &amp; save</button></div></div>
  </>}
  <dialog ref={sourceDialog} className={styles.dialog} onCancel={event=>{event.preventDefault();if(!saving)setSource(null);}} aria-labelledby="mentor-block-title"><h5 id="mentor-block-title">Your available time</h5>{source&&<><p className={styles.blockTime}>{label(source.date)} · {clock(source.start)}–{clock(source.end)}</p><p>This block applies to this date. Copies will be independent dates. New changes publish only after Review &amp; save.</p><button className={styles.primary} disabled={blocked} onClick={openCopy}>Copy to other dates…</button><button className={styles.button} disabled={blocked} onClick={removeSource}>Remove this date’s block</button></>}<div className={styles.actions}><button className={styles.button} disabled={saving} onClick={()=>setSource(null)}>Keep editing</button></div></dialog>
  <dialog ref={copyDialog} className={styles.dialog} onCancel={event=>{event.preventDefault();setCopyOpen(false);}} aria-labelledby="mentor-copy-title"><h5 id="mentor-copy-title">Copy to other dates</h5>{source&&data&&<>
   <p className={styles.source}>Copying from: {label(source.date)} · {clock(source.start)}–{clock(source.end)} · {data.timeZone}</p><p>Choose dates for this time. Each copy can be edited independently.</p>
   <div className={styles.heading}><button className={styles.button} aria-label="Previous month" disabled={month<=source.date.slice(0,7)} onClick={()=>monthMove(-1)}>←</button><strong>{month&&new Intl.DateTimeFormat('en-US',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(month+'-01T12:00:00Z'))}</strong><button className={styles.button} aria-label="Next month" disabled={month>=lastDate!.slice(0,7)||month>=data.semesterEnd.slice(0,7)} onClick={()=>monthMove(1)}>→</button></div>
   <div className={styles.dateGrid}>{weekdays.map(day=><span key={day}>{day.slice(0,2)}</span>)}{Array.from({length:month?new Date(month+'-01T12:00:00Z').getUTCDay():0},(_,i)=><span key={`empty-${i}`}/>)}{monthDates.map(date=>{const state=copyDateState(data,draft,date,source.start,source.end),original=date===source.date,selected=copyDates.has(date),description=original?'Copying from':state.reason;return <button key={date} type="button" className={[styles.date,state.kind==='set'||original?styles.already:'',selected?styles.selected:''].join(' ')} disabled={original||state.kind!=='available'||date<=source.date||blocked} aria-pressed={selected} aria-label={`${label(date)}: ${description}`} title={description} onClick={()=>setCopyDates(current=>{const next=new Set(current);if(next.has(date))next.delete(date);else next.add(date);return next;})}>{Number(date.slice(-2))}{(original||state.kind==='set')&&<small>{original?'Copying from':'Already set'}</small>}</button>;})}</div>
   <div className={styles.legend}><span className={styles.greenKey}>Already set</span><span className={styles.blueKey}>Selected copies</span></div><p>Green dates already have this full time window. Grey dates cannot receive this time; their labels explain why.</p>
   <div className={styles.actions}><button className={styles.button} onClick={()=>{const next=new Set(copyDates);for(let date=shiftDate(source.date,7);date<=data.semesterEnd&&date<=lastDate!;date=shiftDate(date,7))if(copyDateState(data,draft,date,source.start,source.end).kind==='available')next.add(date);setCopyDates(next);}}>Select remaining {weekdays[new Date(source.date+'T12:00:00Z').getUTCDay()]}s</button><button className={styles.button} onClick={()=>setCopyDates(new Set())}>Clear selection</button></div>
   <p className={styles.summary} role="status">{copySummary}</p>{error&&<p role="alert" className={styles.error}>{error}</p>}<div className={styles.actions}><button className={styles.button} onClick={()=>setCopyOpen(false)}>Back</button><button className={styles.primary} disabled={!copies.length||blocked} onClick={copy}>Add to {copies.length||'selected'} {copies.length===1?'date':'dates'}</button></div><p>Copies are added to your draft. Review &amp; save when ready.</p>
  </>}</dialog>
  <dialog ref={reviewDialog} className={styles.dialog} onCancel={event=>{event.preventDefault();if(!saving)setReview(false);}} aria-labelledby="mentor-review-title"><h5 id="mentor-review-title">Review your availability</h5><p>These are the exact dates and times that will change. All other dates stay unchanged.</p><div className={styles.summary}>{changes.map((change,i)=><p key={i}>{change.available?'Add':'Remove'}: {label(change.date)}, {clock(change.start)}–{clock(change.end)}</p>)}</div>{error&&<p role="alert" className={styles.error}>{error}</p>}<div className={styles.actions}><button className={styles.button} disabled={saving} onClick={()=>setReview(false)}>Keep editing</button><button className={styles.primary} disabled={saving||!draft.size} onClick={()=>void save()}>{saving?'Saving…':previewData?'Save preview availability':'Save availability'}</button></div></dialog>
 </section>;
}
