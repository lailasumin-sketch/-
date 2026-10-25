// Pure, bounded itinerary search. All numbers originate in data or explicit user inputs.
export const isTime = value => typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
export const toMinutes = value => { const [h,m]=value.split(':').map(Number); return h*60+m; };
export const toClock = value => `${String(Math.floor(value/60)).padStart(2,'0')}:${String(value%60).padStart(2,'0')}`;
const commercialTypes = new Set(['맛집','카페','특산물 쇼핑']);

export function resolveTravel(from, to, transport, table, allowance) {
  if (!from) return null;
  const match = (Array.isArray(table?.routes)?table.routes:[]).find(r => r && r.transport === transport && ((r.from === from.id && r.to === to.id) || (r.bidirectional === true && r.to === from.id && r.from === to.id)))
    || (Array.isArray(table?.regionRoutes)?table.regionRoutes:[]).find(r => r && r.transport === transport && ((r.fromRegion === from.region && r.toRegion === to.region) || (r.bidirectional === true && r.toRegion === from.region && r.fromRegion === to.region)));
  if (match && Number.isInteger(match.minutes) && match.minutes >= 0 && ['fictional','published'].includes(match.basis) && typeof match.source === 'string' && match.source.trim()) {
    return { minutes:match.minutes, basis:match.basis, source:match.source, label:match.basis === 'fictional' ? '가상 이동시간' : '등록된 이동시간(실시간 아님)' };
  }
  if (allowance !== '' && allowance !== null && allowance !== undefined && Number.isFinite(Number(allowance)) && Number(allowance) > 0) {
    return { minutes:Number(allowance), basis:'user', source:'사용자가 입력한 구간당 이동 여유', label:'사용자 지정 이동 여유 · 실제 시간 확인 필요' };
  }
  return { minutes:null, basis:'unknown', source:null, label:'이동시간 확인 필요' };
}

export function openingWindow(place) {
  const raw=place.openingHours;
  const open=place.openTime ?? raw?.open ?? raw?.openTime;
  const close=place.closeTime ?? raw?.close ?? raw?.closeTime;
  if (open == null && close == null) return {known:false,breaks:[]};
  if (!isTime(open) || !(isTime(close) || close === '24:00') || toMinutes(close) <= toMinutes(open)) return {invalid:true};
  const breaks=place.breakTime ? [place.breakTime] : raw?.breaks || [];
  if (!Array.isArray(breaks) || breaks.some(pair => !Array.isArray(pair) || pair.length !== 2 || !pair.every(isTime) || toMinutes(pair[0]) >= toMinutes(pair[1]))) return {invalid:true};
  return {known:true,open:toMinutes(open),close:toMinutes(close),breaks:breaks.map(pair=>pair.map(toMinutes)).sort((a,b)=>a[0]-b[0])};
}
function visitSlots(place, arrival, limit, date, preferLunch) {
  const weekday=date ? new Date(date+'T00:00:00Z').getUTCDay() : null;
  const closed=place.closedWeekdays ?? place.openingHours?.closedWeekdays;
  if (weekday !== null && closed?.includes(weekday)) return [];
  const hours=openingWindow(place);
  if (hours.invalid || !Number.isInteger(place.minutes) || place.minutes <= 0) return [];
  function fit(earliest) {
    let start=Math.max(earliest,hours.known ? hours.open : earliest);
    if (hours.known) for(const [from,to] of hours.breaks) if(start < to && start+place.minutes > from) start=to;
    const end=start+place.minutes;
    if(end > limit || (hours.known && end > hours.close)) return null;
    return {start,end,openingKnown:hours.known};
  }
  const candidates=[fit(arrival)];
  if (preferLunch && arrival <= 840 && limit >= 690) candidates.push(fit(Math.max(arrival,690)));
  return candidates.filter((slot,index,array)=>slot && array.findIndex(p=>p?.start === slot.start) === index);
}
const compare = (a,b) => {
  for(let i=0;i<a.rank.length;i++) if(a.rank[i] !== b.rank[i]) return b.rank[i]-a.rank[i];
  return a.signature.localeCompare(b.signature);
};

