// Small DOM view over the existing itinerary model; no framework/runtime dependency.
const TYPES={볼거리:{label:'관광지',icon:'🌿',tone:'nature'},맛집:{label:'맛집',icon:'🍚',tone:'food'},카페:{label:'카페',icon:'☕',tone:'cafe'},체험:{label:'체험',icon:'🎨',tone:'experience'},'특산물 쇼핑':{label:'특산물',icon:'🛍',tone:'shopping'},숙박:{label:'숙박',icon:'🛏',tone:'nature'}};
export function placeType(place){return TYPES[place.category]||TYPES[place.categories?.[0]]||{label:'방문 장소',icon:'📍',tone:'nature'};}
export function mapDestination(place){
 if(place.isMock||place.verification==='fictional')return {url:null,note:'가상 업소라 실제 지도 위치를 제공하지 않습니다.'};
 const coordinates=place.coordinates;
 const lat=coordinates?.latitude??coordinates?.lat,lng=coordinates?.longitude??coordinates?.lng;
 let query=null;
 if(typeof lat==='number'&&typeof lng==='number'&&Number.isFinite(lat)&&Number.isFinite(lng)&&lat>=-90&&lat<=90&&lng>=-180&&lng<=180)query=lat+','+lng;
 else if(typeof place.address==='string'&&place.address.trim()&&!/주소\s*없음|미확인|확인\s*필요|가상/.test(place.address))query=place.address.trim();
 if(!query)return {url:null,note:'주소·좌표가 미확인이라 지도 연결을 제공하지 않습니다.'};
 return {url:'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(query),note:'등록 주소·좌표를 검색합니다. 실제 운영 여부는 별도 확인이 필요합니다.'};
}
export function pricePresentation(place){
 const valid=typeof place.price==='number'&&Number.isFinite(place.price)&&place.price>=0;
 if(!valid)return {text:'이용금액 미등록',amount:null,perPerson:false};
 const perPerson=place.isMock===true||place.priceBasis==='per-person';
 return {text:place.price.toLocaleString('ko-KR')+'원'+(place.isMock?' / 1인 가정·가상':perPerson?' / 등록 1인 금액':' / 금액 기준 확인 필요'),amount:place.price,perPerson};
}
export function itineraryOverview(trip){
 const stops=trip.days.flatMap(day=>day.stops),priced=stops.map(p=>({p,price:pricePresentation(p)})).filter(x=>x.price.amount!==null&&x.price.perPerson);
 const total=priced.reduce((sum,x)=>sum+x.price.amount,0);
 const days=trip.days.map(day=>({day:day.day,date:day.date,start:day.startTime,end:day.stops.at(-1)?.endTime||null,provisional:day.stops.some(p=>p.provisional)}));
 return {days,dayCount:days.length,placeCount:stops.length,totalPerPerson:priced.length?total:null,pricedCount:priced.length,unpricedCount:stops.length-priced.length,mockPriceCount:priced.filter(x=>x.p.isMock).length,
  costNote:`전체 ${stops.length}곳 중 1인 금액 ${priced.length}곳만 합산${priced.some(x=>x.p.isMock)?' · 가상 금액 포함':''}. 미등록·기준 미확인 금액, 교통비·숙박비·추가 주문·개인 소비는 제외하며 인원수를 곱하지 않았습니다.`};
}
const el=(tag,text,cls)=>{const node=document.createElement(tag);if(text)node.textContent=text;if(cls)node.className=cls;return node;};
export function renderItineraryDay(day,{regions,renderReasons,badge,onEdit}){
 const dayCard=el('article','','day-card');dayCard.id='itinerary-day-'+day.day;dayCard.dataset.start=day.startTime;dayCard.dataset.deadline=day.endTime;
 const last=day.stops.at(-1),provisional=day.stops.some(p=>p.provisional);
 dayCard.append(el('h3',`DAY ${String(day.day).padStart(2,'0')} · ${day.date||day.day+'일차'} · ${day.region}`),el('p',`${day.startTime}–${last?.endTime||day.startTime}${provisional?' (이동 미반영 최소 시각)':''} · 활동 마감 ${day.endTime} · ${day.budgetMinutes}분 예산 · 방문 ${day.stops.length}곳`,'day-meta'));
 if(!day.stops.length){const empty=el('div','','empty-state');empty.append(el('p','조건·영업시간·활동시간에 맞는 장소가 부족합니다. 여행시간을 늘리거나 권역·관심사·실내외·예산 조건을 완화해 주세요.'));const edit=el('button','조건 다시 수정하기','outline-button');edit.type='button';edit.addEventListener('click',onEdit);empty.append(edit);dayCard.append(empty);return dayCard;}
 const list=el('ol','','day-timeline');let order=0;
 for(const item of day.timeline){
  const row=el('li','','timeline-item timeline-entry');row.dataset.kind=item.kind;
  const marker=el('span',item.kind==='travel'?'→':item.kind==='wait'?'…':String(++order),'timeline-marker');marker.setAttribute('aria-hidden','true');
  const content=el('div','','timeline-content');
  const time=el('span',item.time+(item.endTime?'–'+item.endTime:' → 미정'),'timeline-time');
  if(item.kind==='travel'||item.kind==='wait'){
   row.classList.add(item.kind==='travel'?'transfer-row':'wait-row');content.append(time,el('h4',item.kind==='travel'?'다음 장소 이동':item.label));
   if(item.kind==='travel')content.append(el('p',item.from+' → '+item.to),el('p',item.label+(item.minutes===null?'':' · '+item.minutes+'분')+' / 근거: '+(item.source||'등록 자료 없음'),'source-note'));
   else content.append(el('p',item.minutes+'분 · 등록 운영시간에 맞춘 대기·휴식','source-note'));
  }else{
   const type=placeType(item);row.dataset.tone=type.tone;if(item.isMock)row.dataset.mock='true';
   content.classList.add('itinerary-card','tone-'+type.tone);
   const top=el('div','','visit-card-top');top.append(time,el('span',type.icon+' '+type.label,'visit-type'));content.append(top);
   content.append(el('span',day.day+'일차 · '+order+'번째 방문','visit-order'),el('h4',item.title),badge(item.verification));
   const location=item.address|| (item.area?(item.isMock?'가상 배치: ':'')+item.area+' · '+(regions[item.region]||day.region):day.region+' · 상세 읍·면/주소 확인 필요');
   content.append(el('p','📍 '+location,'visit-location'));
   const facts=el('dl','','visit-facts');
   for(const [label,value]of [['예상 체류',item.minutes+'분 (등록 가정값)'],['예상 이용금액',pricePresentation(item).text]]){const pair=el('div');pair.append(el('dt',label),el('dd',value));facts.append(pair);}
   content.append(facts);
   if(item.reasons?.length)content.append(renderReasons(item.reasons));
   content.append(el('p',item.openingLabel+(item.dateChecked?'':day.date?' · 휴무정보 확인 필요':' · 날짜 미지정: 휴무 확인 필요'),'source-note'));
   if(item.bookingRequired)content.append(el('p','운영·예약 가능 여부를 확인한 뒤 방문을 확정해 주세요.','source-note'));
   const map=mapDestination(item),actions=el('div','','visit-actions');
   if(map.url){const link=el('a','지도에서 보기 ↗','map-button');link.href=map.url;link.target='_blank';link.rel='noopener noreferrer';actions.append(link);}
   else{const disabled=el('button','지도에서 보기','map-button');disabled.type='button';disabled.disabled=true;actions.append(disabled);}
   content.append(actions,el('p',map.note,'map-note'));
   const detail=el('details','','venue-details'),summary=el('summary','장소 설명·데이터 확인');detail.append(summary,el('p',item.description||'추가 설명 없음'));
   if(item.sourceUrl){const source=el('a','확인한 원문 ↗');source.href=item.sourceUrl;source.target='_blank';source.rel='noopener noreferrer';detail.append(source);}
   content.append(detail);
  }
  if(item.provisional)content.append(el('p','이동시간 미확인 · 표시 시각은 확정 시각이 아닙니다.','timing-note'));
  row.append(marker,content);list.append(row);
 }
 dayCard.append(list);
 if(day.missing.length)dayCard.append(el('p','이 날짜에 배치하지 않은 관심사: '+day.missing.join(', ')+' · 다른 날짜를 확인하거나 조건을 바꿔보세요.','missing-note'));
 return dayCard;
}
