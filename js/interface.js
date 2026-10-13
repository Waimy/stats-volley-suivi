// Stats Volley : état, thème, fond animé, tableaux de blocs, vues, sauvegarde et actions.
// Chargé en dernier : lit la sauvegarde locale et lance le premier rendu.

/* ===================== État ===================== */
const MODE_PWA = typeof window!=='undefined' && !!window.__PWA__;
const APP_VERSION='1.0.0';
let db;
const emptyDb=()=>({exemple:false, welcome:true, settings:{}, teamName:'Mon équipe', players:[], matches:[], currentMatchId:null});
db = load() || (MODE_PWA ? emptyDb() : seed());
const DEFAULT_SETTINGS={details:'off', noteRecep:true, theme:'dark', c1:'#E8641B', c2:'#1F4E8C', bgAnim:true};
function ensureSettings(){ db.settings=Object.assign({}, DEFAULT_SETTINGS, db.settings||{}); if(!db.settings.layouts||typeof db.settings.layouts!=='object') db.settings.layouts={}; }
ensureSettings();
const curMatch=()=>db.matches.find(m=>m.id===db.currentMatchId)||null;
const curSet=m=>m.sets[m.sets.length-1]||null;
function needsCompo(m){ const s=curSet(m); return !s || replay(m,s).ended; }
function matchActif(m){ return !!m && !matchState(m).fini; }
function startView(){ const m=curMatch(); if(matchActif(m)) return needsCompo(m)?'compo':'live'; return 'equipe'; }
function freshUI(view, flash){ return {imp:null, view:view||startView(), recep:null, entry:null, panel:null, err:'', flash:flash||'', editId:null, newType:'officiel', confirm:null, compo:null, reportMatch:null, reportSet:null, statsMatch:null, statsSet:'all', journalAll:false, edit:false, look:false}; }
let ui = freshUI();
const stepOf=v=>({equipe:1, match:2, compo:2, live:3, rapport:3}[v]||0);

/* ===================== Thème et couleurs du club ===================== */
const PRESETS_CLUB=[['Orange & marine','#E8641B','#1F4E8C'],['Rouge & noir','#D7263D','#1B1B1E'],['Bleu & jaune','#1E56C8','#F2C230'],['Vert & blanc','#1F9D55','#E9EEF2'],['Violet & or','#6B3FA0','#E0B13A'],['Bleu ciel & marine','#3BA3E6','#13294B']];
function hexLum(h){ const n=parseInt(h.slice(1),16), c=[n>>16&255,n>>8&255,n&255].map(v=>{ v/=255; return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4); }); return 0.2126*c[0]+0.7152*c[1]+0.0722*c[2]; }
const inkFor=h=>hexLum(h)>0.36?'#111418':'#FFFFFF';
function mixHex(a,b,t){ const pa=parseInt(a.slice(1),16), pb=parseInt(b.slice(1),16), ch=(n,s)=>n>>s&255;
  return '#'+[16,8,0].map(s=>Math.round(ch(pa,s)+(ch(pb,s)-ch(pa,s))*t).toString(16).padStart(2,'0')).join(''); }
const contrast=(a,b)=>{ const x=hexLum(a), y=hexLum(b); return (Math.max(x,y)+.05)/(Math.min(x,y)+.05); };
// Une couleur de club trop proche du fond (ex. noir sur thème sombre) est éclaircie ou foncée juste assez pour rester visible.
function lisible(h, dark){ const bg=dark?'#0C1015':'#F2F3F5'; let x=h, i=0; while(contrast(x,bg)<2.4 && i<12){ x=mixHex(x, dark?'#FFFFFF':'#000000', .14); i++; } return x; }
function applyTheme(){
  const S=db.settings, b=document.body; if(!b) return;
  b.dataset.mode=S.theme;
  const dark=S.theme==='dark'||(S.theme==='auto'&&!(window.matchMedia&&matchMedia('(prefers-color-scheme: light)').matches));
  const c1=lisible(S.c1,dark), c2=lisible(S.c2,dark);
  b.style.setProperty('--c1',c1); b.style.setProperty('--c2',c2);
  b.style.setProperty('--c1-ink',inkFor(c1)); b.style.setProperty('--c2-ink',inkFor(c2));
}

/* ===================== Fond animé : un filet de volley flouté qui ondule ===================== */
// Rendu en basse résolution puis agrandi et flouté en CSS : le flou est gratuit et le calcul reste léger sur téléphone.
const BG={raf:0, last:0, scale:.55};
function bgColors(){ const S=db.settings, light=document.body.dataset.mode==='light'||(document.body.dataset.mode==='auto'&&matchMedia('(prefers-color-scheme: light)').matches);
  return {c1:S.c1, c2:S.c2, light, mesh:light?'rgba(16,21,27,.16)':'rgba(236,239,243,.20)', band:light?'rgba(16,21,27,.30)':'rgba(255,255,255,.42)', post:light?'rgba(16,21,27,.22)':'rgba(236,239,243,.18)'}; }
function bgDraw(now){
  const cv=document.getElementById('bg'); if(!cv) return;
  const W=window.innerWidth, H=window.innerHeight, k=BG.scale, w=Math.round(W*k), h=Math.round(H*k);
  if(cv.width!==w||cv.height!==h){ cv.width=w; cv.height=h; }
  const ctx=cv.getContext('2d'); ctx.setTransform(1,0,0,1,0,0); ctx.clearRect(0,0,w,h);
  const col=bgColors(), t=(now||0)/1000;
  // Géométrie du filet : bande blanche en haut, maille carrée, bas plus souple que le haut.
  const top=h*.30, netH=Math.max(h*.24, 90*k), cell=Math.max(9*k, w/38), rows=Math.max(6,Math.round(netH/cell)), x0=-cell*2, cols=Math.ceil((w+cell*4)/cell);
  const sway=(x,yr)=>{ // yr : 0 en haut du filet, 1 en bas
    const amp=cell*(.15+.85*yr);
    return [amp*.55*Math.sin(x/w*5.2 - t*.55 + yr*1.3), amp*.9*Math.sin(x/w*3.1 - t*.38 + 0.6) * yr + amp*.25*Math.sin(t*.27)]; };
  const P=(c,r)=>{ const x=x0+c*cell, yr=r/rows, [dx,dy]=sway(x,yr); return [x+dx, top+r*cell+dy]; };
  // Lueur de salle derrière le filet, aux couleurs du club.
  const g=ctx.createRadialGradient(w*.5,top+netH*.4,0,w*.5,top+netH*.4,w*.75);
  g.addColorStop(0, col.c2+(col.light?'22':'38')); g.addColorStop(1, col.c2+'00');
  ctx.fillStyle=g; ctx.fillRect(0,0,w,h);
  // Maille.
  ctx.strokeStyle=col.mesh; ctx.lineWidth=Math.max(1,1.4*k*1.6);
  ctx.beginPath();
  for(let r=0;r<=rows;r++){ for(let c=0;c<=cols;c++){ const [x,y]=P(c,r); c?ctx.lineTo(x,y):ctx.moveTo(x,y); } }
  for(let c=0;c<=cols;c++){ for(let r=0;r<=rows;r++){ const [x,y]=P(c,r); r?ctx.lineTo(x,y):ctx.moveTo(x,y); } }
  ctx.stroke();
  // Bande supérieure et bande inférieure.
  const band=(r,thick,color)=>{ ctx.strokeStyle=color; ctx.lineWidth=thick; ctx.beginPath(); for(let c=0;c<=cols;c++){ const [x,y]=P(c,r); c?ctx.lineTo(x,y):ctx.moveTo(x,y); } ctx.stroke(); };
  band(0, Math.max(3,cell*.55), col.band);
  band(rows, Math.max(2,cell*.25), col.mesh);
  // Antennes aux couleurs du club, de part et d'autre.
  [.12,.88].forEach(fx=>{
    const c=Math.round((w*fx-x0)/cell), [ax]=P(c,0), seg=cell*.9, n=Math.round((netH*1.9)/seg), y1=top-netH*.95;
    for(let i=0;i<n;i++){ ctx.strokeStyle=i%2?(col.light?'rgba(16,21,27,.35)':'rgba(255,255,255,.55)'):col.c1; ctx.globalAlpha=col.light?.55:.75; ctx.lineWidth=Math.max(2,cell*.28);
      const yy=y1+i*seg, lean=sway(ax,.15)[0], tilt=lean*.04; ctx.beginPath(); ctx.moveTo(ax+lean+tilt*(i-n/2),yy); ctx.lineTo(ax+lean+tilt*(i+1-n/2),yy+seg); ctx.stroke(); }
    ctx.globalAlpha=1;
  });
  // Ligne de terrain au sol, très discrète.
  ctx.strokeStyle=col.post; ctx.lineWidth=Math.max(1,2*k); ctx.beginPath(); ctx.moveTo(0,h*.86); ctx.lineTo(w,h*.86); ctx.stroke();
}
function bgLoop(now){
  BG.raf=0;
  if(document.hidden || !db.settings.bgAnim || matchMedia('(prefers-reduced-motion: reduce)').matches){ bgDraw(0); return; }
  if(!BG.last || now-BG.last>=40){ BG.last=now; bgDraw(now); }   // ~25 images/s suffisent pour un mouvement aussi lent
  BG.raf=requestAnimationFrame(bgLoop);
}
function bgStart(){ if(typeof requestAnimationFrame==='undefined') return; if(!BG.raf){ BG.last=0; BG.raf=requestAnimationFrame(bgLoop); } }
try{ document.addEventListener('visibilitychange',()=>{ if(!document.hidden) bgStart(); }); window.addEventListener('resize',()=>{ bgDraw(0); bgStart(); }); }catch(e){}

