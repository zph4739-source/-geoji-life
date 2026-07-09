/* ====================================================================
   거지 라이프: 길거리의 제왕 — GTA 스타일 고퀄리티 인트로 애니메이션
   (로컬 영상 scene1~4 연결 버전)
   ==================================================================== */

(function(){
  const introContainer = document.getElementById('intro');
  const skipBtn = document.getElementById('skipIntro');
  const appContainer = document.getElementById('app');

  if(!introContainer) return;

  // 인트로가 이미 끝났는지 여부 확인 (스토리지 활용)
  if(sessionStorage.getItem('gtaIntroSeen') === 'true') {
      introContainer.style.display = 'none';
      appContainer.style.display = 'flex';
      return;
  }

  let isSkipped = false;
  let timers = [];
  function at(ms, fn){ if(!isSkipped) timers.push(setTimeout(fn, ms)); }

  // 1. GTA 스타일 씬 데이터 (로컬 영상, 켄 번즈 타입, 크레딧 텍스트/위치, 와이프 방향)
  //    vid 값이 곧 파일명입니다. 확장자/경로가 다르면 여기만 바꾸면 됩니다.
  const sceneData = [
      {
          // Scene 1
          vid: 'scene1.mp4',
          pan: 'kb-zoom-in',
          wipe: null, // 첫 장면은 와이프 없음
          credit: { text: "SEOUL · 00:00", pos: "credit-left" }
      },
      {
          // Scene 2
          vid: 'scene2.mp4',
          pan: 'kb-pan-right',
          wipe: 'split-wipe-right', // 왼쪽에서 오른쪽으로 덮이면서 등장
          credit: { text: "EVERY EMPIRE STARTS IN THE GUTTER", pos: "credit-right" }
      },
      {
          // Scene 3
          vid: 'scene3.mp4',
          pan: 'kb-zoom-out',
          wipe: 'split-wipe-down', // 위에서 아래로 덮이면서 등장
          credit: { text: "냉혹한 왕들의 도시", pos: "credit-left" }
      },
      {
          // Scene 4 (타이틀 씬 백그라운드)
          vid: 'scene4.mp4',
          pan: 'kb-pan-left',
          wipe: 'split-diag', // 대각선으로 베어내듯 등장
          credit: { text: "RISE · OR · ROT", pos: "credit-center" }
      }
  ];

  // 2. 동적 DOM 생성 및 인트로에 삽입
  // 오버레이 노이즈
  introContainer.innerHTML = `
      <div class="gta-grain-overlay"></div>
      <div class="gta-scanline"></div>
  `;

  const scenes = [];
  sceneData.forEach((data, index) => {
      const sceneEl = document.createElement('div');
      sceneEl.className = `gta-scene`;
      sceneEl.id = `gtaScene${index}`;

      let wipeLayer = '';
      if(data.wipe) {
          wipeLayer = `<div class="split-layer ${data.wipe}"></div>`;
      }

      // 배경을 <video>로 렌더링 — muted/playsinline이라 자동재생 정책에 걸리지 않고,
      // loop로 씬 길이보다 영상이 짧아도 반복됩니다.
      sceneEl.innerHTML = `
          ${wipeLayer}
          <video class="gta-bg-layer ${data.pan}" src="${data.vid}" muted playsinline loop preload="auto"></video>
          <div class="gta-credit ${data.credit.pos}">${data.credit.text}</div>
          <div class="gta-flash"></div>
      `;
      scenes.push(sceneEl);
      introContainer.appendChild(sceneEl);
  });

  // 타이틀 컨테이너 생성 (최상단)
  const titleWrap = document.createElement('div');
  titleWrap.id = 'gtaTitleWrap';
  titleWrap.innerHTML = `
      <div class="title-kicker" id="tKicker">A NOIR INCREMENTAL</div>
      <div class="title-main" id="tMain">거지 라이프</div>
      <div class="title-sub" id="tSub">길거리의 제왕</div>
  `;
  introContainer.appendChild(titleWrap);

  // SKIP 버튼을 다시 맨 위로 올림
  introContainer.appendChild(skipBtn);

  // 3. 씬 활성화 함수 — 해당 씬 영상을 처음부터 재생하고 나머지 영상은 정지
  function showScene(idx){
    scenes.forEach((s, i) => {
      const vid = s.querySelector('video');
      if(i === idx){
        s.classList.add('active');
        // 해당 씬 영상 재생 (처음부터)
        if(vid){
            try { vid.currentTime = 0; } catch(e){}
            const pr = vid.play();
            if(pr && pr.catch) pr.catch(function(){});
        }
        // 크레딧 슬라이드인 애니메이션 트리거
        const credit = s.querySelector('.gta-credit');
        if(credit) {
            void credit.offsetWidth; // 리플로우 강제
            credit.classList.add('credit-slide-in');
        }
        // 플래시 뱅 효과
        const flash = s.querySelector('.gta-flash');
        if(flash) {
            void flash.offsetWidth;
            flash.classList.add('flash-anim');
        }
      } else {
        // 이전/다른 씬 영상은 정지 (자원 절약)
        if(vid) vid.pause();
      }
    });
  }

  function stopAllVideos(){
    scenes.forEach(s => { const vid = s.querySelector('video'); if(vid) vid.pause(); });
  }

  // 4. 인트로 종료 함수
  function endIntro(){
    if(isSkipped) return;
    isSkipped = true;
    timers.forEach(clearTimeout);
    stopAllVideos();

    sessionStorage.setItem('gtaIntroSeen', 'true');

    introContainer.style.opacity = '0';
    appContainer.style.display = 'flex'; // 앱 컨테이너 보이기

    setTimeout(() => {
        introContainer.remove();
        // 인트로 끝나고 첫 화면 진동 효과
        document.body.classList.add('screen-quake');
        setTimeout(() => document.body.classList.remove('screen-quake'), 400);
    }, 1000);
  }

  function triggerShake(){
    introContainer.classList.remove('screen-quake');
    void introContainer.offsetWidth;
    introContainer.classList.add('screen-quake');
  }

  /* 타임라인 제어 (밀리초) */
  // 각 씬당 약 3.8초. 영상 길이에 맞춰 아래 숫자만 조절하면 됩니다.
  at(100,   () => showScene(0));
  at(3800,  () => showScene(1));
  at(7600,  () => showScene(2));
  at(11400, () => showScene(3));

  // 마지막 씬에서 타이틀 슬램(쿵쿵쿵 찍히는 효과) — scene4 영상 위에 얹힘
  at(12500, () => { document.getElementById('tKicker').classList.add('anim-slam-kicker'); });
  at(13100, () => {
      document.getElementById('tMain').classList.add('anim-slam-main');
      triggerShake();
  });
  at(13700, () => {
      document.getElementById('tSub').classList.add('anim-slam-sub');
      triggerShake();
  });

  // 전체 17초 후 종료
  at(17000, endIntro);

  skipBtn.addEventListener('click', endIntro);

})();