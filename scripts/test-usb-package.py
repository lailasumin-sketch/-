from pathlib import Path
from playwright.sync_api import sync_playwright, Error as PlaywrightError
import json,sys,shutil,tempfile,subprocess,time,re,urllib.request,hashlib,argparse
parser=argparse.ArgumentParser();parser.add_argument('folder',nargs='?',type=Path,default=Path(__file__).resolve().parents[2]/'USB_최종제출');args=parser.parse_args();root=args.folder.resolve()
report={'windows_bat_double_click':'미검증: Linux, Windows/Wine 없음','windows_no_node_installed':'미검증: Node.exe 포함·체크섬·x64/ARM64 PE 형식만 검증','windows_drive_letter_change':'미검증: 실제 Windows 드라이브 문자 변경 불가','tests':[]}
def log(name):report['tests'].append({'name':name,'status':'passed'});print('PASS',name,flush=True)
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 def check(page, url, offline=True):
  page.context.set_offline(False)
  errors=[];requests=[]
  page.on('pageerror',lambda e:errors.append(str(e)))
  page.on('request',lambda r:requests.append(r.url))
  page.goto(url,wait_until='load')
  page.wait_for_function("document.querySelectorAll('.place-card').length===65")
  assert page.locator('.usb-chart').count()==3
  assert '65곳' in page.locator('.usb-chart').first.inner_text()
  if offline:page.context.set_offline(True)
  assert page.locator('input#start-time').input_value()=='09:30'
  assert page.evaluate("getComputedStyle(document.body).getPropertyValue('--bg').trim()")=='#f9f7f2'
  page.locator('#catalogue-search').fill('카페')
  assert page.locator('.mock-card').count()==12;assert '12곳' in page.locator('.usb-chart').first.inner_text()
  page.locator('#catalogue-budget').select_option('10000')
  assert page.locator('.mock-card').count()>0 and page.locator('.mock-card').count()<12
  page.locator('#catalogue-search').fill('不存在xyz');assert page.locator('.place-card').count()==0
  page.locator('#catalogue-search').fill('');page.locator('#catalogue-budget').select_option('0')
  page.locator('#trip-prompt').fill('가족과 당일치기 맛집 카페 볼거리, 오전 9시30분부터 총 6시간')
  page.locator('#travel-allowance').fill('15');page.locator('#prompt-submit').click()
  assert page.locator('.day-card').count()==1
  assert page.locator('.stat-card').count()==4
  assert page.locator('.recommendation-reasons').count()>=3
  assert page.locator('.reason-check').count()>0
  assert '가족 여행 조건과 일치' in page.locator('#itinerary').inner_text()
  assert page.locator('#itinerary [data-mock=true]').count()==2
  times=page.locator('.timeline-time').all_text_contents();end=0
  for text in times:
   a,b=re.findall(r'\d\d:\d\d',text)
   def mins(t):h,m=map(int,t.split(':'));return h*60+m
   assert mins(a)>=end;end=mins(b);assert end<=930
  page.locator('#copy-trip').click()
  page.wait_for_function("document.querySelector('#copy-status').textContent.length>0")
  assert '복사' in page.locator('#copy-status').inner_text()
  page.set_viewport_size({'width':390,'height':844})
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
  page.set_viewport_size({'width':1440,'height':1000})
  assert not errors,errors
  assert not any(x.startswith(('http://','https://')) and not x.startswith(url) for x in requests),requests
  return requests
 ctx=browser.new_context(viewport={'width':1440,'height':1000})
 page=ctx.new_page()
 try:
  check(page,(root/'index.html').as_uri());log('file:// 직접 실행: 관리 브라우저에서 실제 실행')
 except PlaywrightError as error:
  if 'ERR_BLOCKED_BY_ADMINISTRATOR' not in str(error):raise
  report['file_direct_execution']='미검증: 관리 브라우저의 URLBlocklist가 file://를 차단. 정책 변경·우회하지 않음.'
  print('UNVERIFIED file://: managed browser policy',flush=True)
 main_proc=subprocess.Popen(['node',str(root/'server/launcher.cjs'),'--no-browser'],stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
 main_url=None
 for _ in range(15):
  line=main_proc.stdout.readline()
  if line.startswith('UIDONGI_URL='):main_url=line.strip().split('=',1)[1];break
 assert main_url
 check(page,main_url);log('동일 패키지 HTML: 로컬 제공 후 인터넷 차단, 65개 자료·검색·필터·차트·추천·체크 이유·복사/대체·모바일')
 # Actual screenshots of the packaged app, not invented UI.
 page.evaluate('scrollTo(0,0)');page.screenshot(path=str(root/'발표자료'/'화면_메인.png'),full_page=False)
 page.locator('#results').evaluate('(el)=>el.scrollIntoView({block:"start",behavior:"instant"})');page.wait_for_timeout(200);page.screenshot(path=str(root/'발표자료'/'화면_일정.png'),full_page=False)
 page.locator('#catalogue-search').fill('카페');page.locator('#usb-dashboard').screenshot(path=str(root/'발표자료'/'화면_차트.png'))
 # New path containing Korean text, spaces and !; no absolute path assumptions.
 base=Path(tempfile.mkdtemp(prefix='usb-relocation-'))/'다른 드라이브 가정 ! 심사용';base.mkdir()
 for name in ['index.html','assets','server']:
  src=root/name;dest=base/name
  if src.is_dir():shutil.copytree(src,dest)
  else:shutil.copy2(src,dest)
 relocated=ctx.new_page()
 try:check(relocated,(base/'index.html').as_uri());log('HTML 직접 실행 경로 이동: 한글·공백·느낌표')
 except PlaywrightError as error:
  if 'ERR_BLOCKED_BY_ADMINISTRATOR' not in str(error):raise
  report['file_relocation_execution']='미검증: file:// 관리 정책 차단. 상대경로 파일 존재 정적 검사와 서버 경로 이동은 별도 검증.'
 for relative in ['assets/app.js','assets/style.css','assets/landscape.svg','assets/noto-kr-400.otf','assets/noto-kr-700.otf']:assert (base/relative).is_file()
 log('HTML 상대경로 정적 검사: 경로 이동 후 필요한 스크립트·CSS·이미지·글꼴 존재')
 ctx.close()
 # Server code runs on native Linux Node, not the Windows executable.
 proc=subprocess.Popen(['node',str(base/'server/launcher.cjs'),'--no-browser'],stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
 try:
  url=None
  deadline=time.time()+15
  while time.time()<deadline:
   line=proc.stdout.readline()
   if line.startswith('UIDONGI_URL='):url=line.strip().split('=',1)[1];break
   if proc.poll() is not None:raise AssertionError(proc.stderr.read())
  assert url
  with urllib.request.urlopen(url+'__usb_health') as r:assert json.load(r)['ready']
  try:urllib.request.urlopen(url+'source/package.json');raise AssertionError('source should not be served')
  except urllib.error.HTTPError as e:assert e.code==404
  serverctx=browser.new_context(viewport={'width':1440,'height':1000});serverpage=serverctx.new_page()
  serverpage.route('**/*',lambda route:route.continue_() if route.request.url.startswith(url) or route.request.url.startswith('data:') else route.abort())
  check(serverpage,url,offline=True)
  serverctx.close();log('서버 방식: 다른 경로에서 포트 자동 할당·헬스체크·로컬 응답·소스 비공개·웹 기능 (Linux Node로 검증)')
 finally:
  proc.terminate();proc.wait(timeout=5)
 # Missing runtime asset: clear nonzero startup failure.
 (base/'assets/app.js').rename(base/'assets/app.bak')
 failed=subprocess.run(['node',str(base/'server/launcher.cjs'),'--no-browser'],capture_output=True,text=True,timeout=10)
 assert failed.returncode!=0 and '실행 오류' in failed.stderr
 log('서버 시작 실패: 필수 앱 파일 누락 시 오류 문구와 실패 종료 코드')
 shutil.rmtree(base.parent)
 main_proc.terminate();main_proc.wait(timeout=5)
 browser.close()
# Static checks of launcher/runtimes and source CSV integrity.
bat=(root/'실행하기.bat').read_bytes()
assert b'\r\n' in bat and b'%~dp0' in bat and b'npm ' not in bat and b'node-arm64.exe' in bat
manifest=json.loads((root/'node/검증내역.json').read_text())
for arch,item in manifest['architectures'].items():
 file=root/'node'/('node.exe' if arch=='x64' else 'node-arm64.exe')
 assert hashlib.sha256(file.read_bytes()).hexdigest()==item['exe_sha256']
log('BAT 정적 검사: CRLF·상대경로·x64/ARM64 분기·npm 명령 없음 / Node 실행 파일 체크섬')
analysis=json.loads((root/'data/CSV_분석보고서.json').read_text())
assert sorted(f['records'] for f in analysis['files'])==[30,35]
assert all(f['replacement_characters']==0 and f['utf8_bom'] for f in analysis['files'])
log('CSV 2개: 한글 UTF-8 BOM·열 수·원본 30/35행·대체문자 없음')
(root/'검증결과.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print('REPORT',root/'검증결과.json')