export function planDay({candidates, start, end, date, interests, options, travelTable, usedIds=new Set(), usedGroups=new Set(), previousCoverage=new Set()}) {
  const wanted=new Set(interests);
  const maxStops=options.pace === 'active' ? 8 : options.pace === 'relaxed' ? 4 : 6;
  const touristCap=options.duration === '반나절' || options.pace === 'relaxed' ? 2 : options.pace === 'active' ? 6 : 4;
  const initial={visits:[],timeline:[],cursor:start,ids:new Set(),groups:new Set(),covered:new Set(),matchPoints:0,companionPoints:0,hoursKnown:0,unknownTravel:0,travelMinutes:0,waitMinutes:0,mealScore:0,signature:'',rank:[0,0,0,0,0,0,0,0]};
  let beam=[initial], best=initial;
  for(let depth=0;depth<maxStops;depth++) {
    const next=[];
    for(const state of beam) {
      for(const place of candidates) {
        if(usedIds.has(place.id) || state.ids.has(place.id) || usedGroups.has(place.group) || state.groups.has(place.group)) continue;
        if(place.kind === 'place' && state.visits.filter(p=>p.kind==='place').length >= touristCap) continue;
        // One meal and one cafe per day; other days can select different businesses.
        if(['맛집','카페'].includes(place.category) && state.visits.some(p=>p.category===place.category)) continue;
        const matches=place.categories.filter(c=>wanted.has(c));
        if(!matches.length) continue;
        const last=state.visits.at(-1);
        const travel=resolveTravel(last,place,options.transport,travelTable,options.travelAllowanceMinutes);
        const arrival=state.cursor+(travel?.minutes ?? 0);
        const slots=visitSlots(place,arrival,end,date,place.category==='맛집');
        for(const slot of slots) {
          const timeline=[...state.timeline];
          const provisional=state.unknownTravel>0 || travel?.basis==='unknown';
          if(travel) timeline.push({kind:'travel',from:last.title,to:place.title,time:toClock(state.cursor),endTime:travel.minutes===null?null:toClock(arrival),minutes:travel.minutes,basis:travel.basis,source:travel.source,label:travel.label,provisional});
          if(slot.start>arrival) timeline.push({kind:'wait',time:toClock(arrival),endTime:toClock(slot.start),minutes:slot.start-arrival,label:'운영시간에 맞춘 대기·휴식',provisional});
          const stop={...place,time:toClock(slot.start),endTime:toClock(slot.end),openingKnown:slot.openingKnown,openingLabel:slot.openingKnown ? (place.isMock?'가상 운영시간 충족':'등록 운영시간 충족') : '운영시간 확인 필요',dateChecked:Boolean(date)&&Array.isArray(place.closedWeekdays??place.openingHours?.closedWeekdays),provisional,incomingTravel:travel};
          timeline.push(stop);
          const covered=new Set([...state.covered,...matches]);
          const ids=new Set([...state.ids,place.id]),groups=new Set([...state.groups,place.group]);
          const nextState={visits:[...state.visits,stop],timeline,cursor:slot.end,ids,groups,covered,
            matchPoints:state.matchPoints+matches.length+(place.themeMatch?1:0),companionPoints:state.companionPoints+Number(place.audiences.includes(options.companion)),
            hoursKnown:state.hoursKnown+Number(slot.openingKnown),unknownTravel:state.unknownTravel+Number(travel?.basis==='unknown'),travelMinutes:state.travelMinutes+(travel?.minutes??0),waitMinutes:state.waitMinutes+slot.start-arrival,
            mealScore:state.mealScore+Number(place.category==='맛집'&&slot.start>=690&&slot.start<=840)*2+Number(Boolean(place.category==='카페'&&last&&last.kind==='place')),signature:[...state.visits.map(p=>p.id),place.id,toClock(slot.start)].join('|')};
          // Interest coverage, matches, companion, supported operating hours, then travel and variety.
          nextState.rank=[covered.size+[...covered].filter(c=>!previousCoverage.has(c)).length,nextState.matchPoints,nextState.companionPoints,nextState.hoursKnown,-nextState.unknownTravel,-nextState.travelMinutes,nextState.mealScore,-nextState.waitMinutes];
          next.push(nextState);
          if(compare(nextState,best)<0) best=nextState;
        }
      }
    }
    if(!next.length) break;
    next.sort(compare);
    const keys=new Set();
    beam=next.filter(s=>{const key=[...s.ids].sort().join(',')+'|'+s.visits.at(-1).id+'|'+s.cursor;if(keys.has(key))return false;keys.add(key);return true;}).slice(0,32);
  }
  return {stops:best.visits,timeline:best.timeline,usedIds:best.ids,usedGroups:best.groups,covered:best.covered,rank:best.rank,signature:best.signature};
}

export function summarizeDays(days, budgetMinutes) {
  const stops=days.flatMap(d=>d.stops),segments=days.flatMap(d=>d.timeline);
  const moves=segments.filter(s=>s.kind==='travel');
  const unknownTravelLegs=moves.filter(s=>s.minutes===null).length;
  const knownTravelMinutes=moves.reduce((sum,s)=>sum+(s.minutes??0),0);
  const commercial=stops.filter(p=>p.categories.some(c=>commercialTypes.has(c)));
  const totalStayMinutes=stops.reduce((sum,p)=>sum+p.minutes,0);
  const totalWaitMinutes=segments.filter(s=>s.kind==='wait').reduce((sum,s)=>sum+s.minutes,0);
  return {totalVisitCount:stops.length,totalStayMinutes,knownTravelMinutes,totalTravelMinutes:unknownTravelLegs?null:knownTravelMinutes,unknownTravelLegs,totalWaitMinutes,budgetMinutes,
    plannedMinutes:totalStayMinutes+knownTravelMinutes+totalWaitMinutes,timingProvisional:unknownTravelLegs>0,unknownOpeningCount:stops.filter(p=>!p.openingKnown).length,
    fictionalTravelMinutes:moves.filter(s=>s.basis==='fictional').reduce((n,s)=>n+s.minutes,0),userAllowanceMinutes:moves.filter(s=>s.basis==='user').reduce((n,s)=>n+s.minutes,0),
    commercialCount:commercial.length,commercialMockCount:commercial.filter(p=>p.isMock).length,commercialCandidateCount:commercial.filter(p=>!p.isMock&&p.verification!=='verified').length,commercialVerifiedCount:commercial.filter(p=>!p.isMock&&p.verification==='verified').length};
}
