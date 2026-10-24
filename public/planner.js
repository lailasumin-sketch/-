export const durations = ['반나절', '당일치기', '1박 2일', '2박 3일'];
export const companions = ['혼자', '연인', '친구', '가족'];
export const interests = ['볼거리', '맛집', '체험', '특산물 쇼핑', '축제', '숙박'];
export function parsePrompt(text) {
  const result = { interests: [] };
  if (/2\s*박|3\s*일/.test(text)) result.duration = '2박 3일';
  else if (/1\s*박|2\s*일|하룻밤/.test(text)) result.duration = '1박 2일';
  else if (/반나절|오전만|오후만/.test(text)) result.duration = '반나절';
  else if (/당일|하루/.test(text)) result.duration = '당일치기';
  if (/연인|커플|남자친구|여자친구|단둘/.test(text)) result.companion = '연인';
  else if (/가족|아이|부모|엄마|아빠/.test(text)) result.companion = '가족';
  else if (/친구/.test(text)) result.companion = '친구';
  else if (/혼자|나홀로/.test(text)) result.companion = '혼자';
  const matches = { '볼거리': /볼거리|풍경|산책|관광|자연|사진|사찰/, '맛집': /맛집|먹|음식|식사|한우|마늘소/, '체험': /체험|만들기|액티비티/, '특산물 쇼핑': /특산물|쇼핑|사고|구매|시장|살\s*곳/, '축제': /축제|행사/, '숙박': /숙박|하룻밤|호텔|펜션|1\s*박|2\s*박/ };
  for (const [key, pattern] of Object.entries(matches)) if (pattern.test(text)) result.interests.push(key);
  if (/대중교통|버스|뚜벅이|기차/.test(text)) result.transport = 'public';
  else if (/자가용|자동차|렌트|운전/.test(text)) result.transport = 'car';
  return result;
}
const places = {
  village: { title: '산운마을', description: '전통 가옥과 마을 풍경을 천천히 둘러보세요.', query: '의성 산운마을' },
  temple: { title: '고운사', description: '사찰과 숲길을 걸으며 잠깐 쉬어가세요. 방문 가능 구역과 복구·운영 상황을 먼저 확인해 주세요.', query: '의성 고운사' },
  museum: { title: '의성조문국박물관', description: '의성의 옛이야기를 만나는 실내 관람 시간. 관람일과 운영시간을 확인해 주세요.', query: '의성조문국박물관' },
  ruins: { title: '조문국 사적지', description: '넓은 유적지 주변을 산책해 보세요. 꽃 풍경은 계절과 개화 상태에 따라 달라져요.', query: '의성 조문국 사적지' },
  food: { title: '의성의 맛으로 점심', description: '의성마늘소나 마늘을 활용한 메뉴를 찾아보세요. 음식점별 메뉴·가격·영업 여부를 확인하고 선택해 주세요.', query: '의성 마늘소 맛집' },
  experience: { title: '체험 프로그램 찾아보기', description: '의성의 농촌 체험과 만들기 프로그램을 찾아보는 시간입니다. 운영 업체와 날짜별 예약 가능 여부를 확인한 뒤 일정에 확정해 주세요.', query: '의성 농촌 체험' },
  shopping: { title: '의성전통시장 · 로컬 장보기', description: '마늘 등 의성 특산물을 둘러보세요. 장날·판매 품목·원산지를 확인해 주세요. 온라인 구매는 의성장날도 살펴볼 수 있어요.', query: '의성전통시장' },
  festival: { title: '방문일의 축제·행사 확인', description: '의성군 공식 공지에서 방문 날짜에 열리는 행사를 확인하세요. 개최가 확인되면 이 시간에 배치하고, 없으면 주변 산책으로 바꿔보세요.', query: '의성 축제' },
  stay: { title: '숙소 체크인 · 자유로운 저녁', description: '다음 날 첫 방문지와 가까운 숙소를 골라보세요. 요금·주차·체크인 시간과 실제 객실 예약은 숙박업체에 확인해야 합니다.', query: '의성 숙박' },
  dinner: { title: '저녁 식사 · 여유로운 마무리', description: '이동 동선 가까이에서 저녁 식사를 즐겨보세요. 마지막 영업시간을 확인해 주세요.', query: '의성 음식점' }
};
export function buildTrip(options) {
  const { duration, companion, interests: selected, transport } = options;
  const has = key => selected.includes(key);
  const count = duration === '2박 3일' ? 3 : duration === '1박 2일' ? 2 : 1;
  const half = duration === '반나절';
  let visits = [];
  if (has('볼거리') || !selected.length) visits.push(companion === '가족' ? 'museum' : 'village');
  if (has('맛집')) visits.push('food');
  if (has('체험')) visits.push('experience');
  if (has('특산물 쇼핑')) visits.push('shopping');
  if (has('축제')) visits.push('festival');
  if (!visits.length) visits = ['village', 'food'];
  if (count > 1 && has('볼거리')) visits.push('ruins', 'temple', ...(count === 3 ? ['museum'] : []));
  const capacity = half ? 3 : count * 5;
  const deferred = visits.slice(capacity).map(key => places[key].title);
  visits = visits.slice(0, capacity);
  const groups = Array.from({ length: count }, () => []);
  visits.forEach((key, i) => groups[Math.min(count - 1, Math.floor(i * count / visits.length))].push(key));
  const days = groups.map((group, i) => {
    const times = half ? ['10:00', '11:20', '12:30'] : ['10:00', '12:00', '14:00', '15:30', '17:00'];
    const stops = group.map((key, index) => ({ ...places[key], time: times[index] }));
    if (!stops.length) stops.push({ title: '여유로운 의성 · 자유 일정', description: '추가로 원하는 관심사를 선택하거나 숙소 주변에서 쉬어가세요. 이동과 식사 시간을 충분히 확보한 자유 일정입니다.', query: '의성 관광', time: '10:00' });
    if (i < count - 1) stops.push({ ...places.stay, time: '18:00' });
    return { day: i + 1, stops };
  });
  const notes = [];
  notes.push(companion === '가족' ? '가족 여행은 관람과 이동 사이에 휴식을 충분히 넣어주세요. 유모차·휠체어 접근성은 장소에 문의해 주세요.' : companion === '연인' ? '둘이 걷기 좋은 마을과 풍경을 우선 담았어요. 사진과 휴식 시간은 취향껏 늘려보세요.' : companion === '혼자' ? '혼자서도 여유롭게 둘러볼 수 있도록 산책과 관람 위주로 구성했어요.' : '친구들과 함께라면 체험 예약 인원과 식당 단체석을 먼저 확인해 보세요.');
  if (transport === 'public') notes.push('대중교통의 실제 운행시간은 반영되지 않았어요. 읍면 간 이동은 배차 간격이 길 수 있으니 버스·택시 동선을 확인하고 방문지를 줄여주세요.');
  else notes.push('자가용 이동을 가정한 예시예요. 실시간 도로 상황과 주차 가능 여부는 반영되지 않았어요.');
  if (has('축제')) notes.push('현재 축제 일정 데이터와 연결되어 있지 않아 축제 개최 여부·기간은 확정하지 않습니다. 여행일의 공식 공지를 확인해 주세요.');
  if (has('숙박') && count === 1) notes.push('선택한 일정에는 숙박이 포함되지 않아요. 하룻밤 머무르려면 여행 기간을 1박 2일 이상으로 바꿔주세요.');
  if (deferred.length) notes.push('짧은 일정으로 다음 항목은 이번 코스에서 제외했어요: ' + deferred.join(', ') + '. 기간을 늘리면 더 여유롭게 담을 수 있어요.');
  return { days, notes };
}
