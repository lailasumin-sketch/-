// USB-only, dependency-free charts reflecting the current search/filter result.
(()=>{
 const data=window.__UIDONGI_USB_DATA__;
 if(!data)return;
 const section=document.createElement('section');section.className='section usb-dashboard';section.id='usb-dashboard';
 section.innerHTML='<div class="section-heading"><div><div class="eyebrow">CSV DATA DASHBOARD</div><h2>검색 결과로 보는 데이터</h2><p>현재 검색·필터 결과의 레코드 수입니다. 방문 실적이나 매출 통계가 아닙니다.</p></div></div><div class="usb-chart-grid"></div><p class="form-note">관광지는 조사 후보, 맛집·카페는 가상 업소입니다. 중복 집계를 피하려고 첫 번째 분류로 표시합니다.</p>';
 document.querySelector('#catalogue').after(section);
 const lookup=new Map([...data.catalogue.places,...data.dining].map(p=>[p.name,p]));
 const grid=section.querySelector('.usb-chart-grid');
 function draw(title,items,description){
  const card=document.createElement('article');card.className='usb-chart';
  const heading=document.createElement('h3');heading.textContent=title;card.append(heading);
  const note=document.createElement('p');note.textContent=description;card.append(note);
  const max=Math.max(1,...items.map(i=>i[1]));
  for(const [label,value] of items){
   const row=document.createElement('div');row.className='usb-bar-row';
   const text=document.createElement('span');text.textContent=label;
   const track=document.createElement('span');track.className='usb-bar-track';track.setAttribute('aria-hidden','true');
   const bar=document.createElement('i');bar.style.width=(value/max*100)+'%';track.append(bar);
   const count=document.createElement('strong');count.textContent=value+'곳';row.append(text,track,count);card.append(row);
  }
  return card;
 }
 function update(){
  const records=[...document.querySelectorAll('#catalogue-list .place-card h3')].map(h=>lookup.get(h.textContent)).filter(Boolean);
  const categories=new Map([['볼거리',0],['체험',0],['특산물 쇼핑',0],['숙박',0],['맛집',0],['카페',0]]);
  const regions=new Map(Object.keys(data.catalogue.meta.regions).map(k=>[k,0]));
  const budgets=[['1만원 이하',0],['1만~2만원',0],['2만원 초과',0]];
  for(const p of records){const category=p.categories[0];categories.set(category,(categories.get(category)||0)+1);regions.set(p.region,(regions.get(p.region)||0)+1);if(p.isMock)budgets[p.price<=10000?0:p.price<=20000?1:2][1]++;}
  grid.replaceChildren(draw('분류별 '+records.length+'곳',[...categories],'선택된 검색 결과의 첫 분류 기준'),draw('권역별 분포',[...regions].map(([k,v])=>[data.catalogue.meta.regions[k]||k,v]),'주소 검증 전·가상 배치 권역 포함'),draw('가상 업소 예산',budgets,'가상 맛집·카페 1인 예산 구간'));
 }
 new MutationObserver(update).observe(document.getElementById('catalogue-list'),{childList:true});update();
 document.addEventListener('click',event=>{const link=event.target.closest('a[href^="https://"]');if(link&&!navigator.onLine){event.preventDefault();alert('외부 지도·공식 홈페이지는 인터넷 연결이 필요합니다. 검색과 일정 추천은 계속 사용할 수 있습니다.');}});
})();
