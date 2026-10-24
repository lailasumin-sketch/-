export const durations = ['반나절', '당일치기', '1박 2일', '2박 3일'];
export const companions = ['혼자', '연인', '친구', '가족'];
export const interests = ['볼거리', '맛집', '체험', '특산물 쇼핑', '축제', '숙박'];
const interestPatterns = {
  '볼거리': /볼거리|풍경|산책|관광|자연|사진|사찰|전시|박물관|등산/,
  '맛집': /맛집|음식|식사|한우|마늘소|먹거리/,
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
const clock = minutes => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
const categoryPriority = ['체험', '특산물 쇼핑', '볼거리'];
export function buildTrip(options, catalogue, events = []) {
  if (!catalogue?.places || !catalogue?.meta?.regions) throw new Error('장소 자료를 불러오지 못했습니다. 새로고침해 주세요.');
  const count = options.duration === '2박 3일' ? 3 : options.duration === '1박 2일' ? 2 : 1;
  const half = options.duration === '반나절';
  const selected = [...new Set(options.interests || [])];
  const excluded = new Set(options.excludedInterests || []);
  const allowCandidates = options.includePending === true;
  const chosenRegion = options.region || 'all';
  const capacity = half ? 2 : options.pace === 'relaxed' ? 2 : options.pace === 'active' ? 4 : 3;
  const buffer = options.transport === 'public' ? 45 : 25;
  const used = new Set(), usedGroups = new Set(), covered = new Set();
  const requestedPlaces = selected.filter(category => categoryPriority.includes(category));
  const wanted = requestedPlaces.length ? requestedPlaces : selected.length ? [] : excluded.has('볼거리') ? [] : ['볼거리'];
  const environment = options.environment || 'any';
  const eligible = catalogue.places.filter(p => !p.hold && (!p.requiresPet || options.withPet === true) && (!options.withPet || p.requiresPet || p.petFriendly === true) && (p.verification === 'verified' || allowCandidates) && (chosenRegion === 'all' || p.region === chosenRegion) && (environment === 'any' || (environment === 'indoor' ? p.indoor : !p.indoor)) && !p.categories.some(c => excluded.has(c)));
  const baseScore = p => (p.audiences.includes(options.companion) ? 12 : 0) + p.categories.filter(c => wanted.includes(c)).length * 8 + (options.pace === 'relaxed' && p.minutes <= 70 ? 5 : 0) + (options.pace === 'active' && p.minutes >= 100 ? 6 : 0) + (p.verification === 'verified' ? 5 : 0);
  const notes = [allowCandidates ? '현재 자료는 공식 원문 검증 전 조사 후보입니다. 명칭·권역·운영 여부부터 확인해야 하며, 이 코스는 방문을 확정하는 일정이 아닙니다.' : '공식 원문 확인이 끝난 자료만 사용합니다. 자료가 없으면 임의 장소로 채우지 않습니다.', '시간은 편집상 체류시간과 이동 여유를 배치한 예시입니다. 실제 길찾기·영업시간·가격·예약 가능 여부는 연결되어 있지 않습니다.'];
  if (options.transport === 'public') notes.push('대중교통은 권역별 배차·정류장 접근성이 미확인입니다. 이동 여유 45분은 버스 운행시간이 아니며, 택시 이용이나 코스 축소가 필요할 수 있습니다.');
  else notes.push('장소의 추정 권역을 묶었습니다. 좌표 기반 최단 경로나 실제 이동시간을 계산한 결과는 아닙니다.');
  const days = [];
  for (let index = 0; index < count; index++) {
    const date = dayDate(options.date, index);
    const weekday = date ? new Date(date + 'T00:00:00Z').getUTCDay() : null;
    const available = eligible.filter(p => !used.has(p.id) && !usedGroups.has(p.group) && !(weekday !== null && p.closedWeekdays?.includes(weekday)));
    const zones = chosenRegion === 'all' ? Object.keys(catalogue.meta.regions) : [chosenRegion];
    const ranks = zones.map(region => {
      const pool = available.filter(p => p.region === region && p.categories.some(c => wanted.includes(c)));
      const cover = new Set(pool.flatMap(p => p.categories.filter(c => wanted.includes(c))));
      return { region, score: cover.size * 30 + pool.sort((a,b) => baseScore(b)-baseScore(a)).slice(0,capacity).reduce((sum,p) => sum + baseScore(p),0) };
    }).sort((a,b) => b.score-a.score);
    const region = ranks[0]?.region || 'central';
    const pool = available.filter(p => p.region === region && p.categories.some(c => wanted.includes(c))).sort((a,b) => baseScore(b)-baseScore(a) || a.id.localeCompare(b.id));
    const picks = [];
    for (const category of categoryPriority.filter(c => wanted.includes(c)).sort((a,b) => Number(covered.has(a))-Number(covered.has(b)))) {
      if (picks.length >= capacity) break;
      if (picks.some(p => p.categories.includes(category))) continue;
      const pick = pool.find(p => p.categories.includes(category) && !picks.some(q => q.group === p.group));
      if (pick) picks.push(pick);
    }
    for (const p of pool) {
      if (picks.length >= capacity) break;
      if (!picks.some(q => q.group === p.group)) picks.push(p);
    }
    const stops = [];
    let minute = 600, mealAdded = false;
    const wantsFood = selected.includes('맛집') && !excluded.has('맛집');
    const foodStop = time => ({ title:catalogue.meta.regions[region]+' 식당 찾기', time:clock(time), endTime:clock(time+60), kind:'search', categories:['맛집'], description:'검증된 음식점 목록이 아직 없습니다. 지도에서 이 권역의 식당을 비교하고 메뉴·가격·휴무를 확인해 주세요. 특정 맛집 추천이나 식사 예약이 아닙니다.', query:`의성 ${catalogue.meta.regions[region].split('·')[0].replace('권','')} 음식점`, reason:'맛집 요청 · 음식점 자료 보완 필요', verification:'search' });
    const limit = half ? 840 : 1050;
    for (const p of picks) {
      if (wantsFood && !mealAdded && minute >= 690 && minute + 60 <= limit) {
        stops.push(foodStop(minute)); minute += 60 + buffer; mealAdded = true;
      }
      if (minute + p.minutes > limit) continue;
      stops.push({ id:p.id, title:p.name, description:p.description, query:'의성 ' + p.name, time:clock(minute), endTime:clock(minute+p.minutes), minutes:p.minutes, kind:'place', region:p.region, categories:p.categories, reason:`${p.audiences.includes(options.companion) ? options.companion + ' 동행 취향 · ' : ''}${p.categories.filter(c => wanted.includes(c)).join('·')} · ${p.indoor ? '실내 중심' : '야외 중심'}`, sourceUrl:p.sourceUrl, sourceCheckedAt:p.sourceCheckedAt, verification:p.verification, bookingRequired:p.bookingRequired });
      used.add(p.id); usedGroups.add(p.group); p.categories.forEach(c => covered.add(c));
      minute += p.minutes + buffer;
    }
    if (wantsFood && !mealAdded) {
      const foodTime = Math.max(minute, 720);
      if (foodTime + 60 <= (half ? 900 : 1080)) stops.push(foodStop(foodTime));
    }
    if (index < count - 1 && !excluded.has('숙박')) {
      const stay = eligible.filter(p => p.region === region && p.categories.includes('숙박') && (p.id !== 'binggye-camp' || options.lodgingType === 'camping') && !excluded.has('숙박')).sort((a,b) => baseScore(b)-baseScore(a))[0];
      if (stay) stops.push({ id:stay.id, title:stay.name+' · 숙박 문의 후보', description:stay.description, query:'의성 '+stay.name, time:'18:30', kind:'lodging', verification:stay.verification, sourceUrl:stay.sourceUrl, sourceCheckedAt:stay.sourceCheckedAt, bookingRequired:true, reason:'숙박 요청 · 예약 가능 여부 미확인' });
      else stops.push({ title:catalogue.meta.regions[region]+' 숙소 찾기', time:'18:30', kind:'search', verification:'search', description:'이 권역의 검증된 숙소가 없습니다. 숙소 유형·객실·요금을 확인하고 직접 예약해 주세요. 체크인이 확정된 일정이 아닙니다.', query:'의성 '+catalogue.meta.regions[region].split('·')[0]+' 숙박', reason:'숙소 자료 보완 필요' });
    }
    const missing = [...wanted, ...(wantsFood ? ['맛집'] : [])].filter(c => !stops.some(p => p.categories?.includes(c)));
    days.push({ day:index+1, date, region:catalogue.meta.regions[region], stops, missing });
  }
  const scheduledEvents = selected.includes('축제') ? events.filter(event => event.verification === 'verified' && validDate(event.startDate) && validDate(event.endDate) && days.some(day => day.date && day.date >= event.startDate && day.date <= event.endDate)) : [];
  if (selected.includes('축제')) notes.push(scheduledEvents.length ? '방문일과 겹치는 확인된 행사를 별도로 표시했습니다. 운영시간과 개최 변경을 출발 전에 다시 확인하세요.' : '여행일에 개최가 확인된 축제 자료가 없습니다. 축제를 일정에 임의로 넣지 않았습니다. 의성군 공식 공지를 확인해 주세요.');
  if (excluded.has('숙박') && count > 1) notes.push('숙박 제외 요청에 따라 숙소 항목은 배치하지 않았습니다. 여러 날 여행의 야간 체류는 별도로 정해야 합니다.');
  if (selected.includes('숙박') && count === 1) notes.push('숙박을 선택했지만 당일 일정입니다. 숙박을 원하면 1박 2일 이상으로 바꿔주세요.');
  const allStops = days.flatMap(day => day.stops);
  const missing = [...wanted, ...(selected.includes('맛집') && !excluded.has('맛집') ? ['맛집'] : [])].filter(c => !allStops.some(stop => stop.categories?.includes(c)));
  if (missing.length) notes.push('조건·권역·체류시간·자료 부족으로 전체 코스에 담지 못한 항목: '+missing.join(', ')+'. 다른 권역이나 더 긴 일정을 선택해 보세요.');
  if (options.withPet) notes.push('반려견 동반 조건을 반영해 동반용 시설 후보만 사용했습니다. 다른 시설의 동물 출입 규정은 확인되지 않아 넣지 않았습니다. 펫월드도 입장 가능 여부와 규정을 확인해야 합니다.');
  if (environment !== 'any') notes.push((environment === 'indoor' ? '실내' : '야외')+' 중심 후보만 사용했습니다. 실내외 구분도 편집상 가정이며 현장 이동 구간은 별도 확인이 필요합니다.');
  return { days, notes, events:scheduledEvents, candidateCount:catalogue.places.length, verifiedCount:catalogue.places.filter(p => p.verification === 'verified').length, missing };
}
