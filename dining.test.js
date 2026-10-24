import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parsePrompt, buildTrip } from './public/planner.js';
import { searchDining, diningSlot, minutesOf } from './public/dining.js';
const {places:dining}=JSON.parse(readFileSync(new URL('./public/dining.json',import.meta.url)));
const catalogue=JSON.parse(readFileSync(new URL('./public/catalogue.json',import.meta.url)));
const defaults={duration:'당일치기',companion:'연인',interests:['맛집','카페'],transport:'car',includePending:true,includeMock:true};
const plan=options=>buildTrip({...defaults,...options},catalogue,[],dining);
const mockStops=trip=>trip.days.flatMap(d=>d.stops.filter(p=>p.isMock));
test('엑셀·CSV에서 변환한 데이터 30개는 모두 가상이며 실주소·예약·전화가 없음',()=>{
 assert.equal(dining.length,30);assert.equal(dining.filter(p=>p.category==='맛집').length,18);assert.equal(dining.filter(p=>p.category==='카페').length,12);
 for(const p of dining){assert.ok(p.isMock&&p.name.startsWith('[가상] '));assert.equal(p.verification,'fictional');assert.equal(p.address,null);assert.equal(p.bookingUrl,null);assert.equal(p.phone,null);}
});
test('카페와 맛집 검색은 해당 분류만 반환하며 메뉴·업소명 검색 가능',()=>{
 assert.equal(searchDining(dining,{query:'카페'}).length,12);assert.equal(searchDining(dining,{query:'맛집'}).length,18);
 assert.equal(searchDining(dining,{query:'커피'}).length,12);
 assert.ok(searchDining(dining,{query:'마늘'}).every(p=>(p.name+p.menu+p.tags.join('')).includes('마늘')));
 assert.equal(searchDining(dining,{query:'초록우편 커피'})[0].id,'MOCK-019');
 assert.equal(searchDining(dining,{query:'빙수'})[0].id,'MOCK-029');
 assert.equal(searchDining(dining,{query:'맛집, 카페'}).length,30);
});
test('검색창의 자연어 예산과 조용한 조건이 기본 필터값에 덮이지 않음',()=>{
 const hits=searchDining(dining,{query:'조용한 카페 1만원 이하',maxDiningPrice:0});
 assert.ok(hits.length);assert.ok(hits.every(p=>p.category==='카페'&&p.noise==='낮음'&&p.price<=10000));
 const strict=searchDining(dining,{query:'카페 1만원 미만'});assert.ok(strict.length);assert.ok(strict.every(p=>p.price<10000));
});
test('메뉴·권역·예산·주차·반려견 조건을 함께 적용',()=>{
 const hits=searchDining(dining,{category:'카페',region:'central',maxDiningPrice:10000,parkingOnly:true,withPet:true});
 assert.deepEqual(hits.map(p=>p.id),['MOCK-025']);
 assert.equal(searchDining(dining,{category:'카페',withPet:true,environment:'indoor'}).length,0);
});
test('클릭과 문장 입력으로 맛집·카페를 개별 인식하고 제외 조건 반영',()=>{
 const p=parsePrompt('연인과 당일치기로 조용한 카페와 맛집, 주차 가능하고 1인 1만5천원 이하');
 assert.equal(p.companion,'연인');assert.ok(p.interests.includes('카페')&&p.interests.includes('맛집'));assert.equal(p.maxDiningPrice,15000);assert.equal(p.quiet,true);assert.equal(p.parkingOnly,true);
 const negative=parsePrompt('카페는 빼고 맛집');assert.deepEqual(negative.interests,['맛집']);assert.deepEqual(negative.excludedInterests,['카페']);
});
test('가상 운영시간·브레이크타임·마감을 넘기는 슬롯을 넣지 않음',()=>{
 const sushi=dining.find(p=>p.id==='MOCK-014');
 assert.equal(diningSlot(sushi,minutesOf('14:00'),minutesOf('21:00')).start,minutesOf('17:00'));
 assert.equal(diningSlot(sushi,minutesOf('20:30'),minutesOf('21:00')),null);
});
test('추천 일정에 엑셀의 가상 맛집과 카페가 실제로 들어가고 지도 쿼리가 없음',()=>{
 const result=plan();const stops=mockStops(result);
 assert.ok(stops.some(p=>p.categories.includes('맛집')));assert.ok(stops.some(p=>p.categories.includes('카페')));
 for(const stop of stops){assert.ok(stop.title.startsWith('[가상] '));assert.equal(stop.query,null);assert.equal(stop.verification,'fictional');}
 assert.ok(result.notes.some(n=>n.includes('가상 테스트 업소')));
});
test('여행일의 가상 휴무일과 영업시간을 반영하며 중복·겹치는 시간을 막음',()=>{
 const result=plan({duration:'2박 3일',date:'2026-11-02',interests:['맛집','카페','볼거리']});
 const ids=mockStops(result).map(p=>p.id);assert.equal(new Set(ids).size,ids.length);
 for(const day of result.days){
  let previous=0;
  for(const stop of day.stops){assert.ok(minutesOf(stop.time)>=previous);previous=minutesOf(stop.endTime||stop.time);
   if(stop.isMock){const p=dining.find(p=>p.id===stop.id);assert.ok(!p.closedWeekdays.includes(new Date(day.date+'T00:00:00Z').getUTCDay()));assert.ok(minutesOf(stop.time)>=minutesOf(p.openTime));assert.ok(minutesOf(stop.endTime)<=minutesOf(p.closeTime));}
  }
 }
});
test('검색어로 특정 가상 업소를 선택하면 다른 업소로 대체하지 않음',()=>{
 const result=plan({interests:['카페'],diningQuery:'초록우편 커피',region:'central'});
 assert.deepEqual(mockStops(result).map(p=>p.id),['MOCK-019']);
 const closed=plan({interests:['카페'],diningQuery:'초록우편 커피',region:'central',date:'2026-11-02'});
 assert.equal(mockStops(closed).length,0);assert.ok(closed.missing.includes('카페'));
});
test('가상 데이터 끄기·낮은 예산·카페 제외 때 억지로 가상 업소를 넣지 않음',()=>{
 assert.equal(mockStops(plan({includeMock:false})).length,0);
 const noMatches=plan({maxDiningPrice:1000});assert.equal(mockStops(noMatches).length,0);assert.deepEqual(noMatches.missing,['맛집','카페']);
 assert.ok(mockStops(plan({interests:['맛집'],excludedInterests:['카페']})).every(p=>p.categories.includes('맛집')));
});
test('관광 미확인 후보 제외와 가상 업소 사용은 서로 독립적',()=>{
 const result=plan({includePending:false,includeMock:true,interests:['카페','볼거리']});
 assert.ok(mockStops(result).length);assert.equal(result.days.flatMap(d=>d.stops).filter(p=>p.kind==='place').length,0);
});
