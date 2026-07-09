"use strict";
/* ====================================================================
   거지 라이프: 길거리의 제왕 — 유틸 · 구역 소유 시스템 · 암시장 세력전 · 프레스티지 · 탭/도박 · 조직/난투(runBattle)
   ※ 이 파일들은 하나의 공유 전역 스코프에서 동작합니다.
     index.html 의 <script> 로드 순서: data → core → economy → rivals → ui → main
   ==================================================================== */

  // ---------- util ----------
  function fmt(n){
    n=Math.floor(n);
    if(n<10000) return n.toLocaleString('ko-KR');
    const u=[[1e16,'경'],[1e12,'조'],[1e8,'억'],[1e4,'만']];
    for(const [v,s] of u){ if(n>=v){let x=n/v; return (x>=1000?Math.floor(x):x.toFixed(x>=100?0:x>=10?1:2)).toLocaleString('ko-KR').replace(/\.0+$/,'')+s;} }
    return n.toLocaleString('ko-KR');
  }
  function won(n){return "₩"+fmt(n);}
  function rint(a,b){return Math.floor(a+Math.random()*(b-a));}

  function bizCost(i){return Math.floor(BIZ[i].cost*Math.pow(DIFF.bizGrowth,S.biz[i]));}
  function tapCost(i){return Math.floor(TAPUP[i].cost*Math.pow(DIFF.tapGrowth,S.tapup[i]));}
  function clickPower(){let p=S.clickBase;TAPUP.forEach((t,i)=>p+=t.add*S.tapup[i]);return Math.floor(p*prestigeMult());}
  function crewIncome(){let r=0;CREW.forEach((c,i)=>r+=(c.income||0)*S.crew[i]);return r;}
  // ==================== 자치구(구역) 소유 시스템 ====================
  // 구별 가치 등급 — 등급 1점당 수익 +0.5% (전 구역 점령 시 최대 +약23%)
  const GU_VAL={
    '강남구':3,'서초구':3,'송파구':3,'중구':3,'종로구':3,'영등포구':3,
    '마포구':2,'용산구':2,'성동구':2,'광진구':2,'강동구':2,'양천구':2,'동작구':2,'서대문구':2,'강서구':2,
  };
  const TURF_BONUS=0.005;      // 가치 1점당 수익 +0.5%
  const GU_FORT_DUR=180000;    // 수비 강화 지속 3분
  function guVal(n){return GU_VAL[n]||1;}
  function guFortified(n){return !!(S.guDef&&Date.now()<(S.guDef[n]||0));}
  function guOwnerOf(n){return (S.guOwn&&S.guOwn[n])||'neutral';}
  function myGus(){if(!S.guOwn)return[];return SEOUL.filter(g=>S.guOwn[g.n]==='me').map(g=>g.n);}
  function ownedValueSum(){let v=0;myGus().forEach(n=>v+=guVal(n));return v;}
  function turfMult(){if(!S.guOwn)return 1;return 1+ownedValueSum()*TURF_BONUS;}
  function syncTurf(){if(!S.guOwn)return;S.turf=Math.round(myGus().length/SEOUL.length*1000)/10;}
  function guCounts(){let me=0,rival=0,neu=0;SEOUL.forEach(g=>{const o=guOwnerOf(g.n);if(o==='me')me++;else if(o==='neutral')neu++;else rival++;});return {me,rival,neu};}
  // 홈(강남) 기준 거리
  function guDist(a,b){return Math.hypot(a.cx-b.cx,a.cy-b.cy);}
  function guHome(){return SEOUL.find(g=>g.n==='강남구')||SEOUL[0];}
  // S.turf %를 기반으로 최초 소유 지도를 결정론적으로 생성(구버전 세이브 마이그레이션 포함)
  function buildSeedOwner(){
    const n=SEOUL.length,home=guHome();
    const mine=Math.max(1,Math.min(n,Math.round(S.turf/100*n)));
    const owner={};SEOUL.forEach(g=>owner[g.n]='neutral');const taken=new Set();
    SEOUL.slice().sort((a,b)=>guDist(a,home)-guDist(b,home)).slice(0,mine).forEach(g=>{owner[g.n]='me';taken.add(g.n);});
    const live=(S.rivals||[]).filter(r=>r.power>0);let rest=n-mine;
    if(live.length&&rest>0){
      const totalP=live.reduce((a,r)=>a+r.power,0)||1;
      const far=SEOUL.slice().sort((a,b)=>guDist(b,home)-guDist(a,home));
      live.forEach((r,idx)=>{
        const rhome=far[idx%far.length];let share=Math.max(1,Math.round(rest*(r.power/totalP)));
        SEOUL.slice().sort((a,b)=>guDist(a,rhome)-guDist(b,rhome)).forEach(g=>{
          if(share>0&&!taken.has(g.n)){owner[g.n]=r.id;taken.add(g.n);share--;}
        });
      });
    }
    return owner;
  }
  function initGuOwn(){S.guOwn=buildSeedOwner();S.guDef=S.guDef||{};syncTurf();}
  function ensureGuOwn(){if(!S.guOwn||typeof S.guOwn!=='object'||!Object.keys(S.guOwn).length)initGuOwn();}
  // 라이벌 소멸/부활 시 지도의 라이벌 id 정합성 유지
  function reconcileGuOwn(){
    if(!S.guOwn)return;const live=new Set((S.rivals||[]).map(r=>r.id));
    SEOUL.forEach(g=>{const o=S.guOwn[g.n];if(o&&o!=='me'&&o!=='neutral'&&!live.has(o))S.guOwn[g.n]='neutral';});
    syncTurf();
  }
  // 가장 약한/가까운 라이벌 id (구역 배정 대상)
  function nearestRivalId(from){
    const live=(S.rivals||[]).filter(r=>r.power>0);if(!live.length)return null;
    // 이 구역을 이미 많이 가진 라이벌에게 우선 귀속(세력권 뭉치기)
    const near=SEOUL.filter(g=>{const o=guOwnerOf(g.n);return o!=='me'&&o!=='neutral';})
      .map(g=>({id:S.guOwn[g.n],d:guDist(g,from)})).sort((a,b)=>a.d-b.d)[0];
    if(near)return near.id;
    return live.sort((a,b)=>a.power-b.power)[0].id;
  }
  // ── 구역 이전 핵심 API — 기존 addTurf(±%)가 이걸 통해 실제 지도를 움직인다 ──
  // +d%면 중립→(없으면)라이벌 구역을 홈 근처부터 흡수, -d%면 내 구역을 라이벌에 상납
  function addTurf(d){
    ensureGuOwn();
    let cnt=Math.max(1,Math.round(Math.abs(d)/100*SEOUL.length));
    const home=guHome();
    if(d>0){
      // 1순위 중립, 2순위 라이벌 — 홈에서 가까운 순
      const grab=(pred)=>SEOUL.filter(g=>pred(guOwnerOf(g.n))).sort((a,b)=>guDist(a,home)-guDist(b,home));
      let pool=grab(o=>o==='neutral');
      for(const g of pool){if(cnt<=0)break;S.guOwn[g.n]='me';delete S.guDef[g.n];cnt--;}
      if(cnt>0){pool=grab(o=>o!=='me'&&o!=='neutral');for(const g of pool){if(cnt<=0)break;S.guOwn[g.n]='me';delete S.guDef[g.n];cnt--;}}
    } else if(d<0){
      // 수비 강화 안 된 내 구역을, 홈에서 먼 순으로 상실 → 인접 라이벌에 귀속
      const pool=SEOUL.filter(g=>guOwnerOf(g.n)==='me'&&!guFortified(g.n)).sort((a,b)=>guDist(b,home)-guDist(a,home));
      const keep=1; // 최소 1개 구역은 남겨 게임오버 방지
      let losable=Math.max(0,myGus().length-keep);
      for(const g of pool){if(cnt<=0||losable<=0)break;const rid=nearestRivalId(g);S.guOwn[g.n]=rid||'neutral';cnt--;losable--;}
    }
    syncTurf();
    if(document.querySelector('.seoul-modal'))refreshSeoulMap();
  }

  // ==================== 암시장 세력전 (라이벌 시세 조작) ====================
  const MKTWAR={durLo:12000,durHi:24000,pushLo:0.05,pushHi:0.11,cd:50000,startChance:0.10};
  let mktWarCd=0;
  function startMktWar(){
    if(!mktUnlocked()||S.mktWar||Date.now()<mktWarCd)return;
    const cands=(S.rivals||[]).filter(r=>r.power>0);if(!cands.length)return;
    const pool=[];cands.forEach(r=>{const w=r.archetype==='broker'?4:r.archetype==='schemer'?3:1;for(let k=0;k<w;k++)pool.push(r);});
    const r=pool[Math.floor(Math.random()*pool.length)];
    const mode=Math.random()<0.6?'pump':'dump';
    S.mktWar={rid:r.id,mode,until:Date.now()+rint(MKTWAR.durLo,MKTWAR.durHi),startPrice:S.mkt.price};
    rlog(r,mode==='pump'?'암시장 물량을 매집하기 시작했다':'암시장에 물량을 쏟아내기 시작했다','+');
    if(r.known)flashToast('bad','📊 시장 작전 — '+r.name,mode==='pump'?'매집 개시 · 끝나는 순간 시세가 무너진다':'덤핑 개시 · 저점에서 주울 기회');
    else flashToast('','📊 암시장 이상 징후','정체불명의 큰손이 움직인다 · 시세 '+(mode==='pump'?'급등 중':'급락 중'));
    if(S.tab==='mkt'||S.tab==='war')panelDirty=true;
  }
  function endMktWar(){
    const w=S.mktWar;if(!w)return;S.mktWar=null;mktWarCd=Date.now()+MKTWAR.cd;
    const r=(S.rivals||[]).find(x=>x.id===w.rid);
    if(w.mode==='pump'){
      const crash=0.55+Math.random()*0.15,peak=S.mkt.price;
      S.mkt.price=Math.max(MKT.lo,Math.round(S.mkt.price*crash));
      const gain=Math.floor(Math.max(0,peak-w.startPrice)*80);
      if(r){r.treasury+=gain;rlog(r,'고점에서 전량 투매해 한몫 챙겼다','+');}
      flashToast('bad','📉 투매 폭탄'+(r&&r.known?' — '+r.name:''),'매집 물량이 쏟아졌다 · 시세 '+Math.round((1-crash)*100)+'% 붕괴');
    }else{
      S.mkt.price=Math.min(MKT.hi,Math.round(S.mkt.price*(1.25+Math.random()*0.2)));
      if(r)rlog(r,'저점에서 물량을 쓸어담았다','+');
      flashToast('good','📈 반등'+(r&&r.known?' — '+r.name+' 매집 종료':''),'덤핑이 끝나자 시세가 튀어오른다');
    }
    S.mkt.hist.push(S.mkt.price);if(S.mkt.hist.length>44)S.mkt.hist.shift();
    if(S.tab==='mkt'||S.tab==='war')panelDirty=true;
  }
  function mktWarRival(){return S.mktWar?(S.rivals||[]).find(x=>x.id===S.mktWar.rid):null;}

  function cleanRps(){let r=crewIncome();BIZ.forEach((b,i)=>{if(b.heat===0)r+=b.rps*S.biz[i];});return r*prestigeMult()*warMult()*turfMult();}
  function rps(){if(layingLow())return cleanRps();let r=crewIncome();BIZ.forEach((b,i)=>r+=b.rps*S.biz[i]);return r*prestigeMult()*warMult()*turfMult();}
  function heatRate(){if(layingLow())return 0;let h=0;BIZ.forEach((b,i)=>h+=b.heat*S.biz[i]);return h*DIFF.heatMult;}
  function layingLow(){return Date.now()<S.layLowUntil;}
  function warMult(){return Date.now()<(S.warSuppressUntil||0)?(1-WARLORD.warSuppress):1;}
  function bribeCost(){return Math.max(500,Math.floor(rps()*DIFF.bribeMult+S.totalEarned*DIFF.bribeBase));}
  function stars(){return Math.min(5,Math.floor(S.heat/20));}

  // ---------- 프레스티지(자수 → 재기) ----------
  const PTITLE=['','전설','신화','불멸의 대부','암흑의 제왕','거리의 신','무관의 제왕'];
  function prestigeMult(){return 1+S.notoriety*0.03;}                 // 악명 1당 영구 +3%
  function pendingNotoriety(){return Math.floor(Math.sqrt(S.totalEarned/2e9));}
  function canPrestige(){return S.totalEarned>=PRESTIGE_REQ;}
  function prestigeTitle(){return S.prestige<=0?'':PTITLE[Math.min(S.prestige,PTITLE.length-1)];}
  function doPrestige(){
    if(!canPrestige())return;
    const g=pendingNotoriety();if(g<=0)return;
    if(!confirm('자수하시겠습니까?\n\n현금·사업·조직·작전이 모두 초기화되지만,\n영구 악명 +'+g+' (수익 +'+(g*3)+'%)를 얻고 전설이 됩니다.'))return;
    S.notoriety+=g;S.prestige++;
    Object.assign(S,{cash:0,totalEarned:0,clickBase:25,biz:BIZ.map(()=>0),tapup:TAPUP.map(()=>0),heat:0,raids:0,layLowUntil:0,rankIdx:0,
      ops:OPS.map(()=>null),opsRun:0,opsWin:0,mkt:{price:1500,units:0,avgCost:0,hist:[1500,1500,1500],bought:0,sold:0},
      bet:50,spins:0,gambleNet:0,crew:CREW.map(()=>0),gangFights:0,gangWins:0,warSuppressUntil:0,turf:12,policePay:false,guDef:{},mktWar:null});
    initRivals();initGuOwn();
    saveGame();render();
    flashToast('good','⛓️ 자수 & 재기','전과 '+S.prestige+'범 · 악명 '+S.notoriety+' · 수익 ×'+prestigeMult().toFixed(2));
  }

  // ---------- actions ----------
  function earn(n){S.cash+=n;S.totalEarned+=n;}
  function addHeat(n){S.heat=Math.min(100,S.heat+n);if(S.heat>=100)raid();}
  function doTap(e){
    let g=clickPower(),crit=Math.random()<DIFF.critChance;
    if(crit){
      g*=CRIT.mult;
      const app=document.getElementById('app');
      app.classList.remove('screen-micro-shake');
      void app.offsetWidth;              // 리플로우 강제 → 애니메이션 재시작
      app.classList.add('screen-micro-shake');
    }
    earn(g);if(S.rankIdx>=3)addHeat(DIFF.tapHeat);
    spawnFloat(e,(crit?"CRIT! ":"+")+won(g),crit);
  }

  // ---------- 판돈 베팅 인프라 (라이벌 대결에서 사용) ----------
  function betClamp(){S.bet=Math.max(10,Math.min(S.bet,Math.max(10,Math.floor(S.cash))));return S.bet;}
  function setBet(mult){ if(mult==='max'){S.bet=Math.max(10,Math.floor(S.cash));} else {S.bet=Math.max(10,Math.floor(S.bet*mult));} betClamp(); if(S.tab==='war')panelDirty=true; }
  // ---------- 조직 / 패싸움 ----------
  function crewCost(i){return Math.floor(CREW[i].cost*Math.pow(DIFF.crewGrowth,S.crew[i]));}
  function combatPower(){let p=0;CREW.forEach((c,i)=>p+=c.power*S.crew[i]);return p;}
  function crewCount(){let n=0;S.crew.forEach(c=>n+=c);return n;}
  function crewUnlocked(i){return i===0||S.crew[i-1]>=CREW[i].unlock||S.crew[i]>0;}
  function recruit(i){const c=crewCost(i);if(S.cash<c)return;S.cash-=c;S.crew[i]++;flashToast("good","🤝 RECRUITED",CREW[i].name+" 합류 · 전투력 +"+CREW[i].power);render();}
  function loseCrew(frac){
    let lost=0;
    for(let i=S.crew.length-1;i>=0;i--){const d=Math.floor(S.crew[i]*frac);S.crew[i]-=d;lost+=d;}
    if(lost===0){ // 최소 1명은 다침
      for(let i=0;i<S.crew.length;i++){if(S.crew[i]>0){S.crew[i]--;lost=1;break;}}
    }
    return lost;
  }
  let battling=false;
  function runBattle(opp,onResolve){
    if(battling)return;
    const cp=combatPower();
    battling=true;
    const chance=Math.max(0.05,Math.min(0.95,cp/(cp+opp.power)));
    const ourShare=Math.round(chance*100);
    const ourCount=Math.min(10,Math.max(2,crewCount()));
    const enemyCount=Math.min(10,Math.max(2,Math.round(ourCount*opp.power/Math.max(1,cp))));
    let myEmoji='✦';for(let k=CREW.length-1;k>=0;k--){if(S.crew[k]>0){myEmoji=CREW[k].emoji;break;}}

    const ov=document.createElement('div');ov.className='battle';
    ov.innerHTML=
      '<div class="battle-card"><div class="b-head">'+
      '<div class="b-side ours"><div class="b-lbl">OUR CREW</div><div class="b-pow" id="bCntO">'+ourCount+'명</div></div>'+
      '<div class="b-vs">VS<div class="b-odds">WIN '+ourShare+'%</div></div>'+
      '<div class="b-side enemy"><div class="b-lbl">'+opp.name+'</div><div class="b-pow" id="bCntE">'+enemyCount+'명</div></div></div>'+
      '<div class="b-momentum"><i id="bMom"></i></div>'+
      '<div class="arena" id="arena"><div class="b-center"></div>'+
      '<span class="b-obs" style="left:7px;top:7px">🛢️</span><span class="b-obs" style="right:7px;top:7px">🚧</span>'+
      '<span class="b-obs" style="left:7px;bottom:7px">🚧</span><span class="b-obs" style="right:7px;bottom:7px">🛢️</span>'+
      '<canvas id="bcanvas"></canvas></div>'+
      '<div class="b-result" id="bResult"></div><div class="b-sub" id="bSub">⚔ 난투 중…</div>'+
      '<button class="b-close" id="bClose" style="display:none">계속</button></div>';
    document.body.appendChild(ov);

    const arena=ov.querySelector('#arena'),canvas=ov.querySelector('#bcanvas'),ctx=canvas.getContext('2d');
    const dpr=Math.min(2,window.devicePixelRatio||1);
    const W=arena.clientWidth,H=arena.clientHeight;
    canvas.width=W*dpr;canvas.height=H*dpr;canvas.style.width=W+'px';canvas.style.height=H+'px';ctx.scale(dpr,dpr);

    // 전력비에 비례한 능력치 — 화면에서 실제로 이긴 쪽이 곧 결과
    const ourMult=0.6+chance, enMult=0.6+(1-chance);
    const units=[];
    function rand(a,b){return a+Math.random()*(b-a);}
    function mk(side,emoji,n,mult,yLo,yHi){
      for(let k=0;k<n;k++)units.push({side,emoji,x:rand(W*0.18,W*0.82),y:rand(yLo,yHi),vx:0,vy:0,
        hp:100*mult,maxhp:100*mult,dmg:26*mult,r:13,hit:0,alive:true});
    }
    mk('ours',myEmoji,ourCount,ourMult,H*0.60,H*0.90);
    mk('enemy',opp.emoji,enemyCount,enMult,H*0.10,H*0.40);
    const initO=ourCount*100*ourMult, initE=enemyCount*100*enMult;

    const ACC=620,MAXV=98,SEP=520,WAN=140,TAU=Math.PI*2;
    let raf=0,t0=performance.now(),ended=false,endAt=0;

    function step(now){
      let dt=(now-t0)/1000;t0=now;if(dt>0.05)dt=0.05;
      // 물리 업데이트
      for(const u of units){
        if(!u.alive)continue;
        let tgt=null,bd=1e18;
        for(const v of units){if(v.alive&&v.side!==u.side){const d=(v.x-u.x)**2+(v.y-u.y)**2;if(d<bd){bd=d;tgt=v;}}}
        if(tgt){
          const dx=tgt.x-u.x,dy=tgt.y-u.y,d=Math.hypot(dx,dy)||1,range=u.r+tgt.r+2;
          if(d>range){u.vx+=(dx/d)*ACC*dt;u.vy+=(dy/d)*ACC*dt;}
          else{tgt.hp-=u.dmg*dt;tgt.hit=0.12;u.vx*=0.5;u.vy*=0.5;
               u.vx+=(-dy/d)*60*dt;u.vy+=(dx/d)*60*dt;}      // 살짝 도는 느낌
        }
        for(const v of units){if(v!==u&&v.alive){const dx=u.x-v.x,dy=u.y-v.y,d=Math.hypot(dx,dy);
          if(d>0&&d<u.r+v.r+4){u.vx+=(dx/d)*SEP*dt;u.vy+=(dy/d)*SEP*dt;}}}
        u.vx+=(Math.random()-0.5)*WAN*dt;u.vy+=(Math.random()-0.5)*WAN*dt;
        const sp=Math.hypot(u.vx,u.vy);if(sp>MAXV){u.vx*=MAXV/sp;u.vy*=MAXV/sp;}
        u.x+=u.vx*dt;u.y+=u.vy*dt;u.vx*=0.9;u.vy*=0.9;
        if(u.x<u.r){u.x=u.r;u.vx*=-0.5;}if(u.x>W-u.r){u.x=W-u.r;u.vx*=-0.5;}
        if(u.y<u.r){u.y=u.r;u.vy*=-0.5;}if(u.y>H-u.r){u.y=H-u.r;u.vy*=-0.5;}
        u.hit=Math.max(0,u.hit-dt);
        if(u.hp<=0)u.alive=false;
      }
      // 그리기
      ctx.clearRect(0,0,W,H);
      let aliveO=0,aliveE=0,hpO=0,hpE=0;
      for(const u of units){
        if(u.side==='ours'){if(u.alive){aliveO++;hpO+=u.hp;}}else{if(u.alive){aliveE++;hpE+=u.hp;}}
        if(!u.alive)continue;
        const col=u.side==='ours'?'#5aa6bf':'#c25555',dark=u.side==='ours'?'#16323d':'#3a1212';
        ctx.globalAlpha=u.hit>0?0.55:0.16;ctx.fillStyle=u.hit>0?'#fff':col;
        ctx.beginPath();ctx.arc(u.x,u.y,u.r+4,0,TAU);ctx.fill();ctx.globalAlpha=1;
        const gr=ctx.createRadialGradient(u.x-4,u.y-4,2,u.x,u.y,u.r);gr.addColorStop(0,col);gr.addColorStop(1,dark);
        ctx.fillStyle=gr;ctx.beginPath();ctx.arc(u.x,u.y,u.r,0,TAU);ctx.fill();
        ctx.lineWidth=1.5;ctx.strokeStyle=u.hit>0?'#fff':col;ctx.stroke();
        const f=Math.max(0,u.hp/u.maxhp);
        ctx.beginPath();ctx.arc(u.x,u.y,u.r+3,-Math.PI/2,-Math.PI/2+TAU*f);
        ctx.strokeStyle=u.side==='ours'?'#9fe3f2':'#f3a3a3';ctx.lineWidth=2;ctx.stroke();
        ctx.beginPath();ctx.arc(u.x,u.y,u.r*0.42,0,TAU);
        ctx.fillStyle=u.hit>0?'#fff':(u.side==='ours'?'#cdeef7':'#f4cccc');ctx.fill();
      }
      // 상황판 갱신
      const fracO=hpO/initO,fracE=hpE/initE,tot=fracO+fracE||1;
      ov.querySelector('#bMom').style.width=(fracO/tot*100)+'%';
      ov.querySelector('#bCntO').textContent=aliveO+'명';
      ov.querySelector('#bCntE').textContent=aliveE+'명';

      if(!ended&&(aliveO===0||aliveE===0)){ended=true;endAt=now;}
      if(ended&&now-endAt>500){finish();return;}
      raf=requestAnimationFrame(step);
    }
    function finish(){
      cancelAnimationFrame(raf);
      let aO=0,aE=0,hO=0,hE=0;
      for(const u of units){if(u.side==='ours'){if(u.alive){aO++;hO+=u.hp;}}else{if(u.alive){aE++;hE+=u.hp;}}}
      const ourWin=(aO!==aE)?(aO>aE):(hO>=hE);   // 살아남은 쪽이 승자
      const out=onResolve(ourWin);
      const r=ov.querySelector('#bResult');r.classList.add(ourWin?'win':'lose');r.textContent=ourWin?'V I C T O R Y':'D E F E A T';
      ov.querySelector('#bSub').textContent=(out&&out.sub)?out.sub:(ourWin?'승리':'패배');
      const cb=ov.querySelector('#bClose');cb.style.display='block';
      cb.addEventListener('click',()=>{ov.remove();battling=false;render();if(document.querySelector('.seoul-modal'))refreshSeoulMap();});
    }
    // 안전장치: 최대 9초 후 강제 종료
    setTimeout(()=>{if(!ended){ended=true;endAt=performance.now()-600;}},9000);
    raf=requestAnimationFrame(step);
  }
  function startBattle(i){
    if(battling)return;
    if(combatPower()<=0){flashToast("bad","✊ NO CREW","조직원을 먼저 고용하세요");return;}
    const g=GANGS[i];S.gangFights++;
    runBattle({name:g.name,emoji:g.emoji,power:g.power},(win)=>{
      if(win){const reward=rint(g.min,g.max);earn(reward);addHeat(g.heat);S.gangWins++;return{sub:'전리품 +'+won(reward)+' · 수배 +'+g.heat};}
      const lost=loseCrew(0.15);addHeat(g.heat*0.5);return{sub:'조직원 '+lost+'명 부상 · 수배 +'+Math.round(g.heat*0.5)};
    });
  }

  function buyBiz(i){const c=bizCost(i);if(S.cash<c)return;S.cash-=c;S.biz[i]++;flashToast("good","🏗️ BIZ EXPAND",BIZ[i].name+" 보유 "+S.biz[i]+"개");render();}
  function buyTap(i){const c=tapCost(i);if(S.cash<c)return;S.cash-=c;S.tapup[i]++;flashToast("good","💪 UPGRADE",TAPUP[i].name+" Lv."+S.tapup[i]);render();}
  function layLow(){S.heat=Math.max(0,S.heat*DIFF.layLowFactor);S.layLowUntil=Date.now()+DIFF.layLowDur;flashToast("","🤫 LAY LOW",(DIFF.layLowDur/1000)+"초간 불법 수익 정지 · 수배 -"+Math.round((1-DIFF.layLowFactor)*100)+"%");render();}
  function bribe(){const c=bribeCost();if(S.cash<c){flashToast("bad","💸 FUNDS LOW","뇌물 줄 돈이 없습니다");return;}S.cash-=c;S.heat=0;flashToast("good","💸 BRIBE SUCCESS","경찰의 시선을 돌렸습니다");render();}
  function togglePolice(){
    S.policePay=!S.policePay;
    if(S.policePay)flashToast('good','🛡️ 정기 상납 개시','수입 -'+Math.round(POLICE.cut*100)+'%/s · 수배 발생 -'+Math.round(POLICE.reduce*100)+'% · 수배도 서서히 감소');
    else flashToast('','🛡️ 정기 상납 중단','이제 수배도가 정상 누적됩니다');
    render();
  }
  function raid(){
    S.raids++;
    const cp=combatPower(),mitig=Math.min(0.6,cp/(cp+8000));   // 조직원이 많을수록 압수 경감(최대 60%)
    const lossPct=DIFF.raidLoss*(1-mitig),loss=Math.floor(S.cash*lossPct);
    S.cash-=loss;S.heat=DIFF.raidHeat;
    const f=document.getElementById('flash');f.classList.remove('go');void f.offsetWidth;f.classList.add('go');
    const a=document.getElementById('app');a.classList.remove('shake');void a.offsetWidth;a.classList.add('shake');
    flashToast("bad","🚔 POLICE RAID!","현금 "+Math.round(lossPct*100)+"% 압수 ("+won(loss)+")"+(mitig>0.02?" · 경호로 경감":"")+" · 수배 ★★");
  }