/* ===================== Tableaux de blocs modulables ===================== */
const WIDGETS={
  live:{score:'Score', saisie:'Saisie du point', terrain:'Terrain', actions:'Actions', bilan:'Bilan du set en direct', journal:'Journal du set'},
  rapport:{constats:'À retenir', chiffres:'Chiffres clés', pertes:'Où on perd des points', fautes:'Fautes par joueur', points:'Points marqués', rotations:'Par rotation', reception:'Side-out selon la réception', journal:'Journal du set'}
};
const DEFAULT_LAYOUT={
  live:{large:[['score',6],['saisie',6],['terrain',4],['actions',4],['bilan',4],['journal',12]], compact:[['score',12],['saisie',12],['terrain',12],['actions',12],['bilan',12],['journal',12]]},
  rapport:{large:[['constats',6],['chiffres',6],['pertes',6],['fautes',6],['points',6],['rotations',6],['reception',6],['journal',12]], compact:[['constats',12],['chiffres',12],['pertes',12],['fautes',12],['points',12],['rotations',12],['reception',12],['journal',12]]}
};
const SPANS=[[4,'⅓'],[6,'½'],[8,'⅔'],[12,'1']];
function fmt(){ return (typeof window!=='undefined'&&window.innerWidth||1000)<760?'compact':'large'; }
function layout(board){
  if(!db.settings||!db.settings.layouts) ensureSettings();
  const key=board+'-'+fmt(), ids=Object.keys(WIDGETS[board]);
  let L=db.settings.layouts[key];
  if(!Array.isArray(L)) L=DEFAULT_LAYOUT[board][fmt()].map(([id,span])=>({id,span,hidden:false}));
  L=L.filter(w=>ids.includes(w.id)); ids.forEach(id=>{ if(!L.some(w=>w.id===id)) L.push({id,span:6,hidden:false}); });
  db.settings.layouts[key]=L; return L;
}
function vBoard(board, renderers){
  const L=layout(board), ed=ui.edit, large=fmt()==='large';
  const items=L.map((w,k)=>{
    if(w.hidden&&!ed) return '';
    const body=renderers[w.id]?renderers[w.id]():'';
    if(!body && !ed) return '';
    const tools=ed?`<div class="w-tools"><span class="w-grip" role="img" aria-label="Poignée : glisser pour déplacer">⠿</span>
      <button data-a="w-move" data-v="${board}|${w.id}|-1" aria-label="Monter" ${k===0?'disabled':''}>↑</button><button data-a="w-move" data-v="${board}|${w.id}|1" aria-label="Descendre" ${k===L.length-1?'disabled':''}>↓</button>
      ${large?SPANS.map(([n,l])=>`<button data-a="w-size" data-v="${board}|${w.id}|${n}" aria-pressed="${w.span===n}" aria-label="Largeur ${l}">${l}</button>`).join(''):''}
      <button data-a="w-hide" data-v="${board}|${w.id}">${w.hidden?'Afficher':'Masquer'}</button></div>`:'';
    return `<section class="w${w.hidden?' is-hidden':''}" data-w="${w.id}" style="--span:${w.span}"><header class="w-h"><h2 class="w-t">${WIDGETS[board][w.id]}</h2>${tools}</header><div class="w-b">${body||'<p class="muted small">Rien à afficher pour l\'instant.</p>'}</div></section>`;
  }).join('');
  const bar=ed?`<div class="editbar" role="region" aria-label="Personnalisation"><span>Glisse un bloc en maintenant sa poignée ⠿ (ou utilise ↑ ↓), change sa largeur, masque ce qui ne te sert pas. Disposition enregistrée pour ${large?'tablette et PC':'téléphone'}.</span>
    <span class="row"><button class="btn btn-sm btn-ghost" data-a="w-reset" data-v="${board}">Disposition d'origine</button><button class="btn btn-sm btn-primary" data-a="edit">Terminer</button></span></div>`:'';
  return bar+`<div class="board${ed?' editing':''}" data-board="${board}">${items}</div>`;
}
// Glisser-déposer par la poignée, au doigt comme à la souris (Pointer Events), sans bibliothèque.
function initDrag(){
  if(!ui.edit) return;
  document.querySelectorAll('.board .w-grip').forEach(g=>{
    g.addEventListener('pointerdown', e=>{
      const item=g.closest('.w'), board=item&&item.parentElement; if(!board) return;
      e.preventDefault(); try{ g.setPointerCapture(e.pointerId); }catch(err){}
      item.classList.add('w-dragging');
      const move=ev=>{
        const x=ev.clientX, y=ev.clientY;
        for(const c of [...board.children]){ if(c===item) continue; const r=c.getBoundingClientRect();
          if(x>=r.left&&x<=r.right&&y>=r.top&&y<=r.bottom){ const before=fmt()==='compact'?y<r.top+r.height/2:x<r.left+r.width/2; board.insertBefore(item, before?c:c.nextSibling); break; } }
        if(y<90) window.scrollBy(0,-14); else if(y>window.innerHeight-90) window.scrollBy(0,14);
      };
      const up=()=>{ g.removeEventListener('pointermove',move); g.removeEventListener('pointerup',up); g.removeEventListener('pointercancel',up); item.classList.remove('w-dragging');
        const key=board.dataset.board, order=[...board.children].map(c=>c.dataset.w).filter(Boolean), L=layout(key);
        L.sort((p1,p2)=>order.indexOf(p1.id)-order.indexOf(p2.id)); save(); render(); };
      g.addEventListener('pointermove',move); g.addEventListener('pointerup',up); g.addEventListener('pointercancel',up);
    });
  });
}

/* ===================== Rendu ===================== */
function render(){
  ensureSettings(); applyTheme();
  let h=vHeader();
  if(ui.look) h+=vApparence();
  if(db.exemple) h+=`<div class="note">Joueurs et match fictifs pour tester. En bas de page : recharger l'exemple ou repartir de zéro avec ta propre équipe.</div>`;
  if(ui.flash) h+=`<div class="flash" role="status">${esc(ui.flash)}</div>`;
  const v=ui.view;
  h+= v==='equipe'?vEquipe(): v==='match'?vMatch(): v==='compo'?vCompo(): v==='rapport'?vRapport(): v==='historique'?vHistorique(): v==='stats'?vStats(): vLive();
  h+=`<footer><span>Stats volley ${APP_VERSION} · données gardées sur cet appareil</span>${
    ui.confirm==='reset'?`<span class="row"><span>Tout effacer et recharger l'exemple ?</span><button class="btn btn-sm" data-a="reset-yes">Oui, recharger</button><button class="btn btn-sm btn-ghost" data-a="confirm-no">Non</button></span>`
    :ui.confirm==='empty'?`<span class="row"><span>Tout effacer (joueurs et matchs) ?</span><button class="btn btn-sm" data-a="empty-yes">Oui, repartir de zéro</button><button class="btn btn-sm btn-ghost" data-a="confirm-no">Non</button></span>`
    :`<span class="row"><button class="btn btn-sm btn-ghost" data-a="reset">Recharger l'exemple</button><button class="btn btn-sm btn-ghost" data-a="empty">Repartir de zéro</button></span>`}</footer>`;
  document.getElementById('app').innerHTML=h;
  initDrag(); bgStart();
}
function vHeader(){
  const m=curMatch(), active=matchActif(m), st=stepOf(ui.view), modulable=ui.view==='live'||ui.view==='rapport';
  const steps=[[1,'Équipe','equipe'],[2,'Match','match'],[3,'Saisie','live']];
  return `<header class="appbar"><div class="brand"><span class="ball" aria-hidden="true"></span><span>Stats volley<br><small>${esc(db.teamName)}</small></span></div>
  <nav class="steps" aria-label="Étapes">${steps.map(([n,l,v])=>`<button class="step${st>n?' done':''}" data-a="go" data-v="${v}" ${st===n?'aria-current="step"':''} ${n===3&&!active?'disabled':''}><span class="n">${n}</span>${l}</button>`).join('')}</nav>
  <div class="tools">${modulable?`<button class="tbtn" data-a="edit" aria-pressed="${ui.edit}">${ui.edit?'Terminer':'Personnaliser'}</button>`:''}
   <button class="tbtn" data-a="look" aria-pressed="${ui.look}">Apparence</button><button class="tbtn" data-a="go" data-v="historique"${ui.view==='historique'||ui.view==='stats'?' aria-pressed="true"':''}>Historique</button></div></header>`;
}
function vApparence(){
  const S=db.settings;
  return `<section class="panel" aria-label="Apparence"><div class="row between"><h2>Apparence</h2><button class="btn btn-sm btn-ghost" data-a="look">Fermer</button></div>
   <div class="f"><span class="lbl">Thème</span><div class="seg">${[['dark','Sombre'],['light','Clair'],['auto','Comme l\'appareil']].map(([k,l])=>`<button data-a="ap-theme" data-v="${k}" aria-pressed="${S.theme===k}">${l}</button>`).join('')}</div></div>
   <div class="f"><span class="lbl">Couleurs du club</span><div class="swatches">${PRESETS_CLUB.map(([n,a,b])=>`<button data-a="ap-preset" data-v="${a}|${b}" style="--a:${a};--b:${b}"><i aria-hidden="true"></i>${n}</button>`).join('')}</div>
    <div class="row"><label class="f">Principale<input type="color" id="ap-c1" value="${S.c1}"></label><label class="f">Secondaire<input type="color" id="ap-c2" value="${S.c2}"></label></div></div>
   <div class="f"><span class="lbl">Fond animé</span><div class="seg"><button data-a="ap-bg" data-v="1" aria-pressed="${S.bgAnim}">Activé</button><button data-a="ap-bg" data-v="0" aria-pressed="${!S.bgAnim}">Fixe</button></div>
    <p class="small muted">Le filet ondule lentement en arrière-plan. Il se fige tout seul si l'appareil demande de réduire les animations ; le fixer économise un peu de batterie.</p></div></section>`;
}
const errBox=()=>ui.err?`<div class="err" role="alert">${esc(ui.err)}</div>`:'';
const intro=(eyebrow,title,sub)=>`<section class="intro"><div class="eyebrow">${eyebrow}</div><h1>${title}</h1>${sub?`<p class="muted">${sub}</p>`:''}</section>`;

