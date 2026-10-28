/* Useful local widgets; private recent titles require an explicit reveal. */
(() => {
  'use strict';
  const H=window.HoleOS,W=window.HoleWelcome,welcome=H?.os.querySelector('.hw-welcome');
  if(!H||!W||!welcome)return;
  const node=(tag,cls,text)=>{const n=document.createElement(tag);n.className=cls||'';if(text)n.textContent=text;return n;};
  const button=(label,glyph,action)=>{const b=node('button','',label);b.type='button';b.dataset.hwWidget='true';const i=node('i');i.dataset.lucide=glyph;b.prepend(i);b.onclick=event=>{event.stopPropagation();Promise.resolve().then(action).catch(error=>W.notify(error.message));};return b;};
  const board=node('section','hd-widget-board');board.setAttribute('aria-label','Widgets and local activity');
  const heading=node('div','hd-widget-heading');heading.append(node('span','','AT A GLANCE'),node('h2','','A little closer to your day.'));board.append(heading);
  const grid=node('div','hd-widget-grid'),recent=node('article','hd-widget'),preferences=node('article','hd-widget'),activity=node('article','hd-widget');grid.append(recent,preferences,activity);board.append(grid);
  welcome.querySelector('.hw-welcome-footer').before(board);
  let generation=0;
  function resetRecent(){generation++;recent.replaceChildren(node('span','hd-widget-symbol','↗'),node('h3','','Pick up the thread.'),node('p','','Reveal recent files saved in this browser. Your titles stay hidden until you choose.'));recent.append(button('Show recent local work','history',async()=>{const token=++generation;await HoleCore.ready;const assets=(await HoleCore.list('assets')).filter(a=>a.state==='active').sort((a,b)=>(b.updatedAt||b.createdAt||0)-(a.updatedAt||a.createdAt||0)).slice(0,3);if(token!==generation)return;recent.replaceChildren(node('h3','','Recent local work'),node('p','','Only work saved in this browser.'));const list=node('div','hd-widget-recents');for(const a of assets)list.append(button(a.name,'file-text',()=>HoleContinuity.open('projects',{assetId:a.id,projectId:a.projectId||null})));if(!assets.length)list.append(node('p','','Your next thought can start here.'),button('Capture a thought','plus',()=>HoleContinuity.capture()));recent.append(list,button('Hide recent work','eye-off',resetRecent));H.icons();}));H.icons();}
  preferences.append(node('span','hd-widget-symbol','◐'),node('h3','','At your own pace.'),node('p','','A little less movement, or a little more room. Your workspace follows your lead.'));
  const quiet=button('Use quiet motion','sparkles',()=>W.applyPreferences({quiet:!W.preferences.quiet})),layout=button('Switch to Pocket','smartphone',()=>{H.setLayout(H.state.layout==='pocket'?'desktop':'pocket');sync();});preferences.append(quiet,layout);
  function sync(){quiet.lastChild.textContent=W.preferences.quiet?'Use fluid motion':'Use quiet motion';quiet.setAttribute('aria-pressed',String(W.preferences.quiet));layout.lastChild.textContent=H.state.layout==='pocket'?'Switch to Desktop':'Switch to Pocket';}
  activity.append(node('span','hd-widget-symbol','◎'),node('h3','','Everything has a place.'),node('p','','Keep track of imports, exports, and the things you’re making.'));
  activity.append(button('Open local activity','activity',()=>{W.close(false,true);H.isDrawerOpen&&H.closeDrawer();window.HoleFiles?.showActivity();}),button('Open Control Center','sliders-horizontal',()=>W.openControls()));
  const observer=new MutationObserver(()=>{if(H.os.dataset.welcome==='true'){resetRecent();sync();}});observer.observe(H.os,{attributes:true,attributeFilter:['data-welcome']});H.root.addEventListener('hole:preferences-change',sync);resetRecent();sync();
})();
