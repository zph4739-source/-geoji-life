"use strict";
/* ====================================================================
   거지 라이프: 길거리의 제왕 — 라이벌 AI 군벌 · Ollama 대사 · 협상/전략 · 서울 점령도 인터랙션
   ※ 이 파일들은 하나의 공유 전역 스코프에서 동작합니다.
     index.html 의 <script> 로드 순서: data → core → economy → rivals → ui → main
   ==================================================================== */

  // ==================== 라이벌 AI 군벌 시스템 (하이브리드 · 가혹) ====================
  const WARLORD={
    aggression:'HARSH',
    rivalCount:3,
    minRank:2,              // 양아치부터 라이벌이 주목
    hostBase:0.9,           // 기본 적개심 상승/틱
    hostDominance:1.6,      // 우위일 때 추가 상승
    powerGrowth:0.05,       // 라이벌 세력 성장/틱
    powerFloor:0.9,         // 플레이어 기준전력 대비 최소 비율(러버밴딩)
    raidLoss:0.12,          // 약탈 현금 손실
    warLoss:0.25,           // 전쟁 패배/항복 현금 손실
    warSuppress:0.4,        // 전쟁 패배 시 수익 -40%
    warSuppressMs:120000,   // 2분
    coalitionDom:1.4,       // 연합 발동 우위 임계
    tributeCut:0.10,        // 상납/매수 비용 = 현금×10%
    intelCost:0.05,         // 정보 비용 = 현금×5%
    inciteCost:0.06,        // 이간 비용 = 현금×6%
    tickMs:3000,            // AI 의사결정 주기(ms) — 작을수록 라이벌이 자주 움직임
    // ── 관계·신뢰 시스템 ──
    raidGate:70,            // 이 적개심 이상(적대)에서만 무단 약탈 · 그 아래는 협상 가능한 '요구'
    credStart:50,           // 신뢰도 시작값
    diploCoolMs:40000,      // 친선/협상 재시도 쿨다운
    diploTruceMs:45000,     // 협상 성공 시 휴전 시간
  };
  // ── 로컬 LLM(Ollama) 설정 — 켜져 있으면 실시간 대사 생성, 아니면 폴백 ──
  const OLLAMA={
    enabled:true,
    url:'https://geoji-llm-proxy.USERNAME.workers.dev',   // ★ 배포 후 실제 Worker 주소로 교체
    model:'Llama-3.3-70B · Groq',       // 배지 표시용 라벨 (실제 모델은 Worker가 결정)
    timeoutMs:7000,                     // 응답 제한 (초과 시 폴백 유지)
    temperature:0.9,
    numPredict:60,                      // 생성 토큰 상한 (짧은 한 줄 대사)
  };
  let ollamaOnline=null;                 // null=미확인, true/false=핑 결과
  const ARCH={
    raider:   {name:'약탈자',emoji:'🩸',desc:'피와 돈만 아는 길거리 약탈자',w:{taunt:1,tribute:2,raid:5,sabotage:1,war:1}},
    conqueror:{name:'정복자',emoji:'⚔',desc:'도시를 깃발로 덮으려는 정복자',w:{taunt:1,tribute:1,raid:2,sabotage:1,war:5}},
    schemer:  {name:'모사꾼',emoji:'🐍',desc:'정보와 함정으로 노는 그림자',w:{taunt:2,tribute:1,raid:2,sabotage:5,war:1}},
    broker:   {name:'장사꾼',emoji:'💼',desc:'모든 걸 값으로 매기는 냉혈한',w:{taunt:1,tribute:5,raid:1,sabotage:2,war:1}},
  };
  const RIVAL_NAMES=['독사','강철','붉은손','그림자','백상','녹슨칼','한밤','독수리','검은입','쇠막대','잿더미','외눈'];
  const ACT_LABEL={taunt:'도발',tribute:'상납 요구',raid:'약탈',sabotage:'사보타주',war:'선전포고'};

  // 미리 준비된 폴백 대사 ({p}=플레이어 신분)
  const RIVAL_LINES={
    raider:{taunt:['{p} 주제에 돈 좀 만졌다며? 곧 찾아가지.','네 금고가 곧 내 거다.'],
      tribute:['목숨값으로 알아서 바쳐라.','피 보기 전에 돈을 내놔.'],
      raid:['','',''], war:['털어서 안 나오면 묻어주마.','전쟁? 네 장례식이지.'], truce:['이번만 봐준다.'], coalition:['혼자선 못 당하지?']},
    conqueror:{taunt:['이 도시는 내가 먹는다. 비켜라.','왕은 하나면 충분해.'],
      tribute:['무릎 꿇고 충성을 바쳐라.','내 깃발 아래 들어오든가.'],
      raid:['','',''], war:['전면전이다. 각오해라.','네 구역을 깃발로 덮겠다.'], truce:['항복을 받아주지.'], coalition:['연합군 앞에 무릎 꿇어라.']},
    schemer:{taunt:['경찰이 네 얘길 아주 궁금해하던데.','뒤를 조심해. 늘.'],
      tribute:['조용히 봉투 하나면 다 묻어주지.','정보값은 비싸다.'],
      raid:['','',''], war:['넌 이미 포위됐어.','함정은 벌써 깔렸다.'], truce:['거래는 거래니까.'], coalition:['모두가 널 노린다는 거, 알았어?']},
    broker:{taunt:['시장 물 흐리지 마라.','네 장사, 오래 못 간다.'],
      tribute:['자릿세 밀렸다. 정산하자.','보호비는 선불이야.'],
      raid:['','',''], war:['값을 못 치르면 피로 갚아야지.','적대적 인수에 들어간다.'], truce:['손해 보는 장사는 안 하지.'], coalition:['컨소시엄이 널 정리한다.']},
    _def:{taunt:['건방진 놈.'],tribute:['돈 내놔.'],raid:[''],war:['전쟁이다.'],truce:['휴전하지.'],coalition:['연합이다.']},
  };
  function fallbackLine(r,sit){
    const a=(RIVAL_LINES[r.archetype]&&RIVAL_LINES[r.archetype][sit]&&RIVAL_LINES[r.archetype][sit].length)?RIVAL_LINES[r.archetype][sit]:RIVAL_LINES._def[sit]||[''];
    return (a[Math.floor(Math.random()*a.length)]||'').replace('{p}',RANKS[S.rankIdx].name);
  }
  // 로컬 LLM 대사 (Ollama가 켜져 있으면 실시간 생성 · 실패하면 폴백 유지)
  async function pingOllama(){
    if(!OLLAMA.enabled){ollamaOnline=false;return false;}
    try{
      const ctrl=new AbortController();const t=setTimeout(()=>ctrl.abort(),2500);
      const res=await fetch(OLLAMA.url+'/api/tags',{signal:ctrl.signal});
      clearTimeout(t);ollamaOnline=res.ok;
    }catch(e){ollamaOnline=false;}
    return ollamaOnline;
  }
  async function llmLine(r,sit){
    if(!OLLAMA.enabled)throw new Error('off');
    const a=ARCH[r.archetype];
    const sd={taunt:'플레이어를 도발·협박한다',tribute:'상납(돈)을 요구한다',war:'전면 선전포고를 한다',truce:'휴전을 제안한다',coalition:'다른 세력과 연합해 선전포고를 한다'}[sit]||'위협한다';
    const sys='너는 한국 누아르 범죄 세계의 라이벌 보스다. 이름 "'+r.name+'", 성향 "'+a.name+'". 거칠고 위협적인 뒷골목 말투로, 짧은 한 줄 대사만 출력한다. 따옴표·해설·이모지·줄바꿈 금지. 40자 이내.';
    const prompt='상대는 "'+RANKS[S.rankIdx].name+'" 신분의 라이벌 보스다. 너는 지금 그에게 '+sd+'. 한 줄 대사:';
    const ctrl=new AbortController();const to=setTimeout(()=>ctrl.abort(),OLLAMA.timeoutMs);
    let data;
    try{
      const res=await fetch(OLLAMA.url+'/api/generate',{method:'POST',headers:{'Content-Type':'application/json'},signal:ctrl.signal,
        body:JSON.stringify({model:OLLAMA.model,system:sys,prompt,stream:false,options:{temperature:OLLAMA.temperature,num_predict:OLLAMA.numPredict}})});
      data=await res.json();
    }finally{clearTimeout(to);}
    ollamaOnline=true;
    const txt=(data&&data.response||'').trim();
    if(!txt)throw new Error('empty');
    return txt.replace(/^["'「『\s]+|["'」』\s]+$/g,'').split('\n')[0].slice(0,60);
  }
  function upgradeLine(r,sit,descId){
    let dead=false;const to=setTimeout(()=>{dead=true;},OLLAMA.timeoutMs+1000);
    llmLine(r,sit).then(line=>{if(dead||!line)return;clearTimeout(to);const el=document.getElementById(descId);if(el)el.textContent=line;})
                  .catch(()=>{clearTimeout(to);ollamaOnline=false;});
  }

  function econPower(){return Math.floor(Math.pow(Math.max(0,S.totalEarned),0.42));}
  function playerRef(){return Math.max(combatPower(),econPower(),30);}
  let lastWarAt=0;
  function playerDominance(){const avg=S.rivals.reduce((a,r)=>a+r.power,0)/Math.max(1,S.rivals.length);return combatPower()/(avg||1);}

  function makeRival(used){
    const keys=Object.keys(ARCH),ak=keys[Math.floor(Math.random()*keys.length)];
    let nm,guard=0;do{nm=RIVAL_NAMES[Math.floor(Math.random()*RIVAL_NAMES.length)];}while(used.has(nm)&&guard++<30);used.add(nm);
    const ref=playerRef();
    return {id:'r'+Date.now().toString(36)+Math.floor(Math.random()*1e4).toString(36),name:nm,archetype:ak,
      power:Math.floor(ref*(0.7+Math.random()*0.6)),treasury:Math.floor(Math.max(2000,S.cash*0.4+rps()*60)),
      hostility:rint(8,26),state:'neutral',truceUntil:0,redirect:false,known:false,targetMult:0.8+Math.random()*0.5,log:[],trend:0,
      credibility:WARLORD.credStart,diploCoolUntil:0};
  }
  function initRivals(){const used=new Set();S.rivals=[];for(let i=0;i<WARLORD.rivalCount;i++)S.rivals.push(makeRival(used));}
  function ensureRivals(){if(!Array.isArray(S.rivals)||!S.rivals.length)initRivals();}

  function rlog(r,text,dir){if(!r.log)r.log=[];r.log.unshift({text,dir:dir||''});if(r.log.length>5)r.log.pop();}
  function growRivals(){
    const ref=playerRef();
    S.rivals.forEach(r=>{
      if(r.targetMult===undefined)r.targetMult=0.8+Math.random()*0.5;     // 플레이어 대비 0.8~1.3배 밴드
      if(!r.log)r.log=[];
      const oldH=r.hostility;
      const target=Math.max(30,ref*r.targetMult);
      r.power=Math.floor(r.power+(target-r.power)*0.12+Math.random()*0.03*target); // 타깃으로 수렴(폭주 방지)
      r.treasury=Math.floor(r.treasury*1.02+Math.max(0,rps())*3);
      if(r.credibility===undefined)r.credibility=WARLORD.credStart;
      const dom=ref/(r.power||1);
      let dh=WARLORD.hostBase+(dom>1?WARLORD.hostDominance*Math.min(2,dom-1):0)+S.rankIdx*0.06;
      dh*=(1.25-r.credibility/200);           // 신뢰 높을수록 적개심 상승 완화(0.75~1.25배)
      if(Date.now()<r.truceUntil)dh=-3;
      r.hostility=Math.max(0,Math.min(100,r.hostility+dh));
      r.trend=dh>0.08?1:dh<-0.08?-1:0;
      if(oldH<40&&r.hostility>=40)rlog(r,'당신의 성장에 경계심을 품었다','+');
      else if(oldH<65&&r.hostility>=65)rlog(r,'적대 관계로 돌아섰다','+');
      else if(oldH<85&&r.hostility>=85)rlog(r,'전쟁을 벼르기 시작했다','+');
      if(Date.now()>=r.truceUntil&&r.state==='truce')r.state='neutral';
    });
  }
  function weightedPick(obj){let t=0;for(const k in obj)t+=obj[k];let x=Math.random()*t;for(const k in obj){if((x-=obj[k])<0)return k;}return Object.keys(obj)[0];}
  function actScores(r){
    const w=ARCH[r.archetype].w,h=r.hostility,ratio=r.power/Math.max(1,combatPower());
    const gate=WARLORD.raidGate;
    return {
      taunt:    w.taunt*(h<40?2:0.8),
      tribute:  w.tribute*(h>=25?1.8:0.4),          // 경계부터 협상 가능한 '요구'
      raid:     w.raid*(h>=gate?2.0:0.02),          // 관계 파탄(적대) 전엔 무단 약탈 거의 없음
      sabotage: w.sabotage*(h>=45?1.4:0.4),
      war:      w.war*(h>=88?3.2:(h>=70&&ratio>0.55)?2.4:0.05),
    };
  }
  function predictAct(r){return ACT_LABEL[weightedPick(actScores(r))];}

  // 라이벌이 중립 구를 세력권에 편입(홈 근처부터)
  function rivalExpand(){
    ensureGuOwn();
    const live=(S.rivals||[]).filter(r=>r.power>0);if(!live.length)return;
    const neu=SEOUL.filter(g=>guOwnerOf(g.n)==='neutral');if(!neu.length)return;
    const r=live[Math.floor(Math.random()*live.length)];
    // 이 라이벌 세력권 중심에 가장 가까운 중립 구 하나
    const cluster=SEOUL.filter(g=>guOwnerOf(g.n)===r.id);
    let cx=500,cy=400;if(cluster.length){cx=0;cy=0;cluster.forEach(g=>{cx+=g.cx;cy+=g.cy;});cx/=cluster.length;cy/=cluster.length;}
    const tgt=neu.slice().sort((a,b)=>Math.hypot(a.cx-cx,a.cy-cy)-Math.hypot(b.cx-cx,b.cy-cy))[0];
    if(!tgt)return;
    S.guOwn[tgt.n]=r.id;syncTurf();rlog(r,tgt.n+' 중립 구역을 흡수했다','+');
    if(document.querySelector('.seoul-modal'))refreshSeoulMap();
  }
  function aiWarlordTick(){
    if(document.getElementById('intro'))return;          // 인트로 중엔 대기
    ensureRivals();
    if(battling||eventOpen)return;                        // 모달/전투 충돌 방지
    growRivals();
    if(S.tab==='war')panelDirty=true;
    if(S.rankIdx<WARLORD.minRank)return;                  // 초반엔 잠잠
    if(mktUnlocked()&&!S.mktWar&&Math.random()<MKTWAR.startChance)startMktWar();  // 암시장 세력전 개전
    if(Math.random()<0.06)rivalExpand();                  // 라이벌 중립 구역 잠식
    // 연합: 여러 라이벌이 동시에 당신을 적대하면(=잘나가서 미움받을 때) 연합 침공
    const hot=S.rivals.filter(r=>Date.now()>=r.truceUntil&&r.hostility>=65).sort((a,b)=>b.hostility-a.hostility);
    if(!eventCooling()&&hot.length>=2&&Date.now()-lastWarAt>=45000&&Math.random()<(0.4+(playerDominance()>WARLORD.coalitionDom?0.2:0)+(S.turf>=55?0.2:0))){
      rivalCoalition(hot[0],hot[1]);return;
    }
    // 강제 에스컬레이션: 적개심이 끓는데(>=90) 한동안 전쟁이 없으면 전력비 무관하게 선전포고
    if(!eventCooling()){
      const boiling=S.rivals.filter(r=>Date.now()>=r.truceUntil&&r.hostility>=90).sort((a,b)=>b.hostility-a.hostility);
      if(boiling.length&&Date.now()-lastWarAt>=40000){rivalDeclareWar(boiling[0],false,null);return;}
    }
    const actors=S.rivals.filter(r=>Date.now()>=r.truceUntil&&Math.random()<(0.18+r.hostility/170));
    if(!actors.length)return;
    rivalAct(actors[Math.floor(Math.random()*actors.length)]);
  }
  function rivalAct(r){
    if(r.redirect){r.redirect=false;r.hostility=Math.max(0,r.hostility-10);flashToast('',ARCH[r.archetype].emoji+' '+r.name,'다른 세력과 다투느라 잠잠하다');return;}
    const pick=weightedPick(actScores(r));
    if(pick==='war'&&Date.now()-lastWarAt<35000){rivalRaid(r);return;}  // 전쟁 직후엔 약탈로 대체
    if((pick==='tribute'||pick==='war')&&eventCooling()){rivalRaid(r);return;}  // 모달 쿨다운 중엔 약탈로 대체
    if(pick==='taunt')rivalTaunt(r);
    else if(pick==='tribute')rivalDemandTribute(r);
    else if(pick==='raid')rivalRaid(r);
    else if(pick==='sabotage')rivalSabotage(r);
    else rivalDeclareWar(r,false,null);
  }

  function rivalTaunt(r){
    r.hostility=Math.min(100,r.hostility+4);rlog(r,'당신을 도발했다','');
    flashToast('bad',ARCH[r.archetype].emoji+' '+r.name+'의 도발',fallbackLine(r,'taunt'));
  }
  function rivalRaid(r){
    const cp=combatPower(),mitig=Math.min(0.78,cp/(cp+r.power));
    const loss=Math.floor(S.cash*WARLORD.raidLoss*(1-mitig));
    S.cash-=loss;r.treasury+=loss;r.hostility=Math.max(0,r.hostility-6);addHeat(6);addTurf(-2);rlog(r,'당신을 약탈했다','+');
    flashToast('bad','🩸 약탈 — '+r.name,won(loss)+' 강탈당함'+(mitig>0.12?' (경호 '+Math.round(mitig*100)+'% 방어)':' · 무방비!'));
    render();
  }
  function rivalSabotage(r){
    r.hostility=Math.max(0,r.hostility-4);rlog(r,'뒤에서 사보타주했다','+');
    if(mktUnlocked()&&Math.random()<0.5){S.mkt.price=Math.max(MKT.lo,Math.round(S.mkt.price*0.55));flashToast('bad','🐍 사보타주 — '+r.name,'가짜 물량 투하 · 암시장 시세 폭락');}
    else{addHeat(22);flashToast('bad','🐍 사보타주 — '+r.name,'경찰에 밀고 · 수배 급등');}
    render();
  }
function rivalDemandTribute(r){
    const amt=Math.max(1000,Math.floor(S.cash*WARLORD.tributeCut)),descId='rivDesc'+Date.now();
    const choices=[
      {label:'상납한다',sub:won(amt)+' 지불',cls:'safe',fn:()=>{
        if(S.cash>=amt){S.cash-=amt;r.treasury+=amt;r.hostility=Math.max(0,r.hostility-25);r.credibility=Math.min(100,(r.credibility||50)+8);r.truceUntil=Date.now()+45000;r.state='truce';rlog(r,'상납을 받아 누그러졌다 · 신뢰↑','-');flashToast('','🤝 상납',r.name+'에게 '+won(amt)+' 바침 · 신뢰 +8');}
        else{r.hostility=Math.min(100,r.hostility+15);r.credibility=Math.max(0,(r.credibility||50)-10);rlog(r,'빈손에 격분해 약탈했다','+');flashToast('bad','💢 망신',r.name+': 빈손이라고? · 약탈');rivalRaid(r);}
      }},
    ];
    choices.push({label:'직접 협상',sub:(ollamaOnline===true?'말빨(LLM)로 위기 모면':'신뢰로 담판')+' · 실패 시 약탈',cls:'accept',fn:()=>openNego(r, amt, 'tribute')});
    choices.push({label:'거부한다',sub:'신뢰 급락 · 약탈 위험',cls:'danger',fn:()=>{r.hostility=Math.min(100,r.hostility+18);r.credibility=Math.max(0,(r.credibility||50)-14);rlog(r,'상납 거부에 분노했다 · 신뢰↓','+');rivalRaid(r);}});
    showEvent({tier:'high',emoji:ARCH[r.archetype].emoji,kicker:r.name+' · '+ARCH[r.archetype].name,title:'상납 요구',
      desc:fallbackLine(r,'tribute'),descId,
      stakes:[{k:'요구액',v:won(amt),col:'var(--gold)'},{k:'적개심',v:Math.round(r.hostility),col:'var(--heat)'}],timeout:15000,
      choices,onTimeout:()=>{r.hostility=Math.min(100,r.hostility+12);rivalRaid(r);}});
    upgradeLine(r,'tribute',descId);
  }
  // 🗣️ 라이벌 협상 — 상납 방어(tribute) 또는 선제적 친선(diplo)
  //     LLM 켜지면 실시간 판정, 꺼지면 신뢰·적개심 기반 결정 판정으로 폴백
  function negoBaseChance(r, mode){
    const cred=(r.credibility||50);
    let base=0.30 + cred/250 - (r.hostility-50)/300;
    if(mode==='diplo')base+=0.10;                 // 돈을 안 걸고 관계를 다지는 쪽이 조금 더 쉬움
    return Math.max(0.08, Math.min(0.90, base));
  }
  function openNego(r, amt, mode){
    if(!r)return;
    mode = mode || 'tribute';
    eventOpen=true;                                  // 모달 중첩 방지 잠금
    const online = (OLLAMA.enabled && ollamaOnline!==false);
    const title = mode==='diplo' ? (r.name+'에게 친선 제안') : (r.name+'와(과)의 협상');
    const head  = mode==='diplo'
      ? '관계를 다져 <b style="color:var(--money)">신뢰</b>를 쌓고 적개심을 낮춥니다.<br>상대 성향에 맞게 명분을 대십시오.'
      : '요구액: <b style="color:var(--gold)">'+won(amt)+'</b><br>상대의 성향을 고려해 설득하거나 기만하십시오.';
    const ov=document.createElement('div');ov.className='evt';
    ov.innerHTML='<div class="evt-card tier-high"><div class="evt-kicker mid">'+(mode==='diplo'?'DIPLOMACY':'NEGOTIATION')+'</div>'+
      '<div class="evt-title">'+title+'</div>'+
      '<div class="evt-desc" style="margin-bottom:0">'+head+
        '<br><small style="color:var(--muted)">현재 신뢰 '+Math.round(r.credibility||50)+(online?' · 네 말의 설득력으로 판정 (LLM)':' · 예상 성공 '+Math.round(negoBaseChance(r,mode)*100)+'% · 폴백 판정')+'</small></div>'+
      '<textarea id="negoText" class="nego-input" rows="3" placeholder="예: 이번 달은 경찰이 깔렸다. 다음 달에 1.5배로 갚지."></textarea>'+
      '<button id="negoBtn" class="nego-btn">'+(mode==='diplo'?'친선 제안 보내기':'협상안 전송')+'</button>'+
      '<button id="negoCancel" class="nego-cancel">물러난다</button></div>';
    document.body.appendChild(ov);

    let closed=false;
    function closeNego(){ if(closed)return; closed=true; ov.remove(); eventOpen=false; }
    const btn = ov.querySelector('#negoBtn');
    const txt = ov.querySelector('#negoText');
    const cancel = ov.querySelector('#negoCancel');
    txt.focus();

    // 성공/실패 공통 처리 (모드별 효과)
    function resolve(isAccept, line){
      closeNego();
      if(mode==='diplo')r.diploCoolUntil=Date.now()+WARLORD.diploCoolMs;
      if(isAccept){
        if(mode==='diplo'){
          r.hostility=Math.max(0,r.hostility-16);r.credibility=Math.min(100,(r.credibility||50)+6);
          r.truceUntil=Math.max(r.truceUntil,Date.now()+Math.floor(WARLORD.diploTruceMs*0.6));r.state='truce';
          rlog(r,'친선 제안을 받아들였다 · 신뢰↑','-');flashToast('good','🤝 친선 성립',line+' · 적개심↓ 신뢰 +6');
        }else{
          r.hostility=Math.max(0,r.hostility-20);r.credibility=Math.min(100,(r.credibility||50)+4);
          r.truceUntil=Date.now()+WARLORD.diploTruceMs;r.state='truce';
          rlog(r,'협상 성공: '+line,'-');flashToast('good','🗣️ 협상 타결',line+' · 신뢰↑');
        }
      }else{
        if(mode==='diplo'){
          r.hostility=Math.min(100,r.hostility+8);r.credibility=Math.max(0,(r.credibility||50)-5);
          rlog(r,'친선 제안을 코웃음쳤다','+');flashToast('bad','🚪 문전박대',line+' · 신뢰 -5');
        }else{
          r.hostility=Math.min(100,r.hostility+20);r.credibility=Math.max(0,(r.credibility||50)-8);
          rlog(r,'협상 결렬: '+line,'+');flashToast('bad','🗣️ 협상 결렬',line+' · 약탈!');rivalRaid(r);
        }
      }
      render();
    }

    cancel.addEventListener('click', ()=>{
      closeNego();
      if(mode==='diplo'){ r.diploCoolUntil=Date.now()+Math.floor(WARLORD.diploCoolMs*0.5); flashToast('','🚪 물러남',r.name+': 다음에 얘기하지.'); }
      else{ r.hostility=Math.min(100,r.hostility+8); rlog(r,'협상장에서 발을 뺐다','+'); flashToast('','🚪 물러남',r.name+': 시간 낭비하게 만들지 마라.'); }
      render();
    });

    btn.addEventListener('click', async () => {
      const msg = txt.value.trim();
      if(!msg) return;
      btn.disabled = true; cancel.disabled = true;
      btn.textContent = "상대의 반응을 기다리는 중...";
      const cred=(r.credibility||50);
      // 신뢰가 바닥이면 말 자체가 안 통함
      if(cred<12){ resolve(false, mode==='diplo'?'네 말은 이제 아무도 안 믿어.':'신용이 바닥인 놈과 무슨 협상이냐.'); return; }

      if(online){
        const goal = mode==='diplo' ? '관계 개선을 위해 친선을 제안하며' : '상납금 요구에 대해';
        const sys = "너는 한국 누아르 세계의 보스 '"+r.name+"'이다. 성향: '"+ARCH[r.archetype].desc+"'. 협상 상대(너에 대한 신뢰도 "+Math.round(cred)+"/100)가 "+goal+" 이렇게 말했다: \""+msg+"\". 판단 기준은 오직 '이 말의 설득력'이다 — 논리가 서는지, 배짱이 있는지, 너를 납득시킬 구체적 명분이 있는지 보고 결정해라. 그럴듯하면 받아들이고, 허풍·헛소리·무례·근거 없는 소리면 거절해라. 신뢰도 숫자는 참고만 하고 말 자체를 우선해라. 반드시 'ACCEPT' 또는 'REJECT'로 시작하고 콜론 뒤에 네 성향다운 짧은 한 줄 대사를 붙여라. 예: \"ACCEPT: 논리 하나는 제법이군. 이번만 봐주지.\", \"REJECT: 그딴 헛소리로 넘어갈 줄 알았나.\"";
        const ctrl=new AbortController();const to=setTimeout(()=>ctrl.abort(),OLLAMA.timeoutMs);
        try {
          const res = await fetch(OLLAMA.url+'/api/generate', {
            method: 'POST', headers: {'Content-Type': 'application/json'}, signal: ctrl.signal,
            body: JSON.stringify({model: OLLAMA.model, prompt: sys, stream: false, options: {temperature: 0.8, num_predict: 80}})
          });
          const data = await res.json();
          clearTimeout(to); ollamaOnline=true;
          const reply = (data && data.response || '').trim();
          if(!reply) throw new Error('empty');
          let isAccept = /^\s*accept/i.test(reply);
          const line = reply.replace(/^\s*(accept|reject)\b[\s:：\-]*/i,'').trim() || reply;
          // A+C: LLM이 네 말을 읽고 내린 판단(ACCEPT/REJECT)을 그대로 존중한다 — 확률로 뒤집지 않음
          resolve(isAccept, line);
        } catch(e) {
          clearTimeout(to); ollamaOnline=false;
          // LLM이 끊기면 신뢰 기반 판정으로 폴백
          const ok = Math.random() < negoBaseChance(r,mode);
          resolve(ok, ok ? fallbackLine(r,'truce') : fallbackLine(r,'tribute'));
        }
      } else {
        // 오프라인: 신뢰·적개심 기반 결정 판정
        const ok = Math.random() < negoBaseChance(r,mode);
        setTimeout(()=>resolve(ok, ok ? fallbackLine(r,'truce') : fallbackLine(r,'tribute')), 400);
      }
    });
  }

  // 🕊 선제적 친선/협상 — 위기 전에 관계를 관리한다(쿨다운 있음)
  function diploRival(id){
    const r=S.rivals.find(x=>x.id===id);if(!r)return;
    if(r.state==='war'){flashToast('bad','⚔ 전쟁 중','전쟁 상대와는 친선이 안 된다 — 이기거나 항복하라');return;}
    if(Date.now()<(r.diploCoolUntil||0)){const sec=Math.ceil(((r.diploCoolUntil||0)-Date.now())/1000);flashToast('bad','⏳ 재협상 대기',r.name+'이(가) 아직 냉랭하다 · '+sec+'s 후 가능');return;}
    if(eventOpen||battling){flashToast('bad','⛔ 진행 중','다른 상황을 먼저 처리하세요');return;}
    openNego(r, 0, 'diplo');
  }

  function rivalDeclareWar(r,isCo,r2){
    lastWarAt=Date.now();
    r.state='war';if(isCo&&r2)r2.state='war';rlog(r,isCo?'연합을 이끌고 침공했다':'당신에게 선전포고했다','+');
    const power=isCo&&r2?(r.power+r2.power):r.power;
    const oppName=isCo&&r2?(r.name+'+'+r2.name+' 연합'):r.name;
    const cp=combatPower(),chance=Math.max(0.05,Math.min(0.95,cp/(cp+power))),descId='rivDesc'+Date.now();
    showEvent({tier:'high',emoji:isCo?'🏴':'⚔',kicker:oppName+' · 선전포고',title:isCo?'연합군의 침공':'전면 전쟁',
      desc:fallbackLine(r,isCo?'coalition':'war'),descId,
      stakes:[{k:'적 세력',v:fmt(power),col:'var(--heat)'},{k:'내 전투력',v:fmt(cp),col:'var(--cyan)'},{k:'승산',v:Math.round(chance*100)+'%',col:'var(--gold)'}],timeout:13000,
      choices:[
        {label:'맞서 싸운다',sub:'직접 지휘 — 승리 시 적 궤멸',cls:'accept',fn:()=>{runBattle({name:oppName,emoji:isCo?'🏴':'⚔',power},win=>win?winWar(r,isCo,r2):loseWar(r,isCo,r2));}},
        {label:'항복한다',sub:'현금 '+Math.round(WARLORD.warLoss*100)+'% 헌납 · 수익 정지',cls:'danger',fn:()=>warSurrender(r,isCo,r2)},
      ],onTimeout:()=>warAuto(r,power,oppName,isCo,r2,chance)});
    upgradeLine(r,isCo?'coalition':'war',descId);
  }
  function rivalCoalition(a,b){flashToast('bad','🏴 연합 결성',a.name+'와(과) '+b.name+'이(가) 당신을 노린다');rivalDeclareWar(a,true,b);}

  function rivalColor(r){const pal=['#c0392b','#8e44ad','#d68910','#16a085'];const i=S.rivals.findIndex(x=>x.id===r.id);return pal[(i<0?0:i)%pal.length];}
  function turfOwners(){
    ensureGuOwn();
    const c=guCounts();
    return {owner:S.guOwn,mine:c.me};
  }
  function renderTurfMap(){
    const o=turfOwners(),owner=o.owner,mine=o.mine;
    const rivalCnt=Object.values(owner).filter(v=>v!=='me'&&v!=='neutral').length;
    const neutralCnt=Object.values(owner).filter(v=>v==='neutral').length;
    const bonus=Math.round((turfMult()-1)*100);
    return '<div class="map-wrap"><div class="map-head"><span class="lbl">서울 점령도 · SEOUL TURF</span><b class="map-pct">'+Math.round(S.turf)+'%</b></div>'+
      '<div class="map-summary"><span class="lg me">내 구역 '+mine+'</span><span class="lg rival">라이벌 '+rivalCnt+'</span><span class="lg neutral">중립 '+neutralCnt+'</span><span class="map-total">/ 25개 구</span></div>'+
      '<div class="turf-bonus">점령 보너스 <b style="color:var(--money)">+'+bonus+'%</b> 수익 · 가치구(강남·중구 등) 점령 시 가중</div>'+
      '<button class="map-open-btn" data-seoulmap="1">🗺️ 서울 점령도 · 구역 침공</button>'+
      '<div class="turf-cap">⚔ 지도를 열어 <b>중립·라이벌 구</b>를 직접 침공하거나 <b>수비 강화</b>로 지켜라</div></div>';
  }
  let smSelected=null;   // 지도에서 선택된 구 이름
  function smInvadeCost(n){return Math.max(500,Math.floor(rps()*20*guVal(n)+S.totalEarned*0.0004));}
  function smFortCost(n){return Math.max(1000,Math.floor(rps()*45*guVal(n)));}
  function smEnemyPower(n){
    const o=guOwnerOf(n),v=guVal(n);
    if(o==='me')return 0;
    if(o==='neutral')return Math.max(20,Math.floor(playerRef()*(0.25+v*0.12)));
    const r=S.rivals.find(x=>x.id===o);return r?Math.max(20,Math.floor(r.power*(0.30+v*0.10))):Math.floor(playerRef()*0.4);
  }
  function smOwnerLabel(n){const o=guOwnerOf(n);if(o==='me')return{t:'내 구역',c:'var(--cyan)'};if(o==='neutral')return{t:'중립',c:'var(--muted)'};const r=S.rivals.find(x=>x.id===o);return{t:r?r.name:'라이벌',c:r?rivalColor(r):'#c0392b'};}
  function fortifyGu(n){
    ensureGuOwn();if(guOwnerOf(n)!=='me'){flashToast('bad','🛡 불가','내 구역만 수비 강화할 수 있습니다');return;}
    const c=smFortCost(n);if(S.cash<c){flashToast('bad','💸 자금 부족','수비 강화 비용 '+won(c)+' 필요');return;}
    S.cash-=c;S.guDef[n]=Date.now()+GU_FORT_DUR;
    flashToast('good','🛡 수비 강화',n+' · '+(GU_FORT_DUR/1000)+'초간 라이벌 약탈/전쟁에서 보호');
    refreshSeoulMap();render();
  }
  function invadeGu(n){
    ensureGuOwn();const o=guOwnerOf(n);
    if(o==='me'){flashToast('','이미 내 구역','다른 구를 노리세요');return;}
    if(combatPower()<=0){flashToast('bad','✊ NO CREW','조직원을 먼저 고용해야 침공할 수 있습니다');return;}
    const cost=smInvadeCost(n);
    if(S.cash<cost){flashToast('bad','💸 자금 부족','침공 준비금 '+won(cost)+' 필요');return;}
    S.cash-=cost;
    const enemy=smEnemyPower(n),v=guVal(n),rid=(o!=='neutral')?o:null;
    const oppName=rid?(smOwnerLabel(n).t+' · '+n):('중립 · '+n);
    const oppEmoji=rid?'🏴':'🚩';
    runBattle({name:oppName,emoji:oppEmoji,power:enemy},win=>{
      if(win){
        S.guOwn[n]='me';delete S.guDef[n];syncTurf();addHeat(6+v*3);
        if(rid){const r=S.rivals.find(x=>x.id===rid);if(r){r.hostility=Math.min(100,r.hostility+20);r.power=Math.floor(r.power*0.93);rlog(r,n+'을(를) 빼앗겼다','-');}}
        return {sub:'🚩 '+n+' 점령 · 수익 보너스↑ · 수배 +'+(6+v*3)};
      }
      const lost=loseCrew(0.15);addHeat(4);
      if(rid){const r=S.rivals.find(x=>x.id===rid);if(r){r.hostility=Math.min(100,r.hostility+10);rlog(r,n+' 방어에 성공했다','+');}}
      return {sub:'침공 실패 · 조직원 '+lost+'명 부상 · 준비금 소실'};
    });
  }
  function smPanelHtml(n){
    if(!n)return '<div class="sm-hint">구를 눌러 침공하거나 수비를 강화하세요</div>';
    const lab=smOwnerLabel(n),o=guOwnerOf(n),v=guVal(n),fort=guFortified(n);
    const valTag=v>=3?'프리미엄':v>=2?'중급':'일반';
    let acts='';
    if(o==='me'){
      const fc=smFortCost(n);
      acts='<button class="sm-abtn fort" data-fortify="'+n+'">🛡 수비 강화 <small>'+won(fc)+' · '+(GU_FORT_DUR/1000)+'s</small></button>';
    }else{
      const ic=smInvadeCost(n),ep=smEnemyPower(n),cp=combatPower(),ch=Math.max(5,Math.min(95,Math.round(cp/(cp+ep)*100)));
      acts='<button class="sm-abtn attack" data-invade="'+n+'">⚔ 침공 <small>'+won(ic)+' · 승산 '+ch+'%</small></button>';
    }
    return '<div class="sm-p-head"><div class="sm-p-name">'+n+'</div><div class="sm-p-own" style="color:'+lab.c+'">'+lab.t+(fort?' · 🛡수비':'')+'</div></div>'+
      '<div class="sm-p-info"><span>가치 <b style="color:var(--gold)">'+valTag+' ×'+v+'</b></span>'+(o!=='me'?'<span>적 전력 <b style="color:var(--heat)">'+fmt(smEnemyPower(n))+'</b></span>':'<span>수익 가중 <b style="color:var(--money)">+'+(v*TURF_BONUS*100).toFixed(1)+'%</b></span>')+'</div>'+
      '<div class="sm-p-acts">'+acts+'</div>';
  }
  function paintSeoulSvg(){
    const svg=document.querySelector('.seoul-modal .sm-svg');if(!svg)return;
    SEOUL.forEach(g=>{
      const path=svg.querySelector('path[data-gu="'+g.n+'"]');if(!path)return;
      const ow=guOwnerOf(g.n);let fill='#15161c';
      if(ow==='me')fill='#2a7d99';else if(ow!=='neutral'){const r=S.rivals.find(x=>x.id===ow);fill=r?rivalColor(r):'#5a2424';}
      path.setAttribute('fill',fill);
      path.classList.toggle('mine',ow==='me');
      path.classList.toggle('sel',smSelected===g.n);
      path.classList.toggle('fort',guFortified(g.n));
    });
    // 수비 강화 아이콘 갱신
    SEOUL.forEach(g=>{const t=svg.querySelector('text[data-def="'+g.n+'"]');if(t)t.textContent=guFortified(g.n)?'🛡':'';});
  }
  function refreshSeoulMap(){
    const modal=document.querySelector('.seoul-modal');if(!modal)return;
    paintSeoulSvg();
    const c=guCounts();
    const sub=modal.querySelector('.sm-sub');if(sub)sub.innerHTML='25개 자치구 · 내 장악 <b style="color:var(--cyan)">'+Math.round(S.turf)+'%</b> · 보너스 <b style="color:var(--money)">+'+Math.round((turfMult()-1)*100)+'%</b>';
    const pan=modal.querySelector('.sm-panel');if(pan)pan.innerHTML=smPanelHtml(smSelected);
    const leg=modal.querySelector('.sm-legend');
    if(leg){let h='<span class="lg me">■ 내 '+c.me+'</span>';S.rivals.filter(r=>r.power>0).forEach(r=>{h+='<span class="lg" style="color:'+rivalColor(r)+'">■ '+r.name+'</span>';});h+='<span class="lg neutral">■ 중립 '+c.neu+'</span>';leg.innerHTML=h;}
  }
  function openSeoulMap(){
    ensureGuOwn();smSelected=null;
    let paths='',labels='',defs='';
    SEOUL.forEach(g=>{
      paths+='<path d="'+g.d+'" data-gu="'+g.n+'" stroke="#05060a" stroke-width="1.4" class="gu"/>';
      labels+='<text x="'+g.cx+'" y="'+g.cy+'" class="gu-label">'+g.n.replace('구','')+'</text>';
      defs+='<text x="'+(g.cx)+'" y="'+(g.cy+13)+'" data-def="'+g.n+'" class="gu-def"></text>';
    });
    const ov=document.createElement('div');ov.className='seoul-modal';
    ov.innerHTML='<div class="sm-card"><div class="sm-head"><div><div class="sm-title">🗺️ 서울 점령도</div><div class="sm-sub"></div></div><button class="sm-close" data-smclose="1">✕ 닫기</button></div>'+
      '<div class="sm-mapbox"><svg viewBox="'+SEOUL_VB+'" class="sm-svg" preserveAspectRatio="xMidYMid meet">'+paths+labels+defs+'</svg></div>'+
      '<div class="sm-panel"></div>'+
      '<div class="sm-legend"></div></div>';
    ov.addEventListener('click',function(e){
      if(e.target===ov||e.target.closest('[data-smclose]')){ov.remove();smSelected=null;return;}
      const inv=e.target.closest('[data-invade]');if(inv){invadeGu(inv.dataset.invade);return;}
      const fo=e.target.closest('[data-fortify]');if(fo){fortifyGu(fo.dataset.fortify);return;}
      const path=e.target.closest('path[data-gu]');
      if(path){smSelected=(smSelected===path.dataset.gu)?null:path.dataset.gu;refreshSeoulMap();return;}
    });
    document.body.appendChild(ov);
    refreshSeoulMap();
  }
  function winWar(r,isCo,r2){
    const tgts=isCo&&r2?[r,r2]:[r];
    const loot=Math.floor(tgts.reduce((a,x)=>a+x.treasury,0)*0.6);earn(loot);
    const gain=isCo&&r2?16:10;addTurf(gain);
    tgts.forEach(x=>{x.power=Math.floor(x.power*0.35);x.treasury=Math.floor(x.treasury*0.4);x.hostility=10;x.state='truce';x.truceUntil=Date.now()+90000;rlog(x,'당신에게 궤멸당했다','-');});
    return {sub:'적 궤멸 · 전리품 +'+won(loot)+' · 장악 +'+gain+'%'};
  }
  function loseWar(r,isCo,r2){
    const tgts=isCo&&r2?[r,r2]:[r],loss=Math.floor(S.cash*WARLORD.warLoss);S.cash-=loss;
    const lost=loseCrew(0.25);S.warSuppressUntil=Date.now()+WARLORD.warSuppressMs;addHeat(20);addTurf(-12);
    tgts.forEach(x=>{x.treasury+=Math.floor(loss/tgts.length);x.hostility=Math.max(35,x.hostility-12);x.state='neutral';rlog(x,'전쟁에서 당신을 짓밟았다','+');});
    return {sub:'패전 · '+won(loss)+' 약탈 · 조직원 '+lost+'명 사망 · 장악 -12% · 수익 -'+Math.round(WARLORD.warSuppress*100)+'%'};
  }
  function warSurrender(r,isCo,r2){
    const tgts=isCo&&r2?[r,r2]:[r],loss=Math.floor(S.cash*WARLORD.warLoss);S.cash-=loss;S.warSuppressUntil=Date.now()+WARLORD.warSuppressMs;addTurf(-6);
    tgts.forEach(x=>{x.treasury+=Math.floor(loss/tgts.length);x.hostility=Math.max(0,x.hostility-30);x.state='truce';x.truceUntil=Date.now()+60000;rlog(x,'당신의 항복을 받아냈다','-');});
    flashToast('bad','🏳️ 항복',won(loss)+' 헌납 · 장악 -6% · 굴욕적 평화');render();
  }
  function warAuto(r,power,oppName,isCo,r2,chance){
    const win=Math.random()<chance*0.8;
    const out=win?winWar(r,isCo,r2):loseWar(r,isCo,r2);
    flashToast(win?'good':'bad',(win?'⚔ 자동 방어 성공':'⚔ 무대응 패전')+' — '+oppName,out.sub);render();
  }

  // 플레이어 전략 행동
  function bribeRival(id){const r=S.rivals.find(x=>x.id===id);if(!r)return;const amt=Math.max(1000,Math.floor(S.cash*WARLORD.tributeCut));if(S.cash<amt){flashToast('bad','💸 자금 부족','매수할 돈이 없습니다');return;}S.cash-=amt;r.treasury+=amt;r.hostility=Math.max(0,r.hostility-30);r.credibility=Math.min(100,(r.credibility||50)+5);r.truceUntil=Date.now()+60000;r.state='truce';rlog(r,'당신의 매수에 응했다 · 신뢰↑','-');flashToast('good','🤝 매수',r.name+' 적개심↓ 신뢰↑ · 휴전 60초');render();}
  function preemptRival(id){const r=S.rivals.find(x=>x.id===id);if(!r)return;if(combatPower()<=0){flashToast('bad','✊ NO CREW','조직원을 먼저 고용하세요');return;}
    runBattle({name:r.name,emoji:ARCH[r.archetype].emoji,power:r.power},win=>{
      if(win){const out=winWar(r,false,null);return {sub:'선제공격 성공 · '+out.sub};}
      const lost=loseCrew(0.2);r.hostility=Math.min(100,r.hostility+25);r.credibility=Math.max(0,(r.credibility||50)-15);addHeat(12);addTurf(-3);rlog(r,'당신의 선제공격을 격퇴했다 · 신뢰↓','+');return {sub:'선제공격 실패 · 조직원 '+lost+'명 부상 · 장악 -3% · 적개심 급등 · 신뢰 급락'};
    });}
  function inciteRival(id){const r=S.rivals.find(x=>x.id===id);if(!r)return;const amt=Math.max(1000,Math.floor(S.cash*WARLORD.inciteCost));if(S.cash<amt){flashToast('bad','💸 자금 부족','이간질할 돈이 없습니다');return;}S.cash-=amt;r.redirect=true;r.hostility=Math.max(0,r.hostility-12);rlog(r,'이간질에 휘말렸다','-');flashToast('good','🎭 이간계',r.name+'를 다른 세력과 붙였다 · 다음 행동 무력화');render();}
  function intelRival(id){const r=S.rivals.find(x=>x.id===id);if(!r)return;const amt=Math.max(500,Math.floor(S.cash*WARLORD.intelCost));if(S.cash<amt){flashToast('bad','💸 자금 부족','정보비가 부족합니다');return;}S.cash-=amt;r.known=true;flashToast('','🔍 정보 매수',r.name+'의 내부 정보 입수');render();}

  // ── 뒷골목 판돈 대결 — 라이벌 금고를 직접 뜯는 수 싸움 ──
  // 아키타입별 이쪽 승률 보정: 모사꾼은 블러프로 불리, 장사꾼은 큰 판을 피해 유리
  const DUEL_EDGE={raider:0.0, conqueror:0.0, schemer:-0.08, broker:0.06};
  function duelWinChance(r){
    const cp=combatPower(),domR=cp/(cp+Math.max(1,r.power)); // 기세(전력 우위)
    let w=0.44+(DUEL_EDGE[r.archetype]||0)+(domR-0.5)*0.24;  // 살짝 불리한 기본값 + 보정
    return Math.max(0.15,Math.min(0.80,w));
  }
  function rivalDuel(id){
    const r=S.rivals.find(x=>x.id===id);if(!r)return;
    if(r.state==='war'){flashToast('bad','⚔ 전쟁 중',r.name+'와(과)는 지금 판돈을 나눌 사이가 아니다');return;}
    const bet=betClamp();
    if(S.cash<bet){flashToast('bad','💸 자금 부족','베팅할 돈이 없습니다');return;}
    const pot=Math.min(bet,Math.max(0,Math.floor(r.treasury)));  // 상대 금고가 판돈 상한
    if(pot<10){flashToast('','🃏 빈털터리',(r.known?r.name:'상대')+'은(는) 맞걸 돈이 없다 · 정보를 사서 금고를 확인하라');return;}
    S.cash-=pot;S.duelPlayed++;
    const win=duelWinChance(r),roll=Math.random()<win;
    const taunt=fallbackLine(r,'taunt');
    if(roll){
      S.cash+=pot*2;                        // 내 판돈 회수 + 상대 판돈 획득
      r.treasury=Math.max(0,r.treasury-pot);
      S.duelWins++;S.duelNet+=pot;
      r.hostility=Math.min(100,r.hostility+5);
      rlog(r,'판돈 대결에서 당신에게 털렸다','-');
      flashToast('good','🃏 판돈 대결 승 — '+r.name,'+'+won(pot)+' 뜯음 · 적개심 +5 (승산 '+Math.round(win*100)+'%)');
    }else{
      r.treasury+=pot;r.power=Math.floor(r.power*1.02);
      S.duelNet-=pot;
      r.hostility=Math.max(0,r.hostility-3);
      rlog(r,'판돈 대결에서 당신을 벗겨먹었다','+');
      flashToast('bad','🃏 판돈 대결 패 — '+r.name,'-'+won(pot)+' · 상대 세력↑ · 적개심 -3 · "'+taunt+'"');
    }
    if(S.tab==='war')panelDirty=true;
    render();
  }