/* ---------- Étape 1 : équipe ---------- */
function vEquipe(){
  const p=ui.editId?player(ui.editId):null;
  const act=db.players.filter(x=>x.actif), arch=db.players.filter(x=>!x.actif);
  const nonLib=act.filter(x=>x.poste!=='libero').length;
  const card=x=>`<article class="pcard"><div class="jersey${x.poste==='libero'?' lib':''}" aria-hidden="true">${x.numero??'–'}</div>
    <div class="pname">${esc(x.prenom)} ${esc(x.nom)}</div>
    <div class="chips"><span class="chip">${POSTES[x.poste]}</span>${x.postes.filter(k=>k!==x.poste).map(k=>`<span class="chip">${POSTE_COURT[k]}</span>`).join('')}</div>
    <div class="pactions"><button class="btn btn-sm" data-a="p-edit" data-v="${x.id}">Modifier</button><button class="btn btn-sm btn-ghost" data-a="p-arch" data-v="${x.id}">${x.actif?'Archiver':'Réactiver'}</button></div></article>`;
  const postes=Object.keys(POSTES).map(k=>`<label><input type="checkbox" id="pf-postes-${k}" ${p&&p.postes.includes(k)?'checked':''}><span>${POSTES[k]}</span></label>`).join('');
  const welcome=db.welcome&&!db.players.length?`<section class="panel"><h2>Bienvenue</h2><p>Ajoute tes joueurs ci-dessous pour commencer. Tu peux aussi découvrir l'app avec une équipe d'exemple, puis repartir de zéro quand tu veux.</p><div><button class="btn" data-a="try-example">Essayer avec un exemple</button></div></section>`:'';
  return intro('Étape 1','L\'effectif',"Chaque joueur s'ajoute une seule fois. Le numéro et le poste du jour se règlent à chaque match.")+vInstallHint()+vBackupReminder()+welcome+`
  <section class="panel"><label class="f" style="max-width:380px">Nom de l'équipe<input id="team-name" value="${esc(db.teamName)}"></label></section>
  ${act.length?`<section class="players" aria-label="Joueurs actifs">${act.map(card).join('')}</section>`:`<p class="muted">Aucun joueur pour l'instant : ajoute le premier ci-dessous.</p>`}
  <section class="panel"><h2>${p?'Modifier '+esc(p.prenom):'Ajouter un joueur'}</h2>
   <div class="fgrid"><label class="f">Prénom<input id="pf-prenom" value="${esc(p?.prenom)}" autocomplete="off"></label><label class="f">Nom<input id="pf-nom" value="${esc(p?.nom)}" autocomplete="off"></label>
   <label class="f">Numéro habituel<input id="pf-num" type="number" inputmode="numeric" min="0" max="99" value="${p?.numero??''}"></label>
   <label class="f">Poste habituel<select id="pf-poste">${Object.keys(POSTES).map(k=>`<option value="${k}" ${p&&p.poste===k?'selected':''}>${POSTES[k]}</option>`).join('')}</select></label></div>
   <div class="f"><span class="lbl">Autres postes possibles</span><div class="togglechips">${postes}</div></div>
   ${errBox()}
   <div class="row"><button class="btn btn-primary" data-a="p-save">${p?'Enregistrer':'Ajouter le joueur'}</button>${p?'<button class="btn btn-ghost" data-a="p-cancel">Annuler</button>':''}</div></section>
  ${arch.length?`<details class="panel"><summary>Joueurs archivés (${arch.length})</summary><div class="players">${arch.map(card).join('')}</div></details>`:''}
  <div class="cta"><div class="cta-in"><span class="hint">${nonLib>=6?`${act.length} joueurs actifs`:`Il faut au moins 6 joueurs hors libéro (${nonLib} pour l'instant)`}</span>
  <button class="btn btn-primary btn-lg" data-a="go" data-v="match" ${nonLib>=6?'':'disabled'}>Préparer un match →</button></div></div>`;
}

/* ---------- Étape 2a : match et convocation ---------- */
function vMatch(){
  const m=curMatch(), active=matchActif(m), off=ui.newType==='officiel', R=PRESETS[ui.newType];
  const actifs=db.players.filter(p=>p.actif);
  const resume=active?(()=>{ const ms=matchState(m); return `<section class="flash row between"><div><b>Match en cours contre ${esc(m.adversaire)}</b> · sets ${ms.w.nous}–${ms.w.adv}</div><button class="btn btn-primary" data-a="go" data-v="live">Reprendre la saisie</button></section>`; })():'';
  const rules=off?`<p class="muted small">Au meilleur des 5 sets · 25 points (15 au 5e set) · 2 points d'écart · 6 remplacements et 2 temps morts par set.</p>`
   :`<div class="fgrid">
     <label class="f">Format<select id="nm-mode"><option value="bestOf" ${R.mode==='bestOf'?'selected':''}>Au meilleur des sets</option><option value="fixe" ${R.mode==='fixe'?'selected':''}>Nombre de sets fixe</option></select></label>
     <label class="f">Sets gagnants / nombre de sets<input id="nm-sets" type="number" min="1" max="7" value="${R.mode==='bestOf'?R.setsGagnants:R.nombreSets}"></label>
     <label class="f">Points par set<input id="nm-pts" type="number" min="5" max="50" value="${R.pointsParSet}"></label>
     <label class="f">Points du set décisif (« au meilleur »)<input id="nm-ptsd" type="number" min="5" max="50" value="${R.pointsDernierSet}"></label>
     <label class="f">Remplacements / set (vide = illimité)<input id="nm-rmax" type="number" min="0" max="20" value="${R.rempMax??''}"></label>
     <label class="f">Temps morts / set (vide = illimité)<input id="nm-tm" type="number" min="0" max="5" value="${R.tmMax??''}"></label></div>`;
  const opts=p=>[p.poste,...p.postes.filter(x=>x!==p.poste),...Object.keys(POSTES).filter(x=>x!==p.poste&&!p.postes.includes(x))].map(k=>`<option value="${k}">${POSTES[k]}</option>`).join('');
  const rows=actifs.map(p=>`<div class="rrow" id="rr-${p.id}"><input class="bigcheck" type="checkbox" id="cv-chk-${p.id}" checked aria-label="Convoquer ${esc(p.prenom)}">
    <input id="cv-num-${p.id}" type="number" inputmode="numeric" min="0" max="99" value="${p.numero??''}" aria-label="Numéro de ${esc(p.prenom)}">
    <span class="who">${esc(p.prenom)} ${esc(p.nom)}</span>
    <select id="cv-poste-${p.id}" aria-label="Poste de ${esc(p.prenom)} ce match">${opts(p)}</select>
    <label class="libtog"><input type="checkbox" id="cv-lib-${p.id}" ${p.poste==='libero'?'checked':''}>Libéro</label></div>`).join('');
  const nb=actifs.length, nl=actifs.filter(p=>p.poste==='libero').length;
  return resume+intro('Étape 2','Le match','Adversaire, type de match, puis les présents avec leur numéro et leur poste du jour.')+`
  <section class="panel"><div class="fgrid"><label class="f">Adversaire<input id="nm-adv" placeholder="Nom de l'équipe adverse" autocomplete="off"></label>
   <label class="f">Date<input id="nm-date" type="date" value="${new Date().toISOString().slice(0,10)}"></label></div>
   <div class="f"><span class="lbl">Type de match</span><div class="seg" role="radiogroup" aria-label="Type de match">
    <label><input type="radio" name="nm-type" value="officiel" ${off?'checked':''}><span>Officiel</span></label>
    <label><input type="radio" name="nm-type" value="amical" ${off?'':'checked'}><span>Amical</span></label></div></div>
   ${rules}</section>
  <section class="panel"><div class="row between"><h2>Qui joue ?</h2><span class="chip" id="cv-count">${nb} convoqués · ${nl} libéro${nl>1?'s':''}</span></div>
   <p class="muted small">Décoche les absents. 2 libéros maximum.</p>
   <div class="roster">${rows}</div>${errBox()}</section>
  <div class="cta"><div class="cta-in"><span class="hint">Ensuite : le 6 de départ</span><button class="btn btn-primary btn-lg" data-a="m-create">Composer le 6 →</button></div></div>`;
}

/* ---------- Étape 2b : composition du set ---------- */
function compoPool(m){
  const h=heritage(m,null), libs=liberosMatch(m,h.redes);
  return {h, players:m.convocations.filter(c=>!libs.includes(c.id)&&!h.blesses.has(c.id)), libs:m.convocations.filter(c=>libs.includes(c.id)&&!h.blesses.has(c.id))};
}
function initCompo(m){
  const prev=curSet(m), pool=compoPool(m), ok=new Set(pool.players.map(c=>c.id));
  const slots=prev?prev.formation.map(id=>ok.has(id)?id:null):[null,null,null,null,null,null];
  const libOk=prev&&pool.libs.some(c=>c.id===prev.liberoId);
  ui.compo={matchId:m.id, n:m.sets.length+1, slots, sel:null, libero:libOk?prev.liberoId:(pool.libs[0]?.id||null), service:prev?(prev.serviceInitial==='nous'?'adv':'nous'):'nous'};
}
function vCompo(){
  const m=curMatch(); if(!m) return vEquipe();
  if(!ui.compo||ui.compo.matchId!==m.id||ui.compo.n!==m.sets.length+1) initCompo(m);
  const c=ui.compo, pool=compoPool(m), ms=matchState(m), prev=curSet(m), n=c.n;
  const zone=i=>{ const id=c.slots[i], cv=id?conv(m,id):null, pl=cv?player(cv.playerId):null;
    return `<button class="zone${c.sel===i?' sel':''}${id?'':' empty'}" data-a="cz" data-v="${i}" aria-pressed="${c.sel===i}" aria-label="Zone ${i+1}${id?' : '+esc(nomC(m,id)):' vide'}">
      <span class="z">Z${i+1}</span>${i===0&&c.service==='nous'?'<span class="tag">SERT</span>':''}<span class="n">${cv?'#'+cv.numero:'+ Zone '+(i+1)}</span><span class="p">${pl?esc(pl.prenom)+' · '+POSTE_COURT[cv.poste]:''}</span></button>`; };
  const filled=c.slots.filter(Boolean).length;
  const plBtn=cv=>{ const k=c.slots.indexOf(cv.id), pl=player(cv.playerId);
    return `<button data-a="cp" data-v="${cv.id}" aria-pressed="${k>=0}">#${cv.numero} ${esc(pl?pl.prenom:'?')}<small>${POSTES[cv.poste]}${k>=0?' · zone '+(k+1):''}</small></button>`; };
  const prevMsg=prev?(()=>{ const st=replay(m,prev); return `<section class="flash row between"><div><b>Set ${prev.numero} ${st.nous>st.adv?'gagné':'perdu'} ${st.nous}–${st.adv}</b> · sets ${ms.w.nous}–${ms.w.adv}</div><div class="row"><button class="btn btn-sm" data-a="m-report" data-v="${m.id}|${prev.numero}">Compte rendu</button><button class="btn btn-sm btn-ghost" data-a="undo">Annuler le dernier point</button></div></section>`; })():'';
  return prevMsg+intro('Étape 2 · Set '+n,'Le six de départ','Contre '+esc(m.adversaire)+'. Touche une zone puis un joueur, ou touche les joueurs dans l\'ordre des zones 1 à 6.')+`
  <section class="panel"><div class="court" role="group" aria-label="Terrain, notre camp, filet en haut"><div class="net"></div>
   <div class="crow front">${[3,2,1].map(zone).join('')}</div><div class="crow">${[4,5,0].map(zone).join('')}</div></div>
   <p class="legend">Filet en haut · rangée avant : zones 4-3-2 · rangée arrière : zones 5-6-1${c.sel!=null?' · zone '+(c.sel+1)+' sélectionnée':''}</p>
   <div class="row"><button class="btn btn-sm btn-ghost" data-a="c-clear">Vider le terrain</button>${prev?'<button class="btn btn-sm btn-ghost" data-a="c-prev">Reprendre le 6 du set précédent</button>':''}</div></section>
  <section class="panel"><h2>Joueurs disponibles</h2><div class="opts">${pool.players.map(plBtn).join('')}</div>
   ${pool.h.blesses.size?`<p class="small muted">Blessés, exclus du match : ${[...pool.h.blesses].map(id=>esc(nomC(m,id))).join(', ')}.</p>`:''}</section>
  <section class="panel"><div class="fgrid">
   <div class="f"><span class="lbl">Libéro de départ</span><div class="seg">${pool.libs.map(cv=>`<button data-a="c-lib" data-v="${cv.id}" aria-pressed="${c.libero===cv.id}">${esc(nomC(m,cv.id))}</button>`).join('')}<button data-a="c-lib" data-v="" aria-pressed="${!c.libero}">Aucun</button></div></div>
   <div class="f"><span class="lbl">Premier service</span><div class="seg"><button data-a="c-serv" data-v="nous" aria-pressed="${c.service==='nous'}">Nous</button><button data-a="c-serv" data-v="adv" aria-pressed="${c.service==='adv'}">${esc(m.adversaire)}</button></div></div>
  </div>${errBox()}</section>
  <div class="cta"><div class="cta-in"><span class="hint">${filled}/6 zones remplies</span><button class="btn btn-primary btn-lg" data-a="set-start" ${filled===6?'':'disabled'}>Commencer le set ${n} →</button></div></div>`;
}

