"use strict";
/* ====================================================================
   거지 라이프 — 업적 시스템 (Phase 5)
   · 밸런스를 크게 흔들지 않는 소액 보상 + 도전 목표 제공
   · 조건은 순수 함수로만 판정 (S 스냅샷 기반) → 사이드이펙트 없음
   · 데이터 탭에 진행도 표시
   ==================================================================== */
(function(){
  // reward는 '누적수익 대비 비율'이 아니라 고정 소액 → 후반 밸런스 왜곡 방지
  const ACH = [
    // ── 경제 ──
    { id:'first_won',  emoji:'🥫', name:'첫 동전',        desc:'누적 수익 1,000원 달성',        reward:500,     ok:()=>S.totalEarned>=1000 },
    { id:'mil',        emoji:'💵', name:'백만장자',        desc:'누적 수익 100만원 달성',        reward:20000,   ok:()=>S.totalEarned>=1e6 },
    { id:'bil',        emoji:'💰', name:'억대 자산가',      desc:'누적 수익 1억원 달성',          reward:2000000, ok:()=>S.totalEarned>=1e8 },
    { id:'tril',       emoji:'👑', name:'제왕의 금고',      desc:'누적 수익 1조원 달성',          reward:50000000,ok:()=>S.totalEarned>=1e12 },
    // ── 신분/성장 ──
    { id:'rank5',      emoji:'🎖️', name:'중간 보스',       desc:'신분 5단계 도달',               reward:50000,   ok:()=>S.rankIdx>=4 },
    { id:'rankmax',    emoji:'🌃', name:'길거리의 제왕',    desc:'최고 신분 도달',                reward:10000000,ok:()=>S.rankIdx>=10 },
    { id:'prestige1',  emoji:'♻️', name:'다시 밑바닥부터',  desc:'프레스티지(자수) 1회',          reward:100000,  ok:()=>(S.prestige||0)>=1 },
    // ── 영토 ──
    { id:'gu1',        emoji:'📍', name:'첫 구역',         desc:'자치구 1곳 점령',               reward:5000,    ok:()=>guCount()>=1 },
    { id:'gu10',       emoji:'🗺️', name:'절반의 서울',      desc:'자치구 10곳 점령',              reward:500000,  ok:()=>guCount()>=10 },
    { id:'gu25',       emoji:'🏙️', name:'서울 정복',       desc:'서울 25개 자치구 전부 점령',    reward:20000000,ok:()=>guCount()>=25 },
    // ── 조직/전투 ──
    { id:'crew10',     emoji:'🤝', name:'식구가 늘었다',    desc:'조직원 10명 확보',              reward:30000,   ok:()=>crewCount()>=10 },
    { id:'raid1',      emoji:'⚔️', name:'첫 레이드',        desc:'보스 레이드 1회 성공',          reward:50000,   ok:()=>((S.raid&&S.raid.clears)||0)>=1 },
    { id:'raid10',     emoji:'🏆', name:'보스 사냥꾼',      desc:'보스 레이드 10회 성공',         reward:3000000, ok:()=>((S.raid&&S.raid.clears)||0)>=10 },
    { id:'gamble',     emoji:'☠️', name:'무모한 도박',      desc:'도박형 레이드 성공',            reward:1000000, ok:()=>(S.achFlags&&S.achFlags.riskRaid)===true },
    // ── 관계/협상 (신뢰 시스템에 목표 부여) ──
    { id:'nego1',      emoji:'🗣️', name:'말빨',            desc:'협상 1회 성공',                 reward:10000,   ok:()=>(S.negoWins||0)>=1 },
    { id:'nego10',     emoji:'🎤', name:'혓바닥의 제왕',    desc:'협상 10회 성공',                reward:400000,  ok:()=>(S.negoWins||0)>=10 },
    { id:'trust',      emoji:'💚', name:'믿음직한 사내',    desc:'라이벌 신뢰도 90 이상 달성',    reward:200000,  ok:()=>(S.rivals||[]).some(r=>(r.credibility||0)>=90) },
    { id:'vassal1',    emoji:'🏦', name:'첫 산하 조직',     desc:'라이벌을 산하 조직으로 편입',   reward:300000,  ok:()=>(S.rivals||[]).some(r=>(r.invest||0)>=50) },
    { id:'vassalAll',  emoji:'🕴️', name:'보이지 않는 손',   desc:'모든 라이벌을 산하 조직으로',   reward:8000000, ok:()=>(S.rivals||[]).length>0&&(S.rivals||[]).every(r=>(r.invest||0)>=50) },
    // ── 수배/생존 ──
    { id:'heat100',    emoji:'🚨', name:'지명수배',        desc:'수배도 100 도달',               reward:20000,   ok:()=>S.heat>=100 },
    { id:'clean',      emoji:'🧼', name:'깨끗한 손',       desc:'단속 한 번도 안 당하고 신분 5', reward:300000,  ok:()=>S.rankIdx>=4&&(S.raids||0)===0 },
  ];

  function guCount(){ try{ return (S.guOwn?Object.keys(S.guOwn).filter(k=>S.guOwn[k]).length:0); }catch(e){ return 0; } }

  function ensure(){
    if(!S.ach) S.ach = {};
    if(!S.achFlags) S.achFlags = {};
    return S.ach;
  }
  function unlocked(id){ ensure(); return S.ach[id]===true; }
  function count(){ ensure(); return ACH.filter(a=>S.ach[a.id]).length; }

  // 주기적 체크 (게임 루프에서 호출) — 조건 만족 시 1회만 지급
  function checkAch(){
    ensure();
    ACH.forEach(a=>{
      if(S.ach[a.id]) return;
      let ok=false; try{ ok=!!a.ok(); }catch(e){ ok=false; }
      if(ok){
        S.ach[a.id]=true;
        if(a.reward>0 && typeof earn==='function') earn(a.reward);
        if(typeof flashToast==='function')
          flashToast('good','🏅 업적 달성', a.emoji+' '+a.name+' · '+(a.reward>0?won(a.reward)+' 획득':''));
      }
    });
  }

  // 데이터 탭용 HTML
  function achPanelHtml(){
    ensure();
    const done=count(), total=ACH.length, pct=Math.round(done/total*100);
    let h='<div class="sec-t">업적 · ACHIEVEMENTS <span style="color:var(--gold)">'+done+'/'+total+'</span></div>';
    h+='<div class="ach-prog"><i style="width:'+pct+'%"></i></div>';
    h+='<div class="ach-list">';
    ACH.forEach(a=>{
      const on=!!S.ach[a.id];
      h+='<div class="ach-item'+(on?' on':'')+'">'+
           '<div class="ach-emoji">'+(on?a.emoji:'🔒')+'</div>'+
           '<div class="ach-body"><div class="ach-name">'+a.name+'</div>'+
           '<div class="ach-desc">'+a.desc+'</div></div>'+
           '<div class="ach-rw">'+(on?'<span class="ach-done">달성</span>':won(a.reward))+'</div>'+
         '</div>';
    });
    h+='</div>';
    return h;
  }

  window.checkAch     = checkAch;
  window.achPanelHtml = achPanelHtml;
  window.achCount     = count;
})();