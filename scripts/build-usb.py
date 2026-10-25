"""Build both offline launch modes. Requires build-time Python, fontTools, esbuild.
Judges need none of those tools; all runtime files are included in the result.
"""
import argparse,base64,csv,hashlib,io,json,os,re,shutil,struct,subprocess,tempfile
from pathlib import Path
from datetime import datetime
from zoneinfo import ZoneInfo
from fontTools.ttLib import TTFont
from fontTools import subset

REPO=Path(__file__).resolve().parents[1]
def analyze_csv(path):
 raw=path.read_bytes();encoding=None
 for candidate in ['utf-8-sig','cp949','euc-kr']:
  try:text=raw.decode(candidate,errors='strict');encoding=candidate;break
  except UnicodeDecodeError:pass
 if encoding is None:raise ValueError('지원하지 않는 CSV 인코딩: '+str(path))
 rows=list(csv.reader(io.StringIO(text)));headers=rows[0]
 if any(len(r)!=len(headers) for r in rows[1:]):raise ValueError('CSV 열 수 불일치: '+str(path))
 return {'file':str(path.relative_to(REPO)),'encoding':encoding,'utf8_bom':raw.startswith(b'\xef\xbb\xbf'),'records':len(rows)-1,'columns':len(headers),'headers':headers,'replacement_characters':text.count('\ufffd'),'missing_counts':{h:sum(not r[i].strip() for r in rows[1:]) for i,h in enumerate(headers)},'provenance':'사용자가 승인한 기존 가상/조사 후보 CSV. 주최 측 제공 파일로 확인된 자료가 아님.'}