/* ---------- Étape 3 : saisie (tableau modulable) ---------- */
function vLive(){
  const m=curMatch();
  if(!m) return intro('Étape 3','Saisie','Aucun match en cours.')+`<div><button class="btn btn-primary" data-a="go" data-v="match">Préparer un match</button></div>`;
  const ms=matchState(m), s=curSet(m);
  if(!s) return vCompo();
  const st=ms.states[ms.states.length-1];
  if(st.ended||ms.fini){ ui.view='rapport'; ui.reportMatch=m.id; ui.reportSet=s.numero; return vRapport(); }
  return vBoard('live',{
    score:()=>wScore(m,s,st,ms), saisie:()=>wEntry(m,s,st), terrain:()=>wCourt(m,st),
    actions:()=>wActions(m,s,st), bilan:()=>wBilan(m,s), journal:()=>wJournal(m,st,true)
  });
}
function wScore(m,s,st,ms){
  const R=m.regles, srv=st.service==='nous'?esc(nomC(m,st.pos[0])):esc(m.adversaire);
  const badge=on=>`<span class="servebadge${on?'':' off'}"${on?'':' aria-hidden="true"'}>au service</span>`;
  return `<div class="score" aria-label="Score">
   <div><div class="team">Nous</div><div class="pts">${st.nous}</div>${badge(st.service==='nous')}</div><div class="sep">–</div>
   <div><div class="team" title="${esc(m.adversaire)}">${esc(m.adversaire)}</div><div class="pts">${st.adv}</div>${badge(st.service==='adv')}</div></div>
   <div class="meta"><span>Set <b>${s.numero}</b> · en ${st.cible} pts</span><span>Sets <b>${ms.w.nous}–${ms.w.adv}</b></span><span>Au service : <b>${srv}</b></span></div>
   <div class="meta"><span>Remplacements <b>${st.subs}${R.rempMax!=null?'/'+R.rempMax:''}</b></span><span>Temps morts <b>${st.tm.nous}${R.tmMax!=null?'/'+R.tmMax:''}</b> nous · <b>${st.tm.adv}${R.tmMax!=null?'/'+R.tmMax:''}</b> eux</span></div>`;
}
function wCourt(m,st){
  const cell=i=>{ const id=st.pos[i], c=conv(m,id), p=c?player(c.playerId):null, lib=st.libero.on&&id===st.libero.id;
    return `<div class="zone${i===0&&st.service==='nous'?' server':''}"><span class="z">Z${i+1}</span>${lib?'<span class="tag">LIB</span>':''}${i===0&&st.service==='nous'?'<span class="tag">SERT</span>':''}<span class="n">${c?'#'+c.numero:'?'}</span><span class="p">${p?esc(p.prenom):''} · ${c?POSTE_COURT[c.poste]:''}</span></div>`; };
  return `<div class="court" role="group" aria-label="Terrain, filet en haut"><div class="net"></div>
   <div class="crow front">${[3,2,1].map(cell).join('')}</div><div class="crow">${[4,5,0].map(cell).join('')}</div></div>
   <p class="legend">Filet en haut${st.libero.on?` · libéro en jeu à la place de ${esc(nomC(m,st.libero.replaced))}`:''}</p>`;
}
function wEntry(m,s,st0){
  const e=ui.entry, editing=!!(e&&e.edit!=null), st=editing?replay(m,s,e.edit):st0;
  const last=[...s.events].reverse().find(x=>x.type==='point'&&x.taps);
  const tapsInfo=last?`<p class="taps">Dernier point saisi en ${last.taps} tap${last.taps>1?'s':''}</p>`:'';
  if(!e){
    const recep=(st.service==='adv'&&db.settings.noteRecep)?`<div class="lbl">Réception sur leur service · facultatif</div>
      <div class="recep">${[3,2,1].map(n=>`<button data-a="recep" data-v="${n}" aria-pressed="${ui.recep===n}">${n}<small>${RECEP_LABEL[n]}</small></button>`).join('')}</div>`:'';
    return `${recep}<div class="resbtns"><button class="b-win" data-a="res" data-v="gagne">+ Gagné<small>point pour nous</small></button><button class="b-lose" data-a="res" data-v="perdu">− Perdu<small>point pour eux</small></button></div>${tapsInfo}`;
  }
  const opt=e.opt?ALL_OPTS[e.resultat+'|'+e.opt]:null;
  const nPoint=s.events.slice(0,editing?e.edit:s.events.length).filter(x=>x.type==='point').length+1;
  const head=editing?`<div class="flash">Modification du point n°${nPoint} du set ${s.numero} (score avant : ${st.nous}–${st.adv}). Le résultat est conservé.</div>`:'';
  const crumb=`<div class="crumb"><span class="chip ${e.resultat==='gagne'?'win':'lose'}">${e.resultat==='gagne'?'+ Gagné':'− Perdu'}</span>${e.recep?'<span class="chip">Récep. '+e.recep+'</span>':''}${e.cat&&!opt?'<span aria-hidden="true">›</span><span>'+CAT_LABEL[e.cat]+'</span>':''}${opt?'<span aria-hidden="true">›</span><span>'+esc(opt.label)+'</span>':''}${e.detail?'<span aria-hidden="true">›</span><span>'+DET[e.detail]+'</span>':''}</div>`;
  const sub=o=>o.camp==='inconnu'?'Garde score et rotation justes':o.camp==='nous'?(e.resultat==='gagne'?'Notre action':'Notre faute'):(e.resultat==='gagne'?'Faute adverse':'Action adverse');
  const optBtn=o=>{ const b=optBlocked(o,st); return `<button data-a="opt" data-v="${o.id}" ${b?'disabled':''}>${esc(o.label)}<small>${sub(o)}${b?' · '+b:''}</small></button>`; };
  let body='';
  if(e.step==='option'){
    const opts=OPTIONS[e.resultat];
    if(!e.cat){
      const cats=[...new Set(opts.map(o=>o.cat))].filter(c=>c!=='inconnue');
      body=`<div class="lbl">Le plus fréquent · ${st.service==='nous'?'on est au service':'service adverse'}</div><div class="opts">${shortcuts(e.resultat,st.service).map(id=>optBtn(ALL_OPTS[e.resultat+'|'+id])).join('')}</div>
      <div class="lbl">Autre cause</div><div class="cats">${cats.map(c=>`<button data-a="cat" data-v="${c}">${CAT_LABEL[c]}</button>`).join('')}</div>`;
    } else body=`<div class="opts">${opts.filter(o=>o.cat===e.cat).map(optBtn).join('')}</div><div><button class="btn btn-sm btn-ghost" data-a="cat-back">‹ Toutes les causes</button></div>`;
  } else if(e.step==='detail'){
    body=`<div class="lbl">Précision</div><div class="opts">${opt.details.map(d=>{ const b=detailBlocked(d,st); return `<button data-a="detail" data-v="${d}" ${b?'disabled':''}>${DET[d]}${b?'<small>'+b+'</small>':''}</button>`; }).join('')}<button data-a="detail" data-v="">Passer<small>sans précision</small></button></div>`;
  } else if(e.step==='joueur'){
    const extra=opt.attr==='joueurOuCollectif'?`<button data-a="joueur" data-v="">Collectif<small>ballon entre deux joueurs</small></button>`
      :opt.attr==='facultative'?`<button data-a="joueur" data-v="">Personne<small>pas de faute individuelle</small></button>`:'';
    body=`<div class="lbl">${esc(opt.prompt)}</div><div class="opts">${[3,2,1,4,5,0].map(i=>{ const id=st.pos[i], c=conv(m,id), why=ineligible(opt,e.detail,st,i);
      return `<button data-a="joueur" data-v="${id}" ${why?'disabled':''}>${esc(nomC(m,id))}<small>Zone ${i+1} · ${c?POSTE_COURT[c.poste]:''}${st.libero.on&&id===st.libero.id?' · libéro':''}${why?' · '+why:''}</small></button>`; }).join('')}${extra}</div>`;
  }
  return `${head}${crumb}${body}<div class="row between"><button class="btn btn-sm btn-ghost" data-a="entry-cancel">${editing?'Annuler la modification':'Annuler la saisie'}</button>${editing?'':`<span class="taps">${e.taps} tap${e.taps>1?'s':''}</span>`}</div>`;
}
function wActions(m,s,st){
  const R=m.regles; let panel='';
  if(ui.panel==='sub'){
    const onCourt=st.pos.filter(id=>!(st.libero.on&&id===st.libero.id)), bench=benchFor(m,st);
    panel=`<div class="fgrid"><label class="f">Sort<select id="sub-out"><option value="">—</option>${onCourt.map(id=>`<option value="${id}">${esc(nomC(m,id))}</option>`).join('')}</select></label>
    <label class="f">Entre<select id="sub-in"><option value="">—</option>${bench.map(c=>`<option value="${c.id}">${esc(nomC(m,c.id))} · ${POSTE_COURT[c.poste]}</option>`).join('')}</select></label></div>
    ${errBox()}<div class="row"><button class="btn btn-primary" data-a="sub-ok">Valider le remplacement</button></div>`;
  } else if(ui.panel==='libero'){
    const all=liberosMatch(m,st.redes), dispo=liberosDispo(m,st), locked=liberoLocked(st);
    let p='';
    if(!all.length) p='<p class="muted">Aucun libéro convoqué pour ce match.</p>';
    else if(!dispo.length){
      p=`<div class="note">Plus aucun libéro disponible. Tu peux re-désigner comme libéro, pour la fin du match, un joueur qui n'est pas sur le terrain.</div>
      <label class="f">Nouveau libéro<select id="lib-redes"><option value="">—</option>${benchFor(m,st).map(c=>`<option value="${c.id}">${esc(nomC(m,c.id))}</option>`).join('')}</select></label>
      ${errBox()}<div class="row"><button class="btn btn-primary" data-a="lib-redes">Re-désigner</button></div>`;
    } else {
      if(locked) p+='<div class="note">Un échange doit être joué entre deux changements de libéro (sortie automatique en zone 4 comprise).</div>';
      if(st.libero.on){
        const other=dispo.filter(id=>id!==st.libero.id);
        p+=`<div class="row"><button class="btn btn-primary" data-a="lib-out" ${locked?'disabled':''}>Faire sortir ${esc(nomC(m,st.libero.id))} (${esc(nomC(m,st.libero.replaced))} revient)</button>${other.map(id=>`<button class="btn" data-a="lib-swap" data-v="${id}" ${locked?'disabled':''}>Remplacer par ${esc(nomC(m,id))}</button>`).join('')}</div>`;
      } else {
        p+=`<p class="small muted">Le libéro remplace un arrière (zones 5, 6, 1), jamais en zone 1 quand on sert, et sort seul en arrivant en zone 4.</p>
        ${dispo.length>1?`<label class="f">Libéro qui entre<select id="lib-choice">${dispo.map(id=>`<option value="${id}" ${id===st.libero.id?'selected':''}>${esc(nomC(m,id))}</option>`).join('')}</select></label>`:''}
        <div class="opts">${[4,5,0].map(i=>{ const b=i===0&&st.service==='nous'; return `<button data-a="lib-in" data-v="${st.pos[i]}" ${b||locked?'disabled':''}>Entre pour ${esc(nomC(m,st.pos[i]))}<small>Zone ${i+1}${b?' · au service':''}</small></button>`; }).join('')}</div>`;
      }
      p+=`<div class="lbl">Libéro blessé</div><div class="row">${dispo.map(id=>{ const onC=st.libero.on&&st.libero.id===id, other=dispo.find(x=>x!==id);
        if(!onC) return `<button class="btn btn-sm" data-a="lib-bl" data-v="${id}|">${esc(nomC(m,id))} blessé</button>`;
        return `<button class="btn btn-sm" data-a="lib-bl" data-v="${id}|">${esc(nomC(m,id))} blessé, ${esc(nomC(m,st.libero.replaced))} revient</button>${other?`<button class="btn btn-sm" data-a="lib-bl" data-v="${id}|${other}">${esc(nomC(m,id))} blessé, ${esc(nomC(m,other))} le remplace</button>`:''}`; }).join('')}</div>
      <p class="small muted">Un libéro blessé ne rejoue plus du match.</p>`;
    }
    panel=p;
  } else if(ui.panel==='exc'){
    const onCourt=st.pos.filter(id=>!(st.libero.on&&id===st.libero.id));
    panel=`<p class="small muted">Le joueur blessé sort et ne pourra plus rejouer du match. Non compté dans la limite.${m.type==='officiel'?" En officiel, seulement si aucun remplacement régulier n'est possible pour lui.":''} Libéro blessé : bouton « Libéro ».</p>
    <div class="fgrid"><label class="f">Joueur blessé<select id="exc-out"><option value="">—</option>${onCourt.map(id=>`<option value="${id}">${esc(nomC(m,id))}</option>`).join('')}</select></label>
    <label class="f">Entre<select id="exc-in"><option value="">—</option>${benchFor(m,st).map(c=>`<option value="${c.id}">${esc(nomC(m,c.id))} · ${POSTE_COURT[c.poste]}</option>`).join('')}</select></label></div>
    ${errBox()}<div class="row"><button class="btn btn-primary" data-a="exc-ok">Valider</button></div>`;
  } else if(ui.panel==='corr'){
    const zones=[0,1,2,3,4,5].filter(i=>st.pos[i]!==st.libero.id);
    const cands=m.convocations.filter(c=>!isLib(m,st,c.id)&&c.id!==st.libero.replaced&&!st.blesses.has(c.id));
    panel=`<p class="small muted">Pour réparer une composition mal saisie. Ne compte pas comme remplacement et ne change pas le score.</p>
    <div class="fgrid"><label class="f">Zone<select id="corr-zone">${zones.map(i=>`<option value="${i}">Zone ${i+1} : ${esc(nomC(m,st.pos[i]))}</option>`).join('')}</select></label>
    <label class="f">Joueur réellement en place<select id="corr-j"><option value="">—</option>${cands.map(c=>{ const k=st.pos.indexOf(c.id); return `<option value="${c.id}">${esc(nomC(m,c.id))}${k>=0?' (zone '+(k+1)+', échange)':' (banc)'}</option>`; }).join('')}</select></label></div>
    ${errBox()}<div class="row"><button class="btn btn-primary" data-a="corr-ok">Corriger</button></div>`;
  } else if(ui.panel==='reglages'){
    const d=db.settings.details;
    panel=`<div class="fgrid"><label class="f">Précisions sur les fautes<select id="rg-details"><option value="off" ${d==='off'?'selected':''}>Jamais (plus rapide)</option><option value="serviceAttaque" ${d==='serviceAttaque'?'selected':''}>Service et attaque</option><option value="all" ${d==='all'?'selected':''}>Toujours</option></select></label>
    <label class="libtog" style="color:var(--ink)"><input type="checkbox" id="rg-recep" ${db.settings.noteRecep?'checked':''}>Noter la réception sur leur service</label></div><p class="small muted">Valable pour tous les matchs.</p>`;
  }
  const tmFull=c=>R.tmMax!=null&&st.tm[c]>=R.tmMax;
  const tb=(v,l)=>`<button data-a="panel" data-v="${v}" aria-expanded="${ui.panel===v}">${l}</button>`;
  return `<div class="toolbar">
    <button data-a="undo" ${s.events.length||m.sets.length>1?'':'disabled'}>↶ Annuler le dernier</button>
    <button data-a="tm" data-v="nous" ${tmFull('nous')?'disabled':''}>Temps mort nous</button>
    <button data-a="tm" data-v="adv" ${tmFull('adv')?'disabled':''}>Temps mort eux</button>
    ${tb('sub','Remplacement')}${tb('libero','Libéro')}${tb('exc','Blessure')}${tb('corr','Corriger une position')}${tb('reglages','Réglages de saisie')}</div>
    ${panel?`<div class="subpanel">${panel}<div><button class="btn btn-sm btn-ghost" data-a="panel-close">Fermer</button></div></div>`:''}`;
}
function wJournal(m,st,editable){
  const all=st.log.slice().reverse(), lines=ui.journalAll?all:all.slice(0,6);
  const row=l=>`<div class="jl ${l.cls}"><span class="sc">${l.sc}</span><span>${l.cls==='g'?'<span class="mk" aria-label="gagné">+</span>':l.cls==='p'?'<span class="mk" aria-label="perdu">−</span>':''}${esc(l.txt)}</span>${l.edit&&editable?`<button class="btn btn-sm btn-ghost" data-a="edit-ev" data-v="${l.i}">Modifier</button>`:'<span></span>'}</div>`;
  if(!all.length) return '';
  return `<p class="small muted">Set ${st.setNum||''} · dernier en haut</p><div class="journal">${lines.map(row).join('')}</div>${all.length>6?`<div><button class="btn btn-sm btn-ghost" data-a="journal-all">${ui.journalAll?'Réduire':'Tout afficher ('+all.length+')'}</button></div>`:''}`;
}
function wBilan(m,s){
  const S=computeStats(m,s.numero), {T,P,loss}=S;
  if(!T.won&&!T.lost) return '';
  const rows=Object.keys(LOSS_LABEL).filter(k=>loss[k]&&k!=='adverse'&&k!=='inconnu').map(k=>({l:LOSS_LABEL[k], v:loss[k]})).sort((a,b)=>b.v-a.v).slice(0,4);
  const pire=Object.keys(P).map(id=>({id,f:fautesJoueur(P[id])})).filter(x=>x.f).sort((a,b)=>b.f-a.f)[0];
  return `<div class="tiles"><div class="tile"><div class="v">${pct(T.so[0],T.so[1])}</div><div class="l">Side-out</div></div><div class="tile"><div class="v">${T.lostUs}</div><div class="l">Points perdus sur nos fautes</div></div></div>
   ${rows.length?`<div class="lbl">Nos fautes par geste</div>${bars(rows)}`:'<p class="small muted">Aucune faute directe pour l\'instant.</p>'}
   ${pire?`<p class="small">Le plus en difficulté : <b>${esc(nomC(m,pire.id))}</b> · ${detailFautes(P[pire.id])}</p>`:''}`;
}

