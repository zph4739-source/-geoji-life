"use strict";
/* ====================================================================
   거지 라이프: 길거리의 제왕 — 저장/오프라인 정산 · 이벤트 바인딩 · 게임 루프 · 부팅
   ※ 이 파일들은 하나의 공유 전역 스코프에서 동작합니다.
     index.html 의 <script> 로드 순서: data → core → economy → rivals → ui → main
   ==================================================================== */

  // ---------- 저장 / 오프라인 수익 ----------
  const SAVE_KEY='gtaIdle_save_v2';
  function saveGame(){
    try{
      const d={cash:S.cash,totalEarned:S.totalEarned,clickBase:S.clickBase,biz:S.biz,tapup:S.tapup,
        heat:S.heat,raids:S.raids,rankIdx:S.rankIdx,opsRun:S.opsRun,opsWin:S.opsWin,
        mkt:S.mkt,bet:S.bet,duelPlayed:S.duelPlayed,duelWins:S.duelWins,duelNet:S.duelNet,
        crew:S.crew,gangFights:S.gangFights,gangWins:S.gangWins,prestige:S.prestige,notoriety:S.notoriety,choiceEvents:S.choiceEvents,rivals:S.rivals,warSuppressUntil:S.warSuppressUntil,turf:S.turf,guOwn:S.guOwn,guDef:S.guDef,mktWar:S.mktWar,policePay:S.policePay,tutStep:S.tutStep,tutDone:S.tutDone,lastSaved:Date.now(),ver:2};
      d.raid=S.raid||null;                                          // 레이드 진행도 저장
      d.ach=S.ach||{}; d.achFlags=S.achFlags||{}; d.negoWins=S.negoWins||0;   // 업적 저장
      localStorage.setItem(SAVE_KEY,JSON.stringify(d));
      if(typeof window!=='undefined' && typeof window.cloudSave==='function') window.cloudSave(d);
    }catch(e){}
  }
  function loadGame(){try{const r=localStorage.getItem(SAVE_KEY);return r?JSON.parse(r):null;}catch(e){return null;}}
  function clearSave(){try{localStorage.removeItem(SAVE_KEY);}catch(e){}}
  function applyLoad(d){
    S.ach=(d.ach&&typeof d.ach==='object')?d.ach:{};
    S.achFlags=(d.achFlags&&typeof d.achFlags==='object')?d.achFlags:{};
    S.negoWins=d.negoWins||0;
    S.raid=(d.raid&&typeof d.raid==='object')?{coolUntil:d.raid.coolUntil||0,clears:d.raid.clears||0,fails:d.raid.fails||0,best:d.raid.best||0}:{coolUntil:0,clears:0,fails:0,best:0};
    ['cash','totalEarned','clickBase','heat','raids','rankIdx','opsRun','opsWin','bet','duelPlayed','duelWins','duelNet','gangFights','gangWins','prestige','notoriety','choiceEvents','warSuppressUntil','tutStep','turf'].forEach(k=>{if(typeof d[k]==='number')S[k]=d[k];});
    if(typeof d.tutDone==='boolean')S.tutDone=d.tutDone;if(typeof d.policePay==='boolean')S.policePay=d.policePay;
    if(Array.isArray(d.rivals)&&d.rivals.length){S.rivals=d.rivals.map(r=>({id:r.id,name:r.name,archetype:ARCH[r.archetype]?r.archetype:'raider',power:r.power||30,treasury:r.treasury||2000,hostility:Math.max(0,Math.min(100,r.hostility||10)),state:r.state||'neutral',truceUntil:r.truceUntil||0,redirect:!!r.redirect,known:!!r.known,targetMult:r.targetMult||(0.8+Math.random()*0.5),log:Array.isArray(r.log)?r.log.slice(0,5):[],trend:r.trend||0,credibility:(typeof r.credibility==='number'?Math.max(0,Math.min(100,r.credibility)):50),diploCoolUntil:r.diploCoolUntil||0,invest:(typeof r.invest==='number'?Math.max(0,Math.min(100,r.invest)):0)}));} else {initRivals();}
    if(Array.isArray(d.biz))BIZ.forEach((_,i)=>S.biz[i]=d.biz[i]||0);
    if(Array.isArray(d.tapup))TAPUP.forEach((_,i)=>S.tapup[i]=d.tapup[i]||0);
    if(Array.isArray(d.crew))CREW.forEach((_,i)=>S.crew[i]=d.crew[i]||0);
    if(d.mkt&&typeof d.mkt==='object'){S.mkt.price=d.mkt.price||1500;S.mkt.units=d.mkt.units||0;S.mkt.avgCost=d.mkt.avgCost||0;
      S.mkt.bought=d.mkt.bought||0;S.mkt.sold=d.mkt.sold||0;
      S.mkt.hist=(Array.isArray(d.mkt.hist)&&d.mkt.hist.length)?d.mkt.hist.slice(-44):[1500,1500,1500];}
    S.ops=OPS.map(()=>null);S.layLowUntil=0;   // 작전은 접속 중에만 진행
    // 구역 소유 지도 복원 (구버전 세이브는 turf%로 시드)
    if(d.guOwn&&typeof d.guOwn==='object'&&Object.keys(d.guOwn).length){
      S.guOwn={};SEOUL.forEach(g=>{const o=d.guOwn[g.n];S.guOwn[g.n]=(o==='me'||o==='neutral'||o)?o:'neutral';});
    } else {S.guOwn=null;}
    S.guDef=(d.guDef&&typeof d.guDef==='object')?d.guDef:{};
    S.mktWar=(d.mktWar&&typeof d.mktWar==='object')?d.mktWar:null;
  }
  function fmtTime(s){s=Math.floor(s);const h=Math.floor(s/3600),m=Math.floor(s%3600/60),ss=s%60;
    if(h)return h+'시간 '+m+'분';if(m)return m+'분 '+ss+'초';return ss+'초';}
  function processOffline(d){
    const away=Math.min(Math.max(0,(Date.now()-(d.lastSaved||Date.now()))/1000),DIFF.offlineMax);
    S.heat=Math.max(0,S.heat-0.8*away);                  // 자리 비운 동안 수배 식음
    if(away<30)return null;
    const gain=Math.floor(rps()*DIFF.offlineEff*away);   // 하드코어 효율
    if(gain>0)earn(gain);
    // 자리 비운 만큼 복귀 유예 부여 — 라이벌 추격/적개심을 잠시 늦춰 '따라잡힘' 체감 완화
    if(away>=120)S.awayGraceUntil=Date.now()+Math.min(180000, 60000+away*20);
    return {away,gain};
  }
  function showOffline(info){
    if(!info||info.gain<=0)return;
    const m=document.createElement('div');m.className='battle';
    m.innerHTML='<div class="battle-card" style="text-align:center;max-width:380px">'+
      '<div class="b-lbl" style="font-size:11px;letter-spacing:.22em;color:var(--muted);font-weight:700">WHILE YOU WERE AWAY</div>'+
      '<div style="font-size:32px;margin:16px 0 6px;font-family:var(--font-mono);font-weight:700;color:var(--gold)">+'+won(info.gain)+'</div>'+
      '<div class="b-sub" style="margin-bottom:16px">자리 비운 <b style="color:var(--txt)">'+fmtTime(info.away)+'</b> 동안<br>부하들이 자릿세를 걷어왔습니다 <span style="color:var(--muted)">(효율 '+Math.round(DIFF.offlineEff*100)+'%)</span></div>'+
      '<button class="b-close" id="offClose">💰 수금하기</button></div>';
    document.body.appendChild(m);
    m.querySelector('#offClose').addEventListener('click',()=>m.remove());
  }

  // ---------- bind ----------
  document.getElementById('tapBtn').addEventListener('click',doTap);
  document.getElementById('layLowBtn').addEventListener('click',layLow);
  document.getElementById('bribeBtn').addEventListener('click',bribe);
  document.getElementById('policeBtn').addEventListener('click',togglePolice);
  document.getElementById('resetBtn').addEventListener('click',()=>{
    if(confirm('SYSTEM WIPE: 정말 모든 데이터를 삭제하시겠습니까?')){
      clearSave();
      Object.assign(S,{cash:0,totalEarned:0,clickBase:25,biz:BIZ.map(()=>0),tapup:TAPUP.map(()=>0),heat:0,raids:0,layLowUntil:0,rankIdx:0,
        ops:OPS.map(()=>null),opsRun:0,opsWin:0,mkt:{price:1500,units:0,avgCost:0,hist:[1500,1500,1500],bought:0,sold:0},
        bet:50,duelPlayed:0,duelWins:0,duelNet:0,crew:CREW.map(()=>0),gangFights:0,gangWins:0,prestige:0,notoriety:0,choiceEvents:0,warSuppressUntil:0,tutStep:0,tutDone:false,turf:12,policePay:false,guDef:{},mktWar:null});initRivals();initGuOwn();renderQuest();render();
    }
  });
  document.querySelectorAll('.tab').forEach(t=>t.addEventListener('click',()=>{
    document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));t.classList.add('active');S.tab=t.dataset.tab;
    if(S.tab==='war')pingOllama().then(()=>{if(S.tab==='war')renderPanel();});
    renderPanel();panelDirty=false;
  }));
  document.getElementById('panel').addEventListener('click',(e)=>{
    const bi=e.target.closest('[data-biz]');if(bi){buyBiz(+bi.dataset.biz);return;}
    const ti=e.target.closest('[data-tap]');if(ti){buyTap(+ti.dataset.tap);return;}
    const op=e.target.closest('[data-op]');if(op){launchOp(+op.dataset.op);return;}
    const mb=e.target.closest('[data-mbuy]');if(mb){mktBuy(+mb.dataset.mbuy);return;}
    const mm=e.target.closest('[data-mbuymax]');if(mm){mktBuyMax();return;}
    const ms=e.target.closest('[data-msell]');if(ms){mktSell(+ms.dataset.msell);return;}
    const du=e.target.closest('[data-duel]');if(du){rivalDuel(du.dataset.duel);return;}
    const bt=e.target.closest('[data-bet]');if(bt){setBet(bt.dataset.bet==='max'?'max':+bt.dataset.bet);return;}
    const cw=e.target.closest('[data-crew]');if(cw){recruit(+cw.dataset.crew);return;}
    const ga=e.target.closest('[data-gang]');if(ga){startBattle(+ga.dataset.gang);return;}
    const sm=e.target.closest('[data-seoulmap]');if(sm){openSeoulMap();return;}
    if(e.target.closest('#raidBtn')){ if(typeof openRaid==='function') openRaid(); return; }
    const wd=e.target.closest('[data-diplo]');if(wd){diploRival(wd.dataset.diplo);return;}
    const wv=e.target.closest('[data-invest]');if(wv){investRival(wv.dataset.invest);return;}
    const wb=e.target.closest('[data-bribe]');if(wb){bribeRival(wb.dataset.bribe);return;}
    const wi=e.target.closest('[data-incite]');if(wi){inciteRival(wi.dataset.incite);return;}
    const wt=e.target.closest('[data-intel]');if(wt){intelRival(wt.dataset.intel);return;}
    const wp=e.target.closest('[data-preempt]');if(wp){preemptRival(wp.dataset.preempt);return;}
    const pr=e.target.closest('[data-prestige]');if(pr){doPrestige();return;}
  });

  // ---------- loops ----------
  let last=Date.now();
  setInterval(()=>{
    const now=Date.now(),dt=(now-last)/1000;last=now;
    earn(rps()*dt);
    const hr=heatRate();
    if(S.policePay){
      const fee=rps()*POLICE.cut*dt;
      if(S.cash>=fee||rps()<=0){
        S.cash-=Math.max(0,fee);
        if(hr>0)addHeat(hr*dt*(1-POLICE.reduce));     // 불법 수배 발생 -70%
        S.heat=Math.max(0,S.heat-POLICE.drain*dt);    // 기존 수배도 서서히 감소
      } else {
        S.policePay=false;
        flashToast('bad','🚨 상납 중단','자금 부족 — 경찰이 등을 돌렸다');
      }
    } else {
      if(hr>0)addHeat(hr*dt);else S.heat=Math.max(0,S.heat-0.8*dt);
    }
    S.ops.forEach((o,i)=>{if(o&&now>=o.endAt)resolveOp(i);});
    checkRank();
  },100);
  setInterval(()=>{                                              // 🏦 지분 배당 (투자 시스템)
    if(!S.rivals)return; let div=0;
    S.rivals.forEach(r=>{ if((r.invest||0)>0 && r.state!=='war'){
      const d=Math.floor(r.treasury*(r.invest/100)*WARLORD.dividendRate);
      if(d>0){ div+=d; r.treasury=Math.max(0,r.treasury-d); } } });
    if(div>0)earn(div);
  },1000);
  setInterval(()=>{ if(typeof checkAch==='function') checkAch(); },2000);   // 🏅 업적 체크
  setInterval(maybeEvent,6000);
  setInterval(updateMarket,3000);
  setInterval(aiWarlordTick,WARLORD.tickMs);
  setInterval(()=>{
    renderTop();
    if(!S.tutDone)tutCheck();
    const liveOps=(S.tab==='ops'&&S.ops.some(Boolean));   // 진행 중 작전 막대 애니메이션
    const liveMkt=(S.tab==='mkt'&&S.mktWar);               // 세력전 카운트다운 실시간 갱신
    if(panelDirty||liveOps||liveMkt){renderPanel();panelDirty=false;}
  },120);

  // 저장 불러오기 + 오프라인 정산
  const _saved=loadGame();let _off=null;
  if(_saved){applyLoad(_saved);_off=processOffline(_saved);}
  ensureRivals();
  // 구역 지도: 세이브에 있으면 라이벌 정합성만 맞추고, 없으면 turf%로 시드
  if(S.guOwn)reconcileGuOwn();else initGuOwn();
  if(S.rankIdx>=WARLORD.minRank)S.tutDone=true;   // 이미 양아치 이상이면 튜토리얼 생략
  renderQuest();
  pingOllama().then(()=>{if(S.tab==='war')renderPanel();});
  render();
  if(_off)showOffline(_off);

  setInterval(saveGame,5000);                                  // 5초마다 자동 저장
  window.addEventListener('beforeunload',saveGame);            // 종료 직전 저장
  document.addEventListener('visibilitychange',()=>{if(document.hidden)saveGame();});