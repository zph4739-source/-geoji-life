"use strict";
/* ====================================================================
   거지 라이프 — 보스 레이드 (Phase 3+4)
   · 보스는 플레이어 성장 수준(playerRef)에 맞춰 스케일링 → 후반에도 유효
   · 3티어: 안정 / 중간 / 도박  (성공률 하한 40% 보장)
   · 신뢰도 ≥ ALLY_GATE 인 라이벌이 '참전' → 전투력 가산 + 성공률 상승
     → 신뢰도를 올릴 명확한 이유가 생긴다 (Phase 3의 핵심)
   · 전투 연출은 기존 runBattle(boids)을 그대로 재사용
   ==================================================================== */
(function(){
  const RAID = {
    ALLY_GATE: 60,        // 이 신뢰도 이상이면 참전 가능
    ALLY_CONTRIB: 0.45,   // 참전 라이벌 전력의 45%가 아군 전력에 가산
    COOL_MS: 150000,      // 레이드 재도전 쿨다운 2.5분
    MIN_RANK: 3,          // 이 신분부터 레이드 해금
    FLOOR: 0.40,          // 성공률 하한 (체감상 불가능해지지 않게)
    CEIL: 0.92,
  };

  // 티어: 보스 전력배수 / 보상배수 / 목표 성공률(기준)
  const TIERS = [
    { id:'safe', name:'안정형',  emoji:'🛡️', powMult:0.75, rewardMult:0.8,  aim:0.80,
      desc:'승산이 높다. 보상은 적지만 확실하다.' },
    { id:'mid',  name:'중간형',  emoji:'⚔️', powMult:1.15, rewardMult:2.0,  aim:0.62,
      desc:'해볼 만하다. 위험과 보상이 균형을 이룬다.' },
    { id:'risk', name:'도박형',  emoji:'☠️', powMult:1.85, rewardMult:6.0,  aim:0.45,
      desc:'무모하다. 하지만 성공하면 판이 뒤집힌다.' },
  ];

  const BOSSES = [
    { name:'철산 도끼파',   emoji:'🪓', line:'뒷골목의 오래된 이름이다.' },
    { name:'남부 카르텔',   emoji:'🎭', line:'돈으로 만든 조직, 돈으로 무너뜨린다.' },
    { name:'강철 형제단',   emoji:'⛓️', line:'맞으면서 크는 놈들이다.' },
    { name:'야간 청소부',   emoji:'🩸', line:'조용히, 그러나 확실하게 지운다.' },
    { name:'항만 연합',     emoji:'⚓', line:'바다에서 온 물건은 다 이들 손을 거친다.' },
  ];

  // ---------- 상태 ----------
  function ensure(){ if(!S.raid) S.raid = { coolUntil:0, clears:0, fails:0, best:0 }; return S.raid; }
  function ready(){ ensure(); return Date.now() >= S.raid.coolUntil; }
  function coolLeft(){ ensure(); return Math.max(0, S.raid.coolUntil - Date.now()); }

  // ---------- 동맹 (Phase 3) ----------
  function allies(){
    if(!S.rivals) return [];
    return S.rivals.filter(r =>
      (r.credibility||0) >= RAID.ALLY_GATE &&
      r.state !== 'war' &&
      r.hostility < 70          // 적대 상태면 도와주지 않는다
    );
  }
  function allyPower(){
    return Math.floor(allies().reduce((a,r)=>a + r.power*RAID.ALLY_CONTRIB, 0));
  }

  // ---------- 보스 생성 (플레이어 기준 스케일링) ----------
  function makeBoss(tier){
    const ref = playerRef();                     // 플레이어 성장 수준
    const b   = BOSSES[Math.floor(Math.random()*BOSSES.length)];
    const power = Math.max(60, Math.floor(ref * tier.powMult * (0.92 + Math.random()*0.16)));
    // 보상은 현재 rps/누적 기준으로 스케일 → 후반에도 의미 있는 금액
    const base  = Math.max(3000, Math.floor(Math.max(rps()*180, S.totalEarned*0.012)));
    const reward= Math.floor(base * tier.rewardMult * (0.9 + Math.random()*0.25));
    return { name:b.name, emoji:b.emoji, line:b.line, power, reward, tier };
  }

  // 성공률: 아군(전투력+동맹) 대 보스 전력 → 티어 목표치와 혼합 후 하한/상한 클램프
  function odds(boss){
    const ours = combatPower() + allyPower();
    const raw  = ours / (ours + boss.power);
    const mixed= raw*0.65 + boss.tier.aim*0.35;   // 티어 성격을 유지하되 성장도 반영
    return Math.max(RAID.FLOOR, Math.min(RAID.CEIL, mixed));
  }

  // ---------- 레이드 선택 모달 ----------
  function openRaid(){
    ensure();
    if(typeof eventOpen!=='undefined' && (eventOpen||battling)){ flashToast('bad','⛔ 진행 중','다른 상황을 먼저 처리하세요'); return; }
    if(S.rankIdx < RAID.MIN_RANK){ flashToast('bad','🔒 잠김','신분이 더 올라야 레이드가 열린다'); return; }
    if(!ready()){ flashToast('bad','⏳ 재정비 중','다음 레이드까지 '+Math.ceil(coolLeft()/1000)+'s'); return; }
    if(crewCount() < 1){ flashToast('bad','👥 조직원 필요','최소 1명은 있어야 한다'); return; }

    eventOpen = true;
    const al = allies(), ap = allyPower();
    const cards = TIERS.map(t=>{
      const boss = makeBoss(t);
      const pct  = Math.round(odds(boss)*100);
      return { t, boss, pct };
    });

    const allyHtml = al.length
      ? '<div class="raid-ally"><b style="color:var(--money)">🤝 참전 동맹 '+al.length+'</b> · '+
        al.map(r=>r.name).join(', ')+' <span style="color:var(--muted)">(전투력 +'+ap.toLocaleString()+')</span></div>'
      : '<div class="raid-ally muted">🤝 참전 동맹 없음 · 신뢰도 '+RAID.ALLY_GATE+' 이상인 조직이 함께 싸운다</div>';

    const ov = document.createElement('div'); ov.className='evt'; ov.id='raidModal';
    ov.innerHTML =
      '<div class="evt-card raid-card">'+
        '<div class="evt-kicker mid">BOSS RAID</div>'+
        '<div class="evt-title">레이드 상대를 고른다</div>'+
        allyHtml+
        '<div class="raid-tiers">'+
        cards.map((c,i)=>
          '<button class="raid-tier" data-tier="'+i+'">'+
            '<div class="rt-top"><span class="rt-emoji">'+c.t.emoji+'</span>'+
              '<span class="rt-name">'+c.t.name+'</span>'+
              '<span class="rt-pct">'+c.pct+'%</span></div>'+
            '<div class="rt-boss">'+c.boss.emoji+' '+c.boss.name+' · 전력 '+c.boss.power.toLocaleString()+'</div>'+
            '<div class="rt-reward">보상 '+won(c.boss.reward)+'</div>'+
            '<div class="rt-desc">'+c.t.desc+'</div>'+
          '</button>').join('')+
        '</div>'+
        '<button class="nego-cancel" id="raidCancel">물러난다</button>'+
      '</div>';
    document.body.appendChild(ov);

    function close(){ ov.remove(); eventOpen=false; }
    ov.querySelector('#raidCancel').onclick = close;
    ov.querySelectorAll('.raid-tier').forEach(btn=>{
      btn.onclick = ()=>{
        const c = cards[+btn.dataset.tier];
        close();
        startRaid(c.boss);
      };
    });
  }

  // ---------- 레이드 실행 (boids 전투 재사용) ----------
  function startRaid(boss){
    ensure();
    const al = allies(), ap = allyPower();
    const p  = odds(boss);
    // runBattle은 전력비로 승패를 내므로, 원하는 성공률 p가 되도록 상대 전력을 역산해서 넘긴다
    const ours = combatPower() + ap;
    const effPower = Math.max(1, Math.floor(ours * (1-p) / Math.max(0.02, p)));

    S.raid.coolUntil = Date.now() + RAID.COOL_MS;

    runBattle(
      { name: boss.emoji+' '+boss.name, power: effPower },
      (win)=>{
        if(win){
          S.raid.clears++;
          S.raid.best = Math.max(S.raid.best||0, boss.reward);
          earn(boss.reward);
          addHeat(10);
          // 동맹은 함께 싸운 대가로 신뢰가 오른다
          al.forEach(r=>{
            r.credibility = Math.min(100, (r.credibility||50)+5);
            r.hostility   = Math.max(0, r.hostility-8);
            if(typeof rlog==='function') rlog(r,'레이드에 함께 싸웠다 · 신뢰↑','-');
          });
          flashToast('good','🏆 레이드 성공', boss.name+' 격파 · '+won(boss.reward)+(al.length?' · 동맹 신뢰↑':''));
          return { sub:'레이드 성공 · '+won(boss.reward)+' 획득'+(al.length?' · 동맹 '+al.length+'조직 신뢰 +5':'') };
        } else {
          S.raid.fails++;
          const lost = loseCrew(0.18);
          addHeat(14);
          flashToast('bad','💀 레이드 실패', boss.name+'에게 당했다 · 조직원 '+lost+'명 부상');
          return { sub:'레이드 실패 · 조직원 '+lost+'명 부상' };
        }
      }
    );
  }

  // ---------- 조직 탭에 레이드 진입 카드 렌더 ----------
  function raidPanelHtml(){
    ensure();
    const locked = S.rankIdx < RAID.MIN_RANK;
    const cool   = !ready();
    const al = allies(), ap = allyPower();
    const sub = locked ? '신분이 더 올라야 열린다'
              : cool   ? '재정비 중 · '+Math.ceil(coolLeft()/1000)+'s'
              : al.length ? '동맹 '+al.length+'조직 참전 · 전투력 +'+ap.toLocaleString()
              : '동맹 없음 · 신뢰 '+RAID.ALLY_GATE+' 이상이면 함께 싸운다';
    return ''+
      '<div class="sec-t">보스 레이드</div>'+
      '<div class="raid-entry'+((locked||cool)?' off':'')+'" id="raidBtn">'+
        '<div class="re-l"><div class="re-emoji">👑</div>'+
          '<div><div class="re-name">레이드 소집</div><div class="re-sub">'+sub+'</div></div></div>'+
        '<div class="re-r"><div class="re-stat">'+(S.raid.clears||0)+'</div><div class="re-lbl">CLEAR</div></div>'+
      '</div>';
  }

  // 전역 노출 (다른 모듈에서 호출)
  window.openRaid      = openRaid;
  window.raidPanelHtml = raidPanelHtml;
  window.raidAllies    = allies;
})();