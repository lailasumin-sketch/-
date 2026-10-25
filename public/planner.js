import { searchDining, diningTextOptions } from './dining.js';
import { isTime, toMinutes, toClock, planDay, summarizeDays } from './scheduler.js';
export const durations = ['반나절', '당일치기', '1박 2일', '2박 3일'];
export const companions = ['혼자', '연인', '친구', '가족'];
export const interests = ['볼거리', '맛집', '카페', '체험', '특산물 쇼핑', '축제', '숙박'];
const interestPatterns = {
  '볼거리': /볼거리|풍경|산책|관광|자연|힐링|사진|사찰|전시|박물관|등산/,
  '맛집': /맛집|식당|밥집|고깃집|음식|식사|한우|마늘소|먹거리/,
  '카페': /카페|커피|디저트|찻집|베이커리|빙수/,
  '체험': /체험|만들기|액티비티|컬링/,
  '특산물 쇼핑': /특산물|쇼핑|사고|구매|시장|장보기|살\s*곳/,
  '축제': /축제|행사/, '숙박': /숙박|하룻밤|호텔|펜션|캠핑|1\s*박|2\s*박/
};
export function parsePrompt(text) {
  const result = { interests: [], excludedInterests: [] };
  if (/2\s*박\s*3\s*일|2\s*박|3\s*일/.test(text)) result.duration = '2박 3일';
  else if (/1\s*박|2\s*일|하룻밤/.test(text)) result.duration = '1박 2일';
  else if (/반나절|오전만|오후만/.test(text)) result.duration = '반나절';
  else if (/당일|하루/.test(text)) result.duration = '당일치기';
  if (/가족|아이|어린이|부모|엄마|아빠/.test(text)) result.companion = '가족';
  else if (/연인|커플|남자친구|여자친구|단둘/.test(text)) result.companion = '연인';
  else if (/친구/.test(text)) result.companion = '친구';
  else if (/혼자|나홀로/.test(text)) result.companion = '혼자';
  for (const [key, pattern] of Object.entries(interestPatterns)) {
    const negative = new RegExp(`(?:${pattern.source})(?:은|는|을|를|도|이|가|에|\u0020)*(?:빼|제외|말고|싫|안\\s*할|안\\s*가|필요\\s*없|원하지\\s*않)`);
    if (negative.test(text)) result.excludedInterests.push(key);
    else if (pattern.test(text)) result.interests.push(key);
  }
  if (/반려견|강아지|애견/.test(text)) result.withPet = true;
  if (/캠핑/.test(text)) result.lodgingType = 'camping';
  if (/대중교통|버스|뚜벅이|기차/.test(text)) result.transport = 'public';
  else if (/자가용|자동차|렌트|운전/.test(text)) result.transport = 'car';
  if (/실내|비\s*오|우천/.test(text)) result.environment = 'indoor';
  else if (/야외|실외/.test(text)) result.environment = 'outdoor';
  if (/느긋|여유|천천히|쉬엄/.test(text)) result.pace = 'relaxed';
  else if (/빡빡|알차|많이|활동적/.test(text)) result.pace = 'active';
  const zones = { central: /의성읍|봉양|안평/, south: /금성|빙계|가음|춘산|산운|조문국/, east: /단촌|점곡|옥산|사촌|고운사/, west: /안계|비안|다인|낙단|펫월드/ };
  for (const [region, pattern] of Object.entries(zones)) if (pattern.test(text)) { result.region = region; break; }
  const date = text.match(/(20\d{2})[년.\-/]\s*(\d{1,2})[월.\-/]\s*(\d{1,2})일?/);
  if (date) {
    const value = `${date[1]}-${date[2].padStart(2, '0')}-${date[3].padStart(2, '0')}`;
    if (validDate(value)) result.date = value;
  }
  if (/자연|힐링|숲|산책/.test(text)) result.themes = ['nature'];
  const clock = text.match(/(?:(오전|오후)\s*)?(\d{1,2})(?::(\d{2})|시(?:\s*(\d{1,2})분)?)(?:\s*(?:부터|출발|시작))/);
  if (clock) {
    let hour=Number(clock[2]);
    if (clock[1] === '오후' && hour < 12) hour+=12;
    if (clock[1] === '오전' && hour === 12) hour=0;
    const value=String(hour).padStart(2,'0')+':'+String(Number(clock[3]||clock[4]||0)).padStart(2,'0');
    if(isTime(value)) result.startTime=value;
  }
  const hours=text.match(/(?:총\s*)?(\d+(?:\.\d+)?)\s*시간(?:\s*(\d+)\s*분)?/);
  if(hours) result.availableHours=Number(hours[1])+Number(hours[2]||0)/60;
  const diningOptions = diningTextOptions(text);
  for (const key of ['maxDiningPrice','quiet','parkingOnly']) if (diningOptions[key] !== undefined) result[key] = diningOptions[key];
  const menu = text.match(/마늘|국수|피자|와플|빙수|초밥|만두|비빔밥|전통차|디카페인/);
  if (menu && result.interests.some(c => c === '맛집' || c === '카페')) result.diningQuery = menu[0];
  return result;
}
export function validDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value || '') && !Number.isNaN(Date.parse(value)) && new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value;
}
function dayDate(value, offset) {
  if (!validDate(value)) return null;
  const date = new Date(value + 'T00:00:00Z'); date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}
