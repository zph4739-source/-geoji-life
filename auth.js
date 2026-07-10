"use strict";
/* ====================================================================
   거지 라이프 — 로그인/회원가입 + 클라우드 세이브 (Firebase)
   · 로그인 안 해도 게임은 그대로 동작(localStorage). 로그인하면 동기화.
   · 정책 A: 로그인 시 로컬 vs 클라우드 중 진행도(totalEarned) 높은 쪽 채택.
   · 게임의 전역 함수(applyLoad, render, S 등)와 같은 스코프에서 연동.
   ==================================================================== */
(function(){
  const firebaseConfig = {
    apiKey: "AIzaSyBFh3xKk-ikS9aGhrVA0LdsLCq8Uj134yM",
    authDomain: "geoji-life.firebaseapp.com",
    projectId: "geoji-life",
    storageBucket: "geoji-life.firebasestorage.app",
    messagingSenderId: "522031647729",
    appId: "1:522031647729:web:e5b2b57f2ea5f474951250"
  };

  if(typeof firebase === 'undefined'){
    console.warn('[auth] Firebase SDK 미로드 — index.html의 firebase compat 스크립트를 확인하세요.');
    return;
  }
  firebase.initializeApp(firebaseConfig);
  const auth = firebase.auth();
  const db   = firebase.firestore();
  try{ auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL); }catch(e){}

  const SAVE_KEY = 'gtaIdle_save_v2';
  let currentUser = null;
  let cloudTimer  = null;
  let syncing     = false;

  function toast(kind,title,msg){ if(typeof flashToast==='function') flashToast(kind,title,msg); }
  function earned(o){ return (o && typeof o.totalEarned==='number') ? o.totalEarned : -1; }

  // ---------- 클라우드 저장 ----------
  function writeCloud(data){
    if(!currentUser) return Promise.resolve();
    return db.collection('saves').doc(currentUser.uid).set({
      save: JSON.stringify(data),
      totalEarned: data.totalEarned || 0,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }).catch(e=>console.warn('[auth] cloud save fail', e));
  }
  // main.js의 saveGame()이 매 저장 때 호출 (디바운스로 쓰기 최소화)
  window.cloudSave = function(data){
    if(!currentUser || syncing) return;
    if(cloudTimer) clearTimeout(cloudTimer);
    cloudTimer = setTimeout(()=>writeCloud(data), 1500);
  };

  // ---------- 로그인 시 병합 (정책 A) ----------
  async function syncOnLogin(user){
    syncing = true;
    try{
      const doc = await db.collection('saves').doc(user.uid).get();
      let local=null; try{ const r=localStorage.getItem(SAVE_KEY); local=r?JSON.parse(r):null; }catch(e){}
      const cloud = doc.exists ? safeParse(doc.data().save) : null;

      if(cloud && earned(cloud) >= earned(local)){
        // 클라우드가 더 높음(또는 동률) → 클라우드 채택
        if(typeof applyLoad==='function'){
          applyLoad(cloud);
          if(typeof reconcileGuOwn==='function' && S && S.guOwn) reconcileGuOwn();
          if(typeof ensureRivals==='function') ensureRivals();
          if(typeof renderQuest==='function') renderQuest();
          if(typeof render==='function') render();
        }
        try{ localStorage.setItem(SAVE_KEY, JSON.stringify(cloud)); }catch(e){}
        toast('good','☁ 클라우드 불러옴', user.email? '진행도를 이어합니다':'진행도를 이어합니다');
      } else if(local){
        // 로컬이 더 높음 → 클라우드에 밀어올림
        await writeCloud(local);
        toast('good','☁ 동기화 완료','현재 진행도를 계정에 저장했습니다');
      } else if(cloud){
        // 로컬이 아예 없고 클라우드만 있음
        if(typeof applyLoad==='function'){ applyLoad(cloud); if(typeof render==='function') render(); }
        try{ localStorage.setItem(SAVE_KEY, JSON.stringify(cloud)); }catch(e){}
        toast('good','☁ 클라우드 불러옴','진행도를 이어합니다');
      }
    }catch(e){ console.warn('[auth] sync fail', e); toast('bad','⚠ 동기화 실패','네트워크를 확인하세요'); }
    syncing = false;
  }
  function safeParse(s){ try{ return JSON.parse(s); }catch(e){ return null; } }

  // ---------- 인증 상태 ----------
  auth.onAuthStateChanged(user=>{
    currentUser = user || null;
    renderAuthBar();
    if(user) syncOnLogin(user);
  });

  // ---------- UI: 상단 상태 바 ----------
  function renderAuthBar(){
    let bar = document.getElementById('authBar');
    if(!bar){ bar=document.createElement('div'); bar.id='authBar'; document.body.appendChild(bar); }
    if(currentUser){
      const label = currentUser.email || (currentUser.displayName || '게스트');
      const short = label.length>18 ? label.slice(0,16)+'…' : label;
      bar.innerHTML = '<span class="ab-user" title="'+label+'">👤 '+short+'</span>'+
                      '<button class="ab-btn" id="abLogout">로그아웃</button>';
      bar.querySelector('#abLogout').onclick = ()=>auth.signOut();
    } else {
      bar.innerHTML = '<button class="ab-btn primary" id="abLogin">☁ 로그인 / 회원가입</button>';
      bar.querySelector('#abLogin').onclick = openAuthModal;
    }
  }

  // ---------- UI: 로그인/회원가입 모달 ----------
  function openAuthModal(){
    if(document.getElementById('authModal')) return;
    const ov=document.createElement('div');ov.className='evt';ov.id='authModal';
    ov.innerHTML =
      '<div class="evt-card auth-card">'+
        '<div class="evt-kicker mid">ACCOUNT</div>'+
        '<div class="evt-title">클라우드 세이브</div>'+
        '<div class="auth-desc">로그인하면 어느 기기·브라우저에서든 진행도를 이어할 수 있습니다.</div>'+
        '<button class="auth-google" id="authGoogle"><span>G</span> 구글로 계속하기</button>'+
        '<div class="auth-or">또는 이메일</div>'+
        '<input id="authEmail" class="nego-input" type="email" placeholder="이메일" autocomplete="email">'+
        '<input id="authPass" class="nego-input" type="password" placeholder="비밀번호 (6자 이상)" autocomplete="current-password">'+
        '<div class="auth-err" id="authErr"></div>'+
        '<div class="auth-row">'+
          '<button class="auth-btn primary" id="authLogin">로그인</button>'+
          '<button class="auth-btn" id="authSignup">회원가입</button>'+
        '</div>'+
        '<button class="auth-cancel" id="authClose">닫기</button>'+
      '</div>';
    document.body.appendChild(ov);

    const email=ov.querySelector('#authEmail'), pass=ov.querySelector('#authPass'), err=ov.querySelector('#authErr');
    const close=()=>ov.remove();
    function showErr(e){ err.textContent = koErr(e); }
    function busy(b){ ov.querySelectorAll('button,input').forEach(x=>x.disabled=b); }

    ov.querySelector('#authClose').onclick = close;
    ov.querySelector('#authGoogle').onclick = ()=>{
      busy(true); err.textContent='';
      auth.signInWithPopup(new firebase.auth.GoogleAuthProvider())
        .then(close).catch(e=>{ busy(false); showErr(e); });
    };
    ov.querySelector('#authLogin').onclick = ()=>{
      busy(true); err.textContent='';
      auth.signInWithEmailAndPassword(email.value.trim(), pass.value)
        .then(close).catch(e=>{ busy(false); showErr(e); });
    };
    ov.querySelector('#authSignup').onclick = ()=>{
      busy(true); err.textContent='';
      auth.createUserWithEmailAndPassword(email.value.trim(), pass.value)
        .then(close).catch(e=>{ busy(false); showErr(e); });
    };
    email.focus();
  }

  function koErr(e){
    const c = e && e.code || '';
    if(c.includes('invalid-email')) return '이메일 형식이 올바르지 않습니다.';
    if(c.includes('missing-password')||c.includes('weak-password')) return '비밀번호는 6자 이상이어야 합니다.';
    if(c.includes('email-already-in-use')) return '이미 가입된 이메일입니다. 로그인하세요.';
    if(c.includes('user-not-found')||c.includes('invalid-credential')||c.includes('wrong-password')) return '이메일 또는 비밀번호가 틀립니다.';
    if(c.includes('popup-closed')||c.includes('cancelled-popup')) return '';
    if(c.includes('network')) return '네트워크 오류입니다.';
    if(c.includes('unauthorized-domain')) return '이 도메인이 Firebase 승인 목록에 없습니다.';
    return (e && e.message) ? e.message : '오류가 발생했습니다.';
  }

  // 게임 부팅보다 auth.js가 먼저 그려질 수 있으니, DOM 준비되면 바 렌더
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', renderAuthBar);
  else renderAuthBar();
})();