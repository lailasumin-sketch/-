export const minutesOf = time => { const [h,m]=time.split(':').map(Number); return h*60+m; };
export const formatTime = minute => `${String(Math.floor(minute/60)).padStart(2,'0')}:${String(minute%60).padStart(2,'0')}`;
export function diningTextOptions(text) {
 const result={};
 if(/맛집|식당|한식|음식점/.test(text))result.category='맛집';
 if(/카페|커피|디저트|찻집|베이커리|빙수/.test(text))result.category=result.category?'all':'카페';
 if(/연인|커플|데이트/.test(text))result.companion='연인';
 else if(/가족|아이/.test(text))result.companion='가족';
 else if(/혼자|혼밥/.test(text))result.companion='혼자';
 else if(/친구/.test(text))result.companion='친구';
 if(/조용|차분|독서/.test(text))result.quiet=true;
 if(/주차/.test(text))result.parkingOnly=true;
 if(/반려견|강아지|애견/.test(text))result.withPet=true;
 const amount=text.match(/(?:(\d+(?:\.\d+)?)\s*만\s*(?:(\d+)\s*천)?|([\d,]+))\s*원\s*(이하|이내|미만)/);
 if(amount) result.maxDiningPrice=(amount[1]?Number(amount[1])*10000+Number(amount[2]||0)*1000:Number(amount[3].replaceAll(',','')))-(amount[4]==='미만'?1:0);
 return result;
}
function normalized(text){return text.toLowerCase().replace(/\[가상\]/g,'').replace(/\s+/g,'');}
export function searchDining(places, options={}) {
 const query=(options.query||options.diningQuery||'').trim();
 const parsed=diningTextOptions(query), merged={...parsed,...options, maxDiningPrice:Number(options.maxDiningPrice)||parsed.maxDiningPrice||0, quiet:options.quiet||parsed.quiet, parkingOnly:options.parkingOnly||parsed.parkingOnly};
 const category=options.category&&options.category!=='all'?options.category:parsed.category||'all';
 let keyword=query.replace(/(?:맛집|식당|음식점|카페|커피)(?:만|들|좀|를|을)?/g,' ')
  .replace(/(?:\d+(?:\.\d+)?\s*만\s*(?:\d+\s*천)?|[\d,]+)\s*원\s*(?:이하|이내|미만)/g,' ')
  .replace(/조용한?|차분한?|독서|주차(?:가능한|가능)?|반려견|강아지|애견|연인|커플|데이트|가족|아이|혼자|혼밥|친구/g,' ')
  .replace(/이나|또는|혹은|그리고|및/g,' ')
  .replace(/[,.!?]/g,' ')
  .replace(/추천(?:해줘|해주세요)?|찾아(?:줘|주세요)|알려(?:줘|주세요)|에서|이랑|함께|단둘이|(?:^|\s)(?:과|와|를|을|은|는|가|이)(?=\s|$)/g,' ').trim();
 const terms=keyword?normalized(keyword):'';
 return places.filter(p=>{
  if(!p.isMock||p.verification!=='fictional')return false;
  if(category!=='all'&&p.category!==category)return false;
  if(merged.region&&merged.region!=='all'&&p.region!==merged.region)return false;
  if(merged.maxDiningPrice&&p.price>Number(merged.maxDiningPrice))return false;
  if(merged.parkingOnly&&!p.parking)return false;
  if(merged.quiet&&p.noise!=='낮음')return false;
  if(merged.environment==='outdoor'&&!p.space.includes('테라스'))return false;
  if(merged.environment==='indoor'&&merged.withPet&&p.petPolicy==='테라스만')return false;
  if(merged.withPet&&p.petPolicy==='불가')return false;
  if(merged.date){const day=new Date(merged.date+'T00:00:00Z').getUTCDay();if(p.closedWeekdays.includes(day))return false;}
  const searchable=normalized([p.name,p.menu,p.cuisine,p.area,p.category,p.atmosphere,...p.tags].join(' '));
  if(terms&&!searchable.includes(terms))return false;
  return true;
 }).sort((a,b)=> Number(b.audiences.includes(merged.companion))-Number(a.audiences.includes(merged.companion)) || a.price-b.price || a.id.localeCompare(b.id));
}
export function diningSlot(place, earliest, latest) {
 let start=Math.max(earliest,minutesOf(place.openTime));
 if(place.breakTime){const [from,to]=place.breakTime.map(minutesOf);if(start<to&&start+place.minutes>from)start=to;}
 const end=start+place.minutes;
 if(end>minutesOf(place.closeTime)||end>latest)return null;
 return {start,end};
}
export function mockDiningStop(place,slot) {
 return {id:place.id,title:place.name,description:`가상 테스트 업소 · ${place.menu} · 1인 예산 ${place.price.toLocaleString('ko-KR')}원(가정) · ${place.atmosphere}. 실제 업소·주소·예약 정보가 아닙니다.`,time:formatTime(slot.start),endTime:formatTime(slot.end),minutes:place.minutes,kind:'mock-dining',isMock:true,verification:'fictional',categories:[place.category],region:place.region,price:place.price,menu:place.menu,area:place.area,openTime:place.openTime,closeTime:place.closeTime,closedLabel:place.closedLabel,reason:`${place.category} · 가상 ${place.area} 배치 · ${place.audiences.join('·')} 취향 · 운영시간·휴무 모두 가정`,sourceUrl:null,query:null};
}
