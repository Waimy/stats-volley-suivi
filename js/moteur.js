// Stats Volley : moteur. Catalogue des causes, rejeu du journal, règles de jeu, données d'exemple.
// Aucun accès au DOM. Scripts classiques chargés dans l'ordre moteur → stats → interface :
// leurs déclarations de premier niveau partagent la même portée globale (db, ui, replay…).

/* ===================== Catalogue (identique à Modele.swift) ===================== */
const POSTES = {passeur:'Passeur', pointu:'Pointu', receptionneurAttaquant:'Réceptionneur-attaquant', central:'Central', libero:'Libéro', polyvalent:'Polyvalent'};
const POSTE_COURT = {passeur:'Passeur', pointu:'Pointu', receptionneurAttaquant:'R4', central:'Central', libero:'Libéro', polyvalent:'Poly'};
const CAT_LABEL = {service:'Service', attaque:'Attaque', contre:'Contre', receptionDefense:'Réception / défense', passeRelance:'Passe / relance', fauteTechnique:'Faute technique', sanction:'Sanction', collectif:'Collectif', inconnue:"Je n'ai pas vu"};
const CAUSE_CAT = {ace:'service', serviceGagnant:'service', fauteService:'service', attaqueGagnante:'attaque', blocOut:'attaque', attaqueFaute:'attaque', contreGagnant:'contre', receptionRatee:'receptionDefense', receptionDefenseFaute:'receptionDefense', deuxiemeMainGagnante:'passeRelance', relanceGagnante:'passeRelance', fautePasse:'passeRelance', relanceRatee:'passeRelance', fauteTechnique:'fauteTechnique', sanction:'sanction', mesentente:'collectif', inconnue:'inconnue'};
const DET = {serviceFilet:'Dans le filet', serviceDehors:'Dehors', servicePied:'Faute de pied', delai8s:'Délai de 8 s dépassé', ordreService:'Mauvais serveur', aceNonTouche:'Ace non touché', receptionInjouable:'Touché mais injouable', attaqueDehors:'Dehors', attaqueFilet:'Dans le filet', antenne:'Antenne / hors antennes', doubleTouche:'Double touche', ballonTenu:'Ballon tenu / porté', quatreTouches:'4 touches', toucheFilet:'Touche du filet', ligneCentrale:'Franchissement ligne centrale', invasion:'Invasion au-dessus du filet', faute3m:'Faute des 3 m', fauteLibero:'Faute du libéro', contreArriere:"Contre d'un arrière", contreOuAttaqueSurService:'Contre / attaque sur service', plafondObstacle:'Plafond / obstacle', position:'Position / rotation', cartonRouge:'Carton rouge', retardJeu:'Retard de jeu'};
const SERV_D=['serviceFilet','serviceDehors','servicePied','delai8s'], ATT_D=['attaqueDehors','attaqueFilet','antenne'], PASSE_D=['doubleTouche','ballonTenu'], SANC_D=['cartonRouge','retardJeu'];
const TECH_D=['quatreTouches','toucheFilet','ligneCentrale','invasion','faute3m','fauteLibero','contreArriere','contreOuAttaqueSurService','plafondObstacle','position'];
const O=(cause,camp,attr,details,label,prompt)=>({id:cause+'-'+camp,cause,camp,attr,details,label,prompt:prompt||'',cat:CAUSE_CAT[cause]});
const OPTIONS = {
  gagne:[
    O('ace','nous','serveurAuto',[],'Ace'),
    O('serviceGagnant','nous','serveurAuto',[],'Service gagnant (touché, injouable)'),
    O('attaqueGagnante','nous','obligatoire',[],'Attaque gagnante','Qui a marqué ?'),
    O('blocOut','nous','obligatoire',[],'Bloc-out (sur leur contre)','Qui a attaqué ?'),
    O('contreGagnant','nous','obligatoire',[],'Contre gagnant','Qui a contré ?'),
    O('deuxiemeMainGagnante','nous','obligatoire',[],'Deuxième main gagnante','Qui a joué la 2e main ?'),
    O('relanceGagnante','nous','obligatoire',[],'Relance / free ball qui tombe','Qui a relancé ?'),
    O('fauteService','adversaire','aucune',SERV_D,'Faute de service adverse'),
    O('attaqueFaute','adversaire','aucune',ATT_D,'Attaque adverse dehors / filet'),
    O('receptionDefenseFaute','adversaire','aucune',[],'Défense / free ball adverse ratée'),
    O('fautePasse','adversaire','aucune',PASSE_D,'Faute de passe adverse'),
    O('relanceRatee','adversaire','aucune',[],'Relance adverse ratée'),
    O('fauteTechnique','adversaire','aucune',TECH_D,'Faute technique adverse'),
    O('sanction','adversaire','aucune',SANC_D,'Sanction adverse'),
    O('inconnue','inconnu','aucune',[],"Je n'ai pas vu"),
  ],
  perdu:[
    O('fauteService','nous','serveurAuto',SERV_D,'Faute de service'),
    O('receptionRatee','nous','joueurOuCollectif',['aceNonTouche','receptionInjouable'],'Réception ratée (ace adverse)','Qui était en réception ?'),
    O('attaqueFaute','nous','obligatoire',ATT_D,'Attaque dehors / filet','Qui a attaqué ?'),
    O('receptionDefenseFaute','nous','obligatoire',[],'Défense / free ball ratée','Qui a raté ?'),
    O('fautePasse','nous','obligatoire',PASSE_D,'Faute de passe','Qui a fait la passe ?'),
    O('relanceRatee','nous','obligatoire',[],'Relance ratée','Qui a relancé ?'),
    O('fauteTechnique','nous','facultative',TECH_D,'Faute technique','Qui a fait la faute ?'),
    O('sanction','nous','facultative',SANC_D,'Sanction','Joueur sanctionné ?'),
    O('mesentente','nous','aucune',[],'Mésentente (ballon entre deux)'),
    O('attaqueGagnante','adversaire','facultative',[],'Attaque adverse gagnante','Défenseur en faute ?'),
    O('blocOut','adversaire','facultative',[],'Bloc-out adverse (sur notre contre)','Contreur concerné ?'),
    O('contreGagnant','adversaire','obligatoire',[],"Contré par l'adversaire",'Quel attaquant a été contré ?'),
    O('deuxiemeMainGagnante','adversaire','aucune',[],'Deuxième main adverse'),
    O('relanceGagnante','adversaire','aucune',[],'Relance adverse qui tombe'),
    O('inconnue','inconnu','aucune',[],"Je n'ai pas vu"),
  ]
};
const RECEP_LABEL={3:'Parfaite',2:'Correcte',1:'Difficile',0:'Ace subi'};
const ALL_OPTS = {}; ['gagne','perdu'].forEach(r=>OPTIONS[r].forEach(o=>ALL_OPTS[r+'|'+o.id]=o));
// Raccourcis adaptés à qui sert ; « Je n'ai pas vu » toujours disponible.
function shortcuts(res, service){
  const S={gagne:{nous:['ace-nous','attaqueGagnante-nous','contreGagnant-nous','attaqueFaute-adversaire'],
                  adv:['attaqueGagnante-nous','fauteService-adversaire','contreGagnant-nous','attaqueFaute-adversaire']},
           perdu:{nous:['fauteService-nous','attaqueGagnante-adversaire','contreGagnant-adversaire','attaqueFaute-nous'],
                  adv:['receptionRatee-nous','attaqueGagnante-adversaire','contreGagnant-adversaire','attaqueFaute-nous']}};
  return [...S[res][service],'inconnue-inconnu'];
}
const PRESETS = {
  officiel:{mode:'bestOf', setsGagnants:3, nombreSets:null, pointsParSet:25, pointsDernierSet:15, ecart:2, rempMax:6, tmMax:2},
  amical:{mode:'fixe', setsGagnants:null, nombreSets:4, pointsParSet:25, pointsDernierSet:15, ecart:2, rempMax:null, tmMax:null}
};

