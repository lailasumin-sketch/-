import { readFile, writeFile } from 'node:fs/promises';
const root = new URL('../',import.meta.url);
const data = JSON.parse(await readFile(new URL('public/catalogue.json',root),'utf8'));
const events = JSON.parse(await readFile(new URL('public/events.json',root),'utf8')).events;
const seen = new Set();
const fail = message => { throw new Error(message); };
for (const p of data.places) {
  if(!p.id||seen.has(p.id))fail('장소 ID가 없거나 중복됨');seen.add(p.id);
  if(!p.name||!data.meta.regions[p.region]||!p.categories?.length||!p.audiences?.length)fail(p.id+': 이름·분류·권역·취향 누락');
  if(!['pending','verified'].includes(p.verification))fail(p.id+': 확인 상태 오류');
  if(!Number.isInteger(p.minutes)||p.minutes<=0)fail(p.id+': 편집상 체류시간 오류');
  if(p.verification==='verified'){
    if(!p.sourceUrl||!p.sourceCheckedAt)fail(p.id+': 검증 상태에는 원문 상세 URL과 직접 확인일 필요');
    const url=new URL(p.sourceUrl);
    if(url.protocol!=='https:'||!['www.usc.go.kr','usc.go.kr','korean.visitkorea.or.kr','www.heritage.go.kr','www.khs.go.kr'].includes(url.hostname))fail(p.id+': 허용된 공식 원문 HTTPS 주소가 아님');
    if(url.pathname==='/'&&!url.search)fail(p.id+': 홈페이지 첫 화면은 상세 정보 근거로 사용할 수 없음');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(p.sourceCheckedAt))fail(p.id+': 확인일 형식 오류');
  } else if(p.sourceCheckedAt)fail(p.id+': 미확인 후보에 확인일을 넣지 마세요');
}
for(const event of events){
 if(event.verification==='verified'&&(!event.sourceUrl||!event.startDate||!event.endDate||event.endDate<event.startDate))fail('확인된 행사에는 출처와 올바른 개최 기간 필요');
}
const verified=data.places.filter(p=>p.verification==='verified').length;
console.log(`자료 형식 검사 통과: 후보 ${data.places.length}곳, 공식 원문 확인 ${verified}곳, 미확인 ${data.places.length-verified}곳. 형식 검사 통과는 사실 검증 완료가 아닙니다.`);
if(process.argv.includes('--export')){
 const columns=['id','name','region','categories','audiences','minutes','indoor','verification','sourceUrl','sourceCheckedAt','address','openingHours','price','hold'];
 const escape=value=>'"'+String(Array.isArray(value)?value.join(' / '):value??'').replaceAll('"','""')+'"';
 const csv='\ufeff'+[columns.join(','),...data.places.map(p=>columns.map(key=>escape(key==='region'?data.meta.regions[p[key]]:p[key])).join(','))].join('\r\n');
 await writeFile(new URL('data/research-candidates.csv',root),csv);
 console.log('data/research-candidates.csv 내보내기 완료');
}
