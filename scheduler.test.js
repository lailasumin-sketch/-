import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { buildTrip, parsePrompt } from './public/planner.js';
import { resolveTravel, toMinutes } from './public/scheduler.js';
import { loadTripData } from './public/load-data.js';
const catalogue=JSON.parse(readFileSync(new URL('./public/catalogue.json',import.meta.url)));
const diningData=JSON.parse(readFileSync(new URL('./public/dining.json',import.meta.url)));
const emptyTravel=JSON.parse(readFileSync(new URL('./public/travel-times.json',import.meta.url)));
const defaults={duration:'당일치기',startTime:'09:30',availableMinutes:480,companion:'연인',interests:['볼거리','맛집','카페'],transport:'car',includePending:true,includeMock:true,pace:'normal'};
const plan=options=>buildTrip({...defaults,...options},catalogue,[],diningData.places,emptyTravel);
function checkSchedule(trip) {
 const ids=new Set();let total=0;
 for(const day of trip.days){
  let end=toMinutes(day.startTime);
  for(const event of day.timeline){
   assert.ok(toMinutes(event.time)>=end,'시간 겹침');
   if(event.endTime){assert.ok(toMinutes(event.endTime)<=toMinutes(day.endTime),'종료시간 초과');assert.ok(toMinutes(event.endTime)>=toMinutes(event.time));end=toMinutes(event.endTime);}
   else {assert.equal(event.kind,'travel');assert.equal(event.minutes,null);assert.equal(event.basis,'unknown');end=toMinutes(event.time);}
  }
  for(const stop of day.stops){assert.ok(!ids.has(stop.id),'중복 방문');ids.add(stop.id);assert.ok(stop.minutes>0);assert.ok(toMinutes(stop.time)>=toMinutes(day.startTime));}
  total+=day.budgetMinutes;
 }
 assert.equal(total,trip.stats.budgetMinutes);assert.ok(trip.stats.plannedMinutes<=total);
 assert.equal(ids.size,trip.stats.totalVisitCount);
}
test('요청 시나리오: 반나절 가족 여행, 사용자 이동 여유까지 포함해 4시간 이내',()=>{
 const t=plan({duration:'반나절',availableMinutes:240,companion:'가족',travelAllowanceMinutes:15});checkSchedule(t);
 assert.ok(t.stats.totalVisitCount>=2);assert.equal(t.stats.unknownTravelLegs,0);assert.ok(t.stats.userAllowanceMinutes>0);
 assert.ok(t.days.flatMap(d=>d.stops).some(p=>p.audiences.includes('가족')));
});
test('요청 시나리오: 당일 연인 여행과 이동·대기 시간 구간',()=>{
 const t=plan({travelAllowanceMinutes:20,interests:['볼거리','맛집','카페','체험']});checkSchedule(t);
 assert.ok(t.days[0].stops.some(p=>p.category==='맛집'));assert.ok(t.days[0].stops.some(p=>p.category==='카페'));assert.ok(t.days[0].timeline.some(p=>p.kind==='travel'));
 assert.ok(t.days[0].stops.some(p=>p.reason.includes('연인')));
});
test('요청 시나리오: 자연·힐링 중심과 문장의 시작시간·총 활동시간 추출',()=>{
 const parsed=parsePrompt('혼자 자연 힐링 여행, 오전 9시30분부터 총 4시간');
 assert.deepEqual(parsed.themes,['nature']);assert.equal(parsed.startTime,'09:30');assert.equal(parsed.availableHours,4);
 const t=plan({...parsed,availableMinutes:240,travelAllowanceMinutes:10});checkSchedule(t);
 assert.ok(t.days[0].stops.some(p=>p.themeMatch));assert.ok(t.days[0].stops.every(p=>!p.isMock));
});
test('요청 시나리오: 맛집·카페 중심에서 관광지·검색 과제를 억지로 넣지 않음',()=>{
 const t=plan({interests:['맛집','카페'],travelAllowanceMinutes:15});checkSchedule(t);
 assert.equal(t.stats.totalVisitCount,2);assert.ok(t.days[0].stops.every(p=>p.isMock));assert.equal(t.stats.commercialCount,2);assert.equal(t.stats.commercialMockCount,2);
});
test('요청 시나리오: 여행시간 20분이면 체류시간을 줄이거나 숫자를 만들어 넣지 않음',()=>{
 const t=plan({availableMinutes:20});checkSchedule(t);assert.equal(t.stats.totalVisitCount,0);assert.equal(t.stats.totalStayMinutes,0);assert.deepEqual(t.missing,['볼거리','맛집','카페']);
});
test('요청 시나리오: 영업시간이 맞지 않는 이른 아침은 빈 일정',()=>{
 const t=plan({startTime:'06:00',availableMinutes:60,interests:['맛집','카페']});checkSchedule(t);assert.equal(t.stats.totalVisitCount,0);
});
test('요청 시나리오: CSV 원본 누락 시 변환 실패를 명시하고 기존 웹 자료 보존',()=>{
 const path=new URL('./public/dining.json',import.meta.url),digest=()=>createHash('sha256').update(readFileSync(path)).digest('hex'),before=digest();
 const result=spawnSync(process.execPath,['scripts/dining-import.js','--source','/tmp/uidongi-no-such-csv-20261025.csv','--check'],{cwd:new URL('./',import.meta.url),encoding:'utf8'});
 assert.equal(result.status,1);assert.match(result.stderr,/CSV 원본을 읽을 수 없습니다/);assert.equal(digest(),before);
});
test('이동 자료가 없으면 null과 확인 필요를 유지하며 25분·45분을 생성하지 않음',()=>{
 const t=plan({interests:['볼거리'],availableMinutes:240});checkSchedule(t);
 assert.ok(t.stats.unknownTravelLegs>0);assert.equal(t.stats.totalTravelMinutes,null);assert.equal(t.stats.knownTravelMinutes,0);assert.ok(t.stats.timingProvisional);
 assert.ok(t.days[0].timeline.filter(p=>p.kind==='travel').every(p=>p.minutes===null&&p.label==='이동시간 확인 필요'));
 assert.ok(t.days[0].stops.slice(1).every(p=>p.provisional));
 assert.ok(t.days[0].stops.every(p=>p.openingLabel==='운영시간 확인 필요'));
});
const fixture=(id,categories,minutes=40,extra={})=>({id,name:id,categories,minutes,audiences:['가족','연인'],region:'central',group:id,description:'테스트 fixture',verification:'verified',indoor:false,openingHours:{open:'09:00',close:'18:00'},...extra});
const fixtureCatalogue=places=>({meta:{regions:{central:'테스트 권역'}},places});
const fakeRegionTravel={routes:[],regionRoutes:[{fromRegion:'central',toRegion:'central',transport:'car',minutes:15,basis:'fictional',source:'테스트 픽스처: 가상 권역표'}]};
test('가상 시간표가 주어졌을 때만 15분 이동을 배치하고 근거·가상 여부 표시',()=>{
 const data=fixtureCatalogue([fixture('tour',['볼거리'],60),fixture('food',['맛집'],60,{openingHours:{open:'11:00',close:'14:00'}}),fixture('cafe',['카페'],30,{openingHours:{open:'12:00',close:'18:00'}})]);
 const t=buildTrip({...defaults,includeMock:false,availableMinutes:240},data,[],[],fakeRegionTravel);checkSchedule(t);
 assert.equal(t.stats.totalVisitCount,3);assert.equal(t.stats.totalTravelMinutes,30);assert.equal(t.stats.fictionalTravelMinutes,30);
 const food=t.days[0].stops.find(p=>p.category==='맛집');assert.ok(toMinutes(food.time)>=690&&toMinutes(food.time)<=840);
 for(const move of t.days[0].timeline.filter(p=>p.kind==='travel')){assert.equal(move.label,'가상 이동시간');assert.match(move.source,/픽스처/);assert.equal(toMinutes(move.endTime)-toMinutes(move.time),15);}
});
test('제공된 구간표가 있으면 관심사·동행·운영시간 조건 동률에서 이동 합계 최소화',()=>{
 const data=fixtureCatalogue(['A','B','C'].map(id=>fixture(id,['볼거리'],30)));
 const table={routes:[['A','B',5],['B','C',5],['A','C',40]].map(([from,to,minutes])=>({from,to,minutes,transport:'car',basis:'fictional',source:'테스트 구간표',bidirectional:true})),regionRoutes:[]};
 const t=buildTrip({...defaults,interests:['볼거리'],includeMock:false,availableMinutes:180},data,[],[],table);checkSchedule(t);
 assert.equal(t.stats.totalVisitCount,3);assert.equal(t.stats.totalTravelMinutes,10);
});
test('시간이 부족하면 관심사 일치가 낮은 후보를 제외',()=>{
 const data=fixtureCatalogue([fixture('high',['볼거리','체험'],60),fixture('low',['볼거리'],60)]);
 const t=buildTrip({...defaults,interests:['볼거리','체험'],includeMock:false,availableMinutes:60},data);checkSchedule(t);assert.deepEqual(t.days[0].stops.map(p=>p.id),['high']);
});
test('운영시간·브레이크타임·날짜별 휴무, 알 수 없는 읍면을 조작하지 않음',()=>{
 const data=fixtureCatalogue([fixture('break',['체험'],60,{openingHours:{open:'09:00',close:'15:00',breaks:[['10:00','12:00']]}}),fixture('closed',['체험'],30,{closedWeekdays:[0]})]);
 const t=buildTrip({...defaults,startTime:'09:30',date:'2026-10-25',availableMinutes:240,interests:['체험'],includeMock:false},data);checkSchedule(t);
 assert.deepEqual(t.days[0].stops.map(p=>p.id),['break']);assert.equal(t.days[0].stops[0].time,'12:00');assert.equal(t.days[0].stops[0].area,null);assert.equal(t.stats.totalWaitMinutes,150);
});
test('여러 날은 총 예산을 정확히 분배하고 방문 중복·종료 초과 없음',()=>{
 const t=plan({duration:'2박 3일',availableMinutes:1001,travelAllowanceMinutes:10,interests:['볼거리','체험','특산물 쇼핑','맛집','카페']});checkSchedule(t);
 assert.deepEqual(t.days.map(d=>d.budgetMinutes),[334,334,333]);
 const commerce=t.days.flatMap(d=>d.stops).filter(p=>p.categories.some(c=>['맛집','카페','특산물 쇼핑'].includes(c)));assert.equal(t.stats.commercialCount,commerce.length);
 assert.equal(t.stats.commercialMockCount+t.stats.commercialCandidateCount+t.stats.commercialVerifiedCount,t.stats.commercialCount);
});
test('이동수단·구간 방향·근거 없는 숫자 확인: 임의 역방향이나 빠른 이동을 만들지 않음',()=>{
 const a={id:'a',region:'central'},b={id:'b',region:'central'};
 const table={routes:[{from:'a',to:'b',transport:'car',minutes:7,basis:'published',source:'테스트 등록값(실측 아님)'}]};
 assert.equal(resolveTravel(a,b,'car',table).minutes,7);assert.equal(resolveTravel(b,a,'car',table).minutes,null);assert.equal(resolveTravel(a,b,'public',table).minutes,null);
 assert.equal(resolveTravel(a,b,'car',{routes:[{from:'a',to:'b',transport:'car',minutes:7}]}).minutes,null);
});
test('자정 초과, 잘못된 시작시간·여행일·이동 여유·0분 예산을 조용히 보정하지 않음',()=>{
 for(const o of [{startTime:'25:00'},{startTime:'23:00',availableMinutes:120},{availableMinutes:0},{date:'2026-02-30'},{travelAllowanceMinutes:-5}])assert.throws(()=>plan(o));
});
test('CSV 기반 웹 자료 누락·손상 시 관광 기능은 유지하고 누락 경고 제공',async()=>{
 const fetcher=async path=>({ok:path!=='/dining.json',status:path==='/dining.json'?404:200,json:async()=>path==='/catalogue.json'?catalogue:path==='/events.json'?{events:[]}:emptyTravel});
 const data=await loadTripData(fetcher);assert.deepEqual(data.dining,[]);assert.match(data.warnings.join(' '),/CSV 기반/);
 const t=buildTrip(defaults,data.catalogue,data.events,data.dining,data.travelTable);checkSchedule(t);assert.ok(t.stats.totalVisitCount>0);assert.ok(t.days.flatMap(d=>d.stops).every(p=>!p.isMock));
});
test('관광 필수 자료 누락은 명확한 실패, 이동표 누락은 확인 필요 상태로 계속',async()=>{
 await assert.rejects(loadTripData(async()=>({ok:false,status:404})),/관광 장소 자료/);
 const data=await loadTripData(async path=>({ok:path!=='/travel-times.json',status:404,json:async()=>path==='/catalogue.json'?catalogue:path==='/dining.json'?diningData:{events:[]}}));
 assert.deepEqual(data.travelTable,{routes:[],regionRoutes:[]});assert.match(data.warnings.join(' '),/이동시간표/);
});

test('카페가 첫 방문이어도 점심 선호 점수가 깨지지 않으며 가능하면 11:30 이후 식사',()=>{
 const t=plan({interests:['맛집','카페'],region:'central',availableMinutes:360,travelAllowanceMinutes:15});checkSchedule(t);
 const food=t.days[0].stops.find(p=>p.category==='맛집');assert.ok(food);assert.ok(toMinutes(food.time)>=690&&toMinutes(food.time)<=840);
});