/* ===================== Utilitaires ===================== */
const uid=()=>Math.random().toString(36).slice(2,10);
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const pct=(a,b)=>b?Math.round(a*100/b)+' %':'–';
const KEY='statsvolley.v1';
function save(){ try{ localStorage.setItem(KEY, JSON.stringify(db)); }catch(e){} }
function load(){ try{ const s=localStorage.getItem(KEY); return s?JSON.parse(s):null; }catch(e){ return null; } }

/* ===================== Version du schéma de données ===================== */
// Tout changement du format de db : incrémenter SCHEMA et ajouter MIGRATIONS[ancien] qui fait passer une base de ancien à ancien+1.
const SCHEMA=1;
const MIGRATIONS={};
// Met une base au schéma courant, sur place, et la renvoie. Les bases sans champ schema (app 1.0.x) sont au schéma 1.
// Une base d'un schéma plus récent (app plus récente) est laissée telle quelle.
function migrer(d){
  if(!d || typeof d!=='object') return d;
  if(d.schema==null) d.schema=1;
  while(d.schema<SCHEMA){ MIGRATIONS[d.schema](d); d.schema++; }
  return d;
}

/* ===================== Moteur : rejoue le journal ===================== */
function pointsCible(m, numero){ const R=m.regles; return (R.mode==='bestOf' && numero===2*R.setsGagnants-1) ? R.pointsDernierSet : R.pointsParSet; }
function conv(m,id){ return m.convocations.find(c=>c.id===id); }
function player(id){ return db.players.find(p=>p.id===id); }
function nomC(m,id){ const c=conv(m,id); if(!c) return '?'; const p=player(c.playerId); return '#'+c.numero+' '+(p?p.prenom:'?'); }