export function defaultAvailableMinutes(duration) {
  return duration === '반나절' ? 240 : duration === '1박 2일' ? 960 : duration === '2박 3일' ? 1440 : 480;
}
const visitTypes = ['볼거리','맛집','카페','체험','특산물 쇼핑'];
function comparePlans(a,b) {
  for(let i=0;i<a.plan.rank.length;i++) if(a.plan.rank[i]!==b.plan.rank[i])return b.plan.rank[i]-a.plan.rank[i];
  return a.plan.signature.localeCompare(b.plan.signature);
}
function normalizePlace(p, selected, options, isMock) {
  const category=p.categories.find(c=>selected.includes(c))||p.categories[0];
  const themeMatch=Boolean(options.themes?.includes('nature')&&!p.indoor&&p.categories.includes('볼거리')&&/산|숲|계곡|공원|마을|강|낙단보/.test(p.name));
  return {...p,title:p.name,category,kind:isMock?'mock-dining':'place',group:p.group||p.id,isMock,area:p.area||null,
    description:isMock?`가상 테스트 업소 · ${p.menu} · 1인 예산 ${p.price.toLocaleString('ko-KR')}원(가정). ${p.atmosphere}. 실제 업소·주소·예약 정보가 아닙니다.`:p.description,
    reason:[p.categories.filter(c=>selected.includes(c)).join('·')+' 관심사 일치',p.audiences.includes(options.companion)?options.companion+' 동행 적합':'',themeMatch?'이름·실내외 분류에 따른 자연·힐링 취향':''].filter(Boolean).join(' · '),
    themeMatch,query:isMock?null:'의성 '+p.name,sourceUrl:p.sourceUrl||null};
}
export function buildTrip(options, catalogue, events = [], dining = [], travelTable = {routes:[],regionRoutes:[]}) {
  if(!Array.isArray(catalogue?.places)||!catalogue?.meta?.regions)throw new Error('장소 자료를 불러오지 못했습니다. 새로고침해 주세요.');
  const count=options.duration==='2박 3일'?3:options.duration==='1박 2일'?2:1;
  const startTime=options.startTime ?? '09:30';
  if(!isTime(startTime))throw new Error('여행 시작시간을 00:00~23:59 형식으로 입력해 주세요.');
  const rawBudget=options.availableMinutes ?? (options.availableHours!==undefined?Number(options.availableHours)*60:defaultAvailableMinutes(options.duration));
  const budget=Math.round(Number(rawBudget));
  if(!Number.isFinite(Number(rawBudget))||budget<=0||Math.abs(budget-Number(rawBudget))>0.000001)throw new Error('전체 여행 가능시간은 1분 이상의 분 단위 시간으로 입력해 주세요.');
  if(options.date&&!validDate(options.date))throw new Error('올바른 여행 날짜를 입력해 주세요.');
  if(options.region&&options.region!=='all'&&!catalogue.meta.regions[options.region])throw new Error('지원하는 여행 권역을 선택해 주세요.');
  const start=toMinutes(startTime);
  if(Math.ceil(budget/count)>1440-start)throw new Error('여행 가능시간을 일수로 나누면 하루 종료시간이 자정을 넘습니다. 시작시간·여행시간·기간을 조정해 주세요.');
  if(options.travelAllowanceMinutes!==''&&options.travelAllowanceMinutes!=null&&(!Number.isInteger(Number(options.travelAllowanceMinutes))||Number(options.travelAllowanceMinutes)<=0))throw new Error('이동 여유는 비워두거나 1분 이상의 정수로 입력해 주세요.');
  const excluded=new Set(options.excludedInterests||[]);
  const selected=[...new Set(options.interests||[])].filter(c=>!excluded.has(c));
  const wanted=selected.length?selected.filter(c=>visitTypes.includes(c)):excluded.has('볼거리')?[]:['볼거리'];
  const useMock=options.includeMock===true;
  const tourists=catalogue.places.filter(p=>!p.hold&&p.categories.some(c=>wanted.includes(c))&&!p.categories.some(c=>excluded.has(c))&&(p.verification==='verified'||options.includePending===true)&&(!p.requiresPet||options.withPet)&&(!options.withPet||p.requiresPet||p.petFriendly===true)&&(!options.region||options.region==='all'||p.region===options.region)&&(!options.environment||options.environment==='any'||(options.environment==='indoor'?p.indoor:!p.indoor))&&p.id!=='binggye-camp').map(p=>normalizePlace(p,wanted,options,false));
  const diningPlaces=useMock?searchDining(Array.isArray(dining)?dining:[],{...options,query:options.diningQuery,date:null}).filter(p=>wanted.includes(p.category)).map(p=>normalizePlace(p,wanted,options,true)):[];
  const candidates=[...tourists,...diningPlaces];
  const usedIds=new Set(),usedGroups=new Set(),previousCoverage=new Set(),days=[];
  for(let index=0;index<count;index++) {
    const dayBudget=Math.floor(budget/count)+Number(index<budget%count),end=start+dayBudget,date=dayDate(options.date,index);
    const regions=options.region&&options.region!=='all'?[options.region]:Object.keys(catalogue.meta.regions);
    const plans=regions.map(region=>({region,plan:planDay({candidates:candidates.filter(p=>p.region===region),start,end,date,interests:wanted,options,travelTable,usedIds,usedGroups,previousCoverage})})).sort(comparePlans);
    const result=plans[0];
    for(const id of result.plan.usedIds)usedIds.add(id);
    for(const group of result.plan.usedGroups)usedGroups.add(group);
    for(const c of result.plan.covered)previousCoverage.add(c);
    days.push({day:index+1,date,region:catalogue.meta.regions[result.region]||result.region,startTime,endTime:toClock(end),budgetMinutes:dayBudget,stops:result.plan.stops,timeline:result.plan.timeline,missing:wanted.filter(c=>!result.plan.covered.has(c))});
  }
  const stats=summarizeDays(days,budget);
  const scheduledEvents=selected.includes('축제')?(events||[]).filter(e=>e.verification==='verified'&&validDate(e.startDate)&&validDate(e.endDate)&&days.some(d=>d.date&&d.date>=e.startDate&&d.date<=e.endDate)):[];
  const missing=wanted.filter(c=>!previousCoverage.has(c));
  const notes=[
    '시작시간은 각 날짜의 첫 방문지 도착 기준입니다. 전체 활동 가능시간을 일수에 나누며, 날짜 간 이동·숙박·수면은 포함하지 않습니다.',
    '체류시간은 기존 JSON·CSV의 편집상 가정입니다. 일정은 관심사 일치, 동행 적합성, 운영시간·시간 예산 충족을 비교하는 제한된 후보 탐색으로 구성합니다. AI 또는 실시간 최단 경로를 사용하지 않습니다.',
    '같은 날짜에는 한 권역에서 구성하고 같은 장소·시설군은 여러 날에 걸쳐 반복하지 않습니다. 동행·권역·실내외·주차·예산·반려견 조건은 데이터가 있는 범위에서만 적용합니다.'
  ];
  if(stats.unknownTravelLegs)notes.push(`이동시간 확인 필요: ${stats.unknownTravelLegs}구간. 숫자를 만들지 않았으며 이후 방문 시각과 운영시간 충족은 이동 미반영 최소 시각 기준입니다. 전체 종료시간을 보장하는 확정 일정이 아닙니다.`);
  if(stats.userAllowanceMinutes)notes.push('사용자가 지정한 이동 여유를 시간 예산에 포함했습니다. 실제 이동시간이나 가상 이동시간표에서 가져온 값은 아닙니다.');
  if(stats.fictionalTravelMinutes)notes.push('가상 이동시간이 포함되어 있습니다. 구간별 데이터 출처를 표시하며 실제 지도·도로 이동시간이 아닙니다.');
  if(stats.unknownOpeningCount)notes.push(`운영시간 확인 필요: ${stats.unknownOpeningCount}곳. 운영시간이 없는 장소의 실제 방문 가능 여부는 보장하지 않습니다.`);
  if(!options.date)notes.push('여행 날짜를 선택하지 않아 요일별 휴무를 확인하지 못했습니다. 등록된 시각과 체류시간만 비교합니다.');
  if(options.includePending)notes.push('관광 장소는 공식 원문 검증 전 조사 후보가 포함됩니다. 실제 여부·운영 상태·정확한 읍면을 확인해야 합니다.');
  if(stats.commercialMockCount||diningPlaces.length)notes.push('맛집·카페는 엑셀에서 가져온 가상 테스트 업소입니다. 메뉴·가격·운영·가상 읍면 배치 모두 창작이며 실제 방문·예약 정보가 아닙니다.');
  if(missing.length)notes.push('조건·영업시간·시간 예산·자료 부족으로 넣지 않은 관심사: '+missing.join(', ')+'. 조건에 맞지 않는 장소나 검색 안내를 방문 일정으로 채우지 않습니다.');
  if(selected.includes('축제'))notes.push(scheduledEvents.length?'방문일과 겹치는 확인된 행사를 별도로 표시했습니다.':'확인된 개최 기간이 없어 축제를 일정에 임의로 넣지 않았습니다.');
  const lodgingSuggestions=[];
  if(count>1&&!excluded.has('숙박'))lodgingSuggestions.push('숙소 찾기: 숙소·예약 자료가 미확인입니다. 야간 체류는 별도로 정하고 확정되지 않은 체크인을 시간표에 넣지 않았습니다.');
  if(excluded.has('숙박')&&count>1)notes.push('숙박 제외 요청을 반영했습니다. 여러 날 여행의 야간 체류는 별도 확인이 필요합니다.');
  if(selected.includes('숙박')&&count===1)notes.push('당일 일정에는 숙박을 넣지 않았습니다. 숙박이 필요하면 여행 기간을 늘려주세요.');
  return {days,notes,events:scheduledEvents,stats,missing,lodgingSuggestions,candidateCount:catalogue.places.length,verifiedCount:catalogue.places.filter(p=>p.verification==='verified').length,mockDiningCount:days.flatMap(d=>d.stops).filter(p=>p.isMock).length};
}
