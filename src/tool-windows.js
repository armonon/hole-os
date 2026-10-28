/* Independent everyday views over the shared Core; owned dialogs guard closing. */
(()=>{'use strict';
function create({view,context}){if(!['day','paperwork'].includes(view))throw Error('Unsupported independent tool view.');return{async mount(instance,root){const base=context(),dialogs=new Set(),navigation={...base.navigation,...instance.context,view,assetId:null,versionId:null};let disposed=false,rendering=Promise.resolve();const ctx={...base,main:root,navigation};
ctx.title=(kicker,name,subtitle,actions=[])=>{const header=base.el('header');header.append(base.el('p','hc-kicker',kicker),base.el('h2','',name),base.el('p','hc-subtitle',subtitle||''),...actions,base.button('Refresh '+(view==='day'?'Day':'Paperwork'),'refresh-cw',()=>ctx.render()));root.append(header);};
ctx.section=name=>{const section=base.el('section');section.append(base.el('h3','',name));root.append(section);return section;};
ctx.status=(text='',bad=false,parent=root)=>{const status=base.el('p','hc-status',text);status.setAttribute('role','status');status.setAttribute('aria-live','polite');status.dataset.error=String(bad);parent.append(status);return status;};
ctx.modal=(...args)=>{const dialog=base.modal(...args);dialog.dataset.toolInstance=instance.id;dialogs.add(dialog);dialog.addEventListener('close',()=>dialogs.delete(dialog),{once:true});return dialog;};
ctx.render=()=>{rendering=rendering.catch(()=>{}).then(async()=>{if(disposed)return;if([...dialogs].some(d=>d.open))throw Error('Finish the open tool dialog before refreshing this window.');root.replaceChildren();if(view==='day')await HoleEveryday.day(ctx);else{ctx.title('PAPERWORK','Paperwork','Documents and material in your shared workspace.');await HoleEveryday.paperwork(ctx);}base.H.icons();});return rendering;};
ctx.context=()=>ctx;
await ctx.render();return{async serialize(){await rendering;if([...dialogs].some(d=>d.open))throw Error('Finish or cancel this tool’s open dialog before closing or minimizing. Its work remains open.');return{schema:'hole.tool-window/1',view,projectId:navigation.projectId||null};},refresh:ctx.render,close(){if([...dialogs].some(d=>d.open))throw Error('Finish the open tool dialog first.');disposed=true;root.replaceChildren();}};
}};}
globalThis.HoleToolWindows=Object.freeze({create});})();
