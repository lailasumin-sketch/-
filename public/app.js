import { durations, companions, interests, parsePrompt, buildTrip } from './planner.js';
const defaults = () => ({ duration: '1박 2일', companion: '연인', interests: ['볼거리', '맛집'], transport: 'car', date: '' });
let state = defaults();
let currentTrip;
const $ = selector => document.querySelector(selector);
const icons = { '반나절': '☀', '당일치기': '🌤', '1박 2일': '🌙', '2박 3일': '🧳', '혼자': '🚶', '연인': '♡', '친구': '🙌', '가족': '🏡', '볼거리': '🌿', '맛집': '🍚', '체험': '🎨', '특산물 쇼핑': '🛍', '축제': '🎉', '숙박': '🛏' };
function renderChoices() {
  for (const [id, values, key] of [['duration-options', durations, 'duration'], ['companion-options', companions, 'companion'], ['interest-options', interests, 'interests']]) {
    const container = document.getElementById(id);
    container.replaceChildren();
    values.forEach(value => {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'chip';
      button.textContent = `${icons[value]} ${value}`;
      button.setAttribute('aria-pressed', key === 'interests' ? state.interests.includes(value) : state[key] === value);
      button.addEventListener('click', () => {
        if (key === 'interests') state.interests = state.interests.includes(value) ? state.interests.filter(item => item !== value) : [...state.interests, value];
        else state[key] = value;
        renderChoices();
        document.getElementById(id).children[values.indexOf(value)].focus({ preventScroll: true });
      });
      container.append(button);
    });
  }
}
function element(tag, text, className) {
  const el = document.createElement(tag);
  if (text) el.textContent = text;
  if (className) el.className = className;
  return el;
}
function recommend() {
  state.transport = $('#transport').value;
  state.date = $('#travel-date').value;
  currentTrip = buildTrip(state);
  const snapshot = structuredClone(state);
  currentTrip.options = snapshot;
  $('#results').hidden = false;
  $('#result-summary').textContent = `${state.companion === '혼자' ? '혼자 떠나는' : state.companion + '과 함께하는'} ${state.duration} 여행${state.date ? ' · ' + state.date + ' 출발' : ''}. 마음에 드는 곳부터 천천히 만나보세요.`;
  $('#result-tags').replaceChildren(...[state.duration, state.companion, ...state.interests, state.transport === 'car' ? '자가용' : '대중교통·택시'].map(value => element('span', value)));
  $('#itinerary').replaceChildren(...currentTrip.days.map(day => {
    const card = element('article', '', 'day-card');
    card.append(element('h3', `DAY ${String(day.day).padStart(2, '0')} · ${day.day === 1 ? '설레는 의성의 시작' : '조금 더 깊이 만나는 의성'}`));
    day.stops.forEach(stop => {
      const row = element('div', '', 'stop');
      const time = element('time', stop.time); time.dateTime = stop.time;
      const content = element('div');
      const link = element('a', '위치·업체 검색 ↗');
      link.href = `https://map.naver.com/p/search/${encodeURIComponent(stop.query)}`;
      link.target = '_blank'; link.rel = 'noopener noreferrer';
      content.append(element('h4', stop.title), element('p', stop.description), link);
      row.append(time, content); card.append(row);
    });
    return card;
  }));
  $('#dynamic-notes').replaceChildren(...currentTrip.notes.map(note => element('p', note)));
  $('#copy-status').textContent = '';
  $('#results').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
$('#trip-form').addEventListener('submit', event => { event.preventDefault(); recommend(); });
$('#reset').addEventListener('click', () => {
  state = defaults(); renderChoices(); $('#transport').value = 'car'; $('#travel-date').value = '';
  $('#trip-prompt').value = ''; $('#prompt-feedback').textContent = ''; $('#results').hidden = true; currentTrip = null;
});
$('#example').addEventListener('click', () => {
  $('#trip-prompt').value = '연인이랑 단둘이 맛집을 찾고 1박2일로 볼거리 체험거리 즐기고 의성 특산물도 사고 싶어. 의성에서 하룻밤 보낼 거야. 추천 코스 안내해줘!';
  $('#trip-prompt').focus();
});
$('#prompt-submit').addEventListener('click', () => {
  const text = $('#trip-prompt').value.trim();
  if (!text) { $('#prompt-feedback').textContent = '떠나고 싶은 여행을 한 문장으로 알려주세요.'; $('#trip-prompt').focus(); return; }
  const parsed = parsePrompt(text);
  if (!parsed.duration && !parsed.companion && !parsed.interests.length && !parsed.transport) {
    $('#prompt-feedback').textContent = '기간, 동행, 관심사를 찾지 못했어요. “연인과 1박 2일 맛집 여행”처럼 적어주세요.'; return;
  }
  const recognized = [parsed.duration, parsed.companion, ...parsed.interests, parsed.transport === 'public' ? '대중교통' : parsed.transport === 'car' ? '자가용' : ''].filter(Boolean);
  if (!parsed.interests.length) delete parsed.interests;
  state = { ...state, ...parsed };
  if (parsed.transport) $('#transport').value = parsed.transport;
  renderChoices();
  $('#prompt-feedback').textContent = `반영했어요: ${recognized.join(' · ')}. 언급하지 않은 조건은 현재 선택을 유지해요.`;
  recommend();
});
document.querySelectorAll('[data-interest]').forEach(button => button.addEventListener('click', () => {
  if (!state.interests.includes(button.dataset.interest)) state.interests.push(button.dataset.interest);
  renderChoices(); $('#planner').scrollIntoView({ behavior: 'smooth' });
}));
$('#copy-trip').addEventListener('click', async () => {
  if (!currentTrip) return;
  const text = [`의동이 픽 · ${currentTrip.options.duration}`, ...currentTrip.days.flatMap(day => [`\nDAY ${day.day}`, ...day.stops.map(stop => `${stop.time} ${stop.title}\n${stop.description}`)]), '\n출발 전 확인', ...currentTrip.notes, '추천 일정은 참고용이며 운영시간·예약·이동시간 확인이 필요합니다.'].join('\n');
  try { await navigator.clipboard.writeText(text); $('#copy-status').textContent = '일정을 복사했어요. 함께 갈 사람에게 공유해 보세요!'; }
  catch { $('#copy-status').textContent = '복사 기능을 사용할 수 없어요. 아래 내용을 직접 복사해 주세요.'; const area = element('textarea'); area.value = text; area.readOnly = true; area.setAttribute('aria-label', '복사할 여행 일정'); $('#copy-status').append(area); area.select(); }
});
renderChoices();