// Ce qui se transmet d'un set à l'autre : joueurs blessés (exclus du match) et libéros re-désignés.
function heritage(m, s){
  const idx=m.sets.indexOf(s), h={blesses:new Set(), redes:[]};
  (idx<0?m.sets:m.sets.slice(0,idx)).forEach(x=>x.events.forEach(ev=>{
    if(ev.type==='exceptionnel') h.blesses.add(ev.sortantID);
    if(ev.type==='liberoBlesse') h.blesses.add(ev.liberoID);
    if(ev.type==='liberoRedesigne') h.redes.push(ev.joueurID);
  }));
  return h;
}
function liberosMatch(m, redes){ return [...m.convocations.filter(c=>c.libero).map(c=>c.id), ...redes]; }
function isLib(m, st, id){ return liberosMatch(m, st.redes).includes(id); }
function liberosDispo(m, st){ return liberosMatch(m, st.redes).filter(id=>!st.blesses.has(id)); }
// Joueurs pouvant entrer : pas sur le terrain, pas libéro, pas remplacé par le libéro, pas blessé.
function benchFor(m, st){ return m.convocations.filter(c=>!isLib(m,st,c.id) && !st.pos.includes(c.id) && c.id!==st.libero.replaced && !st.blesses.has(c.id)); }

