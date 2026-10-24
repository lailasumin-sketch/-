import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePrompt, buildTrip } from './public/planner.js';
test('요청 예시에서 기간, 연인, 관심사 추출', () => {
  const result = parsePrompt('연인이랑 단둘이 맛집을 찾고 1박2일로 볼거리 체험거리 즐기고 의성 특산물도 사고 싶어 의성에서 하룻밤 보낼거야');
  assert.equal(result.duration, '1박 2일'); assert.equal(result.companion, '연인');
  assert.deepEqual(result.interests, ['볼거리', '맛집', '체험', '특산물 쇼핑', '숙박']);
});
test('1박 2일 코스에 숙박과 선택 관심사를 포함', () => {
  const trip = buildTrip({ duration: '1박 2일', companion: '연인', interests: ['볼거리', '맛집', '체험', '특산물 쇼핑'], transport: 'car' });
  assert.equal(trip.days.length, 2);
  const titles = trip.days.flatMap(day => day.stops.map(stop => stop.title));
  for (const fragment of ['산운', '점심', '체험', '장보기', '체크인']) assert.ok(titles.some(t => t.includes(fragment)));
});
test('반나절에는 방문지 3개까지만 넣고 누락과 숙박 조건 안내', () => {
  const trip = buildTrip({ duration: '반나절', companion: '가족', interests: ['볼거리', '맛집', '체험', '특산물 쇼핑', '축제', '숙박'], transport: 'public' });
  assert.equal(trip.days[0].stops.length, 3);
  assert.ok(trip.notes.some(t => t.includes('제외')));
  assert.ok(trip.notes.some(t => t.includes('숙박이 포함되지')));
  assert.ok(trip.notes.some(t => t.includes('대중교통')));
});
test('2박 3일의 모든 날짜에 방문지와 시간 배정', () => {
  const trip = buildTrip({ duration: '2박 3일', companion: '혼자', interests: [], transport: 'car' });
  assert.equal(trip.days.length, 3);
  assert.ok(trip.days.every(day => day.stops.length > 0 && day.stops.every(stop => stop.time)));
});
test('축제 개최를 확정하지 않으며 알 수 없는 입력은 조건을 만들지 않음', () => {
  assert.deepEqual(parsePrompt('안녕하세요'), { interests: [] });
  const trip = buildTrip({ duration: '당일치기', companion: '친구', interests: ['축제'], transport: 'car' });
  assert.ok(trip.notes.some(t => t.includes('확정하지')));
});
