import { searchDining, diningTextOptions } from './dining.js';
import { durations, companions, interests, parsePrompt, buildTrip } from './planner.js';
const defaults = () => ({ duration:'1박 2일', companion:'연인', interests:['볼거리','맛집'], excludedInterests:[], transport:'car', date:'', region:'all', environment:'any', pace:'normal', withPet:false, lodgingType:'any', includePending:true, includeMock:true, diningQuery:'', maxDiningPrice:'', parkingOnly:false, quiet:false });
let state = defaults(), currentTrip, catalogue, events = [], dining = [];
const $ = selector => document.querySelector(selector);
const icons = { '반나절':'☀', '당일치기':'🌤', '1박 2일':'🌙', '2박 3일':'🧳', '혼자':'🚶', '연인':'♡', '친구':'🙌', '가족':'🏡', '볼거리':'🌿', '맛집':'🍚', '카페':'☕', '체험':'🎨', '특산물 쇼핑':'🛍', '축제':'🎉', '숙박':'🛏' };
function element(tag, text, className) {
  const el = document.createElement(tag); if (text) el.textContent = text; if (className) el.className = className; return el;
}
function externalLink(text, href, className) {
  const a = element('a',text,className); a.href=href; a.target='_blank'; a.rel='noopener noreferrer'; return a;
}
function mapLink(query) { return externalLink('지도에서 확인 ↗',`https://map.naver.com/p/search/${encodeURIComponent(query)}`); }
function badge(status, hold = false) { return element('span',hold ? '방문 후보에서 보류' : status === 'fictional' ? '[가상] 테스트 전용' : status === 'verified' ? '원문 확인' : status === 'search' ? '업체 직접 찾기' : '원문·운영 확인 전', 'status-badge'+(status==='verified'?' verified':'')); }
function renderChoices() {
  for (const [id, values, key] of [['duration-options',durations,'duration'], ['companion-options',companions,'companion'], ['interest-options',interests,'interests']]) {
    const container=document.getElementById(id); container.replaceChildren();
    values.forEach(value => {
      const button=element('button',`${icons[value]} ${value}`,'chip'); button.type='button';
      button.setAttribute('aria-pressed',key==='interests'?state.interests.includes(value):state[key]===value);
      button.addEventListener('click',()=>{
        if (key==='interests') {
          if (state.interests.includes(value)) { state.interests=state.interests.filter(v=>v!==value); state.excludedInterests=[...new Set([...state.excludedInterests,value])]; }
          else { state.interests.push(value); state.excludedInterests=state.excludedInterests.filter(v=>v!==value); }
        } else state[key]=value;
        renderChoices(); container.children[values.indexOf(value)].focus({preventScroll:true});
      }); container.append(button);
    });
  }
}
const controls = {transport:'#transport',date:'#travel-date',region:'#region',environment:'#environment',pace:'#pace',lodgingType:'#lodging-type',diningQuery:'#dining-query',maxDiningPrice:'#max-dining-price'};
function readControls() { for (const [key,selector] of Object.entries(controls)) state[key]=$(selector).value; state.includePending=$('#include-pending').checked; state.withPet=$('#with-pet').checked; state.includeMock=$('#include-mock').checked; state.parkingOnly=$('#parking-only').checked; state.quiet=$('#quiet-only').checked; }
function syncControls() { for (const [key,selector] of Object.entries(controls)) $(selector).value=state[key]; $('#include-pending').checked=state.includePending; $('#with-pet').checked=state.withPet; $('#include-mock').checked=state.includeMock; $('#parking-only').checked=state.parkingOnly; $('#quiet-only').checked=state.quiet; }
function renderCatalogue() {
  if (!catalogue) return;
  const query=$('#catalogue-search').value.trim().toLowerCase();
  const category=$('#catalogue-category').value, region=$('#catalogue-region').value;
  const maxDiningPrice=Number($('#catalogue-budget').value);
  const compact = text => text.toLowerCase().replace(/\s+/g,'');
  const regular=maxDiningPrice ? [] : catalogue.places.filter(p=>compact([p.name,...p.categories].join(' ')).includes(compact(query))&&(category==='all'||p.categories.includes(category))&&(region==='all'||p.region===region));
  const mocks=['all','맛집','카페'].includes(category) ? searchDining(dining,{query,category,region,maxDiningPrice}) : [];
  $('#catalogue-count').textContent=`관광 조사 후보 ${catalogue.places.length}곳 · 가상 맛집 ${dining.filter(p=>p.category==='맛집').length}곳 · 가상 카페 ${dining.filter(p=>p.category==='카페').length}곳. 가상 업소는 실제 장소가 아닙니다.`;
  $('#catalogue-filter-status').textContent=`검색 결과 ${regular.length+mocks.length}곳 (관광 후보 ${regular.length}곳 / 가상 업소 ${mocks.length}곳)`;
  const cards=mocks.map(p=>{
    const card=element('article','','place-card mock-card'); card.dataset.mock='true';
    card.append(badge('fictional'),element('h3',p.name),element('p',`${p.category} · ${p.cuisine} · 가상 ${p.area} 배치`,'place-meta'),element('p',p.menu),element('p',`1인 예산 ${p.price.toLocaleString('ko-KR')}원 · ${p.minutes}분 체류 (모두 가정)`),element('p',`${p.atmosphere} · ${p.audiences.join('·')} · ${p.space}`,'place-meta'),element('p',`가상 영업 ${p.openTime}–${p.closeTime} / ${p.closedLabel}요일 휴무${p.breakTime?' / 휴식 '+p.breakTime.join('–'):''}`,'place-meta'),element('p',`주차 ${p.parking?'있음':'없음'} · 반려견 ${p.petPolicy} · 예약 ${p.reservation} (가정)`,'place-meta'),element('p','실제 업소·주소·전화·예약 링크가 없는 창작 데이터입니다.','mock-notice'));
    const button=element('button','이 업소로 당일 코스 테스트 ↗','text-button');button.type='button';
    button.addEventListener('click',()=>{readControls();state.interests=[p.category];state.excludedInterests=[];state.duration='당일치기';state.region=p.region;state.diningQuery=p.name.replace('[가상] ','');state.includeMock=true;syncControls();renderChoices();recommend();});
    card.append(button);return card;
  });
  cards.push(...regular.map(p=>{
    const card=element('article','','place-card');
    card.append(badge(p.verification,p.hold),element('h3',p.name),element('p',`${catalogue.meta.regions[p.region]} · ${p.categories.join(' / ')} · ${p.indoor?'실내':'야외'} 중심`,'place-meta'),element('p',p.description),element('p',`취향 제안: ${p.audiences.join('·')} / 체류 가정 ${p.minutes}분`,'place-meta'),element('p',`공식 확인일: ${p.sourceCheckedAt||'미확인'} · 운영시간·가격·정확한 주소: ${p.verification==='verified'?'상세 출처 참고':'미확인'}`,'place-meta'));
    if(p.hold) card.append(element('p',p.holdReason+' — 일정 자동 배치 제외','hold-note'));
    card.append(mapLink('의성 '+p.name),externalLink(p.sourceUrl?'확인한 원문 ↗':'의성군에서 자료 확인 ↗',p.sourceUrl||'https://www.usc.go.kr/'));
    return card;
  }));
  $('#catalogue-list').replaceChildren(...cards);
  if(!cards.length) $('#catalogue-list').append(element('p','일치하는 장소가 없습니다. 이름·메뉴·분류·권역·예산을 바꿔주세요.','empty-state'));
}
function recommend() {
  readControls();
  if(!catalogue) { $('#data-status').textContent='장소 자료를 불러오지 못했어요. 인터넷 연결 및 서버 실행을 확인하고 새로고침해 주세요.'; return; }
  currentTrip=buildTrip(state,catalogue,events,dining); currentTrip.options=structuredClone(state);
  $('#results').hidden=false;
  $('#results-title').textContent=currentTrip.mockDiningCount?'가상 업소가 포함된 테스트 코스':state.includePending?'취향에 맞춰 고른 확인 전 후보 코스':'확인된 자료로 구성한 코스';
  const chosen=catalogue.meta.regions[state.region]||'취향에 맞는 권역';
  $('#result-summary').textContent=`${state.companion==='혼자'?'혼자':state.companion+' 동행'} · ${state.duration} · ${chosen}${state.date?' · '+state.date+' 출발':''}. 취향·권역·시간 여유를 반영했습니다.`;
  $('#result-tags').replaceChildren(...[state.duration,state.companion,...state.interests,state.environment==='indoor'?'실내 중심':state.environment==='outdoor'?'야외 중심':'실내·야외',state.pace==='relaxed'?'느긋하게':state.pace==='active'?'활동적으로':'적당하게',state.transport==='car'?'자가용':'대중교통·택시',...(state.withPet?['반려견 동반']:[]),...(state.lodgingType==='camping'?['캠핑 후보']:[]),...(state.includeMock?['가상 업소 테스트']:[]),...(state.maxDiningPrice?['업소별 1인 '+Number(state.maxDiningPrice).toLocaleString('ko-KR')+'원 이하']:[]),...(state.diningQuery?[state.diningQuery]:[])].map(v=>element('span',v)));
  $('#itinerary').replaceChildren(...currentTrip.days.map(day=>{
    const card=element('article','','day-card');
    card.append(element('h3',`DAY ${String(day.day).padStart(2,'0')} · ${day.region}`),element('p',(day.date?day.date+' · ':'')+'체류 가정과 이동 여유를 배치한 예시','day-meta'));
    if(!day.stops.length) card.append(element('p','이 조건으로 구성할 수 있는 확인된 자료가 없습니다. 권역·실내외 조건을 바꾸거나, 미확인 후보 포함 여부를 확인해 주세요.','empty-state'));
    day.stops.forEach(stop=>{
      const row=element('div','','stop'),time=element('time',stop.time),content=element('div'); time.dateTime=stop.time;
      content.append(badge(stop.verification),element('h4',stop.title),element('p',stop.description),element('p',stop.reason||'','reason'));
      if(stop.endTime) content.append(element('p',`${stop.time}–${stop.endTime} · ${stop.isMock?'가상 영업시간·휴무를 반영한 테스트':'편집상 체류시간'}`,'source-note'));
      if(stop.bookingRequired) content.append(element('p','운영·예약 가능 여부를 확인한 뒤 일정 확정','source-note'));
      if(stop.isMock) { row.dataset.mock='true'; content.append(element('p','[가상] 실제 업소가 아니므로 지도·예약 기능을 제공하지 않습니다.','mock-notice')); }
      else if(stop.query) content.append(mapLink(stop.query));
      if(stop.sourceUrl) content.append(externalLink('확인한 원문 ↗',stop.sourceUrl,'source-link'));
      row.append(time,content); card.append(row);
    });
    if(day.missing.length) card.append(element('p','이 날짜에 배치하지 않은 관심사: '+day.missing.join(', ')+' — 다른 날짜의 코스도 확인해 주세요.','missing-note'));
    return card;
  }));
  $('#dynamic-notes').replaceChildren(...currentTrip.notes.map(n=>element('p',n)));
  $('#event-results').replaceChildren(...currentTrip.events.map(event=>{ const card=element('article','','event-card'); card.append(element('h3',event.name),element('p',`${event.startDate} ~ ${event.endDate}`),externalLink('행사 공식 안내 ↗',event.sourceUrl)); return card; }));
  $('#copy-status').textContent=''; $('#results').scrollIntoView({behavior:'smooth',block:'start'});
}
$('#dining-query').addEventListener('input',()=>{
  const query=$('#dining-query').value.trim();
  const exact=dining.find(p=>p.name.replace('[가상] ','').replace(/\s+/g,'')===query.replace(/\s+/g,''));
  const category=exact?.category||diningTextOptions(query).category;
  if(!category)return;
  const kinds=category==='all'?['맛집','카페']:[category];
  state.interests=[...state.interests.filter(c=>!['맛집','카페'].includes(c)),...kinds];
  state.excludedInterests=state.excludedInterests.filter(c=>!kinds.includes(c));
  renderChoices();
});
$('#trip-form').addEventListener('submit',e=>{e.preventDefault();recommend();});
$('#reset').addEventListener('click',()=>{state=defaults();renderChoices();syncControls();$('#trip-prompt').value='';$('#prompt-feedback').textContent='';$('#results').hidden=true;currentTrip=null;});
$('#example').addEventListener('click',()=>{$('#trip-prompt').value='연인이랑 1박2일로 맛집과 조용한 카페, 볼거리를 즐기고 의성 특산물도 사고 싶어. 자가용으로 느긋하게 여행할 거야!';$('#trip-prompt').focus();});
$('#prompt-submit').addEventListener('click',()=>{
  const text=$('#trip-prompt').value.trim();
  if(!text){$('#prompt-feedback').textContent='원하는 여행을 한 문장으로 알려주세요.';$('#trip-prompt').focus();return;}
  const parsed=parsePrompt(text);
  const named=dining.find(p=>text.replace(/\s+/g,'').includes(p.name.replace('[가상] ','').replace(/\s+/g,'')));
  if(named){parsed.diningQuery=named.name.replace('[가상] ','');if(!parsed.interests.includes(named.category))parsed.interests.push(named.category);}
  else if(parsed.interests.some(c=>['맛집','카페'].includes(c))&&!parsed.diningQuery) parsed.diningQuery='';
  if(!Object.keys(parsed).some(k=>!['interests','excludedInterests'].includes(k))&&!parsed.interests.length&&!parsed.excludedInterests.length){$('#prompt-feedback').textContent='조건을 찾지 못했어요. “아이와 당일치기, 실내 체험”처럼 적어주세요.';return;}
  readControls();
  const prior=state.interests;
  state={...state,...parsed,interests:(parsed.interests.length?parsed.interests:prior).filter(c=>!parsed.excludedInterests.includes(c))};
  renderChoices();syncControls();
  const recognized=[parsed.duration,parsed.companion,...parsed.interests,...parsed.excludedInterests.map(c=>c+' 제외'),parsed.environment==='indoor'?'실내 중심':parsed.environment==='outdoor'?'야외 중심':'',parsed.region?catalogue?.meta.regions[parsed.region]:'',parsed.pace==='relaxed'?'느긋하게':parsed.pace==='active'?'활동적으로':'',parsed.transport==='public'?'대중교통':parsed.transport==='car'?'자가용':'',parsed.date,parsed.withPet?'반려견 동반':'',parsed.lodgingType==='camping'?'캠핑 후보':'',parsed.diningQuery,parsed.maxDiningPrice?'업소별 1인 '+parsed.maxDiningPrice+'원 이하':'',parsed.quiet?'조용한 업소':'',parsed.parkingOnly?'주차 가능':''].filter(Boolean);
  $('#prompt-feedback').textContent='반영: '+recognized.join(' · ')+'. 언급하지 않은 조건은 현재 선택을 유지해요.';recommend();
});
for(const button of document.querySelectorAll('[data-interest]')) button.addEventListener('click',()=>{if(!state.interests.includes(button.dataset.interest))state.interests.push(button.dataset.interest);state.excludedInterests=state.excludedInterests.filter(c=>c!==button.dataset.interest);renderChoices();$('#planner').scrollIntoView({behavior:'smooth'});});
for(const id of ['catalogue-search','catalogue-category','catalogue-region','catalogue-budget']) document.getElementById(id).addEventListener('input',renderCatalogue);
$('#copy-trip').addEventListener('click',async()=>{
  if(!currentTrip)return;
  const text=['의동이 픽 · '+currentTrip.options.duration,'확인 전 후보 코스 · 운영·가격·예약·실제 이동시간 확인 필요',...currentTrip.days.flatMap(day=>['\nDAY '+day.day+' · '+day.region+(day.date?' · '+day.date:''),...day.stops.map(s=>`${s.time} ${s.title}\n${s.description}\n${s.isMock?'[가상] 창작 데이터 · 실제 방문·예약 불가':s.sourceUrl||'원문 확인 전 / 업체 직접 찾기'}`)]),'\n확인 사항',...currentTrip.notes].join('\n');
  try{await navigator.clipboard.writeText(text);$('#copy-status').textContent='확인 사항과 함께 일정을 복사했어요.';}
  catch{$('#copy-status').textContent='아래 내용을 직접 복사해 주세요.';const area=element('textarea');area.value=text;area.readOnly=true;area.setAttribute('aria-label','복사할 여행 일정');$('#copy-status').append(area);area.select();}
});
async function init(){
  renderChoices();
  const buttons=[$('#trip-form button[type="submit"]'),$('#prompt-submit')];buttons.forEach(b=>b.disabled=true);
  try{
    const responses=await Promise.all([fetch('/catalogue.json'),fetch('/events.json'),fetch('/dining.json')]);
    if(responses.some(r=>!r.ok))throw new Error('자료 HTTP 오류');
    const [data,eventData,diningData]=await Promise.all(responses.map(r=>r.json()));
    if(!Array.isArray(data.places)||!data.meta?.regions||!Array.isArray(eventData.events)||!Array.isArray(diningData.places)||diningData.places.some(p=>!p.isMock||p.verification!=='fictional'))throw new Error('자료 형식 오류');
    catalogue=data;events=eventData.events;dining=diningData.places;
    $('#data-status').textContent=`조사 후보 ${data.places.length}곳 · 공식 원문 확인 ${data.places.filter(p=>p.verification==='verified').length}곳. 가상 맛집·카페 ${dining.length}곳을 검색·코스 테스트에 사용합니다. [가상] 업소는 실제 방문하거나 예약할 수 없어요.`;
    renderCatalogue();buttons.forEach(b=>b.disabled=false);
  }catch{$('#data-status').textContent='장소 자료를 불러오지 못했습니다. npm start로 서버가 실행 중인지 확인한 후 새로고침해 주세요.';$('#catalogue-count').textContent='장소 자료 로딩 실패';}
}
init();