function replay(m, s, upTo){
  const h=heritage(m,s);
  const st={libLock:false, nous:0, adv:0, service:s.serviceInitial, pos:[...s.formation], libero:{id:s.liberoId||null, on:false, replaced:null},
    subs:0, pairs:{}, starters:new Set(s.formation), played:new Set(s.formation), exc:new Set(), blesses:h.blesses, redes:h.redes, tm:{nous:0,adv:0}, rallies:[], log:[], ended:false};
  const cible=pointsCible(m,s.numero);
  s.events.forEach((ev,i)=>{
    if(upTo!=null && i>=upTo) return;
    const sc=()=>st.nous+'–'+st.adv;
    if(ev.type==='point'){
      const opt=ALL_OPTS[ev.resultat+'|'+ev.cause+'-'+ev.camp];
      st.rallies.push({ev, opt, service:st.service, server: st.service==='nous'?st.pos[0]:null, zone1:st.pos[0], setNum:s.numero});
      let note=''; st.libLock=false;
      if(ev.resultat==='gagne'){ st.nous++; if(st.service==='adv'){ st.service='nous'; note=rotate(m,st); } }
      else { st.adv++; st.service='adv'; }
      let who='';
      if(ev.joueurID) who=' · '+nomC(m,ev.joueurID);
      else if(opt && opt.attr==='joueurOuCollectif') who=' · Collectif';
      const rec=(ev.noteReception!=null && ev.cause!=='receptionRatee')?' · récep. '+ev.noteReception:'';
      st.log.push({i, edit:true, cls: ev.resultat==='gagne'?'g':'p', sc:sc(), txt:(opt?opt.label:ev.cause)+(ev.detail?' ('+DET[ev.detail]+')':'')+who+rec});
      if(note) st.log.push({i, cls:'o', sc:'', txt:note});
    } else if(ev.type==='remplacement'){
      const k=st.pos.indexOf(ev.sortantID); if(k>=0) st.pos[k]=ev.entrantID;
      st.subs++; st.played.add(ev.entrantID);
      if(st.starters.has(ev.sortantID) && !st.pairs[ev.sortantID]) st.pairs[ev.sortantID]={sub:ev.entrantID, back:false};
      else { const starter=Object.keys(st.pairs).find(k=>st.pairs[k].sub===ev.sortantID); if(starter && starter===ev.entrantID) st.pairs[starter].back=true; }
      st.log.push({i, cls:'o', sc:sc(), txt:'Remplacement : '+nomC(m,ev.entrantID)+' entre, '+nomC(m,ev.sortantID)+' sort'});
    } else if(ev.type==='correction'){
      const other=st.pos.indexOf(ev.joueur), before=st.pos[ev.zone];
      if(other>=0) st.pos[other]=before;
      else {
        st.played.add(ev.joueur); st.played.delete(before);
        // Le joueur mal saisi est remplacé dans son rôle : titulaire → titulaire, remplaçant → remplaçant.
        if(st.starters.has(before)){ st.starters.delete(before); st.starters.add(ev.joueur); if(st.pairs[before]){ st.pairs[ev.joueur]=st.pairs[before]; delete st.pairs[before]; } }
        else { const k2=Object.keys(st.pairs).find(k=>st.pairs[k].sub===before); if(k2) st.pairs[k2].sub=ev.joueur; }
      }
      st.pos[ev.zone]=ev.joueur;
      st.log.push({i, cls:'o', sc:sc(), txt:'Correction : zone '+(ev.zone+1)+' = '+nomC(m,ev.joueur)+(other>=0?' (échangé avec '+nomC(m,before)+')':' (à la place de '+nomC(m,before)+', non compté)')});
    } else if(ev.type==='tempsMort'){
      st.tm[ev.camp]++;
      st.log.push({i, cls:'o', sc:sc(), txt:'Temps mort '+(ev.camp==='nous'?'nous':'adversaire')});
    } else if(ev.type==='exceptionnel'){
      const k=st.pos.indexOf(ev.sortantID); if(k>=0) st.pos[k]=ev.entrantID;
      st.blesses.add(ev.sortantID); st.played.add(ev.entrantID); st.exc.add(ev.entrantID);
      st.log.push({i, cls:'o', sc:sc(), txt:'Remplacement exceptionnel (blessure) : '+nomC(m,ev.entrantID)+' entre, '+nomC(m,ev.sortantID)+' sort et ne rejouera plus'});
    } else if(ev.type==='liberoIn'){
      const lid=ev.liberoID||st.libero.id;
      const k=st.pos.indexOf(ev.remplaceID); if(k>=0){ st.pos[k]=lid; st.libero.id=lid; st.libero.on=true; st.libero.replaced=ev.remplaceID; } st.libLock=true;
      st.log.push({i, cls:'o', sc:sc(), txt:'Libéro '+nomC(m,lid)+' entre pour '+nomC(m,ev.remplaceID)});
    } else if(ev.type==='liberoSwap'){
      const from=st.libero.id, k=st.pos.indexOf(from); if(k>=0) st.pos[k]=ev.liberoID; st.libero.id=ev.liberoID; st.libLock=true;
      st.log.push({i, cls:'o', sc:sc(), txt:'Changement de libéro : '+nomC(m,ev.liberoID)+' remplace '+nomC(m,from)});
    } else if(ev.type==='liberoBlesse'){
      st.blesses.add(ev.liberoID);
      let txt='Libéro '+nomC(m,ev.liberoID)+' blessé (ne rejouera plus)';
      if(st.libero.on && st.libero.id===ev.liberoID){
        const k=st.pos.indexOf(ev.liberoID);
        if(ev.par){ st.pos[k]=ev.par; st.libero.id=ev.par; txt+=', '+nomC(m,ev.par)+' le remplace'; }
        else { const back=st.libero.replaced; st.pos[k]=back; st.libero.on=false; st.libero.replaced=null; txt+=', '+nomC(m,back)+' revient'; }
      } else if(st.libero.id===ev.liberoID){ st.libero.id=liberosDispo(m,st)[0]||null; }
      st.log.push({i, cls:'o', sc:sc(), txt});
    } else if(ev.type==='liberoRedesigne'){
      st.redes.push(ev.joueurID); if(!st.libero.on) st.libero.id=ev.joueurID;
      st.log.push({i, cls:'o', sc:sc(), txt:nomC(m,ev.joueurID)+' re-désigné libéro pour la fin du match'});
    } else if(ev.type==='liberoOut'){
      const k=st.pos.indexOf(st.libero.id); const back=st.libero.replaced;
      if(k>=0){ st.pos[k]=back; st.libero.on=false; st.libero.replaced=null; } st.libLock=true;
      st.log.push({i, cls:'o', sc:sc(), txt:'Libéro sort, '+nomC(m,back)+' revient'});
    }
  });
  st.setNum=s.numero;
  st.ended = Math.max(st.nous,st.adv)>=cible && Math.abs(st.nous-st.adv)>=m.regles.ecart;
  st.cible=cible;
  return st;
}
// Rotation horaire : zone 2 → 1, 3 → 2, … , 1 → 6. Le libéro sort seul s'il arrive en zone 4.
function rotate(m, st){
  st.pos.push(st.pos.shift());
  if(st.libero.on && st.pos[3]===st.libero.id){
    st.pos[3]=st.libero.replaced; const back=st.libero.replaced; st.libero.on=false; st.libero.replaced=null; st.libLock=true;
    return 'Rotation : le libéro arrive en zone 4 et sort, '+nomC(m,back)+' revient';
  }
  return '';
}
function matchState(m){
  const w={nous:0,adv:0}; let ended=0; const states=m.sets.map(s=>{ const st=replay(m,s); if(st.ended){ ended++; st.nous>st.adv?w.nous++:w.adv++; } return st; });
  const R=m.regles; let fini=!!m.forceFin;
  if(R.mode==='bestOf' && (w.nous>=R.setsGagnants || w.adv>=R.setsGagnants)) fini=true;
  if(R.mode==='fixe' && R.nombreSets && ended>=R.nombreSets) fini=true;
  return {w, ended, states, fini};
}
function optBlocked(opt, st){
  const serv=['ace','serviceGagnant','fauteService'].includes(opt.cause);
  if(serv && opt.camp==='nous' && st.service!=='nous') return 'on ne sert pas';
  if(serv && opt.camp==='adversaire' && st.service!=='adv') return "l'adversaire ne sert pas";
  if(opt.cause==='receptionRatee' && st.service!=='adv') return 'on est au service';
  return null;
}
// Zones : index 0 = zone 1. Avant = zones 2, 3, 4 ; arrière = zones 1, 5, 6.
const AVANT=[1,2,3];
// Qui peut être désigné pour cette action, selon sa zone et son statut (règles officielles 6×6).
// Renvoie null si le joueur en zone i est éligible, sinon la raison.
function ineligible(o, detail, st, i){
  const id=st.pos[i], avant=AVANT.includes(i), lib=st.libero.on && id===st.libero.id, c=o.cause, camp=o.camp;
  // Contre : seuls les joueurs de la rangée avant contrent (le libéro jamais).
  if((c==='contreGagnant'&&camp==='nous') || (c==='blocOut'&&camp==='adversaire')) return avant?null:'arrière : ne contre pas';
  // 2e main : attaque au-dessus du filet depuis la zone avant → joueur avant uniquement.
  if(c==='deuxiemeMainGagnante') return lib?'libéro':(avant?null:'arrière : interdit devant les 3 m');
  // Attaque (y compris attaque contrée) : tout le monde sauf le libéro ; un arrière attaque derrière les 3 m.
  if((['attaqueGagnante','blocOut','attaqueFaute'].includes(c)&&camp==='nous') || (c==='contreGagnant'&&camp==='adversaire')) return lib?"le libéro n'attaque pas":null;
  if(c==='fauteTechnique'){
    if(detail==='fauteLibero') return lib?null:"ce n'est pas le libéro";
    if(detail==='faute3m') return lib?'libéro : faute du libéro':(avant?'joueur avant':null);
    if(detail==='contreArriere') return lib?'libéro : faute du libéro':(avant?'joueur avant':null);
    if(detail==='position') return 'faute collective';
  }
  return null;
}
function detailBlocked(d, st){
  if(d==='fauteLibero' && !st.libero.on) return "libéro pas en jeu";
  return null;
}
function liberoLocked(st){ return st.libLock; }
// Remplacement exceptionnel : en officiel, seulement si aucun remplacement régulier n'est possible pour ce joueur.
function canExc(m, s, st, out, inn){
  if(!out||!inn) return 'Choisis le joueur blessé et celui qui entre.';
  if(m.type==='officiel'){
    const legal=benchFor(m,st).filter(c=>!canSub(m,s,st,out,c.id));
    if(legal.length) return 'Un remplacement régulier est encore possible ('+legal.map(c=>nomC(m,c.id)).join(', ')+') : il doit être utilisé en priorité.';
  }
  return null;
}
function canSub(m, s, st, out, inn){
  if(!out||!inn) return 'Choisis le joueur qui sort et celui qui entre.';
  if(st.blesses.has(inn)) return 'Joueur blessé : il ne peut plus rejouer de ce match.';
  const R=m.regles;
  if(R.rempMax!=null && st.subs>=R.rempMax) return 'Plus de remplacement possible ('+R.rempMax+' max par set).';
  if(m.type!=='officiel') return null;
  // Joueur entré sur remplacement exceptionnel : seule la limite du nombre de remplacements s'applique.
  if(st.exc.has(out)) return null;
  if(st.starters.has(out)){
    if(st.pairs[out]) return 'Ce titulaire est déjà sorti et revenu : il ne peut plus être remplacé dans ce set.';
    if(st.starters.has(inn)) return "Un titulaire ne peut revenir qu'à la place de son remplaçant.";
    if(st.played.has(inn)) return "Ce joueur a déjà joué ce set : il ne peut entrer qu'à la place de son titulaire.";
    return null;
  }
  const starter=Object.keys(st.pairs).find(k=>st.pairs[k].sub===out);
  if(!starter) return 'Remplacement impossible.';
  if(st.pairs[starter].back) return 'Ce remplacement a déjà été fait.';
  if(inn!==starter) return nomC(m,out)+" ne peut sortir qu'au profit de "+nomC(m,starter)+' (son titulaire).';
  return null;
}