/* ---------- Compte rendu (tableau modulable) ---------- */
function vRapport(){
  const m=db.matches.find(x=>x.id===ui.reportMatch)||curMatch();
  if(!m) return intro('Compte rendu','Aucun match','');
  const filter=ui.reportSet??'all', ms=matchState(m), S=computeStats(m,filter), {P,T,rot,loss,RC}=S;
  const s=filter==='all'?null:m.sets.find(x=>String(x.numero)===String(filter));
  const st=s?replay(m,s):null;
  const titre=s?`Set ${s.numero}`:'Match complet';
  const res=s?(st.ended?`<span class="chip ${st.nous>st.adv?'win':'lose'}">${st.nous>st.adv?'+ Gagné':'− Perdu'} ${st.nous}–${st.adv}</span>`:`<span class="chip">En cours ${st.nous}–${st.adv}</span>`)
    :`<span class="chip ${ms.fini?(ms.w.nous>ms.w.adv?'win':'lose'):''}">Sets ${ms.w.nous}–${ms.w.adv}${ms.fini?'':' · en cours'}</span>`;
  const pick=`<div class="setpick">${m.sets.map(x=>`<button data-a="rep-set" data-v="${x.numero}" aria-current="${String(filter)===String(x.numero)}">Set ${x.numero}</button>`).join('')}<button data-a="rep-set" data-v="all" aria-current="${filter==='all'}">Match complet</button></div>`;
  const isCur=m.id===db.currentMatchId, last=curSet(m), lastSt=last?replay(m,last):null;
  const canNext=isCur && !ms.fini && lastSt && lastSt.ended;
  const editing=isCur && ui.entry && ui.entry.edit!=null ? `<section class="panel">${wEntry(m,last,lastSt)}</section>` : '';
  const ic={bad:'!', good:'✓', info:'i'};
  const noted=[3,2,1,0].reduce((a,k)=>a+RC[k][1],0), sum=[3,2,1,0].reduce((a,k)=>a+k*RC[k][1],0);
  const board=vBoard('rapport',{
    constats:()=>{ const cs=constats(m,S); return cs.length?`<ul class="constats">${cs.map(c=>`<li><span class="ic ${c.t}" aria-hidden="true">${ic[c.t]}</span><span>${esc(c.s)}</span></li>`).join('')}</ul>`:'<p class="muted">Pas encore assez de points pour tirer des conclusions.</p>'; },
    chiffres:()=>`<div class="tiles">
      <div class="tile"><div class="v">${T.won}–${T.lost}</div><div class="l">Points gagnés – perdus</div></div>
      <div class="tile"><div class="v">${pct(T.so[0],T.so[1])}</div><div class="l">Side-out (${T.so[0]}/${T.so[1]})</div></div>
      <div class="tile"><div class="v">${pct(T.bp[0],T.bp[1])}</div><div class="l">Break-point (${T.bp[0]}/${T.bp[1]})</div></div>
      <div class="tile"><div class="v">${T.run} / ${T.runAdv}</div><div class="l">Plus longue série nous / eux</div></div>
      ${noted?`<div class="tile"><div class="v">${(sum/noted).toFixed(1)}</div><div class="l">Réception moyenne (sur 3)</div></div>`:''}</div>`,
    pertes:()=>{ if(!T.lost) return ''; const rows=Object.keys(LOSS_LABEL).filter(k=>loss[k]).map(k=>({l:LOSS_LABEL[k], sub:LOSS_SUB[k], v:loss[k], txt:`${loss[k]} · ${Math.round(loss[k]*100/T.lost)} %`, cls:(k==='adverse'||k==='inconnu')?'neutral':''})).sort((a,b)=>(a.cls?1:0)-(b.cls?1:0)||b.v-a.v);
      return bars(rows)+`<p class="small muted">Gagnés : ${T.wonUs} sur nos actions, ${T.wonThem} sur leurs fautes.</p>`; },
    fautes:()=>{ const fj=Object.keys(P).map(id=>({id,f:fautesJoueur(P[id])})).filter(x=>x.f).sort((a,b)=>b.f-a.f).slice(0,6);
      return fj.length?bars(fj.map(x=>({l:esc(nomC(m,x.id)), sub:detailFautes(P[x.id]), v:x.f}))):''; },
    points:()=>{ const pj=Object.keys(P).map(id=>({id,p:P[id].ace+P[id].att+P[id].con+P[id].aut})).filter(x=>x.p).sort((a,b)=>b.p-a.p).slice(0,6);
      return pj.length?bars(pj.map(x=>({l:esc(nomC(m,x.id)), sub:[P[x.id].att&&P[x.id].att+' attaque',P[x.id].ace&&P[x.id].ace+' service',P[x.id].con&&P[x.id].con+' contre',P[x.id].aut&&P[x.id].aut+' autre'].filter(Boolean).join(', '), v:x.p})),'good'):''; },
    rotations:()=>{ const rots=Object.entries(rot).map(([id,r])=>({id,...r,d:r.w-r.l})).sort((a,b)=>a.d-b.d); if(!rots.length) return '';
      return `<p class="small muted">Repérée par le joueur en zone 1 au début de l'échange.</p><div class="tbl-wrap"><table><thead><tr><th>Zone 1</th><th class="num">Gagnés</th><th class="num">Perdus</th><th class="num">Solde</th></tr></thead><tbody>
      ${rots.map((r,k)=>`<tr${k===0&&r.d<0?' class="worst"':''}><td>${esc(nomC(m,r.id))}${k===0&&r.d<0?' <b>(la plus coûteuse)</b>':''}</td><td class="num">${r.w}</td><td class="num">${r.l}</td><td class="num">${r.d>0?'+':''}${r.d}</td></tr>`).join('')}</tbody></table></div>`; },
    reception:()=>noted?`<div class="tbl-wrap"><table><thead><tr><th>Réception</th><th class="num">Échanges</th><th class="num">Gagnés</th><th class="num">Side-out</th></tr></thead><tbody>
      ${[3,2,1,0,'n'].filter(k=>RC[k][1]).map(k=>`<tr><td>${k==='n'?'Non notée':k+' · '+RECEP_LABEL[k]}</td><td class="num">${RC[k][1]}</td><td class="num">${RC[k][0]}</td><td class="num">${pct(RC[k][0],RC[k][1])}</td></tr>`).join('')}</tbody></table></div>`:'',
    journal:()=>s&&isCur&&s===last?wJournal(m,st,true):''
  });
  const actions=`<div class="cta"><div class="cta-in">${isCur&&last&&!ms.fini?'<button class="btn btn-ghost" data-a="undo">↶ Annuler le dernier point</button>':'<span></span>'}
    ${canNext?`<button class="btn btn-primary btn-lg" data-a="next-set">Préparer le set ${m.sets.length+1} →</button>`
     :ms.fini?`<button class="btn btn-primary btn-lg" data-a="go" data-v="match">Nouveau match →</button>`
     :isCur?`<button class="btn btn-primary btn-lg" data-a="go" data-v="live">Retour à la saisie →</button>`:`<button class="btn btn-primary btn-lg" data-a="go" data-v="historique">Historique</button>`}</div></div>`;
  return editing+intro('Compte rendu · '+esc(m.adversaire), titre+' '+res, '')+pick+board+`<div><button class="btn btn-sm btn-ghost" data-a="m-stats" data-v="${m.id}">Tableau détaillé par joueur</button></div>`+actions;
}