def main():
 ap=argparse.ArgumentParser();ap.add_argument('--output',type=Path,default=REPO.parent/'USB_최종제출');ap.add_argument('--node-cache',type=Path,default=REPO.parent/'usb-build-cache');args=ap.parse_args()
 output=args.output.resolve();cache=args.node_cache.resolve()
 if output==REPO or REPO in output.parents:raise ValueError('결과 폴더는 원본 저장소 밖에 지정하세요.')
 if output.exists():raise ValueError('기존 결과를 덮어쓰지 않습니다. 다른 --output 경로를 지정하세요.')
 manifest=json.loads((cache/'node-manifest.json').read_text())
 for arch,m in manifest['architectures'].items():
  exe=cache/f'node-{arch}.exe'
  if hashlib.sha256(exe.read_bytes()).hexdigest()!=m['exe_sha256']:raise ValueError('Node 실행 파일 체크섬 불일치')
  raw=exe.read_bytes();offset=struct.unpack_from('<I',raw,0x3c)[0]
  if raw[:2]!=b'MZ' or raw[offset:offset+4]!=b'PE\0\0' or struct.unpack_from('<H',raw,offset+4)[0]!={'x64':0x8664,'arm64':0xaa64}[arch]:raise ValueError('Windows PE 아키텍처 불일치')
 for name in ['assets','data','node','server','발표자료','source']:(output/name).mkdir(parents=True,exist_ok=True)
 for template in (REPO/'packaging').glob('*'):
  if template.suffix in ['.txt','.md']:shutil.copy2(template,output/template.name)
 public=REPO/'public'
 inputs={name:json.loads((public/name).read_text()) for name in ['catalogue.json','dining.json','events.json','travel-times.json']}
 payload={'catalogue':inputs['catalogue.json'],'dining':inputs['dining.json']['places'],'events':inputs['events.json']['events'],'travelTable':inputs['travel-times.json'],'warnings':[]}
 (output/'data'/'bundled-data.json').write_text(json.dumps(payload,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
 reports=[]
 for file in sorted((REPO/'data').rglob('*.csv')):
  reports.append(analyze_csv(file));dest=output/'data'/file.relative_to(REPO/'data');dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(file,dest)
 shutil.copy2(REPO/'data/mock/mock-restaurants-cafes.xlsx',output/'data/mock/mock-restaurants-cafes.xlsx')
 (output/'data/CSV_분석보고서.json').write_text(json.dumps({'files':reports,'runtime':'CSV를 빌드 시 내장 JavaScript 데이터로 변환. 실행 중 CSV·외부 DB·API 요청 없음.','status':'기존 가상/미검증 자료 표시 유지'},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
 stage=Path(tempfile.mkdtemp(prefix='uidongi-usb-stage-'))
 try:
  shutil.copytree(public,stage/'public')
  embedded=json.dumps(payload,ensure_ascii=False).replace('<','\\u003c')
  (stage/'public/load-data.js').write_text('const bundled='+embedded+';\nexport async function loadTripData(){return JSON.parse(JSON.stringify(bundled));}\n',encoding='utf-8')
  subprocess.run(['npx','--yes','esbuild@0.25.12',str(stage/'public/app.js'),'--bundle','--format=iife','--target=es2020','--charset=utf8','--outfile='+str(output/'assets/app.js')],check=True,cwd=REPO)
 finally:shutil.rmtree(stage)
 (output/'assets/usb-data.js').write_text('window.__UIDONGI_USB_DATA__='+json.dumps(payload,ensure_ascii=False).replace('<','\\u003c')+';\n',encoding='utf-8')
 shutil.copy2(REPO/'scripts/usb-dashboard.js',output/'assets/usb-dashboard.js')
 css=(public/'style.css').read_text();css=re.sub(r"@import\s+url\([^)]*\)\s*;",'',css,count=1)
 fonts=[]
 for weight,suffix in [(400,'Regular'),(700,'Bold')]:
  name=f'noto-kr-{weight}.otf';font=TTFont('/usr/share/fonts/opentype/noto/NotoSansCJK-'+suffix+'.ttc',fontNumber=1)
  options=subset.Options();options.layout_features=['*'];sub=subset.Subsetter(options=options)
  chars=set(range(0x20,0x100))|set(range(0xac00,0xd7a4))|set(range(0x1100,0x1200))|set(range(0x3130,0x3190))
  for p in public.iterdir():
   if p.suffix in ['.html','.js','.json']:chars.update(map(ord,p.read_text()))
  chars.update(map(ord,'가상 데이터 CSV 분류별 권역별 예산 검색 결과 기록 수 곳 주최 측 제공 아님 관광 후보'))
  sub.populate(unicodes=chars);sub.subset(font);font.save(output/'assets'/name)
  encoded=base64.b64encode((output/'assets'/name).read_bytes()).decode('ascii')
  fonts.append(f"@font-face{{font-family:'Noto Sans KR';src:url('data:font/otf;base64,{encoded}') format('opentype');font-weight:{weight};font-style:normal;font-display:swap;}}")
 css='\n'.join(fonts)+'\n'+css+'''
.usb-chart-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px}.usb-chart{background:#fffefa;border:1px solid var(--line);border-radius:12px;padding:24px}.usb-chart h3{font-size:17px}.usb-chart>p{font-size:10px;color:#8a947f;line-height:1.7;margin:10px 0 20px}.usb-bar-row{display:grid;grid-template-columns:88px 1fr 35px;gap:8px;align-items:center;font-size:10px;margin:12px 0}.usb-bar-row strong{text-align:right;font-size:10px;font-weight:500}.usb-bar-track{height:8px;border-radius:5px;background:#edf0e5;overflow:hidden}.usb-bar-track i{display:block;height:100%;border-radius:5px;background:#799867}.usb-chart:first-child .usb-bar-track i{background:#de935d}.usb-dashboard>.form-note{text-align:left;line-height:1.8;margin-top:16px}@media(max-width:800px){.usb-chart-grid{grid-template-columns:1fr}.usb-bar-row{grid-template-columns:100px 1fr 40px}}'''
 (output/'assets/style.css').write_text(css,encoding='utf-8')
 shutil.copy2('/usr/share/doc/fonts-noto-cjk/copyright',output/'assets/FONT-LICENSE.txt')
 shutil.copy2(public/'landscape.svg',output/'assets/landscape.svg')
 html=(public/'index.html').read_text().replace('href="/style.css"','href="./assets/style.css"').replace('src="/landscape.svg"','src="./assets/landscape.svg"').replace('href="/"','href="./index.html"')
 html=html.replace('<script type="module" src="/app.js"></script>','<script defer src="./assets/app.js"></script><script defer src="./assets/usb-data.js"></script><script defer src="./assets/usb-dashboard.js"></script>')
 html=html.replace('의성 여행 추천 서비스 · 프로토타입','의성 여행 추천 서비스 · USB 오프라인 체험판')
 (output/'index.html').write_text(html,encoding='utf-8')
 for arch in ['x64','arm64']:
  shutil.copy2(cache/f'node-{arch}.exe',output/'node'/('node.exe' if arch=='x64' else 'node-arm64.exe'))
  shutil.copy2(cache/f'LICENSE-{arch}.txt',output/'node'/f'LICENSE-{arch}.txt')
 shutil.copy2(cache/'node-manifest.json',output/'node/검증내역.json');shutil.copy2(cache/'SHASUMS256.txt',output/'node/SHASUMS256.txt')
 shutil.copy2(REPO/'scripts/usb-launcher.cjs',output/'server/launcher.cjs')
 bat='''@echo off
setlocal EnableExtensions DisableDelayedExpansion
chcp 65001 >nul
title 의동이 PICK USB 실행
set "UIDONGI_NODE=%~dp0node\\node.exe"
if /I "%PROCESSOR_ARCHITECTURE%"=="ARM64" set "UIDONGI_NODE=%~dp0node\\node-arm64.exe"
if /I "%PROCESSOR_ARCHITEW6432%"=="ARM64" set "UIDONGI_NODE=%~dp0node\\node-arm64.exe"
if not exist "%UIDONGI_NODE%" (
  echo [오류] 포함된 Node.js 파일을 찾을 수 없습니다.
  echo USB 폴더 전체를 복사했는지 확인하거나 index.html을 직접 여세요.
  pause
  exit /b 1
)
echo 의동이 PICK을 준비합니다. 이 창을 닫으면 서버가 종료됩니다.
"%UIDONGI_NODE%" "%~dp0server\\launcher.cjs"
if errorlevel 1 (
  echo.
  echo [오류] 서버 실행에 실패했습니다. 위 오류를 확인하세요.
  echo index.html을 직접 열면 보조 실행할 수 있습니다.
)
pause
endlocal
'''
 (output/'실행하기.bat').write_bytes(bat.replace('\n','\r\n').encode('utf-8'))
 files=subprocess.check_output(['git','ls-files','-z','--cached','--others','--exclude-standard'],cwd=REPO).decode('utf-8').split('\0')
 copied={}
 for name in files:
  if not name:continue
  rel=Path(name)
  if rel.parts[0] in ['deliverables','dist','node_modules','.git','.vercel'] or rel.name.startswith('.env'):continue
  src=REPO/rel
  if src.is_file():dest=output/'source'/rel;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(src,dest);copied[name]=hashlib.sha256(src.read_bytes()).hexdigest()
 record={'builtAt':datetime.now(ZoneInfo('Asia/Seoul')).isoformat(),'sourceBaseCommit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=REPO,text=True).strip(),'sourceFilesSha256':copied,'runtime':manifest,'webData':{'tourismCandidates':len(payload['catalogue']['places']),'fictionalDining':len(payload['dining']),'organizerCsvProvided':False},'windowsExecution':'UNVERIFIED: Linux build environment has no Windows or Wine','launchModes':['Windows portable Node (x64/ARM64)','Direct file:// classic-script HTML']}
 (output/'빌드_명세.json').write_text(json.dumps(record,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
 print('Built',output,flush=True)
 print('CSV analysis:',[(p['file'],p['records'],p['encoding']) for p in reports],flush=True)
if __name__=='__main__':main()