/* ===================== Données d'exemple ===================== */
function seed(){
  const P=[['Thomas','Lefebvre',3,'passeur'],['Julien','Dupont',7,'receptionneurAttaquant'],['Kevin','Martin',9,'central'],['Mathieu','Leroy',11,'pointu'],
    ['Camille','Roussel',5,'receptionneurAttaquant'],['Laura','Caron',12,'central'],['Romain','Delattre',1,'libero'],['Benoît','Lemaire',8,'polyvalent'],
    ['Sarah','Fournier',10,'receptionneurAttaquant'],['Hugo','Vasseur',14,'central'],['Damien','Petit',6,'passeur'],['Pierre','Lambert',4,'pointu']];
  const d={schema:SCHEMA, exemple:true, settings:{details:'off', noteRecep:true}, teamName:"Mon équipe (exemple)", players:P.map(([prenom,nom,numero,poste])=>({id:uid(),prenom,nom,numero,poste,postes:[poste],actif:true})), matches:[], currentMatchId:null};
  const m={id:uid(), date:'2026-10-10', adversaire:'Volley Club Exemple', type:'officiel', regles:{...PRESETS.officiel}, forceFin:false,
    convocations:d.players.slice(0,10).map((p,k)=>{ const lib=p.poste==='libero'||k===7; return {id:uid(), playerId:p.id, numero:p.numero, poste:lib?'libero':p.poste, libero:lib}; }), sets:[]};
  const C=m.convocations.map(c=>c.id);
  m.sets.push({numero:1, serviceInitial:'nous', formation:[C[0],C[1],C[2],C[3],C[4],C[5]], liberoId:C[6], events:[]});
  d.matches.push(m); d.currentMatchId=m.id; db=d;
  const s=m.sets[0];
  const push=(res,optId,detail,ci,note)=>{ const st=replay(m,s); const o=ALL_OPTS[res+'|'+optId];
    s.events.push({type:'point', resultat:res, cause:o.cause, camp:o.camp, detail:detail||null, joueurID:o.attr==='serveurAuto'?st.pos[0]:(ci==null?null:C[ci]), noteReception:o.cause==='receptionRatee'?0:(note??null), taps:null}); };
  push('gagne','ace-nous');
  push('perdu','fauteService-nous','serviceDehors');
  push('gagne','attaqueGagnante-nous',null,3,3);
  push('perdu','attaqueGagnante-adversaire');
  s.events.push({type:'liberoIn', remplaceID:C[5]});
  push('perdu','receptionRatee-nous','aceNonTouche',4);
  push('gagne','fauteService-adversaire','serviceFilet');
  push('gagne','contreGagnant-nous',null,5);
  push('perdu','contreGagnant-adversaire',null,1);
  push('gagne','attaqueFaute-adversaire','attaqueDehors',null,2);
  push('gagne','attaqueGagnante-nous',null,1);
  push('perdu','inconnue-inconnu');
  return d;
}