/* ---------- Historique et stats détaillées ---------- */
function vHistorique(){
  const cards=db.matches.slice().reverse().map(m=>{ const ms=matchState(m), active=!ms.fini;
    return `<article class="panel"><div class="row between"><div><h2>${esc(m.adversaire)}</h2><p class="small muted">${esc(m.date)} · ${m.type==='officiel'?'Officiel':'Amical'}</p></div>
      <span class="chip ${ms.fini?(ms.w.nous>ms.w.adv?'win':'lose'):''}">${ms.fini?(ms.w.nous>ms.w.adv?'+ Gagné':'− Perdu'):m.sets.length?'En cours':'À démarrer'} · sets ${ms.w.nous}–${ms.w.adv}</span></div>
      <div class="row">${m.sets.length?`<button class="btn btn-sm" data-a="m-report" data-v="${m.id}|all">Compte rendu</button><button class="btn btn-sm" data-a="m-stats" data-v="${m.id}">Stats détaillées</button>`:''}
      ${active?`<button class="btn btn-sm btn-primary" data-a="m-open" data-v="${m.id}">Reprendre</button>`:''}
      ${ui.confirm==='del-'+m.id?`<button class="btn btn-sm" data-a="m-del-yes" data-v="${m.id}">Confirmer la suppression</button><button class="btn btn-sm btn-ghost" data-a="confirm-no">Non</button>`:`<button class="btn btn-sm btn-ghost" data-a="m-del" data-v="${m.id}">Supprimer</button>`}</div></article>`; }).join('');
  return intro('Historique','Les matchs','Comptes rendus et stats de chaque match.')+vSauvegarde()+(cards||'<p class="muted">Aucun match pour l\'instant.</p>')+`<div><button class="btn btn-primary" data-a="go" data-v="match">Préparer un match</button></div>`;
}
function vStats(){
  const m=db.matches.find(x=>x.id===ui.statsMatch)||curMatch();
  if(!m) return intro('Stats','Aucun match','');
  const {P,T}=computeStats(m, ui.statsSet);
  const pick=`<div class="setpick">${['all',...m.sets.map(s=>s.numero)].map(v=>`<button data-a="st-set" data-v="${v}" aria-current="${String(ui.statsSet)===String(v)}">${v==='all'?'Match complet':'Set '+v}</button>`).join('')}</div>`;
  const rows=m.convocations.map(c=>{ const j=P[c.id], p=player(c.playerId), pts=j.ace+j.att+j.con+j.aut, f=fautesJoueur(j);
    if(!pts&&!f&&!j.serv) return '';
    return `<tr><td>#${c.numero} ${esc(p?p.prenom+' '+p.nom:'?')}</td><td>${POSTE_COURT[c.poste]}</td><td class="num">${j.serv}</td><td class="num">${j.ace}</td><td class="num">${j.att}</td><td class="num">${j.con}</td><td class="num">${j.aut}</td><td class="num"><b>${pts}</b></td>
    <td class="num">${j.fServ}</td><td class="num">${j.fRec}</td><td class="num">${j.fAtt}</td><td class="num">${j.fDef}</td><td class="num">${j.fPas}</td><td class="num">${j.fTech}</td><td class="num"><b>${f}</b></td><td class="num"><b>${pts-f>0?'+':''}${pts-f}</b></td></tr>`; }).join('');
  return intro('Stats détaillées · '+esc(m.adversaire),'Par joueur','')+pick+`<section class="panel"><div class="tbl-wrap"><table><thead><tr><th>Joueur</th><th>Poste</th><th class="num">Services</th><th class="num">Aces*</th><th class="num">Pts att.</th><th class="num">Contres</th><th class="num">Autres</th><th class="num">Total pts</th><th class="num">F. serv.</th><th class="num">F. récep.</th><th class="num">F. att.**</th><th class="num">F. déf.</th><th class="num">F. passe</th><th class="num">F. tech.</th><th class="num">Total F.</th><th class="num">Solde</th></tr></thead><tbody>${rows||'<tr><td colspan="16" class="muted">Pas encore de données.</td></tr>'}</tbody></table></div>
  <p class="small muted">* aces + services gagnants · ** attaques dehors/filet + attaques contrées. Services = services joués, déduits de la rotation. Taps moyens par point saisi : ${T.taps[1]?(T.taps[0]/T.taps[1]).toFixed(1):'–'}.</p></section>
  <div class="row"><button class="btn" data-a="m-report" data-v="${m.id}|all">Compte rendu</button><button class="btn btn-ghost" data-a="go" data-v="historique">Historique</button></div>`;
}

