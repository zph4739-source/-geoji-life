"use strict";
/* ====================================================================
   거지 라이프: 길거리의 제왕 — 범죄작전 · 블랙마켓 · 신분별 랜덤 이벤트
   ※ 이 파일들은 하나의 공유 전역 스코프에서 동작합니다.
     index.html 의 <script> 로드 순서: data → core → economy → rivals → ui → main
   ==================================================================== */

  // ---------- operations ----------
  function opUnlocked(i){return S.rankIdx>=OPS[i].unlock;}
  function opChance(i){return Math.max(0.05,OPS[i].chance-DIFF.opPenalty);}
  function launchOp(i){
    if(S.ops[i]||!opUnlocked(i))return;
    const o=OPS[i];
    if(S.cash<o.cost){flashToast("bad","🧰 FUNDS LOW","작전 준비금 "+won(o.cost)+" 필요");return;}
    S.cash-=o.cost;S.ops[i]={endAt:Date.now()+o.dur*1000,dur:o.dur};S.opsRun++;
    flashToast("","🎯 OP STARTED",o.name+" 개시 — "+o.dur+"초 후 결과");render();
  }
  function resolveOp(i){
    const o=OPS[i];S.ops[i]=null;
    if(S.tab==='ops')panelDirty=true;
    if(Math.random()<opChance(i)){
      const reward=rint(o.min,o.max);earn(reward);addHeat(o.heat);S.opsWin++;
      flashToast("good","✅ OP SUCCESS",o.name+" — 전리품 +"+won(reward)+" · 수배 상승");
    }else{
      addHeat(o.heat*0.7);
      flashToast("bad","🚨 OP FAILED",o.name+" — 들켜서 도주, 준비비 날림");
    }
  }

  // ---------- black market ----------
  function mktUnlocked(){return S.rankIdx>=2;}
  function updateMarket(){
    const w=S.mktWar;
    if(w&&Date.now()>=w.until){endMktWar();return;}
    let p=S.mkt.price;
    if(w){
      // 세력이 시세를 일방향으로 밀어붙이는 중 — 자연 드리프트 대신 압박
      const push=MKTWAR.pushLo+Math.random()*(MKTWAR.pushHi-MKTWAR.pushLo);
      p=p*(1+(w.mode==='pump'?push:-push));
    }else{
      const drift=(MKT.base-p)/MKT.base*0.05;
      const shock=(Math.random()-0.5)*0.30;
      p=p*(1+drift+shock);
    }
    p=Math.max(MKT.lo,Math.min(MKT.hi,Math.round(p)));
    S.mkt.price=p;S.mkt.hist.push(p);if(S.mkt.hist.length>44)S.mkt.hist.shift();
    if(S.tab==='mkt')panelDirty=true;
  }
  function mktBuy(n){
    const m=S.mkt;let cost=m.price*n;
    if(S.cash<cost){n=Math.floor(S.cash/m.price);if(n<=0){flashToast("bad","🪙 FUNDS LOW","매입할 돈이 없습니다");return;}cost=m.price*n;}
    S.cash-=cost;m.avgCost=(m.avgCost*m.units+cost)/(m.units+n);m.units+=n;m.bought+=n;
    flashToast("","📦 PURCHASED",n+"개 매입 · 평단 "+won(m.avgCost));render();
  }
  function mktBuyMax(){const n=Math.floor(S.cash/S.mkt.price);if(n<=0){flashToast("bad","🪙 FUNDS LOW","매입할 돈이 없습니다");return;}mktBuy(n);}
  function mktSell(frac){
    const m=S.mkt;if(m.units<=0){flashToast("bad","📭 EMPTY STOCK","팔 물건이 없습니다");return;}
    const n=frac>=1?m.units:Math.max(1,Math.floor(m.units*frac));
    const rev=m.price*n,profit=rev-m.avgCost*n;
    S.cash+=rev;m.units-=n;m.sold+=n;if(m.units<=0)m.avgCost=0;
    addHeat(Math.min(40,n*0.30)); 
    // 라이벌 매집 판(pump)에 끼어들어 크게 먹으면 원한을 산다
    if(S.mktWar&&S.mktWar.mode==='pump'&&n>=50&&profit>0){
      const r=mktWarRival();
      if(r){r.hostility=Math.min(100,r.hostility+8);rlog(r,'자기 판에 끼어든 당신에게 이를 갈았다','+');
        flashToast('bad','💢 원한',(r.known?r.name:'큰손')+'의 판에서 차익을 챙겼다 · 적개심 +8');}
    }
    flashToast(profit>=0?"good":"bad","💊 SOLD OUT",n+"개 매도 · "+(profit>=0?"+":"")+won(Math.abs(profit))+" 수익 · 수배 급증");render();
  }

  // ---------- 신분별 랜덤 이벤트 시스템 ----------
  let eventOpen=false;
  let globalEventCooldown=0;                               // 모달 폭주 방지 쿨다운(타임스탬프)
  function eventCooling(){return Date.now()<globalEventCooldown;}

  // 공용 선택형 이벤트 모달 빌더
  function showEvent(cfg){
    if(eventOpen||battling)return;
    eventOpen=true;S.choiceEvents++;
    globalEventCooldown=Date.now()+60000;                  // 모달 후 60초간 다음 모달 억제
    const ov=document.createElement('div');ov.className='evt';
    let stakes='';
    if(cfg.stakes&&cfg.stakes.length){
      stakes='<div class="evt-stakes">'+cfg.stakes.map(s=>
        '<div class="evt-stake"><div class="k">'+s.k+'</div><div class="v" style="color:'+(s.col||'var(--txt)')+'">'+s.v+'</div></div>').join('')+'</div>';
    }
    const timer=cfg.timeout?'<div class="evt-timer"><i id="evtBar"></i></div>':'';
    ov.innerHTML='<div class="evt-card tier-'+(cfg.tier||'mid')+'">'+
      '<div class="evt-emoji">'+cfg.emoji+'</div>'+
      '<div class="evt-kicker '+(cfg.tier||'mid')+'">'+(cfg.kicker||'INCIDENT')+'</div>'+
      '<div class="evt-title">'+cfg.title+'</div>'+
      '<div class="evt-desc"'+(cfg.descId?' id="'+cfg.descId+'"':'')+'>'+cfg.desc+'</div>'+stakes+timer+
      '<div class="evt-choices">'+cfg.choices.map((c,i)=>
        '<button class="evt-btn '+(c.cls||'')+'" data-choice="'+i+'">'+c.label+(c.sub?'<small>'+c.sub+'</small>':'')+'</button>').join('')+
      '</div></div>';
    document.body.appendChild(ov);
    let done=false,to=null,barIv=null,start=Date.now();
    function close(){if(done)return;done=true;if(to)clearTimeout(to);if(barIv)clearInterval(barIv);ov.remove();eventOpen=false;render();}
    ov.querySelectorAll('[data-choice]').forEach(b=>b.addEventListener('click',()=>{
      const c=cfg.choices[+b.dataset.choice];close();if(c&&c.fn)c.fn();
    }));
    if(cfg.timeout){
      const barEl=ov.querySelector('#evtBar');
      barIv=setInterval(()=>{const left=Math.max(0,1-(Date.now()-start)/cfg.timeout);if(barEl)barEl.style.width=(left*100)+'%';if(left<=0)clearInterval(barIv);},80);
      to=setTimeout(()=>{close();if(cfg.onTimeout)cfg.onTimeout();},cfg.timeout);
    }
  }

  // === 중간 신분 이벤트 (똘마니~중간보스) ===
  function evtTurf(){
    const reward=Math.max(50000,Math.floor(rps()*120+S.totalEarned*0.004));
    showEvent({tier:'mid',emoji:'💼',kicker:'TURF DISPUTE',title:'이권 다툼',
      desc:'옆 구역과 이권이 겹쳤다. 힘으로 밀어붙이면 큰돈이 들어오지만,<br>경찰의 시선이 따갑게 쏠릴 것이다.',
      stakes:[{k:'예상 수익',v:'+'+won(reward),col:'var(--money)'},{k:'수배도',v:'+18',col:'var(--heat)'}],
      choices:[
        {label:'밀어붙인다',sub:'현금 확보 · 수배 급등',cls:'accept',fn:()=>{earn(reward);addHeat(18);flashToast('good','💼 구역 장악','+'+won(reward)+' · 수배 상승');}},
        {label:'물러선다',sub:'조용히 발을 뺀다',cls:'safe',fn:()=>{S.heat=Math.max(0,S.heat-5);flashToast('','💼 물러섬','분쟁을 피했다');}},
      ]});
  }
  function evtPoliceTip(){
    showEvent({tier:'mid',emoji:'🚓',kicker:'INSIDER TIP',title:'경찰 단속 정보',
      desc:'정보원이 곧 단속이 있다고 귀띔했다.<br>지금 잠수타면 위기를 넘길 수 있다. 시간이 없다.',
      stakes:[{k:'무시 시 위험',v:'수배 +30',col:'var(--heat)'}],timeout:8000,
      choices:[
        {label:'잠수 탄다',sub:'수배 ×0.4 · 잠시 수익 정지',cls:'safe',fn:()=>{S.heat=Math.max(0,S.heat*0.4);S.layLowUntil=Date.now()+DIFF.layLowDur;flashToast('good','🤫 위기 회피','단속을 피했다 · 수배 급감');}},
        {label:'무시한다',sub:'운에 맡긴다',cls:'danger',fn:()=>{addHeat(30);flashToast('bad','🚓 단속 적중','정보를 흘렸다 · 수배 +30');}},
      ],
      onTimeout:()=>{addHeat(30);flashToast('bad','🚓 단속 적중','우물쭈물하다 단속에 걸렸다 · 수배 +30');}});
  }
  function evtBossOffer(){
    const reward=Math.max(120000,Math.floor(rps()*300+S.totalEarned*0.01)),win=0.55;
    showEvent({tier:'mid',emoji:'🤝',kicker:"BOSS'S OFFER",title:'거물의 제안',
      desc:'거물이 한탕을 제안했다. 조직원을 빌려주면 크게 먹을 수 있지만,<br>실패하면 부하 일부를 잃는다.',
      stakes:[{k:'성공 확률',v:Math.round(win*100)+'%',col:'var(--gold)'},{k:'성공 보상',v:'+'+won(reward),col:'var(--money)'}],
      choices:[
        {label:'참가한다',sub:'성공 시 대박 · 실패 시 조직원 부상',cls:'accept',fn:()=>{
          if(Math.random()<win){earn(reward);addHeat(10);flashToast('good','🤝 한탕 성공','+'+won(reward));}
          else{const l=loseCrew(0.2);addHeat(6);flashToast('bad','🤝 한탕 실패','조직원 '+l+'명 부상');}
        }},
        {label:'거절한다',sub:'안전하게 넘긴다',cls:'safe',fn:()=>{flashToast('','🤝 거절','위험한 제안을 거절했다');}},
      ]});
  }

  // === 높은 신분 이벤트 (두목~신화) ===
  function evtFactionWar(){
    const wager=Math.max(1,Math.floor(S.cash*0.3)),win=0.50;
    showEvent({tier:'high',emoji:'🏙️',kicker:'FACTION WAR',title:'세력 전쟁',
      desc:'도시의 패권을 두고 전면전이 벌어졌다.<br>전 재산의 30%를 군자금으로 걸 수 있다.',
      stakes:[{k:'군자금',v:won(wager),col:'var(--heat)'},{k:'승리 시',v:'+'+won(wager*2),col:'var(--money)'},{k:'승률',v:Math.round(win*100)+'%',col:'var(--gold)'}],
      choices:[
        {label:'참전한다',sub:'승리 시 군자금 2배 회수',cls:'accept',fn:()=>{
          S.cash-=wager;
          if(Math.random()<win){S.cash+=wager*2;addHeat(25);flashToast('good','🏙️ 전쟁 승리','+'+won(wager*2)+' 군자금 회수');}
          else{addHeat(20);flashToast('bad','🏙️ 전쟁 패배','군자금 '+won(wager)+' 소실');}
        }},
        {label:'관망한다',sub:'중립을 지킨다',cls:'safe',fn:()=>{flashToast('','🏙️ 관망','전쟁에서 발을 뺐다');}},
      ]});
  }
  function evtBlackDeal(){
    const reward=Math.floor(S.totalEarned*(0.02+S.rankIdx*0.005));
    showEvent({tier:'high',emoji:'👑',kicker:'BLACK DEAL',title:'검은 거래',
      desc:'거대 거래 제안이 들어왔다. 누적 수익의 일정 %를 한 방에 챙긴다.<br>신분이 높을수록 액수가 폭발한다.',
      stakes:[{k:'한 방 수익',v:'+'+won(reward),col:'var(--money)'},{k:'수배도',v:'+35',col:'var(--heat)'}],
      choices:[
        {label:'성사시킨다',sub:'거대 현금 · 수배 급등',cls:'accept',fn:()=>{earn(reward);addHeat(35);flashToast('good','👑 거래 성사','+'+won(reward));}},
        {label:'거절한다',sub:'위험을 피한다',cls:'safe',fn:()=>{flashToast('','👑 거절','검은 거래를 거절했다');}},
      ]});
  }
  function evtInvestigation(){
    const seizeEst=Math.floor(S.cash*0.4),bribe=Math.floor(S.cash*0.13);
    showEvent({tier:'high',emoji:'⚖️',kicker:'MAJOR PROBE',title:'대형 수사',
      desc:'검찰이 대대적인 수사에 착수했다.<br>막대한 자산 압수가 임박했다. 뇌물로 막을 수 있다.',
      stakes:[{k:'압수 위기',v:'-'+won(seizeEst),col:'var(--heat)'},{k:'무마 비용',v:won(bribe),col:'var(--gold)'}],timeout:10000,
      choices:[
        {label:'뇌물로 막는다',sub:won(bribe)+' 지불 · 압수 회피',cls:'safe',fn:()=>{
          if(S.cash>=bribe){S.cash-=bribe;S.heat=0;flashToast('good','⚖️ 무마 성공','수사를 덮었다 · 수배 초기화');}
          else{const l=Math.floor(S.cash*0.4);S.cash-=l;flashToast('bad','⚖️ 무마 실패','돈이 모자라 압수당했다 -'+won(l));}
        }},
        {label:'감수한다',sub:'압수를 받아들인다',cls:'danger',fn:()=>{const s=Math.floor(S.cash*0.4);S.cash-=s;flashToast('bad','⚖️ 자산 압수','-'+won(s)+' 압수당했다');}},
      ],
      onTimeout:()=>{const s=Math.floor(S.cash*0.4);S.cash-=s;flashToast('bad','⚖️ 자산 압수','대응이 늦어 -'+won(s)+' 압수당했다');}});
  }

  // 선택형 이벤트 레지스트리 (신분 범위 + 가중치)
  const CHOICE_EVENTS=[
    {minRank:3,maxRank:5,weight:3,run:evtTurf},
    {minRank:3,maxRank:99,weight:2,run:evtPoliceTip},
    {minRank:3,maxRank:99,weight:2,need:()=>crewCount()>0,run:evtBossOffer},
    {minRank:6,maxRank:99,weight:3,run:evtFactionWar},
    {minRank:6,maxRank:99,weight:3,run:evtBlackDeal},
    {minRank:6,maxRank:99,weight:2,run:evtInvestigation},
  ];
  function fireChoiceEvent(){
    const pool=[];
    CHOICE_EVENTS.forEach(e=>{if(S.rankIdx>=e.minRank&&S.rankIdx<=e.maxRank&&(!e.need||e.need())){for(let k=0;k<e.weight;k++)pool.push(e);}});
    if(!pool.length)return false;
    pool[Math.floor(Math.random()*pool.length)].run();
    return true;
  }

  // 자동(토스트) 이벤트 — 수익에 비례하므로 신분 오를수록 액수가 커짐
  function fireAutoEvent(){
    const base=rps(),tot=S.totalEarned,r=S.rankIdx,pool=[];
    const push=(w,fn)=>{for(let k=0;k<w;k++)pool.push(fn);};
    push(3,()=>{const g=Math.max(20,Math.floor(base*45+clickPower()*8));earn(g);flashToast('good','🍀 LUCK','바닥에서 돈을 주웠다 +'+won(g));});
    push(3,()=>{const g=Math.max(60,Math.floor(base*90));earn(g);flashToast('good','💵 DEAL','뒷거래 성공 +'+won(g));});
    push(2,()=>{S.heat=Math.max(0,S.heat-22);flashToast('good','🌧️ QUIET','거리가 조용하다 · 수배 하락');});
    if(r<=4)push(2,()=>{if(S.cash>0){const l=Math.floor(S.cash*0.04);S.cash-=l;flashToast('bad','🦝 PICKPOCKET','소매치기 당함 -'+won(l));}});
    if(r>=2)push(2,()=>{addHeat(13);flashToast('bad','👮 WITNESS','누가 경찰에 찔렀다 · 수배 상승');});
    if(r>=4){
      push(3,()=>{const g=Math.floor(base*160+tot*0.0015);earn(g);flashToast('good','💰 WINDFALL','대형 건수 성사 +'+won(g));});
      if(crewCount()>0)push(2,()=>{const l=loseCrew(0.08);const c=Math.floor(S.cash*0.05);S.cash-=c;flashToast('bad','📉 BETRAYAL','부하의 배신 · 조직원 '+l+'명 이탈 -'+won(c));});
    }
    if(mktUnlocked())push(2,()=>{const up=Math.random()<0.5;S.mkt.price=Math.round(up?Math.min(MKT.hi,S.mkt.price*1.5):Math.max(MKT.lo,S.mkt.price*0.6));flashToast(up?'good':'bad','📈 VOLATILITY',up?'암시장 물건값 폭등!':'암시장 물건값 폭락…');});
    if(pool.length)pool[Math.floor(Math.random()*pool.length)]();
  }

  function maybeEvent(){
    if(eventOpen||battling||eventCooling())return;
    if(S.rankIdx>=3&&Math.random()<0.08){if(fireChoiceEvent())return;}  // 중간+ 신분: 드물게 선택형 대형 이벤트
    if(Math.random()<0.10)fireAutoEvent();
  }