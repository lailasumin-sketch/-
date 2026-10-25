import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parsePrompt, buildTrip, validDate } from './public/planner.js';
const catalogue=JSON.parse(readFileSync(new URL('./public/catalogue.json',import.meta.url)));
const defaults={duration:'1박 2일',companion:'연인',interests:['볼거리','맛집'],transport:'car',includePending:true,pace:'normal'};
const trip=options=>buildTrip({...defaults,...options},catalogue);
const ids=result=>result.days.flatMap(d=>d.stops.filter(s=>s.kind==='place').map(s=>s.id));
test('예시 문장에 대한 동행·기간·관심사 추출',()=>{
 const p=parsePrompt('연인이랑 단둘이 맛집을 찾고 1박2일로 볼거리 체험거리 즐기고 의성 특산물도 사고 싶어 의성에서 하룻밤 보낼거야');
 assert.equal(p.duration,'1박 2일'); assert.equal(p.companion,'연인');
 assert.deepEqual(p.interests,['볼거리','맛집','체험','특산물 쇼핑','숙박']);
});
test('문장 속 부정 조건을 관심사로 넣지 않음',()=>{
 const p=parsePrompt('체험은 빼고 맛집과 볼거리, 축제는 필요 없어. 대중교통으로 느긋하게');
 assert.deepEqual(p.excludedInterests,['체험','축제']);assert.ok(!p.interests.includes('체험'));assert.equal(p.transport,'public');assert.equal(p.pace,'relaxed');
});
test('자연어의 실내·권역·날짜를 반영하고 잘못된 날짜는 거절',()=>{
 const p=parsePrompt('아이와 안계에서 실내 위주로 2026년 11월 2일 당일치기');
 assert.equal(p.companion,'가족');assert.equal(p.environment,'indoor');assert.equal(p.region,'west');assert.equal(p.date,'2026-11-02');
 assert.equal(validDate('2026-02-30'),false);assert.equal(parsePrompt('2026년 2월 30일').date,undefined);
});
test('35개 후보는 모두 미검증이며 확인한 출처나 가격을 생성하지 않음',()=>{
 assert.equal(catalogue.places.length,35);
 assert.equal(new Set(catalogue.places.map(p=>p.id)).size,35);
 for(const p of catalogue.places){assert.equal(p.verification,'pending');assert.equal(p.sourceUrl,null);assert.equal(p.sourceCheckedAt,null);assert.equal(p.price,null);}
});
test('커플·가족·친구의 같은 기간 여행 결과가 달라짐',()=>{
 const couple=ids(trip({duration:'당일치기',companion:'연인'}));
 const family=ids(trip({duration:'당일치기',companion:'가족'}));
 const friends=ids(trip({duration:'당일치기',companion:'친구',pace:'active'}));
 assert.notDeepEqual(couple,family);assert.notDeepEqual(couple,friends);assert.ok(couple.length&&family.length&&friends.length);
});
test('체험·쇼핑·볼거리 각각 실제 후보 분류를 선택',()=>{
 for(const interest of ['볼거리','체험','특산물 쇼핑']){
  const result=trip({duration:'당일치기',interests:[interest]});
  const stops=result.days.flatMap(d=>d.stops.filter(s=>s.kind==='place'));
  assert.ok(stops.length);assert.ok(stops.every(s=>s.categories.includes(interest)));
 }
});
test('실내·서부권 조건을 벗어나는 후보를 넣지 않음',()=>{
 const result=trip({duration:'당일치기',companion:'가족',environment:'indoor',region:'west',interests:['볼거리','체험']});
 for(const id of ids(result)){const p=catalogue.places.find(p=>p.id===id);assert.equal(p.region,'west');assert.equal(p.indoor,true);}
 assert.ok(ids(result).length);
});
test('다일 여행은 장소와 같은 시설군을 반복하지 않음',()=>{
 const result=trip({duration:'2박 3일',interests:['볼거리','체험','특산물 쇼핑']});
 const selected=ids(result);assert.equal(new Set(selected).size,selected.length);
 const groups=selected.map(id=>catalogue.places.find(p=>p.id===id).group);assert.equal(new Set(groups).size,groups.length);
 assert.equal(result.days.length,3);assert.ok(result.days.every(d=>d.stops.length));
});
test('느긋한 1박2일도 전체 기간에 관심사를 분산해 포함',()=>{
 const result=trip({pace:'relaxed',interests:['볼거리','체험','특산물 쇼핑','맛집']});
 const categories=result.days.flatMap(d=>d.stops.flatMap(s=>s.categories||[]));
 for(const c of ['볼거리','체험','특산물 쇼핑'])assert.ok(categories.includes(c),c);
});
test('반나절·느긋한 일정은 방문 수와 종료시간을 제한',()=>{
 const short=trip({duration:'반나절',pace:'active',interests:['볼거리','체험','특산물 쇼핑']});
 assert.ok(ids(short).length<=2);assert.ok(short.days[0].stops.every(s=>!s.endTime||s.endTime<='14:00'));
 const relaxed=trip({duration:'당일치기',pace:'relaxed'});assert.ok(ids(relaxed).length<=2);
});
test('후보 포함 해제 시 검증되지 않은 장소를 보여주지 않음',()=>{
 const result=trip({includePending:false,interests:['볼거리'],duration:'당일치기'});
 assert.equal(ids(result).length,0);assert.equal(result.verifiedCount,0);assert.equal(result.days[0].stops.length,0);
});
test('보류 장소는 모든 동행과 실내외 조건에서 추천 제외',()=>{
 for(const companion of ['가족','친구','연인','혼자']){
  const result=trip({companion,duration:'2박 3일',region:'east',pace:'active',interests:['볼거리','체험','숙박']});
  for(const day of result.days)for(const stop of day.stops)assert.ok(!catalogue.places.find(p=>p.id===stop.id)?.hold);
 }
});
test('음식점·숙소 자료가 없을 때 실재하는 추천 업소처럼 표시하지 않음',()=>{
 const result=trip({interests:['맛집','숙박']});
 assert.equal(result.days.flatMap(d=>d.stops).length,0);
 assert.ok(result.missing.includes('맛집'));
 assert.ok(result.lodgingSuggestions.some(s=>s.includes('숙소 찾기')));
});
test('날짜별 휴무와 확인된 축제의 개최 기간을 검사',()=>{
 const data=structuredClone(catalogue);
 data.places=data.places.map(p=>({...p,verification:'verified',closedWeekdays:[1]}));
 const result=buildTrip({...defaults,date:'2026-11-02',duration:'당일치기',includePending:false,interests:['볼거리','축제']},data,[{name:'테스트 행사',verification:'verified',startDate:'2026-11-02',endDate:'2026-11-03',sourceUrl:'https://www.usc.go.kr/'}]);
 assert.equal(ids(result).length,0);assert.equal(result.events.length,1);
 const outside=buildTrip({...defaults,date:'2026-11-05',interests:['축제']},data,[{verification:'verified',startDate:'2026-11-02',endDate:'2026-11-03'}]);assert.equal(outside.events.length,0);
});
test('축제의 확인되지 않은 개최 기간을 만들거나 코스에 넣지 않음',()=>{
 const result=trip({interests:['축제'],duration:'당일치기',date:'2026-11-02'});
 assert.equal(result.events.length,0);assert.equal(result.days[0].stops.length,0);assert.ok(result.notes.some(n=>n.includes('축제를 일정에 임의로 넣지')));
});
test('데이터 로딩 실패와 알 수 없는 문장을 조용히 성공 처리하지 않음',()=>{
 assert.throws(()=>buildTrip(defaults),/불러오지/);assert.deepEqual(parsePrompt('안녕하세요'),{interests:[],excludedInterests:[]});
});

test('숙박을 명시적으로 제외하면 다일 여행에도 숙소 검색을 강요하지 않음',()=>{
 const result=trip({excludedInterests:['숙박'],interests:['볼거리']});
 assert.ok(result.days.flatMap(d=>d.stops).every(s=>s.kind!=='lodging'&&!s.title.includes('숙소 찾기')));
 assert.ok(result.notes.some(n=>n.includes('숙박 제외')));
});

test('반려견 없이 펫월드로 보내지 않고 반려견 요청 때만 해당 후보 사용',()=>{
 const regular=trip({interests:['체험','볼거리'],region:'west',companion:'가족'});assert.ok(!ids(regular).includes('petworld'));
 const pet=trip({...parsePrompt('반려견과 야외 체험 당일치기'),region:'west'});assert.ok(ids(pet).includes('petworld'));assert.ok(ids(pet).every(id=>id==='petworld'));
});