/* ---------- Installation, sauvegarde, import ---------- */
const estInstallee=()=>{ try{ return matchMedia('(display-mode: standalone)').matches || navigator.standalone===true; }catch(e){ return false; } };
function vInstallHint(){
  if(!MODE_PWA || estInstallee() || db.settings.hideInstall) return '';
  return `<section class="panel"><div class="row between"><h2>Installer l'app</h2><button class="btn btn-sm btn-ghost" data-a="hide-install">Masquer</button></div>
   <ul style="margin:0;padding-left:20px;display:flex;flex-direction:column;gap:4px"><li><b>iPhone / iPad</b> (Safari) : bouton Partager, puis « Sur l'écran d'accueil »</li><li><b>Android</b> (Chrome) : menu ⋮, puis « Installer l'application »</li><li><b>PC</b> : icône d'installation dans la barre d'adresse</li></ul>
   <p class="small muted">Installée, l'app s'ouvre en plein écran, fonctionne sans réseau, et ses données sont mieux protégées par le système.</p></section>`;
}
function joursDepuis(t){ return t?Math.floor((Date.now()-t)/86400000):null; }
function vBackupReminder(){
  if(!MODE_PWA || !db.matches.some(m=>m.sets.length)) return '';
  const d=joursDepuis(db.lastExport);
  if(d!==null && d<7) return '';
  return `<div class="note row between"><span>${d===null?'Aucune sauvegarde faite pour l\'instant.':'Dernière sauvegarde il y a '+d+' jours.'} Pense à exporter tes données.</span><button class="btn btn-sm" data-a="export">Sauvegarder maintenant</button></div>`;
}
function vSauvegarde(){
  if(!MODE_PWA) return `<section class="panel"><h2>Sauvegarde</h2><p class="small muted">L'export et l'import de sauvegarde sont disponibles dans la version installable de l'app.</p></section>`;
  const d=joursDepuis(db.lastExport);
  const imp=ui.imp?`<div class="subpanel"><p><b>Fichier lu :</b> ${ui.imp.db.players.length} joueurs, ${ui.imp.db.matches.length} matchs${ui.imp.exportedAt?' (sauvegarde du '+esc(new Date(ui.imp.exportedAt).toLocaleDateString('fr-FR'))+')':''}.</p>
    <div class="row"><button class="btn btn-primary" data-a="imp-merge">Ajouter ce qui manque</button><button class="btn" data-a="imp-replace">Tout remplacer</button><button class="btn btn-ghost" data-a="imp-cancel">Annuler</button></div>
    <p class="small muted">« Ajouter » garde tes données et ajoute les joueurs et matchs absents (idéal pour regrouper deux appareils). « Remplacer » efface tout ce qui est sur cet appareil.</p></div>`:'';
  return `<section class="panel"><h2>Sauvegarde</h2>
   <p class="small muted">Les données restent sur cet appareil. Exporte un fichier pour les mettre à l'abri ou les passer sur un autre appareil (AirDrop, mail, Drive…). Dernière sauvegarde : <b>${d===null?'jamais':d===0?'aujourd\'hui':'il y a '+d+' jour'+(d>1?'s':'')}</b>.</p>
   <div class="row"><button class="btn btn-primary" data-a="export">Exporter une sauvegarde</button>
   <label class="btn" style="display:inline-flex;align-items:center;cursor:pointer">Importer un fichier<input type="file" id="imp-file" accept="application/json,.json" style="position:absolute;opacity:0;width:1px;height:1px"></label></div>
   ${errBox()}${imp}</section>`;
}
function exportData(){
  const data=JSON.stringify({app:'stats-volley', format:1, version:APP_VERSION, exportedAt:new Date().toISOString(), db});
  const name='stats-volley-'+new Date().toISOString().slice(0,10)+'.json';
  let file; try{ file=new File([data], name, {type:'application/json'}); }catch(e){ file=new Blob([data],{type:'application/json'}); file.name=name; }
  db.lastExport=Date.now(); save();
  try{ if(navigator.canShare && navigator.canShare({files:[file]})){ navigator.share({files:[file], title:'Sauvegarde Stats volley'}).catch(()=>{}); ui.flash='Sauvegarde prête : choisis où l\'envoyer.'; return; } }catch(e){}
  const url=URL.createObjectURL(file), a=document.createElement('a'); a.href=url; a.download=name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),4000);
  ui.flash='Sauvegarde téléchargée : '+name;
}
function lireImport(file){
  const r=new FileReader();
  r.onload=()=>{ try{
      const o=JSON.parse(r.result), d=o&&o.db?o.db:o;
      const ok=d && Array.isArray(d.players) && Array.isArray(d.matches) && d.matches.every(m=>Array.isArray(m.convocations)&&Array.isArray(m.sets));
      if(!ok) throw new Error('format');
      ui.imp={db:d, exportedAt:o.exportedAt||null}; ui.err='';
    }catch(e){ ui.imp=null; ui.err="Ce fichier n'est pas une sauvegarde Stats volley valide."; }
    render(); };
  r.onerror=()=>{ ui.err='Lecture du fichier impossible.'; render(); };
  r.readAsText(file);
}
function fusionner(d){
  let nj=0, nm=0;
  d.players.forEach(p=>{ if(!db.players.some(x=>x.id===p.id)){ db.players.push(p); nj++; } });
  d.matches.forEach(m=>{ if(!db.matches.some(x=>x.id===m.id)){ db.matches.push(m); nm++; } });
  return {nj,nm};
}

