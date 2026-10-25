import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { recommendationReasons } from './public/recommendation-reasons.js';
import { buildTrip } from './public/planner.js';
const place={minutes:60,category:'맛집',categories:['맛집'],audiences:['가족']};
const context={options:{companion:'가족'},interests:['맛집'],start:720,end:780,dayStart:570,dayEnd:900,provisional:false};
const codes=reasons=>reasons.map(r=>r.code);
test('선택한 동행·관심사가 데이터에 일치할 때만 이유 표시',()=>{
 const reasons=recommendationReasons(place,context);
 assert.equal(reasons[0].text,'가족 여행 조건과 일치');assert.equal(reasons[1].text,'맛집 관심사와 일치');
 const mismatch=recommendationReasons(place,{...context,options:{companion:'연인'},interests:['카페']});
 assert.ok(!codes(mismatch).includes('companion'));assert.ok(!codes(mismatch).includes('interest'));assert.ok(!codes(mismatch).includes('lunch'));
});
test('점심시간에 실제 배치된 식사에만 점심 이유 표시',()=>{
 assert.ok(codes(recommendationReasons(place,context)).includes('lunch'));
 for(const start of [660,900])assert.ok(!codes(recommendationReasons(place,{...context,start,end:start+60,dayEnd:1100})).includes('lunch'));
 assert.ok(!codes(recommendationReasons({...place,category:'카페',categories:['카페']},{...context,interests:['카페']})).includes('lunch'));
});
test('미확인 이동 뒤 임시 시각을 점심·전체 여행시간 충족으로 설명하지 않음',()=>{
 const reasons=recommendationReasons(place,{...context,provisional:true});
 assert.deepEqual(codes(reasons),['companion','interest']);assert.ok(!reasons.some(r=>/이동|근거리|최적|점심|시간 내/.test(r.text)));
});
test('여행시간 이유는 계산한 체류 구간이 입력 범위 안일 때만 표시',()=>{
 assert.ok(codes(recommendationReasons(place,context)).includes('time-budget'));
 for(const extra of [{end:901},{start:500,end:560},{end:781},{dayEnd:undefined}])assert.ok(!codes(recommendationReasons(place,{...context,...extra})).includes('time-budget'));
});
test('자연 관심사 이유에 실제 사용한 분류 기준을 명시하고 선택 안 된 취향은 만들지 않음',()=>{
 const nature={minutes:60,categories:['볼거리'],audiences:['혼자'],themeMatch:true};
 const c={...context,options:{themes:['nature']},interests:['볼거리']};
 assert.match(recommendationReasons(nature,c)[0].text,/자연·힐링.*이름·야외 분류 기준/);
 assert.equal(recommendationReasons(nature,{...c,options:{}})[0].text,'볼거리 관심사와 일치');
 assert.equal(recommendationReasons({...nature,themeMatch:false},c)[0].text,'볼거리 관심사와 일치');
});
test('시간순 일정의 모든 이유를 기존 데이터와 계산한 슬롯에 대조',()=>{
 const catalogue=JSON.parse(readFileSync(new URL('./public/catalogue.json',import.meta.url))),dining=JSON.parse(readFileSync(new URL('./public/dining.json',import.meta.url))).places;
 const options={duration:'당일치기',startTime:'09:30',availableMinutes:480,companion:'가족',interests:['볼거리','맛집','카페'],includePending:true,includeMock:true,travelAllowanceMinutes:15,transport:'car'};
 const result=buildTrip(options,catalogue,[],dining),sources=[...catalogue.places,...dining];
 assert.ok(result.days[0].stops.length>=3);
 for(const stop of result.days[0].stops){
  const source=sources.find(p=>p.id===stop.id);assert.ok(source);assert.ok(stop.reasons.length>0);
  assert.equal(stop.reason,stop.reasons.map(r=>r.text).join(' · '));
  if(codes(stop.reasons).includes('companion'))assert.ok(source.audiences.includes(options.companion));
  if(codes(stop.reasons).includes('interest'))assert.ok(source.categories.some(c=>options.interests.includes(c)));
  if(codes(stop.reasons).includes('lunch')){assert.equal(stop.category,'맛집');assert.ok(stop.time>='11:30'&&stop.time<='14:00');}
  assert.ok(stop.reasons.every(r=>!/(?:가까운|최단|실시간|AI|이동시간)/.test(r.text)));
 }
});
