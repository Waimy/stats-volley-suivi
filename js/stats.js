// Stats Volley : statistiques d'un match ou d'un set, constats du compte rendu, barres.

/* ---------- Statistiques ---------- */
function computeStats(m, filter){
  const sets = filter==='all'? m.sets : m.sets.filter(s=>String(s.numero)===String(filter));
  const P={}; m.convocations.forEach(c=>P[c.id]={serv:0, ace:0, att:0, con:0, aut:0, fServ:0, fRec:0, fAtt:0, fDef:0, fPas:0, fTech:0});
  const T={won:0,lost:0,wonUs:0,wonThem:0,lostUs:0,lostThem:0,unk:0,coll:0,so:[0,0],bp:[0,0],taps:[0,0],run:0,runAdv:0};
  const RC={3:[0,0],2:[0,0],1:[0,0],0:[0,0],n:[0,0]};
  const rot={}, causes={gagne:{},perdu:{}}, loss={};
  sets.forEach(s=>{ const st=replay(m,s); let run=0, runA=0;
    st.rallies.forEach(r=>{ const ev=r.ev, o=r.opt, g=ev.resultat==='gagne';
      if(g){ T.won++; if(o.camp==='nous')T.wonUs++; else if(o.camp==='adversaire')T.wonThem++; else T.unk++; run++; runA=0; T.run=Math.max(T.run,run); }
      else { T.lost++; if(o.camp==='nous')T.lostUs++; else if(o.camp==='adversaire')T.lostThem++; else T.unk++; run=0; runA++; T.runAdv=Math.max(T.runAdv,runA);
        const k=lossCat(ev,o); loss[k]=(loss[k]||0)+1; }
      if(r.service==='adv'){ T.so[1]++; if(g) T.so[0]++; const k=ev.noteReception==null?'n':ev.noteReception; RC[k][1]++; if(g) RC[k][0]++; }
      else { T.bp[1]++; if(g) T.bp[0]++; if(r.server&&P[r.server]) P[r.server].serv++; }
      if(ev.taps){ T.taps[0]+=ev.taps; T.taps[1]++; }
      rot[r.zone1]=rot[r.zone1]||{w:0,l:0}; g?rot[r.zone1].w++:rot[r.zone1].l++;
      causes[ev.resultat][o.id]=(causes[ev.resultat][o.id]||0)+1;
      const j=ev.joueurID&&P[ev.joueurID];
      if(!g && o.camp==='nous' && !ev.joueurID) T.coll++;
      if(!j) return;
      if(g && o.camp==='nous'){
        if(['ace','serviceGagnant'].includes(o.cause)) j.ace++; else if(['attaqueGagnante','blocOut'].includes(o.cause)) j.att++; else if(o.cause==='contreGagnant') j.con++; else j.aut++;
      } else if(!g){
        if(o.cause==='fauteService') j.fServ++;
        else if(o.cause==='receptionRatee') j.fRec++;
        else if(o.cause==='attaqueFaute' || (o.cause==='contreGagnant'&&o.camp==='adversaire')) j.fAtt++;
        else if(o.cause==='receptionDefenseFaute' || (['attaqueGagnante','blocOut'].includes(o.cause)&&o.camp==='adversaire')) j.fDef++;
        else if(['fautePasse','relanceRatee'].includes(o.cause)) j.fPas++;
        else if(['fauteTechnique','sanction'].includes(o.cause)) j.fTech++;
      }
    });
  });
  return {P,T,rot,causes,RC,loss};
}
const LOSS_LABEL={service:'Service', reception:'Réception', attaque:'Attaque (dehors, filet, contrée)', defense:'Défense et contre', passe:'Passe et relance', technique:'Fautes techniques et sanctions', collectif:'Mésentente', adverse:'Réussites adverses', inconnu:'Non vus'};
const LOSS_SUB={attaque:'dont attaques contrées', defense:'défenseur ou contreur désigné', adverse:'sans faute de notre part', inconnu:'« je n\'ai pas vu »'};
function lossCat(ev,o){
  if(o.camp==='inconnu') return 'inconnu';
  if(o.camp==='nous') return {fauteService:'service', receptionRatee:'reception', attaqueFaute:'attaque', receptionDefenseFaute:'defense', fautePasse:'passe', relanceRatee:'passe', fauteTechnique:'technique', sanction:'technique', mesentente:'collectif'}[o.cause]||'technique';
  if(o.cause==='contreGagnant') return 'attaque';
  if(['attaqueGagnante','blocOut'].includes(o.cause) && ev.joueurID) return 'defense';
  return 'adverse';
}
const FAUTE_LABEL={fServ:'service', fRec:'réception', fAtt:'attaque', fDef:'défense', fPas:'passe', fTech:'technique'};
function fautesJoueur(j){ return Object.keys(FAUTE_LABEL).reduce((a,k)=>a+j[k],0); }
function detailFautes(j){ return Object.keys(FAUTE_LABEL).filter(k=>j[k]).sort((a,b)=>j[b]-j[a]).map(k=>j[k]+' '+FAUTE_LABEL[k]).join(', '); }
function prenomC(m,id){ const c=conv(m,id), p=c?player(c.playerId):null; return p?p.prenom:'?'; }
function constats(m, S){
  const {P,T,rot,loss}=S, out=[];
  const ours=Object.entries(loss).filter(([k])=>k!=='adverse'&&k!=='inconnu').sort((a,b)=>b[1]-a[1]);
  if(ours.length){ const [k,n]=ours[0]; out.push({t:'bad', s:`${LOSS_LABEL[k]} : première source de points perdus, ${n} sur ${T.lost} (${Math.round(n*100/T.lost)} %).`}); }
  else if(T.lost) out.push({t:'good', s:'Aucun point perdu sur une faute directe de notre part.'});
  const pire=Object.keys(P).map(id=>({id, f:fautesJoueur(P[id])})).filter(x=>x.f>=2).sort((a,b)=>b.f-a.f)[0];
  if(pire) out.push({t:'bad', s:`${prenomC(m,pire.id)} cumule ${pire.f} fautes (${detailFautes(P[pire.id])}).`});
  const fs=Object.values(P).reduce((a,j)=>a+j.fServ,0), sv=T.bp[1];
  if(sv>=5 && fs/sv>=0.2) out.push({t:'bad', s:`${fs} fautes de service sur ${sv} services (${Math.round(fs*100/sv)} %).`});
  const rots=Object.entries(rot).map(([id,r])=>({id,...r,d:r.w-r.l})).sort((a,b)=>a.d-b.d);
  if(rots.length && rots[0].d<=-2) out.push({t:'bad', s:`Rotation la plus coûteuse : ${prenomC(m,rots[0].id)} en zone 1 (${rots[0].w} gagné${rots[0].w>1?'s':''}, ${rots[0].l} perdus).`});
  if(T.so[1]>=5) out.push(T.so[0]/T.so[1]<0.5?{t:'bad', s:`Side-out faible : ${pct(T.so[0],T.so[1])} des points gagnés sur leur service.`}:{t:'good', s:`Bon side-out : ${pct(T.so[0],T.so[1])} des points gagnés sur leur service.`});
  const top=Object.keys(P).map(id=>({id, p:P[id].ace+P[id].att+P[id].con+P[id].aut})).sort((a,b)=>b.p-a.p)[0];
  if(top&&top.p>=2) out.push({t:'good', s:`Meilleur marqueur : ${prenomC(m,top.id)} avec ${top.p} points.`});
  if(T.unk && T.unk/(T.won+T.lost)>=0.2) out.push({t:'info', s:`${T.unk} points non vus : les chiffres sont moins fiables.`});
  return out.slice(0,5);
}
function bars(rows, cls){
  const max=Math.max(1,...rows.map(r=>r.v));
  return `<div class="bars">${rows.map(r=>`<div class="bar"><div class="bl">${r.l}${r.sub?`<small>${r.sub}</small>`:''}</div><div class="track"><div class="fill ${r.cls||cls||''}" style="width:${Math.max(2,Math.round(r.v*100/max))}%"></div><span class="bv">${r.txt??r.v}</span></div></div>`).join('')}</div>`;
}
