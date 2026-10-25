import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const root = new URL('../', import.meta.url);
const sourceIndex=process.argv.indexOf('--source');
const source=sourceIndex>=0&&process.argv[sourceIndex+1]?pathToFileURL(resolve(process.argv[sourceIndex+1])):new URL('data/mock/mock-restaurants-cafes.csv',root);
let text;
try { text=(await readFile(source,'utf8')).replace(/^\uFEFF/,''); }
catch(error) { console.error('CSV 원본을 읽을 수 없습니다. 파일 경로를 확인하세요. ('+error.code+') 기존 웹 데이터를 덮어쓰지 않았습니다.');process.exit(1); }
// CSV state machine supports quoted commas, newlines and escaped quotes.
const rows=[];let row=[],field='',quoted=false;
for(let i=0;i<text.length;i++){
 const c=text[i];
 if(c==='"'){if(quoted&&text[i+1]==='"'){field+='"';i++;}else quoted=!quoted;}
 else if(c===','&&!quoted){row.push(field);field='';}
 else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(field);if(row.some(Boolean))rows.push(row);row=[];field='';}
 else field+=c;
}
if(quoted)throw new Error('닫히지 않은 CSV 인용부호');
if(field||row.length){row.push(field);rows.push(row);}
const headers=rows.shift();
if(!headers||rows.length===0)throw new Error('CSV 헤더 또는 업소 데이터가 비어 있습니다.');
for(const name of ['업소ID','업소명(가상)','분류','가상 배치 권역','대표메뉴(가상)','1인예산(원·가정)','추천 동행','분위기','체류시간(분·가정)','오픈(가정)','마감(가정)','정기휴무(가정)','예약정책(가정)','반려견(가정)','주차(가정)','소음정도(가정)','공간(가정)','브레이크타임(가정)','추천태그','데이터구분'])if(!headers.includes(name))throw new Error('필수 CSV 필드 누락: '+name);
const zones={의성읍:'central',봉양면:'central',안평면:'central',금성면:'south',춘산면:'south',가음면:'south',단촌면:'east',점곡면:'east',옥산면:'east',안계면:'west',다인면:'west',단밀면:'west',비안면:'west',단북면:'west'};
const weekdays={일:0,월:1,화:2,수:3,목:4,금:5,토:6};
const places=rows.map(values=>{
 if(values.length!==headers.length)throw new Error('CSV 열 수 오류');
 const r=Object.fromEntries(headers.map((h,i)=>[h,values[i]]));
 if(r['데이터구분']!=='가상 테스트 데이터'||!r['업소명(가상)'].startsWith('[가상] '))throw new Error('가상 표시 누락');
 const price=Number(r['1인예산(원·가정)']),minutes=Number(r['체류시간(분·가정)']);
 if(!zones[r['가상 배치 권역']]||!Number.isFinite(price)||price<=0||!Number.isInteger(minutes)||minutes<=0)throw new Error('권역·가격·시간 오류');
 return {id:r['업소ID'],name:r['업소명(가상)'],category:r['분류'],categories:[r['분류']],region:zones[r['가상 배치 권역']],area:r['가상 배치 권역'],cuisine:r['세부분류'],menu:r['대표메뉴(가상)'],price,audiences:r['추천 동행'].split('·'),atmosphere:r['분위기'],minutes,openTime:r['오픈(가정)']||null,closeTime:r['마감(가정)']||null,closedWeekdays:weekdays[r['정기휴무(가정)']]===undefined?null:[weekdays[r['정기휴무(가정)']]],closedLabel:r['정기휴무(가정)'],reservation:r['예약정책(가정)'],petPolicy:r['반려견(가정)'],parking:r['주차(가정)']==='있음',noise:r['소음정도(가정)'],space:r['공간(가정)'],breakTime:r['브레이크타임(가정)']==='없음'?null:r['브레이크타임(가정)'].split('–'),tags:r['추천태그'].split('·'),isMock:true,verification:'fictional',address:null,phone:null,bookingUrl:null,sourceUrl:null};
});
if(new Set(places.map(p=>p.id)).size!==places.length)throw new Error('중복 ID');
const result={meta:{sourceWorkbook:'data/mock/mock-restaurants-cafes.xlsx',sourceCsv:'data/mock/mock-restaurants-cafes.csv',disclaimer:'전부 창작한 가상 테스트 업소입니다. 메뉴·가격·운영시간·권역·정책 모두 가정이며 실제 방문·예약·지도 검색에 사용할 수 없습니다.'},places};
const output=JSON.stringify(result,null,2)+'\n';
const target=new URL('public/dining.json',root);
if(process.argv.includes('--check')){
 if(await readFile(target,'utf8')!==output)throw new Error('CSV와 웹 데이터가 다릅니다. npm run data:dining 을 실행하세요.');
 console.log(`가상 업소 ${places.length}개: CSV와 웹 JSON 일치`);
}else{await writeFile(target,output);console.log(`가상 업소 ${places.length}개 웹 데이터 생성`);}