/* ===================== Actions ===================== */
const val=id=>{ const el=document.getElementById(id); return el?el.value:''; };
const chk=id=>{ const el=document.getElementById(id); return !!(el&&el.checked); };
function commitPoint(){
  const m=curMatch(), s=curSet(m), e=ui.entry, o=ALL_OPTS[e.resultat+'|'+e.opt];
  const editing=e.edit!=null, st=editing?replay(m,s,e.edit):replay(m,s);
  const joueurID=o.attr==='serveurAuto'?st.pos[0]:(e.joueur||null);
  const noteReception=o.cause==='receptionRatee'?0:(st.service==='adv'?(e.recep??null):null);
  const ev={type:'point', resultat:e.resultat, cause:o.cause, camp:o.camp, detail:e.detail||null, joueurID, noteReception, taps:e.taps, t:Date.now()};
  ui.entry=null;
  if(editing){ const old=s.events[e.edit]; ev.taps=old.taps; ev.t=old.t; s.events[e.edit]=ev; save(); ui.flash='Point modifié : score, rotation et stats recalculés.'; return; }
  s.events.push(ev); ui.recep=null; done();
}
function wantDetails(o){ const d=db.settings.details; if(!o.details.length||d==='off') return false; if(d==='all') return true; return ['fauteService','attaqueFaute'].includes(o.cause); }
function nextStep(){
  const e=ui.entry, o=ALL_OPTS[e.resultat+'|'+e.opt];
  if(e.step==='option' && wantDetails(o)){ e.step='detail'; return; }
  if(e.step!=='joueur' && ['obligatoire','joueurOuCollectif','facultative'].includes(o.attr)){
    const m=curMatch(), s=curSet(m), st=e.edit!=null?replay(m,s,e.edit):replay(m,s);
    if([0,1,2,3,4,5].some(i=>!ineligible(o,e.detail,st,i))){ e.step='joueur'; return; }
  }
  commitPoint();
}
// Après chaque événement : enregistrer, et ouvrir le compte rendu si le set vient de se terminer.
function done(){
  save();
  const m=curMatch(); if(!m) return;
  const ms=matchState(m), s=curSet(m), st=s?ms.states[ms.states.length-1]:null;
  if(st&&st.ended){
    ui.entry=null; ui.panel=null; ui.edit=false; ui.view='rapport'; ui.reportMatch=m.id; ui.reportSet=s.numero; ui.journalAll=false;
    ui.flash=ms.fini?`Match terminé : sets ${ms.w.nous}–${ms.w.adv}. Voici le compte rendu du dernier set.`:`Set ${s.numero} terminé ${st.nous}–${st.adv}. Voici le compte rendu.`;
  }
}
function push(ev){ const s=curSet(curMatch()); ev.t=Date.now(); s.events.push(ev); ui.panel=null; done(); }
function act(a,v){
  ui.flash=''; if(!['p-save','m-create','set-start','sub-ok','corr-ok','exc-ok','lib-redes','cp'].includes(a)) ui.err='';
  const m=curMatch();
  switch(a){
    case 'go': {
      ui.entry=null; ui.panel=null; ui.confirm=null; ui.edit=false;
      if(v==='live'){ ui.view=matchActif(m)?(needsCompo(m)?'compo':'live'):'match'; }
      else ui.view=v;
      break; }
    case 'edit': ui.edit=!ui.edit; ui.entry=null; ui.panel=null; break;
    case 'look': ui.look=!ui.look; break;
    case 'ap-theme': db.settings.theme=v; save(); break;
    case 'ap-preset': { const [a1,b1]=v.split('|'); db.settings.c1=a1; db.settings.c2=b1; save(); break; }
    case 'ap-bg': db.settings.bgAnim=v==='1'; save(); break;
    case 'w-move': { const [b,id,d]=v.split('|'), L=layout(b), i=L.findIndex(w=>w.id===id), j=i+Number(d); if(j>=0&&j<L.length){ const t=L[i]; L[i]=L[j]; L[j]=t; save(); } break; }
    case 'w-size': { const [b,id,n]=v.split('|'); layout(b).find(w=>w.id===id).span=Number(n); save(); break; }
    case 'w-hide': { const [b,id]=v.split('|'), w=layout(b).find(x=>x.id===id); w.hidden=!w.hidden; save(); break; }
    case 'w-reset': delete db.settings.layouts[v+'-'+fmt()]; layout(v); save(); break;
    case 'recep': { const n=Number(v); ui.recep=ui.recep===n?null:n; break; }
    case 'res': { const r=replay(m,curSet(m)).service==='adv'?ui.recep:null;
      ui.entry={resultat:v, step:'option', cat:null, opt:null, detail:null, joueur:null, recep:r, taps:1+(r?1:0)}; break; }
    case 'edit-ev': { const i=Number(v), ev=curSet(m).events[i]; ui.panel=null;
      ui.entry={resultat:ev.resultat, step:'option', cat:null, opt:null, detail:null, joueur:null, recep:ev.noteReception||null, taps:0, edit:i}; break; }
    case 'cat': ui.entry.cat=v; ui.entry.taps++; break;
    case 'cat-back': ui.entry.cat=null; ui.entry.taps++; break;
    case 'opt': ui.entry.opt=v; ui.entry.taps++; nextStep(); break;
    case 'detail': ui.entry.detail=v||null; ui.entry.taps++; nextStep(); break;
    case 'joueur': ui.entry.joueur=v||null; ui.entry.taps++; commitPoint(); break;
    case 'entry-cancel': ui.entry=null; break;
    case 'journal-all': ui.journalAll=!ui.journalAll; break;
    case 'undo': { if(!m) break; ui.entry=null; ui.recep=null; const s=curSet(m);
      if(m.forceFin) m.forceFin=false; else if(s&&s.events.length) s.events.pop(); else if(s) m.sets.pop();
      save(); ui.compo=null; const s2=curSet(m);
      if(!s2) ui.view='compo';
      else if(replay(m,s2).ended){ ui.view='rapport'; ui.reportMatch=m.id; ui.reportSet=s2.numero; }
      else ui.view='live';
      ui.flash='Dernier événement annulé.'; break; }
    case 'panel': ui.panel=ui.panel===v?null:v; ui.entry=null; break;
    case 'panel-close': ui.panel=null; break;
    case 'tm': push({type:'tempsMort', camp:v}); break;
    case 'sub-ok': { const s=curSet(m), st=replay(m,s), out=val('sub-out'), inn=val('sub-in'), err=canSub(m,s,st,out,inn);
      if(err){ ui.err=err; break; } ui.err=''; push({type:'remplacement', sortantID:out, entrantID:inn}); break; }
    case 'corr-ok': { const s=curSet(m), st=replay(m,s), z=Number(val('corr-zone')), j=val('corr-j');
      if(!j){ ui.err='Choisis le joueur réellement en place.'; break; }
      if(st.pos[z]===j){ ui.err='Ce joueur est déjà dans cette zone.'; break; }
      ui.err=''; push({type:'correction', zone:z, joueur:j}); ui.flash='Position corrigée.'; break; }
    case 'lib-in': { const st=replay(m,curSet(m)); if(liberoLocked(st)) break;
      const d=liberosDispo(m,st), lid=val('lib-choice')||(d.includes(st.libero.id)?st.libero.id:d[0]);
      push({type:'liberoIn', remplaceID:v, liberoID:lid}); break; }
    case 'lib-out': { if(liberoLocked(replay(m,curSet(m)))) break; push({type:'liberoOut'}); break; }
    case 'lib-swap': { if(liberoLocked(replay(m,curSet(m)))) break; push({type:'liberoSwap', liberoID:v}); break; }
    case 'lib-bl': { const [lid,par]=v.split('|'); push({type:'liberoBlesse', liberoID:lid, par:par||null}); break; }
    case 'lib-redes': { const j=val('lib-redes'); if(!j){ ui.err='Choisis le joueur à re-désigner.'; break; } ui.err=''; push({type:'liberoRedesigne', joueurID:j}); break; }
    case 'exc-ok': { const s=curSet(m), st=replay(m,s), out=val('exc-out'), inn=val('exc-in'), err=canExc(m,s,st,out,inn);
      if(err){ ui.err=err; break; } ui.err=''; push({type:'exceptionnel', sortantID:out, entrantID:inn}); break; }
    case 'cz': { const c=ui.compo, i=Number(v); c.sel=c.sel===i?null:i; break; }
    case 'cp': { const c=ui.compo, cur=c.slots.indexOf(v);
      if(cur>=0 && c.sel==null){ c.slots[cur]=null; ui.err=''; break; }
      const target=c.sel!=null?c.sel:c.slots.indexOf(null);
      if(target<0){ ui.err="Les 6 zones sont remplies : touche d'abord la zone à changer."; break; }
      if(cur>=0) c.slots[cur]=c.slots[target];
      c.slots[target]=v; c.sel=null; ui.err=''; break; }
    case 'c-clear': ui.compo.slots=[null,null,null,null,null,null]; ui.compo.sel=null; break;
    case 'c-prev': { const keepS=ui.compo.service; initCompo(m); ui.compo.service=keepS; break; }
    case 'c-lib': ui.compo.libero=v||null; break;
    case 'c-serv': ui.compo.service=v; break;
    case 'set-start': { const c=ui.compo; if(!c||c.slots.some(x=>!x)){ ui.err='Place un joueur dans chacune des 6 zones.'; break; }
      m.sets.push({numero:m.sets.length+1, serviceInitial:c.service, formation:[...c.slots], liberoId:c.libero, events:[]});
      ui.compo=null; ui.err=''; ui.recep=null; ui.entry=null; ui.journalAll=false; save(); ui.view='live'; break; }
    case 'next-set': ui.compo=null; ui.edit=false; ui.entry=null; ui.view='compo'; break;
    case 'm-finish': m.forceFin=true; save(); ui.view='rapport'; ui.reportMatch=m.id; ui.reportSet='all'; break;
    case 'm-open': db.currentMatchId=v; save(); ui.compo=null; { const mm=curMatch(); ui.view=needsCompo(mm)?'compo':'live'; } break;
    case 'm-report': { const [id,set]=v.split('|'); ui.reportMatch=id; ui.reportSet=set||'all'; ui.view='rapport'; ui.edit=false; break; }
    case 'rep-set': ui.reportSet=v; ui.entry=null; break;
    case 'm-stats': ui.statsMatch=v; ui.statsSet='all'; ui.view='stats'; ui.edit=false; break;
    case 'st-set': ui.statsSet=v; break;
    case 'm-del': ui.confirm='del-'+v; break;
    case 'm-del-yes': db.matches=db.matches.filter(x=>x.id!==v); if(db.currentMatchId===v) db.currentMatchId=null; ui.confirm=null; save(); break;
    case 'confirm-no': ui.confirm=null; break;
    case 'm-create': {
      const adv=val('nm-adv').trim(); if(!adv){ ui.err="Indique le nom de l'adversaire."; break; }
      const type=ui.newType; let R={...PRESETS[type]};
      if(type==='amical'){ const mode=val('nm-mode'), n=parseInt(val('nm-sets'))||1;
        R={mode, setsGagnants:mode==='bestOf'?n:null, nombreSets:mode==='fixe'?n:null, pointsParSet:parseInt(val('nm-pts'))||25, pointsDernierSet:parseInt(val('nm-ptsd'))||15, ecart:2,
           rempMax:val('nm-rmax')===''?null:parseInt(val('nm-rmax')), tmMax:val('nm-tm')===''?null:parseInt(val('nm-tm'))}; }
      const sel=db.players.filter(p=>p.actif && chk('cv-chk-'+p.id));
      const sansNum=sel.filter(p=>val('cv-num-'+p.id).trim()==='');
      if(sansNum.length){ ui.err='Numéro manquant pour : '+sansNum.map(p=>p.prenom).join(', ')+'.'; break; }
      const convs=sel.map(p=>{ const poste=val('cv-poste-'+p.id), libero=chk('cv-lib-'+p.id)||poste==='libero';
        return {id:uid(), playerId:p.id, numero:parseInt(val('cv-num-'+p.id))||0, poste:libero?'libero':poste, libero}; });
      if(convs.filter(c=>c.libero).length>2){ ui.err='2 libéros maximum par match.'; break; }
      if(convs.filter(c=>!c.libero).length<6){ ui.err='Il faut au moins 6 joueurs présents hors libéro.'; break; }
      const nums=convs.map(c=>c.numero); if(new Set(nums).size<nums.length){ ui.err='Deux joueurs présents ont le même numéro.'; break; }
      const nm={id:uid(), date:val('nm-date'), adversaire:adv, type, regles:R, forceFin:false, convocations:convs, sets:[]};
      db.matches.push(nm); db.currentMatchId=nm.id; ui.err=''; ui.compo=null; save(); ui.view='compo'; break; }
    case 'p-edit': ui.editId=v; break;
    case 'p-cancel': ui.editId=null; break;
    case 'p-arch': { const p=player(v); p.actif=!p.actif; save(); break; }
    case 'p-save': { const prenom=val('pf-prenom').trim(); if(!prenom){ ui.err='Le prénom est obligatoire.'; break; }
      const poste=val('pf-poste'), postes=Object.keys(POSTES).filter(k=>chk('pf-postes-'+k)); if(!postes.includes(poste)) postes.unshift(poste);
      const numero=val('pf-num')===''?null:parseInt(val('pf-num'));
      if(ui.editId){ Object.assign(player(ui.editId),{prenom, nom:val('pf-nom').trim(), numero, poste, postes}); ui.editId=null; ui.flash=prenom+' mis à jour.'; }
      else { db.players.push({id:uid(), prenom, nom:val('pf-nom').trim(), numero, poste, postes, actif:true}); db.welcome=false; ui.flash=prenom+' ajouté.'; }
      ui.err=''; save(); break; }
    case 'try-example': { const keep=db.settings; db=seed(); db.settings=Object.assign({},keep); save(); ui=freshUI(null,'Équipe d\'exemple chargée. « Repartir de zéro » en bas de page pour saisir la tienne.'); break; }
    case 'hide-install': db.settings.hideInstall=true; save(); break;
    case 'export': exportData(); break;
    case 'imp-cancel': ui.imp=null; break;
    case 'imp-merge': { const r=fusionner(ui.imp.db); ui.imp=null; save(); ui.flash=`Import terminé : ${r.nj} joueur${r.nj>1?'s':''} et ${r.nm} match${r.nm>1?'s':''} ajoutés.`; break; }
    case 'imp-replace': { const keepS=db.settings; db=ui.imp.db; db.settings=Object.assign({}, keepS, db.settings||{}); db.welcome=false; ui.imp=null; save(); ui=freshUI(null,'Données remplacées par la sauvegarde.'); break; }
    case 'reset': ui.confirm='reset'; break;
    case 'empty': ui.confirm='empty'; break;
    case 'reset-yes': { const keep=db.settings; db=seed(); db.settings=Object.assign({},keep); save(); ui=freshUI(null,'Exemple rechargé.'); break; }
    case 'empty-yes': db={exemple:false, welcome:false, settings:db.settings, teamName:'Mon équipe', players:[], matches:[], currentMatchId:null}; save(); ui=freshUI('equipe','Tout est vide : ajoute tes joueurs.'); break;
  }
  render();
  if(['go','edit-ev','m-create','set-start','next-set','m-report','m-open','m-stats','undo','reset-yes','empty-yes','look'].includes(a) || (ui.view==='rapport'&&a==='joueur')){ try{ window.scrollTo({top:0}); }catch(err){} }
}
document.addEventListener('click',e=>{ const b=e.target.closest('[data-a]'); if(!b||b.disabled) return; act(b.dataset.a, b.dataset.v); });
function majConvocation(){
  let n=0, l=0;
  db.players.filter(p=>p.actif).forEach(p=>{ const on=chk('cv-chk-'+p.id), row=document.getElementById('rr-'+p.id); if(row) row.classList.toggle('off',!on); if(on){ n++; if(chk('cv-lib-'+p.id)||val('cv-poste-'+p.id)==='libero') l++; } });
  const el=document.getElementById('cv-count'); if(el) el.textContent=n+' convoqués · '+l+' libéro'+(l>1?'s':'');
}
document.addEventListener('change',e=>{
  const t=e.target;
  if(t.name==='nm-type'){
    const keep={}; document.querySelectorAll('#app input, #app select').forEach(el=>{ if(el.id && (el.id==='nm-adv'||el.id==='nm-date'||el.id.startsWith('cv-'))) keep[el.id]=el.type==='checkbox'?el.checked:el.value; });
    ui.newType=t.value; render();
    Object.entries(keep).forEach(([id,v])=>{ const el=document.getElementById(id); if(!el) return; if(el.type==='checkbox') el.checked=v; else el.value=v; });
    majConvocation(); return;
  }
  if(t.id && t.id.startsWith('cv-')){
    if(t.id.startsWith('cv-lib-') && t.checked){ const sel=document.getElementById('cv-poste-'+t.id.slice(7)); if(sel) sel.value='libero'; }
    if(t.id.startsWith('cv-poste-')){ const lb=document.getElementById('cv-lib-'+t.id.slice(9)); if(lb) lb.checked=t.value==='libero'; }
    majConvocation(); return;
  }
  if(t.id==='ap-c1'||t.id==='ap-c2'){ db.settings[t.id==='ap-c1'?'c1':'c2']=t.value; save(); render(); return; }
  if(t.id==='imp-file'&&t.files&&t.files[0]){ lireImport(t.files[0]); return; }
  if(t.id==='team-name'){ db.teamName=t.value.trim()||'Mon équipe'; save(); render(); }
  if(t.id==='rg-details'){ db.settings.details=t.value; save(); }
  if(t.id==='rg-recep'){ db.settings.noteRecep=t.checked; save(); render(); }
});
document.addEventListener('input',e=>{ const t=e.target; if(t.id==='ap-c1'||t.id==='ap-c2'){ db.settings[t.id==='ap-c1'?'c1':'c2']=t.value; applyTheme(); } });
let lastFmt=fmt(); try{ window.addEventListener('resize',()=>{ const f=fmt(); if(f!==lastFmt){ lastFmt=f; render(); } }); }catch(e){}
render();
