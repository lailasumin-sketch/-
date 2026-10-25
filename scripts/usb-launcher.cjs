'use strict';
const http=require('node:http');
const fs=require('node:fs/promises');
const path=require('node:path');
const {spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.otf':'font/otf','.png':'image/png'};
let server;
function fail(error){console.error('\n[실행 오류] '+error.message+'\nindex.html을 직접 열어 보조 실행할 수 있습니다.');process.exitCode=1;}
async function main(){
 for(const file of ['index.html','assets/app.js','assets/style.css','assets/usb-data.js','assets/usb-dashboard.js','assets/landscape.svg'])await fs.access(path.join(root,file));
 server=http.createServer(async(req,res)=>{
  try{
   if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
   const pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);
   if(pathname==='/__usb_health'){res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify({app:'uidongi-pick-usb',ready:true}));return;}
   const name=pathname==='/'?'index.html':pathname.replace(/^\//,'');
   if(name!=='index.html'&&!name.startsWith('assets/')){res.writeHead(404);res.end('Not found');return;}
   const target=path.resolve(root,name),relative=path.relative(root,target);
   if(relative.startsWith('..')||path.isAbsolute(relative)){res.writeHead(403);res.end();return;}
   const body=await fs.readFile(target);
   res.writeHead(200,{'Content-Type':mime[path.extname(target)]||'application/octet-stream','X-Content-Type-Options':'nosniff','Cache-Control':'no-store'});
   res.end(req.method==='HEAD'?undefined:body);
  }catch(error){res.writeHead(error instanceof URIError?400:404);res.end('파일을 찾을 수 없습니다. USB 폴더 전체가 있는지 확인하세요.');}
 });
 server.on('error',fail);
 server.listen(0,'127.0.0.1',()=>{
  const url=`http://127.0.0.1:${server.address().port}/`;
  http.get(url+'__usb_health',response=>{
   if(response.statusCode!==200){server.close();fail(new Error('서버 준비 확인에 실패했습니다.'));return;}
   response.resume();
   console.log('\n의동이 PICK USB 체험판이 준비되었습니다.');
   console.log('UIDONGI_URL='+url);
   console.log('브라우저가 열리지 않으면 위 주소를 주소창에 입력하세요.');
   console.log('이 창을 닫으면 서버가 종료됩니다.\n');
   if(process.argv.includes('--no-browser'))return;
   if(process.platform==='win32'){
    const child=spawn('cmd.exe',['/d','/c','start','',url],{windowsHide:true,stdio:'ignore'});
    child.on('error',error=>console.error('브라우저 자동 열기 실패: '+error.message+' / 위 주소를 직접 여세요.'));
    child.on('exit',code=>{if(code)console.error('브라우저 자동 열기 실패. 위 주소를 직접 여세요.');});
   }else console.log('Windows 외 환경입니다. 위 주소를 직접 여세요.');
  }).on('error',error=>{server.close();fail(error);});
 });
}
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{if(server)server.close(()=>process.exit(0));else process.exit(0);});
main().catch(fail);
