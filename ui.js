"use strict";
/* ====================================================================
   거지 라이프: 길거리의 제왕 — 렌더(top/panel) · 도박 UI · 온보딩/목표 추적기
   ※ 이 파일들은 하나의 공유 전역 스코프에서 동작합니다.
     index.html 의 <script> 로드 순서: data → core → economy → rivals → ui → main
   ==================================================================== */

  // ---------- render helpers ----------
  function spawnFloat(e,txt,crit){
    const wrap=document.querySelector('.tapwrap'),r=wrap.getBoundingClientRect();
    const el=document.createElement('div');el.className='float'+(crit?' crit':'');el.textContent=txt;
    el.style.left=((e&&e.clientX?e.clientX-r.left:r.width/2))+'px';el.style.top=(r.height/2-10)+'px';
    wrap.appendChild(el);setTimeout(()=>el.remove(),crit?1100:900);
  }
  function flashToast(kind,title,msg){
    const c=document.getElementById('toasts'),t=document.createElement('div');
    t.className='toast '+(kind||'');t.innerHTML='<div class="tt">'+title+'</div>'+msg;
    c.appendChild(t);setTimeout(()=>t.remove(),3000);
  }
  function checkRank(){let idx=0;RANKS.forEach((r,i)=>{if(S.totalEarned>=r.at)idx=i;});if(idx>S.rankIdx){flashToast("good","⬆️ RANK UP!","신분 상승: ["+RANKS[idx].name+"] "+RANKS[idx].emoji);panelDirty=true;}S.rankIdx=idx;}

  function sparkline(hist){
    const w=320,h=60,pad=5,lo=Math.min(...hist),hi=Math.max(...hist),rng=(hi-lo)||1;
    const pts=hist.map((v,i)=>{const x=pad+(w-2*pad)*(i/(hist.length-1||1));const y=pad+(h-2*pad)*(1-(v-lo)/rng);return x.toFixed(1)+','+y.toFixed(1);});
    const d='M'+pts.join(' L');
    const last=hist[hist.length-1],up=hist.length>1&&last>=hist[hist.length-2];
    const col=up?'var(--money)':'var(--heat)';
    const area=d+` L${(w-pad).toFixed(1)},${h-pad} L${pad},${h-pad} Z`;
    return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
      <defs><linearGradient id="mg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${col}" stop-opacity="0.3"/><stop offset="100%" stop-color="${col}" stop-opacity="0"/></linearGradient></defs>
      <path d="${area}" fill="url(#mg)"/><path d="${d}" fill="none" stroke="${col}" stroke-width="1.5" stroke-linejoin="round"/></svg>`;
  }

  // ---------- top render ----------
  function renderTop(){
    document.getElementById('cash').innerHTML='<span class="won">₩</span>'+fmt(S.cash);
    document.getElementById('rps').textContent=won(rps())+(layingLow()?" (OFF)":(Date.now()<S.warSuppressUntil?" (전시)":""));
    document.getElementById('cpt').textContent=won(clickPower());
    const r=RANKS[S.rankIdx];
    document.getElementById('rankName').textContent=r.name;
    document.getElementById('rankEmoji').textContent=r.emoji;
    document.getElementById('tapSub').textContent=TAP_SUB[Math.min(S.rankIdx,TAP_SUB.length-1)];
    const sv=stars();let sh='';for(let i=0;i<5;i++)sh+='<span class="star'+(i<sv?' on':'')+'">★</span>';
    document.getElementById('stars').innerHTML=sh;
    const hn=document.getElementById('heatNum');if(hn){hn.textContent=Math.floor(S.heat)+' / 100';hn.className='heatnum'+(S.heat>=80?' danger':(S.heat>=20?' hi':''));}
    document.body.classList.toggle('high-heat',S.heat>=80);
    const pp=document.getElementById('prestigePip');
    if(pp){if(S.prestige>0){pp.style.display='block';pp.textContent='★'+S.prestige+(prestigeTitle()?' '+prestigeTitle():'');}else pp.style.display='none';}
    const ll=layingLow();
    document.getElementById('layLowBtn').disabled=ll||S.heat<1;
    document.getElementById('lowSub').textContent=ll?Math.ceil((S.layLowUntil-Date.now())/1000)+"s OFF":"수배 -40% · 10s OFF";
    document.getElementById('bribeSub').textContent=won(bribeCost())+" · CLEAR HEAT";
    document.getElementById('bribeBtn').disabled=S.heat<1||S.cash<bribeCost();
    const pb=document.getElementById('policeBtn');
    if(pb){const fee=rps()*POLICE.cut;pb.classList.toggle('on',S.policePay);
      pb.querySelector('.sub').textContent=S.policePay?('상납중 · -'+won(fee)+'/s · 수배억제'):('OFF · -'+Math.round(POLICE.cut*100)+'%/s로 수배 억제');}
    
    const opsActive=S.ops.some(Boolean);
    if(opsActive!==_lastOpsActive){
      _lastOpsActive=opsActive;
      const ot=document.querySelector('.tab[data-tab="ops"]');
      if(ot){const base=ot.getAttribute('data-base')||ot.textContent;ot.setAttribute('data-base',base);ot.innerHTML=base+(opsActive?'<span class="dot"></span>':'');}
    }
  }

  function bizUnlocked(i){return i===0||S.biz[i-1]>=BIZ[i].unlock||S.biz[i]>0;}
  function tapUnlocked(i){return i===0||S.tapup[i-1]>=TAPUP[i].unlock||S.tapup[i]>0;}

  function renderPanel(){
    const p=document.getElementById('panel');
    if(S.tab==='biz'){
      let h='<div class="list">';
      BIZ.forEach((b,i)=>{const c=bizCost(i),af=S.cash>=c,lk=!bizUnlocked(i);
        const dirty=b.heat>0?'<span class="dirty">· 수배도 +'+b.heat.toFixed(2)+'/s</span>':'<span style="color:var(--money)">· 합법적 수익</span>';
        h+='<div class="item '+(af?'afford':'')+(lk?' locked':'')+'" data-biz="'+i+'"><div class="emoji">'+(lk?'🔒':b.emoji)+'</div>'+
           '<div class="body"><div class="nm">'+(lk?'[CLASSIFIED]':b.name)+(S.biz[i]>0?'<span class="cnt">Lv.'+S.biz[i]+'</span>':'')+'</div>'+
           '<div class="dsc">'+(lk?'선행 비즈니스 요구됨':'개당 +'+won(b.rps)+'/s '+dirty)+'</div></div>'+
           '<div class="buy"><div class="costlbl">COST</div><div class="cost '+(af?'':'no')+'">'+won(c)+'</div></div></div>';});
      h+='</div>';
      // ── HUSTLE 강화(구 업그레이드 탭) — 비즈니스 안으로 편입 ──
      h+='<div class="crewsub">✋ HUSTLE 강화 · TAP UPGRADE<span class="crewsub-r">탭당 '+won(clickPower())+'</span></div><div class="list">';
      TAPUP.forEach((t,i)=>{const c=tapCost(i),af=S.cash>=c,lk=!tapUnlocked(i);
        h+='<div class="item '+(af?'afford':'')+(lk?' locked':'')+'" data-tap="'+i+'"><div class="emoji">'+(lk?'🔒':t.emoji)+'</div>'+
           '<div class="body"><div class="nm">'+(lk?'[CLASSIFIED]':t.name)+(S.tapup[i]>0?'<span class="cnt">Lv.'+S.tapup[i]+'</span>':'')+'</div>'+
           '<div class="dsc">'+(lk?'선행 업그레이드 요구됨':'HUSTLE 효율 +'+won(t.add))+'</div></div>'+
           '<div class="buy"><div class="costlbl">COST</div><div class="cost '+(af?'':'no')+'">'+won(c)+'</div></div></div>';});
      h+='</div>';
      p.innerHTML=h;
    } else if(S.tab==='ops'){
      let h='<div class="list">';
      OPS.forEach((o,i)=>{
        const lk=!opUnlocked(i),run=S.ops[i],ch=opChance(i),cls=ch>=0.7?'hi':ch>=0.5?'mid':'lo';
        h+='<div class="item op"><div class="top"><div class="emoji">'+(lk?'🔒':o.emoji)+'</div>'+
           '<div class="body"><div class="nm">'+(lk?'[LOCKED OP]':o.name)+'</div>'+
           '<div class="dsc">'+(lk?'['+RANKS[o.unlock].name+'] 랭크 요구됨':'EST. PAYOUT: '+won(o.min)+'~'+won(o.max)+'<br>수배도 +'+o.heat+(o.cost>0?' · 준비금 '+won(o.cost):''))+'</div></div>'+
           '<div class="chance"><div class="pc '+cls+'">'+Math.round(ch*100)+'%</div><div class="pl">WIN RATE</div></div></div>';
        if(lk){ /* nothing */ }
        else if(run){const rem=Math.max(0,(run.endAt-Date.now())/1000),pct=100*(1-rem/run.dur);
          h+='<div class="progress"><div class="pbar"><i style="width:'+pct.toFixed(1)+'%"></i></div><div class="ptxt">IN PROGRESS... '+rem.toFixed(0)+'s LEFT</div></div>';}
        else{const af=S.cash>=o.cost;h+='<button class="runbtn" data-op="'+i+'" '+(af?'':'disabled')+'>'+(o.cost>0?'준비금 '+won(o.cost)+' 지불 후 실행':'작전 실행')+'</button>';}
        h+='</div>';
      });
      p.innerHTML=h+'</div>';
    } else if(S.tab==='mkt'){
      if(!mktUnlocked()){p.innerHTML='<div class="item locked" style="justify-content:center;text-align:center;padding:40px"><div><div style="font-size:40px;margin-bottom:10px;">🔒</div><div class="nm" style="justify-content:center;font-size:16px;">NETWORK OFFLINE</div><div class="dsc" style="margin-top:10px;">['+RANKS[2].name+'] 신분에 도달해야<br>브로커가 접선해 옵니다</div></div></div>';}
      else{
        const m=S.mkt,up=m.hist.length>1&&m.price>=m.hist[m.hist.length-2];
        const pl=(m.price-m.avgCost)*m.units;
        let warBanner='';
        if(S.mktWar){
          const r=mktWarRival(),who=(r&&r.known)?r.name:'정체불명의 큰손';
          const left=Math.max(0,Math.ceil((S.mktWar.until-Date.now())/1000));
          const pump=S.mktWar.mode==='pump';
          warBanner='<div class="mkt-war '+(pump?'pump':'dump')+'"><div class="mw-top"><span class="mw-tag">'+(pump?'📈 매집 작전':'📉 덤핑 작전')+'</span><span class="mw-who">'+who+'</span><span class="mw-cd">'+left+'s</span></div>'+
            '<div class="mw-desc">'+(pump?'시세를 끌어올리는 중 — <b>끝나는 순간 폭락</b>한다. 지금 팔고 빠질지, 더 오를지 도박.':'저점을 만드는 중 — <b>끝나면 반등</b>. 지금이 매집 기회일 수 있다.')+'</div></div>';
        }
        p.innerHTML=
          '<div class="mkt"><div class="mkt-head"><div class="mkt-name">DARK WEB MARKET<span class="tag">REAL-TIME PRICE FLUCTUATION</span></div>'+
          '<div class="mkt-price"><div class="v '+(up?'up':'down')+'">'+won(m.price)+'</div><div class="tr" style="color:'+(up?'var(--money)':'var(--heat)')+'">'+(up?'▲ TREND UP':'▼ TREND DOWN')+'</div></div></div>'+
          warBanner+
          sparkline(m.hist)+
          '<div class="mkt-grid"><div class="mc"><div class="k">INVENTORY</div><div class="v">'+fmt(m.units)+' EA</div></div>'+
          '<div class="mc"><div class="k">AVG COST</div><div class="v">'+won(m.avgCost)+'</div></div>'+
          '<div class="mc"><div class="k">PNL (UNREALIZED)</div><div class="v" style="color:'+(pl>=0?'var(--money)':'var(--heat)')+'">'+(pl>=0?'+':'-')+won(Math.abs(pl))+'</div></div></div>'+
          '<div class="mkt-actions"><div class="mkt-row">'+
          '<button class="mbtn buy" data-mbuy="10">+10 BUY</button>'+
          '<button class="mbtn buy" data-mbuy="100">+100 BUY</button>'+
          '<button class="mbtn buy" data-mbuymax="1">MAX BUY</button></div>'+
          '<div class="mkt-row">'+
          '<button class="mbtn sell" data-msell="0.5" '+(m.units<=0?'disabled':'')+'>50% SELL</button>'+
          '<button class="mbtn sell" data-msell="1" '+(m.units<=0?'disabled':'')+'>100% SELL</button></div></div>'+
          '<div class="mkt-warn">대량 매도는 <b>경찰의 감시망(수배도)</b>을 급격히 자극합니다.</div></div>';
      }
    } else if(S.tab==='crew'){
      const cp=combatPower();
      let h='<div class="combathdr"><div><div class="lbl">조직 전투력</div><div style="font-size:10px;color:var(--muted);margin-top:2px">조직원 '+crewCount()+'명 · 자릿세 <span style="color:var(--money)">+'+won(crewIncome())+'/s</span> · 단속 경호</div></div>'+
            '<div class="val">'+fmt(cp)+'</div></div>';
      h+='<div class="crewsub">조직원 고용 · RECRUIT</div><div class="list">';
      CREW.forEach((c,i)=>{const cost=crewCost(i),af=S.cash>=cost,lk=!crewUnlocked(i);
        h+='<div class="item '+(af?'afford':'')+(lk?' locked':'')+'" data-crew="'+i+'"><div class="emoji glyph" style="color:var(--gold)">'+(lk?'⊘':c.emoji)+'</div>'+
           '<div class="body"><div class="nm">'+(lk?'[CLASSIFIED]':c.name)+(S.crew[i]>0?'<span class="cnt">x'+S.crew[i]+'</span>':'')+'</div>'+
           '<div class="dsc">'+(lk?'선행 조직원 요구됨':'전투력 +'+fmt(c.power)+' / 1명')+'</div></div>'+
           '<div class="buy"><div class="costlbl">HIRE</div><div class="cost '+(af?'':'no')+'">'+won(cost)+'</div></div></div>';});
      h+='</div>';
      h+='<div class="crewsub">패싸움 · TURF WAR</div><div class="list">';
      GANGS.forEach((g,i)=>{const chance=cp<=0?0:Math.max(0.05,Math.min(0.95,cp/(cp+g.power)));
        const cls=chance>=0.7?'hi':chance>=0.4?'mid':'lo';
        h+='<div class="item op"><div class="top"><div class="emoji glyph" style="color:var(--heat)">'+g.emoji+'</div>'+
           '<div class="body"><div class="nm">'+g.name+'</div>'+
           '<div class="dsc">적 전투력 '+fmt(g.power)+' · 보상 '+won(g.min)+'~'+won(g.max)+'<br>수배도 +'+g.heat+' · 패배 시 조직원 부상</div></div>'+
           '<div class="chance"><div class="pc '+cls+'">'+Math.round(chance*100)+'%</div><div class="pl">WIN ODDS</div></div></div>'+
           '<button class="runbtn" data-gang="'+i+'" '+(cp<=0?'disabled':'')+'>'+(cp<=0?'조직원이 없습니다':'⚔ 패싸움 시작')+'</button></div>';});
      h+='</div>';
      p.innerHTML=h;
    } else if(S.tab==='war'){
      ensureRivals();
      const cp=combatPower(),locked=S.rankIdx<WARLORD.minRank;
      if(locked){
        p.innerHTML='<div class="item locked" style="justify-content:center;text-align:center;padding:40px"><div><div style="font-size:40px;margin-bottom:10px;">🏴</div><div class="nm" style="justify-content:center;font-size:16px;">세력들이 아직 당신을 주목하지 않는다</div><div class="dsc" style="margin-top:10px;">['+RANKS[WARLORD.minRank].name+'] 신분에 오르면<br>라이벌 군벌들이 움직이기 시작합니다</div></div></div>';
      } else {
        const dom=playerDominance(),suppressed=Date.now()<S.warSuppressUntil,warTime=Math.max(0,Math.ceil((S.warSuppressUntil-Date.now())/1000));
        const ref=playerRef();
        let warn='';
        const hotCnt=S.rivals.filter(r=>Date.now()>=r.truceUntil&&r.hostility>=65).length;
        const waryCnt=S.rivals.filter(r=>Date.now()>=r.truceUntil&&r.hostility>=40&&r.hostility<65).length;
        const truceCnt=S.rivals.filter(r=>Date.now()<r.truceUntil).length;
        const warCnt=S.rivals.filter(r=>r.state==='war').length;
        if(hotCnt>=2)warn='<div class="wl-alert">⚠ '+hotCnt+'개 세력이 당신을 적대 중 — <b>연합</b> 결성 위험</div>';
        else if(suppressed)warn='<div class="wl-alert">🔥 전시 상태 — 수익 -'+Math.round(WARLORD.warSuppress*100)+'% ('+warTime+'s 남음)</div>';
        if(S.mktWar){const mr=mktWarRival();warn+='<div class="wl-alert mkt">📊 암시장 '+(S.mktWar.mode==='pump'?'매집':'덤핑')+' 작전 진행 중'+((mr&&mr.known)?' — '+mr.name:'')+' · 블랙마켓 탭 확인</div>';}
        const ollBadge=ollamaOnline===true?'<span class="oll on">🟢 LLM 생성 중 · '+OLLAMA.model+'</span>':ollamaOnline===false?'<span class="oll off">⚪ LLM 서버 오프라인 · 폴백 대사</span>':'<span class="oll">⏳ LLM 확인 중…</span>';
        const rel='<div class="wl-rel">관계 — <b class="up">적대 '+hotCnt+'</b> · 경계 '+waryCnt+' · <b class="down">휴전 '+truceCnt+'</b>'+(warCnt?' · <b class="up">전쟁 '+warCnt+'</b>':'')+'</div>';
        const turfBar=renderTurfMap();
        betClamp();
        const betBar='<div class="duel-betbar"><span class="db-lbl">🃏 판돈</span>'+
          '<button class="mbtn" data-bet="0.1">/10</button>'+
          '<b class="db-amt">'+won(S.bet)+'</b>'+
          '<button class="mbtn" data-bet="10">x10</button>'+
          '<button class="mbtn" data-bet="max">ALL IN</button></div>';
        let h='<div class="wl-head"><div><div class="lbl">정세판 · THREAT BOARD</div><div class="wl-sub">내 전투력 <b style="color:var(--cyan)">'+fmt(cp)+'</b> · 우위지수 <b style="color:'+(dom>WARLORD.coalitionDom?'var(--heat)':'var(--gold)')+'">×'+dom.toFixed(2)+'</b></div></div>'+ollBadge+'</div>'+turfBar+warn+rel+betBar;
        h+='<div class="list" style="margin-top:8px">';
        S.rivals.slice().sort((a,b)=>b.hostility-a.hostility).forEach(r=>{
          const a=ARCH[r.archetype],ratio=r.power/Math.max(1,cp);
          const hostCol=r.hostility>=70?'var(--heat)':r.hostility>=40?'var(--gold)':'var(--muted)';
          const stBadge=r.state==='war'?'<span class="wl-st war">전쟁</span>':Date.now()<r.truceUntil?'<span class="wl-st truce">휴전</span>':r.hostility>=70?'<span class="wl-st war">적대</span>':r.hostility>=40?'<span class="wl-st threat">경계</span>':'<span class="wl-st">평시</span>';
          const powCol=ratio>1.1?'var(--heat)':ratio>0.8?'var(--gold)':'var(--money)';
          const tr=r.trend>0?'<span class="wl-tr up">▲</span>':r.trend<0?'<span class="wl-tr down">▼</span>':'<span class="wl-tr">▬</span>';
          const last=(r.log&&r.log[0])?r.log[0]:null;
          const lastLine=last?'<div class="wl-recent"><span class="dot '+(last.dir==='+'?'up':last.dir==='-'?'down':'')+'"></span>'+last.text+'</div>':'';
          const intel=r.known
            ? '<div class="wl-intel">금고 '+won(r.treasury)+' · 다음 수: <b style="color:var(--heat)">'+predictAct(r)+'</b></div>'+
              ((r.log&&r.log.length)?'<div class="wl-log">'+r.log.slice(0,3).map(e=>'<div class="'+(e.dir==='+'?'up':e.dir==='-'?'down':'')+'">· '+e.text+'</div>').join('')+'</div>':'')
            : '<div class="wl-intel dim">금고/다음 수 — 🔒 정보 미확보</div>';
          h+='<div class="wl-card"><div class="wl-row1"><div class="wl-emoji glyph" style="color:'+(a.emoji==='💼'?'var(--gold)':'var(--heat)')+'">'+a.emoji+'</div>'+
             '<div style="flex:1;min-width:0"><div class="wl-name">'+r.name+' '+stBadge+'</div><div class="wl-arch">'+a.desc+'</div><div class="wl-arch2">세력 '+fmt(r.power)+' <span style="color:'+powCol+'">(나의 ×'+ratio.toFixed(2)+')</span></div></div></div>'+
             '<div class="wl-bars"><div class="wl-bk">적개심</div><div class="wl-bar"><i style="width:'+r.hostility+'%;background:'+hostCol+'"></i></div><div class="wl-bv" style="color:'+hostCol+'">'+Math.round(r.hostility)+tr+'</div></div>'+
             '<div class="wl-bars"><div class="wl-bk">신뢰</div><div class="wl-bar"><i style="width:'+(r.credibility||50)+'%;background:var(--money)"></i></div><div class="wl-bv" style="color:var(--money)">'+Math.round(r.credibility||50)+'</div></div>'+
             lastLine+intel+
             '<div class="wl-acts"><button class="wl-btn safe" data-diplo="'+r.id+'"'+((r.state==='war'||Date.now()<(r.diploCoolUntil||0))?' disabled':'')+'>'+(Date.now()<(r.diploCoolUntil||0)?('협상 '+Math.ceil(((r.diploCoolUntil||0)-Date.now())/1000)+'s'):'🕊 협상')+'</button>'+
             '<button class="wl-btn safe" data-bribe="'+r.id+'">매수</button>'+
             '<button class="wl-btn" data-incite="'+r.id+'">이간</button>'+
             (r.known?'':'<button class="wl-btn" data-intel="'+r.id+'">정보</button>')+
             (r.state==='war'?'':'<button class="wl-btn gold" data-duel="'+r.id+'">🃏 판돈</button>')+
             '<button class="wl-btn danger" data-preempt="'+r.id+'">선제공격</button></div></div>';
        });
        h+='</div><div class="mkt-warn" style="margin-top:10px"><b>🃏 판돈 대결</b>로 라이벌 금고를 직접 뜯으세요 — 이기면 적개심이 오르고, 지면 상대가 커집니다. 모사꾼은 블러프에 능하고(불리), 장사꾼은 큰 판을 피합니다(유리). <b>독주하면 연합</b>이 결성되니 매수·이간으로 시간을 벌고 <b>선제공격</b>으로 싹을 자르세요.</div>';
        p.innerHTML=h;
      }
    } else { // stat
      const next=RANKS[Math.min(S.rankIdx+1,RANKS.length-1)],isMax=S.rankIdx>=RANKS.length-1,cur=RANKS[S.rankIdx];
      const prog=isMax?100:Math.min(100,(S.totalEarned-cur.at)/(next.at-cur.at)*100);
      let owned=0;S.biz.forEach(c=>owned+=c);
      const winrate=S.opsRun>0?Math.round(S.opsWin/S.opsRun*100):0;
      ensureGuOwn();const gc=guCounts(),tbonus=Math.round((turfMult()-1)*100);
      const pm=prestigeMult(),pend=pendingNotoriety(),can=canPrestige();
      const pbox='<div class="prestige-box"><div class="pb-title">⛓ 자수 &amp; 재기 · PRESTIGE</div>'+
        '<div class="pb-row"><span class="pb-k">악명 NOTORIETY</span><span class="pb-v gold">'+fmt(S.notoriety)+'</span></div>'+
        '<div class="pb-row"><span class="pb-k">영구 수익 배수</span><span class="pb-v gold">×'+pm.toFixed(2)+'</span></div>'+
        '<div class="pb-row"><span class="pb-k">전과</span><span class="pb-v">'+S.prestige+'범'+(prestigeTitle()?' · '+prestigeTitle():'')+'</span></div>'+
        '<button class="prestige-btn" data-prestige="1" '+((can&&pend>0)?'':'disabled')+'>'+
        ((can&&pend>0)?'자수하고 전설로 — 악명 +'+fmt(pend)+' (+'+(pend*3)+'%)':'자수 조건: 누적 수익 '+won(PRESTIGE_REQ)+' 이상')+'</button></div>';
      p.innerHTML=pbox+'<div class="stats">'+
        '<div class="stat"><div class="k">TOTAL REVENUE</div><div class="v gold">'+won(S.totalEarned)+'</div></div>'+
        '<div class="stat"><div class="k">INCOME / SEC</div><div class="v money">'+won(rps())+'</div></div>'+
        '<div class="stat"><div class="k">INCOME / TAP</div><div class="v cyan">'+won(clickPower())+'</div></div>'+
        '<div class="stat"><div class="k">HEAT GENERATION</div><div class="v heat">'+heatRate().toFixed(2)+'/s</div></div>'+
        '<div class="stat"><div class="k">BUSINESS OWNED</div><div class="v">'+owned+' EA</div></div>'+
        '<div class="stat"><div class="k">POLICE RAIDS</div><div class="v heat">'+S.raids+' TIMES</div></div>'+
        '<div class="stat"><div class="k">OPS SUCCESS RATE</div><div class="v cyan">'+winrate+'%</div></div>'+
        '<div class="stat"><div class="k">BLACK MARKET TRADES</div><div class="v">'+fmt(S.mkt.bought)+'/'+fmt(S.mkt.sold)+'</div></div>'+
        '<div class="stat"><div class="k">DUEL WIN RATE</div><div class="v cyan">'+(S.duelPlayed>0?Math.round(S.duelWins/S.duelPlayed*100):0)+'% ('+fmt(S.duelWins)+'/'+fmt(S.duelPlayed)+')</div></div>'+
        '<div class="stat"><div class="k">DUEL NET</div><div class="v" style="color:'+(S.duelNet>=0?'var(--money)':'var(--heat)')+'">'+(S.duelNet>=0?'+':'-')+won(Math.abs(S.duelNet))+'</div></div>'+
        '<div class="stat"><div class="k">COMBAT POWER</div><div class="v heat">'+fmt(combatPower())+'</div></div>'+
        '<div class="stat"><div class="k">TURF WARS (W/T)</div><div class="v">'+fmt(S.gangWins)+'/'+fmt(S.gangFights)+'</div></div>'+
        '<div class="stat"><div class="k">DISTRICTS OWNED</div><div class="v cyan">'+gc.me+' / 25</div></div>'+
        '<div class="stat"><div class="k">TURF INCOME BONUS</div><div class="v money">+'+tbonus+'%</div></div>'+
        '<div class="stat"><div class="k">BIG DECISIONS</div><div class="v gold">'+fmt(S.choiceEvents)+'</div></div>'+
        '<div class="progressbox"><div class="k"><span>'+cur.name+'</span><span>'+(isMax?'MAXIMUM RANK':next.name+' 까지')+'</span></div>'+
        '<div class="bar"><i style="width:'+prog+'%"></i></div></div></div>';
      // 라이벌 정세 요약 (정세판에서 걷어낸 상세 데이터를 여기로 집약)
      if(S.rankIdx>=WARLORD.minRank&&S.rivals.length){
        const cp2=combatPower();
        let rt='<div class="crewsub">🏴 라이벌 정세 · INTEL<span class="crewsub-r">정보 매수 시 금고·다음수 공개</span></div><div class="riv-table">';
        rt+='<div class="riv-row riv-head"><span>세력</span><span>적개심</span><span>세력비</span><span>금고</span><span>다음 수</span></div>';
        S.rivals.slice().sort((a,b)=>b.hostility-a.hostility).forEach(r=>{
          const a=ARCH[r.archetype],ratio=(r.power/Math.max(1,cp2)).toFixed(2);
          const hc=r.hostility>=70?'var(--heat)':r.hostility>=40?'var(--gold)':'var(--muted)';
          const st=r.state==='war'?' 🔥':Date.now()<r.truceUntil?' 🕊':'';
          rt+='<div class="riv-row"><span class="rv-n">'+a.emoji+' '+r.name+st+'</span>'+
            '<span style="color:'+hc+'">'+Math.round(r.hostility)+'</span>'+
            '<span>×'+ratio+'</span>'+
            '<span>'+(r.known?won(r.treasury):'🔒')+'</span>'+
            '<span>'+(r.known?predictAct(r):'🔒')+'</span></div>';
        });
        rt+='</div>';
        p.innerHTML+=rt;
      }
    }
  }
  // ==================== 온보딩 · 목표 추적기 ====================
  const TUT=[
    {t:'길거리로 나서라',h:'HUSTLE 버튼을 눌러 첫 푼돈을 구걸하세요.',target:'#tapBtn',reward:50,done:()=>S.totalEarned>=80},
    {t:'첫 벌이 수단',h:"'비즈니스' 탭에서 \u2018깡통 구걸\u2019을 사면 가만히 있어도 돈이 들어옵니다.",target:'#panel',reward:120,done:()=>S.biz.reduce((a,b)=>a+b,0)>=1},
    {t:'잠들어도 돈이 든다',h:'이제 초당 수익이 자동으로 쌓입니다. 잠시 지켜보세요.',target:null,reward:200,done:()=>S.totalEarned>=600},
    {t:'바닥에서 한 칸',h:'누적 ₩500을 넘기면 \u2018거지\u2019로 승급합니다.',target:null,reward:0,done:()=>S.rankIdx>=1},
    {t:'몸집을 불려라',h:'사업을 더 사들여 수익을 키우세요. (사업 총 3개)',target:'#panel',reward:800,done:()=>S.biz.reduce((a,b)=>a+b,0)>=3},
    {t:'거리의 양아치',h:"누적 ₩18,000으로 \u2018양아치\u2019에 오르면\u2026 누군가 당신을 주목하기 시작합니다.",target:null,reward:0,done:()=>S.rankIdx>=2},
    {t:'적이 깨어났다',h:"라이벌 군벌이 움직입니다. \u2018세력 다툼\u2019 탭을 열어 정세를 확인하세요.",target:'.tab[data-tab="war"]',reward:5000,done:()=>S.rankIdx>=2&&S.tab==='war'},
  ];
  let _coachEl=null;
  function setCoach(sel){
    if(_coachEl){_coachEl.classList.remove('coach');_coachEl=null;}
    if(sel){const el=document.querySelector(sel);if(el){el.classList.add('coach');_coachEl=el;}}
  }
  function renderQuest(){
    const q=document.getElementById('quest');if(!q)return;
    if(S.tutDone||S.tutStep>=TUT.length){q.innerHTML='';q.style.display='none';setCoach(null);return;}
    const s=TUT[S.tutStep];
    q.style.display='block';
    q.innerHTML='<div class="quest-card"><div class="quest-k">현재 목표 <span class="quest-step">'+(S.tutStep+1)+' / '+TUT.length+'</span></div>'+
      '<div class="quest-t">'+s.t+'</div><div class="quest-h">'+s.h+'</div></div>';
    setCoach(s.target);
  }
  function tutCheck(){
    if(S.tutDone||S.tutStep>=TUT.length)return;
    const s=TUT[S.tutStep];
    if(s.done()){
      if(s.reward>0){earn(s.reward);flashToast('good','✅ 목표 달성',s.t+' — 보상 +'+won(s.reward));}
      S.tutStep++;
      if(S.tutStep>=TUT.length){S.tutDone=true;flashToast('good','🎓 튜토리얼 완료','이제 길거리는 당신의 무대다');}
      renderQuest();
    }
  }

  let panelDirty=true;                       // 패널 재렌더 필요 여부
  let _lastOpsActive=null;                    // 작전 탭 점(dot) 캐시
  function markDirty(){panelDirty=true;}
  function render(){renderTop();panelDirty=true;}