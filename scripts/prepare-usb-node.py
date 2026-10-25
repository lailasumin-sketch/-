import urllib.request,json,hashlib,zipfile,argparse
from pathlib import Path
parser=argparse.ArgumentParser();parser.add_argument('--cache',type=Path,default=Path(__file__).resolve().parents[2]/'usb-build-cache');args=parser.parse_args();root=args.cache;root.mkdir(parents=True,exist_ok=True)
version='v24.22.1'
base='https://nodejs.org/dist/'+version+'/'
with urllib.request.urlopen(base+'SHASUMS256.txt',timeout=30) as r: sums=r.read()
(root/'SHASUMS256.txt').write_bytes(sums)
checks={line.split()[1]:line.split()[0] for line in sums.decode().splitlines() if len(line.split())==2}
manifest={'version':version,'source':base,'verification':'Official HTTPS download, SHA-256 compared with official SHASUMS256.txt','architectures':{}}
for arch in ['x64','arm64']:
 name=f'node-{version}-win-{arch}.zip';target=root/name
 if not target.exists():
  with urllib.request.urlopen(base+name,timeout=60) as response,target.open('wb') as out:
   while True:
    block=response.read(1024*1024)
    if not block: break
    out.write(block)
 digest=hashlib.sha256(target.read_bytes()).hexdigest()
 if digest!=checks[name]:raise SystemExit('Checksum mismatch: '+name)
 with zipfile.ZipFile(target) as z:
  prefix=f'node-{version}-win-{arch}/'
  (root/f'node-{arch}.exe').write_bytes(z.read(prefix+'node.exe'))
  (root/f'LICENSE-{arch}.txt').write_bytes(z.read(prefix+'LICENSE'))
 manifest['architectures'][arch]={'zip':name,'sha256':digest,'exe_sha256':hashlib.sha256((root/f'node-{arch}.exe').read_bytes()).hexdigest(),'exe_bytes':(root/f'node-{arch}.exe').stat().st_size}
 print('Verified',name,'zip bytes',target.stat().st_size,'exe bytes',manifest['architectures'][arch]['exe_bytes'],flush=True)
(root/'node-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
