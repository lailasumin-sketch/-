import test from 'node:test';
import assert from 'node:assert/strict';
import {mapDestination,pricePresentation,itineraryOverview,placeType} from './public/itinerary-cards.js';
import {recommendationReasons} from './public/recommendation-reasons.js';
import {buildTrip} from './public/planner.js';
import {readFileSync} from 'node:fs';
const c=JSON.parse(readFileSync(new URL('./public/catalogue.json',import.meta.url))),d=JSON.parse(readFileSync(new URL('./public/dining.json',import.meta.url))).places;
test('유형별 카드 색상과 아이콘 분류를 실제 분류에 대응',()=>{
 assert.equal(placeType({category:'볼거리'}).tone,'nature');assert.equal(placeType({category:'맛집'}).tone,'food');assert.equal(placeType({category:'카페'}).tone,'cafe');assert.equal(placeType({category:'체험'}).tone,'experience');
});
test('주소·좌표가 있는 실제/조사 후보만 지도 URL 생성, API 키 없음',()=>{
 const a=mapDestination({address:'경상북도 의성군 의성읍 테스트 주소'});assert.ok(a.url);const url=new URL(a.url);assert.equal(url.searchParams.get('query'),'경상북도 의성군 의성읍 테스트 주소');assert.equal(url.searchParams.get('api'),'1');assert.ok(!url.searchParams.has('key'));
 const b=mapDestination({coordinates:{lat:36.35,lng:128.69}});assert.equal(new URL(b.url).searchParams.get('query'),'36.35,128.69');
});
test('가상 업소나 미확인 위치를 실제 지도 위치로 만들지 않음',()=>{
 for(const p of [{isMock:true,address:'가상주소',coordinates:{lat:36,lng:128}},{verification:'fictional',address:'임의 주소'},{},{address:'실제 주소 없음'},{coordinates:{lat:200,lng:0}}])assert.equal(mapDestination(p).url,null);
 assert.ok([...c.places,...d].every(p=>mapDestination(p).url===null));
});
test('가상 1인 금액과 단위 미확인 금액, 무료와 미등록을 구분',()=>{
 assert.equal(pricePresentation({price:null}).amount,null);assert.equal(pricePresentation({price:0,isMock:true}).amount,0);assert.equal(pricePresentation({price:10000}).perPerson,false);assert.equal(pricePresentation({price:10000,isMock:true}).perPerson,true);
 assert.equal(pricePresentation({price:-1,isMock:true}).amount,null);
});
test('총금액은 1인 기준이 있는 레코드만 한 번씩 합산하고 미등록 항목 안내',()=>{
 const trip={days:[{day:1,startTime:'09:30',stops:[{price:12000,isMock:true,endTime:'11:00'},{price:9000,isMock:true,endTime:'12:00'},{price:null,endTime:'13:00'},{price:5000,endTime:'14:00'}]}]};
 const s=itineraryOverview(trip);assert.equal(s.totalPerPerson,21000);assert.equal(s.pricedCount,2);assert.equal(s.unpricedCount,2);assert.equal(s.mockPriceCount,2);assert.match(s.costNote,/교통비·숙박비/);assert.equal(s.days[0].end,'14:00');
 const empty=itineraryOverview({days:[{day:1,startTime:'09:30',stops:[]}]});assert.equal(empty.totalPerPerson,null);assert.equal(empty.days[0].end,null);
});
test('예산·권역 이유는 실제 일치하는 필드에만 생성, 가상 표시 유지',()=>{
 const place={minutes:60,categories:['카페'],category:'카페',audiences:['연인'],price:10000,isMock:true,region:'west'};
 const ctx={options:{companion:'연인',maxDiningPrice:12000,region:'west'},interests:['카페'],start:720,end:780,dayStart:570,dayEnd:1000,provisional:false};
 const matched=recommendationReasons(place,ctx);assert.ok(matched.some(r=>r.code==='budget'&&r.text.includes('가상')));assert.ok(matched.some(r=>r.code==='region'&&r.text.includes('가상')));
 const unmatched=recommendationReasons(place,{...ctx,options:{maxDiningPrice:5000,region:'south'}});assert.ok(unmatched.every(r=>!['budget','region'].includes(r.code)));
});
test('실제 CSV의 긴 일정은 점심·저녁에 서로 다른 맛집을 배치하고 시간 중복 없음',()=>{
 const t=buildTrip({duration:'당일치기',startTime:'09:30',availableMinutes:720,interests:['맛집','카페','볼거리'],includePending:true,includeMock:true,companion:'친구',transport:'car',travelAllowanceMinutes:15},c,[],d);
 const meals=t.days[0].stops.filter(p=>p.category==='맛집');assert.equal(meals.length,2);assert.deepEqual(meals.map(p=>p.mealPeriod).sort(),['dinner','lunch']);assert.equal(new Set(meals.map(p=>p.id)).size,2);
 assert.ok(meals.find(p=>p.mealPeriod==='dinner').reasons.some(r=>r.code==='dinner'));
 let end='09:30';for(const p of t.days[0].timeline){assert.ok(p.time>=end);end=p.endTime||p.time;assert.ok(end<='21:30');}
});
test('요약 시간은 활동 마감이 아닌 실제 마지막 방문 종료와 이동 미확정 상태를 표시',()=>{
 const t=buildTrip({duration:'당일치기',startTime:'10:00',availableMinutes:480,interests:['볼거리'],includePending:true,transport:'car'},c);
 const summary=itineraryOverview(t);assert.equal(summary.days[0].end,t.days[0].stops.at(-1).endTime);assert.ok(summary.days[0].provisional);assert.equal(summary.placeCount,t.stats.totalVisitCount);
});
