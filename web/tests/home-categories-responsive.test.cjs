const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawn}=require('node:child_process');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));

// Run against a local Next server. Every API response is mocked before network dispatch.
test('home category layout, surrounding content and mobile navigation', {skip:!process.env.FOODSAVE_LAYOUT_URL},async t=>{
 const url=new URL(process.env.FOODSAVE_LAYOUT_URL);
 assert.equal(url.protocol,'http:');assert.ok(['127.0.0.1','localhost'].includes(url.hostname));
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'foodsave-category-browser-'));
 const executable=process.env.FOODSAVE_BROWSER_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
 const browser=spawn(executable,['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-component-update','--disable-sync','--disable-extensions','--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:'ignore',windowsHide:true});
 let ws,send;const errors=[];
 try{
  let port;for(let i=0;i<100;i++){try{port=fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0];break;}catch{await wait(100);}}
  assert.ok(port,'Local browser must start');
  const targets=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();
  ws=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise(resolve=>ws.addEventListener('open',resolve,{once:true}));
  let sequence=0;const pending=new Map();
  send=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
  ws.addEventListener('message',async event=>{
   const m=JSON.parse(event.data);
   if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p?.reject(Error(m.error.message)):p?.resolve(m.result);return;}
   if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.text);
   if(m.method==='Fetch.requestPaused'){
    try{
     const {requestId,request}=m.params,u=new URL(request.url);
     if(u.pathname.endsWith('/offers')&&m.params.resourceType!=='Document'){
      await send('Fetch.fulfillRequest',{requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'application/json'},{name:'Access-Control-Allow-Origin',value:'*'}],body:Buffer.from('{"offers":[]}').toString('base64')});
     }else if(u.origin===url.origin)await send('Fetch.continueRequest',{requestId});
     else await send('Fetch.failRequest',{requestId,errorReason:'BlockedByClient'});
    }catch(e){errors.push(e.message);}
   }
  });
  await send('Runtime.enable');await send('Page.enable');await send('Network.enable');await send('Fetch.enable',{patterns:[{urlPattern:'*'}]});
  const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});assert.ok(!r.exceptionDetails,JSON.stringify(r.exceptionDetails));return r.result.value;};
  const screenshots=fs.mkdtempSync(path.join(os.tmpdir(),'foodsave-category-layouts-'));
  for(const width of [320,390,480,768,1024,1440])for(const locale of ['fr','en'])await t.test(`${locale} at ${width}px`,async()=>{
   await send('Emulation.setDeviceMetricsOverride',{width,height:740,deviceScaleFactor:1,mobile:width<=480});
   await send('Network.setCookie',{name:'foodsave_locale',value:locale,url:url.origin,path:'/'});
   await send('Page.navigate',{url:url.origin+'/'});
  for(let i=0;i<100;i++){if(await evaluate(`document.documentElement?.lang==='${locale}-CA' && document.querySelectorAll('[class*="categoryTiles"] a').length===8`))break;await wait(100);}
   await evaluate('document.fonts.ready');await wait(700);
   const layout=await evaluate(`(()=>{
    const box=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,right:r.right,bottom:r.bottom}};
    const grid=document.querySelector('[class*="categoryTiles"]');
    const cards=[...grid.querySelectorAll('a')].map(e=>({href:e.getAttribute('href'),box:box(e),display:getComputedStyle(e).display,children:[...e.children].map(c=>({text:c.textContent,box:box(c),scroll:c.scrollWidth,client:c.clientWidth}))}));
    const clipped=[...document.querySelectorAll('h1,h2,h3,p,figcaption,footer a')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&(r.left< -1||r.right>innerWidth+1||e.scrollWidth>e.clientWidth+1)}).map(e=>e.textContent);
    const section=grid.closest('section'),hero=section.previousElementSibling,caption=hero.querySelector('figcaption');
    return {width:innerWidth,scroll:document.documentElement.scrollWidth,columns:getComputedStyle(grid).gridTemplateColumns.split(' ').length,cards,clipped,
      heroGap:box(section).y-box(hero).bottom,disclosure:caption?.textContent,disclosureBottom:caption&&box(caption).bottom,categoryTop:box(section).y,nextGap:box(section.nextElementSibling).y-box(grid).bottom};
   })()`);
   assert.ok(layout.scroll<=layout.width,'No horizontal overflow');assert.deepEqual(layout.clipped,[],'Surrounding text stays within viewport');
   assert.equal(layout.columns,width<=480?1:width<=1024?2:4);
  assert.equal(layout.cards.length,8);
  const categoryValues=['EPICERIE','PLATS_PREPARES','SANDWICHS','BOULANGERIE_PATISSERIE','PIZZA_FAST_FOOD','FRUITS_LEGUMES','BOISSONS','AUTRE'];
  const {localeTools}=require('./i18n-fixture.cjs');
  const categoryKeys=['ui.grocery','ui.prepared_meals','ui.sandwiches','ui.bakery_pastries','ui.pizza_fast_food','ui.fruit_and_vegetables','ui.drinks','ui.other'];
  assert.deepEqual(layout.cards.map(card=>card.children[1].text),categoryKeys.map(key=>localeTools(locale).t(key)),'All localized Home categories are present');
  layout.cards.forEach((card,index)=>{assert.equal(card.href,'/offers?category='+categoryValues[index]);assert.equal(card.children.length,3);assert.ok(card.box.h>=44);});
   if(width<=480){
    const heights=layout.cards.map(c=>c.box.h);assert.ok(Math.max(...heights)-Math.min(...heights)<1,'Equal-height rows');assert.ok(Math.min(...heights)>=72&&Math.max(...heights)<=88,'Compact 72–88px rows');
    for(const card of layout.cards){const [icon,label,arrow]=card.children;assert.equal(card.display,'grid');assert.ok(icon.box.right<=label.box.x);assert.ok(label.box.right<=arrow.box.x);assert.ok(Math.abs(icon.box.x-card.box.x-13)<1);assert.ok(Math.abs(card.box.right-arrow.box.right-13)<1);assert.ok(label.scroll<=label.client+1);for(const child of card.children)assert.ok(Math.abs(child.box.y+child.box.h/2-card.box.y-card.box.h/2)<1,'Vertically centered content');}
    assert.ok(layout.disclosure?.trim(),'Hero image disclosure remains visible');assert.ok(layout.disclosureBottom<=layout.categoryTop,'Disclosure does not overlap categories');assert.ok(layout.heroGap>=-1,'Hero does not overlap categories');assert.ok(layout.nextGap>=24&&layout.nextGap<=48,'Compact separation before next section');
    const labels=layout.cards.map(c=>c.children[1].text);
    assert.ok(labels.some(s=>locale==='fr'?s.includes('Pâtisserie'):s.includes('Baker')));assert.ok(labels.some(s=>locale==='fr'?s.includes('Fruits'):s.includes('Fruit')));
    await evaluate(`document.querySelector('[class*="categoryTiles"]').scrollIntoView({block:'center'})`);
    const shot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(screenshots,locale+'-'+width+'.png'),Buffer.from(shot.data,'base64'));
    await evaluate(`window.scrollTo(0,0);document.querySelector('button[aria-controls="mobile-nav"]').click()`);await wait(100);
    assert.ok(await evaluate(`!!document.getElementById('mobile-nav')`));assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'));
    await evaluate(`document.querySelector('button[aria-controls="mobile-nav"]').click()`);
    // Shorter visible area simulates browser chrome: content must remain scrollable.
    await send('Emulation.setDeviceMetricsOverride',{width,height:540,deviceScaleFactor:1,mobile:true});
    await evaluate('window.scrollTo(0,document.documentElement.scrollHeight)');await wait(50);
    assert.ok(await evaluate('document.querySelector("footer").getBoundingClientRect().bottom<=innerHeight+1'));
   }else for(const card of layout.cards)assert.equal(card.display,'flex','Tablet and desktop keep original layout');
  });
  for(const width of [320,390,480])for(const locale of ['fr','en'])await t.test(`all nine offer filters reachable by touch: ${locale} at ${width}px`,async()=>{
   await send('Emulation.setDeviceMetricsOverride',{width,height:740,deviceScaleFactor:1,mobile:true});
   await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});
   await send('Network.setCookie',{name:'foodsave_locale',value:locale,url:url.origin,path:'/'});
   await send('Page.navigate',{url:url.origin+'/offers'});
   for(let i=0;i<100;i++){if(await evaluate(`document.querySelectorAll('[class*="filterRow"] button').length===9`))break;await wait(100);}
   await evaluate(`document.querySelector('[class*="filterRow"]').scrollIntoView({block:'center'})`);await wait(500);
   const state=()=>evaluate(`(()=>{const row=document.querySelector('[class*="filterRow"]'),r=row.getBoundingClientRect();return {left:r.left,right:r.right,y:r.y+r.height/2,scroll:row.scrollLeft,max:row.scrollWidth-row.clientWidth,more:row.parentElement.dataset.moreCategories,buttons:[...row.querySelectorAll('button')].map(b=>{const q=b.getBoundingClientRect();return {text:b.textContent,left:q.left,right:q.right,y:q.y+q.height/2,pressed:b.getAttribute('aria-pressed'),height:q.height}})}})()`);
   async function swipe(left){const r=await state(),start=left?r.right-16:r.left+16,end=left?r.left+16:r.right-16;
    await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:start,y:r.y}]});
    for(let n=1;n<=12;n++){await send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:start+(end-start)*n/12,y:r.y}]});await wait(15);}
    await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await wait(250);
   }
   const initial=await state();assert.equal(initial.more,'true','Right-edge cue advertises more categories');assert.ok(initial.max>0);
   const {localeTools}=require('./i18n-fixture.cjs');
   const keys=['ui.all','ui.grocery','ui.prepared_meals','ui.sandwiches','ui.bakery_pastries','ui.pizza_fast_food','ui.fruit_and_vegetables','ui.drinks','ui.other'];
   assert.deepEqual(initial.buttons.map(b=>b.text),keys.map(k=>localeTools(locale).t(k)),'All original localized category names preserved');
   for(let n=0;n<20&&(await state()).scroll<(await state()).max-1;n++)await swipe(true);
   const end=await state();assert.ok(Math.abs(end.scroll-end.max)<=1,'Touch scrolling reaches the end');assert.ok(end.buttons[8].right<=end.right-24,'Other is fully visible with trailing space');assert.equal(end.more,'false');
   // Visit backwards using touch gestures, then tap every real button.
   for(let index=8;index>=0;index--){
    for(let n=0;n<20;n++){const r=await state(),b=r.buttons[index];if(b.left>=r.left+2&&b.right<=r.right-2)break;await swipe(b.right>r.right);}
    const r=await state(),b=r.buttons[index];assert.ok(b.left>=r.left&&b.right<=r.right,'Category reachable: '+b.text);assert.ok(b.height>=44);
    await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:(b.left+b.right)/2,y:b.y}]});await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await wait(400);
    const selected=await state();assert.equal(selected.buttons[index].pressed,'true');assert.equal(selected.buttons.filter(b=>b.pressed==='true').length,1);
   }
   // Selection by the existing reset action must also bring All back from offscreen.
   await evaluate(`document.querySelector('[class*="filterRow"]').lastElementChild.click()`);await wait(500);
   let r=await state();assert.equal(r.buttons[8].pressed,'true');assert.ok(r.buttons[8].left>=r.left&&r.buttons[8].right<=r.right);
   await evaluate(`document.querySelector('[class*="empty"] button').click()`);await wait(500);
   r=await state();assert.equal(r.buttons[0].pressed,'true');assert.ok(r.buttons[0].left>=r.left&&r.buttons[0].right<=r.right);
   assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'),'Only the chip row scrolls horizontally');
  });
  assert.deepEqual(errors,[]);t.diagnostic('Screenshots: '+screenshots);
 }finally{if(send&&ws?.readyState===1){try{await send('Browser.close');}catch{}}ws?.close();browser.kill();}
});
