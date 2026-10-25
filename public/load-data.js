// Optional data failure must not disable working tourism/search features.
export async function loadTripData(fetcher=fetch) {
  async function read(path) { const response=await fetcher(path); if(!response.ok)throw new Error('HTTP '+response.status); return response.json(); }
  const results=await Promise.allSettled(['/catalogue.json','/dining.json','/events.json','/travel-times.json'].map(read));
  const main=results[0];
  if(main.status!=='fulfilled'||!Array.isArray(main.value?.places)||!main.value?.meta?.regions)throw new Error('관광 장소 자료를 불러오지 못했습니다. 서버 실행 및 catalogue.json을 확인해 주세요.');
  const warnings=[];
  const dining=results[1].status==='fulfilled'?results[1].value?.places:null;
  const validDining=Array.isArray(dining)&&dining.every(p=>p.isMock&&p.verification==='fictional'&&typeof p.name==='string'&&Array.isArray(p.categories)&&Array.isArray(p.audiences)&&Array.isArray(p.tags)&&Number.isFinite(p.price)&&Number.isInteger(p.minutes)&&p.minutes>0);
  if(!validDining)warnings.push('CSV 기반 맛집·카페 웹 자료(dining.json)를 불러오지 못했습니다. 해당 업소를 제외하고 관광 후보로 추천합니다. CSV 원본과 data:dining 변환 결과를 확인해 주세요.');
  const events=results[2].status==='fulfilled'?results[2].value?.events:null;
  if(!Array.isArray(events))warnings.push('축제 자료를 불러오지 못해 축제 안내를 제외했습니다.');
  const travel=results[3].status==='fulfilled'?results[3].value:null;
  const validTravel=travel&&Array.isArray(travel.routes)&&Array.isArray(travel.regionRoutes);
  if(!validTravel)warnings.push('이동시간표를 불러오지 못했습니다. 이동시간이 없는 구간은 확인 필요로 표시합니다.');
  return {catalogue:main.value,dining:validDining?dining:[],events:Array.isArray(events)?events:[],travelTable:validTravel?travel:{routes:[],regionRoutes:[]},warnings};
}
