import { mealPeriodAt } from './meal-times.js';
// Explain only matched data and the slot that was actually scheduled.
export function recommendationReasons(place, context) {
  const { options, interests, start, end, dayStart, dayEnd, provisional } = context;
  const reasons = [];
  if (options.companion && place.audiences?.includes(options.companion)) {
    reasons.push({ code:'companion', text:`${options.companion} 여행 조건과 일치` });
  }
  const matches = (place.categories || []).filter(category => interests.includes(category));
  if (matches.length) {
    const nature = options.themes?.includes('nature') && place.themeMatch === true && matches.includes('볼거리');
    reasons.push({ code:'interest', text:nature ? '자연·힐링 관심사와 일치 (이름·야외 분류 기준)' : `${matches.join('·')} 관심사와 일치` });
  }
  const budget=Number(options.maxDiningPrice);
  if(Number.isFinite(budget)&&budget>0&&typeof place.price==='number'&&Number.isFinite(place.price)&&place.price>=0&&place.price<=budget&&(place.isMock===true||place.priceBasis==='per-person'))reasons.push({code:'budget',text:'선택한 1인 예산 범위에 적합'+(place.isMock?' (가상 금액)':'')});
  if(options.region&&options.region!=='all'&&place.region===options.region)reasons.push({code:'region',text:'선택한 권역 조건과 일치'+(place.isMock?' (가상 배치)':'')});
  const validSlot = [start,end,dayStart,dayEnd].every(Number.isFinite)
    && start >= dayStart && end <= dayEnd && end - start === place.minutes;
  // Unknown travel makes subsequent timestamps provisional; do not turn those
  // lower-bound times into confident lunch or complete-trip claims.
  if (validSlot && !provisional) {
    if (place.category === '맛집' && matches.includes('맛집') && start >= 690 && start <= 840) {
      reasons.push({ code:'lunch', text:'점심시간에 맞춘 식사 장소' });
    }
    if(place.category==='맛집'&&matches.includes('맛집')&&mealPeriodAt(start)==='dinner')reasons.push({code:'dinner',text:'저녁시간에 맞춘 식사 장소'});
    reasons.push({ code:'time-budget', text:'입력·등록 시간 기준 여행시간 내 배치' });
  }
  return reasons;
}
