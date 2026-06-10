const configMap = {
  central:{title:"الاختبار المركزي الشامل",subtitle:"محاكاة متوازنة لأقسام الاختبار المركزي",count:20,minutes:30,kind:"central"},
  quick:{title:"تحدي سريع",subtitle:"مراجعة متنوعة في وقت قصير",count:10,minutes:12,kind:"quick"},
  weak:{title:"مراجعة نقاط الضعف",subtitle:"أسئلة تتكيف مع نتائجك السابقة",count:12,minutes:18,kind:"weak"},
  storylines:{title:"محاكي وحدة Storylines",subtitle:"قواعد ومفردات وقراءة واستماع من الوحدة الخامسة",count:10,minutes:18,kind:"unit",unit:5},
  wordMastery:{title:"تحدي إتقان الكلمات والجمل",subtitle:"اختبار صعب في معاني كلمات الكتاب وتكوين الجمل",count:20,minutes:28,kind:"word-mastery"}
};

const store = {
  get attempts(){return JSON.parse(localStorage.getItem("miqyas_attempts_v1")||"[]")},
  set attempts(value){localStorage.setItem("miqyas_attempts_v1",JSON.stringify(value))},
  get recent(){return JSON.parse(localStorage.getItem("miqyas_recent_questions_v1")||"[]")},
  set recent(value){localStorage.setItem("miqyas_recent_questions_v1",JSON.stringify(value.slice(-55)))},
  get profile(){try{return JSON.parse(localStorage.getItem("miqyas_student_profile_v1")||"null")}catch{return null}},
  set profile(value){localStorage.setItem("miqyas_student_profile_v1",JSON.stringify(value))}
};

const state={page:"dashboard",exam:null,timerId:null,sessionId:createId("session"),sessionStarted:false};
const view=document.getElementById("app-view");
const modalRoot=document.getElementById("modal-root");
const toast=document.getElementById("toast");

function esc(value){
  return String(value??"").replace(/[&<>'"]/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[char]));
}
function createId(prefix){
  const value=globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${value}`;
}
function studentName(){return store.profile?.name||"يا بطل"}
function greeting(){
  const hour=new Date().getHours();
  return hour<12?"صباح الخير":hour<18?"مرحبًا":"مساء الخير";
}
function applyStudentProfile(){
  const profile=store.profile;if(!profile)return;
  const nameElement=document.getElementById("profile-name");
  const avatarElement=document.getElementById("profile-avatar");
  if(nameElement)nameElement.textContent=profile.name;
  if(avatarElement)avatarElement.textContent=Array.from(profile.name)[0]||"6";
}
function trackEvent(type,{page=state.page,meta={}}={}){
  const profile=store.profile;if(!profile)return;
  fetch("/api/track",{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    keepalive:true,
    body:JSON.stringify({type,studentId:profile.id,name:profile.name,page,sessionId:state.sessionId,meta})
  }).catch(()=>{});
}
async function sendFeedback(category,message){
  const profile=store.profile;
  if(!profile)throw new Error("تعذر معرفة بيانات الطالب.");
  const response=await fetch("/api/track",{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({type:"feedback_submit",studentId:profile.id,name:profile.name,page:state.page,sessionId:state.sessionId,meta:{category,message}})
  });
  if(!response.ok)throw new Error("تعذر إرسال الملاحظة الآن.");
}
function startAnalyticsSession(){
  if(state.sessionStarted||!store.profile)return;
  state.sessionStarted=true;
  trackEvent("session_start",{page:state.page});
}
function shuffle(items){
  const copy=[...items];
  for(let i=copy.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[copy[i],copy[j]]=[copy[j],copy[i]]}
  return copy;
}
function formatDate(iso){return new Intl.DateTimeFormat("ar-SA",{day:"numeric",month:"short",year:"numeric"}).format(new Date(iso))}
function formatDuration(seconds){const min=Math.floor(seconds/60);return `${min}:${String(seconds%60).padStart(2,"0")}`}
function statsFor(attempts=store.attempts){
  if(!attempts.length)return{average:0,best:0,total:0,questions:0,latest:0};
  const scores=attempts.map(a=>a.score);
  return{average:Math.round(scores.reduce((a,b)=>a+b,0)/scores.length),best:Math.max(...scores),total:attempts.length,questions:attempts.reduce((sum,a)=>sum+a.total,0),latest:scores.at(-1)}
}
function skillStats(attempts=store.attempts){
  const base=Object.fromEntries(Object.keys(skillMeta).map(skill=>[skill,{correct:0,total:0,score:0}]));
  attempts.forEach(attempt=>(attempt.answers||[]).forEach(answer=>{
    if(!base[answer.skill])return;
    base[answer.skill].total++;
    if(answer.correct)base[answer.skill].correct++;
  }));
  Object.values(base).forEach(item=>item.score=item.total?Math.round(item.correct/item.total*100):0);
  return base;
}
function weakestSkills(attempts=store.attempts){
  const stats=skillStats(attempts);
  return Object.entries(stats).filter(([,value])=>value.total).sort((a,b)=>a[1].score-b[1].score).map(([skill])=>skill);
}
function unitStats(attempts=store.attempts){
  const result=Object.fromEntries(Object.keys(units).map(unit=>[unit,{correct:0,total:0,score:0}]));
  attempts.forEach(attempt=>(attempt.answers||[]).forEach(answer=>{
    if(!result[answer.unit])return;
    result[answer.unit].total++;
    if(answer.correct)result[answer.unit].correct++;
  }));
  Object.values(result).forEach(item=>item.score=item.total?Math.round(item.correct/item.total*100):0);
  return result;
}
function recommendation(){
  const weak=weakestSkills();
  return weak.length?`ركز على ${skillMeta[weak[0]].topic}، ثم اختبر نفسك بأسئلة قصيرة.`:"ابدأ باختبار شامل لنحدد الموضوعات التي تحتاج إلى مراجعة.";
}
function setHeader(eyebrow,title){
  document.getElementById("page-eyebrow").textContent=eyebrow;
  document.getElementById("page-title").textContent=title;
}
function setActiveNav(page){
  document.querySelectorAll("[data-nav]").forEach(btn=>btn.classList.toggle("active",btn.dataset.nav===page));
}
function emptyState(title,text,button,start){
  return `<div class="empty-state"><div class="empty-state-mark">A+</div><h3>${title}</h3><p>${text}</p><button class="primary-btn teal" data-start="${start}">${button}</button></div>`;
}

function renderDashboard(){
  const attempts=store.attempts;
  const stats=statsFor(attempts);
  const skills=skillStats(attempts);
  const trend=attempts.slice(-6);
  const weekly=attempts.filter(a=>Date.now()-new Date(a.date).getTime()<7*86400000).length;
  document.getElementById("weekly-progress").style.width=`${Math.min(100,weekly/2*100)}%`;
  const name=studentName();
  setHeader("لوحة الطالب",`${greeting()}، ${name}`);
  const chart=trend.length?`<div class="chart-bars">${trend.map((a,index)=>`
    <div class="bar-wrap ${index===trend.length-1?"current":""}">
      <b>${a.score}%</b><span class="bar" style="height:${Math.max(4,a.score)}%"></span>
      <small>${new Intl.DateTimeFormat("ar-SA",{day:"numeric",month:"numeric"}).format(new Date(a.date))}</small>
    </div>`).join("")}</div>`:`<div class="empty-chart">سيظهر منحنى تقدمك بعد أول اختبار.</div>`;
  const tracked=["reading","grammar","vocabulary","writing"];
  view.innerHTML=`
    <div class="dashboard-grid">
      <section class="hero-card">
        <div class="hero-copy">
          <span class="hero-kicker">محاكاة مبنية على مقرر Top Goal 2</span>
          <h2>${attempts.length?`${name}، كل محاولة تقرّبك من الإتقان.`:`${name}، ابدأ رحلتك نحو نتيجة أقوى.`}</h2>
          <p>${attempts.length?`أحسنت! آخر نتيجة لك ${stats.latest}%، وسنختار لك أسئلة جديدة دون تكرار حديث.`:"اختبار متوازن، تصحيح بعد التسليم، وشرح واضح للأخطاء حتى تعرف كيف تتحسن."}</p>
          <div class="hero-actions"><button class="primary-btn" data-start="central">ابدأ اختبارًا شاملًا</button><button class="secondary-btn" data-start="weak">راجع نقاط الضعف</button></div>
        </div>
        <div class="hero-visual" aria-hidden="true"><div class="orbit"></div><div class="book-shape"></div></div>
      </section>
      <section class="overview-card">
        <div class="card-heading"><div><h2>مستواك العام</h2><p>متوسط جميع المحاولات</p></div></div>
        <div class="score-ring" style="--score:${stats.average}"><div class="score-ring-inner"><strong>${stats.average}%</strong><small>${stats.total?"متوسط الأداء":"بانتظار البداية"}</small></div></div>
        <div class="overview-row"><div class="overview-metric"><strong>${stats.best}%</strong><small>أفضل نتيجة</small></div><div class="overview-metric"><strong>${stats.total}</strong><small>محاولة مكتملة</small></div></div>
      </section>
      <section class="stats-grid">
        <div class="stat-card"><span class="stat-icon teal">${stats.total}</span><div><strong>${stats.total}</strong><small>اختبارات مكتملة</small></div></div>
        <div class="stat-card"><span class="stat-icon coral">${stats.questions}</span><div><strong>${stats.questions}</strong><small>سؤال تمت إجابته</small></div></div>
        <div class="stat-card"><span class="stat-icon gold">${skills.grammar.score}%</span><div><strong>${skills.grammar.score}%</strong><small>إتقان القواعد</small></div></div>
        <div class="stat-card"><span class="stat-icon blue">${Math.min(weekly,2)}/2</span><div><strong>${Math.min(weekly,2)}/2</strong><small>هدف الأسبوع</small></div></div>
      </section>
      <section class="below-grid">
        <div class="panel"><div class="card-heading"><div><h2>تطور النتائج</h2><p>آخر ست محاولات مكتملة</p></div><button class="ghost-btn" data-nav="history">عرض السجل</button></div><div>${chart}</div></div>
        <div class="panel"><div class="card-heading"><div><h2>المهارات الأساسية</h2><p>نسبة الإجابات الصحيحة</p></div></div>
          <div class="skills-list">${tracked.map(skill=>`<div class="skill-row"><div class="skill-row-head"><span>${skillMeta[skill].ar}</span><b>${skills[skill].score}%</b></div><div class="skill-track"><span style="width:${skills[skill].score}%"></span></div></div>`).join("")}</div>
          <div class="recommendation"><strong>توصية مِقياس</strong><p>${recommendation()}</p></div>
        </div>
      </section>
    </div>`;
}

function renderTests(){
  setHeader("بنك الاختبارات",`اختر تدريبك اليوم، ${studentName()}`);
  view.innerHTML=`
    <h2 class="section-title">اختبارات تناسب هدفك</h2>
    <p class="section-subtitle">كل اختبار يُنشأ من بنك متنوع، ويبتعد عن الأسئلة التي ظهرت لك مؤخرًا.</p>
    <div class="tests-grid">
      <article class="test-card featured"><span class="test-tag">الخيار المقترح</span><h3>الاختبار المركزي الشامل</h3><p>محاكاة لأقسام الأسئلة العامة والقراءة والقواعد والمفردات والكتابة والإملاء.</p><div class="test-meta"><span>20 سؤالًا</span><span>30 دقيقة</span><span>جميع الوحدات</span></div><button class="primary-btn" data-start="central">ابدأ الآن</button></article>
      <article class="test-card"><span class="test-tag">تكيفي</span><h3>مراجعة نقاط الضعف</h3><p>يركز على المهارات الأقل في نتائجك السابقة.</p><div class="test-meta"><span>12 سؤالًا</span><span>18 دقيقة</span></div><button class="ghost-btn" data-start="weak">ابدأ المراجعة</button></article>
      <article class="test-card"><span class="test-tag">سريع</span><h3>تحدي سريع</h3><p>أسئلة قصيرة ومتنوعة لتنشيط الذاكرة.</p><div class="test-meta"><span>10 أسئلة</span><span>12 دقيقة</span></div><button class="ghost-btn" data-start="quick">ابدأ التحدي</button></article>
      <article class="test-card"><span class="test-tag">استماع</span><h3>Storylines</h3><p>تدريب خاص على الوحدة الخامسة مع المقطع الصوتي.</p><div class="test-meta"><span>10 أسئلة</span><span>18 دقيقة</span></div><button class="ghost-btn" data-start="storylines">ابدأ الوحدة</button></article>
      <article class="test-card"><span class="test-tag">مستوى صعب</span><h3>إتقان الكلمات والجمل</h3><p>معاني دقيقة داخل السياق وتكوين جمل من مفردات الوحدات الثماني.</p><div class="test-meta"><span>20 سؤالًا</span><span>28 دقيقة</span><span>معاني + جمل</span></div><button class="ghost-btn" data-start="wordMastery">ابدأ التحدي الصعب</button></article>
    </div>
    <div class="card-heading" style="margin-top:32px"><div><h2>اختبار حسب الوحدة</h2><p>راجع مفردات وقواعد كل وحدة على حدة</p></div></div>
    <div class="unit-grid">${Object.entries(units).map(([number,unit])=>`<button class="unit-card" data-unit="${number}"><span class="unit-number">${number}</span><h4>${unit.title}</h4><p>${unit.ar}</p></button>`).join("")}</div>`;
}

function renderProgress(){
  const attempts=store.attempts;
  const skills=skillStats(attempts);
  const unitPerformance=unitStats(attempts);
  const ordered=Object.keys(skillMeta).sort((a,b)=>skills[b].score-skills[a].score);
  const weak=weakestSkills(attempts);
  setHeader("تحليل الأداء",`تقدمك الدراسي، ${studentName()}`);
  view.innerHTML=`
    <h2 class="section-title">صورة أوضح لمستواك</h2>
    <p class="section-subtitle">يُحدّث التحليل تلقائيًا بعد كل اختبار ويقترح موضوعات المراجعة التالية.</p>
    <div class="progress-layout">
      <section class="panel"><div class="card-heading"><div><h2>إتقان المهارات</h2><p>دقة إجاباتك بحسب نوع السؤال</p></div></div>
        ${attempts.length?`<div class="mastery-grid">${ordered.map(skill=>`<article class="skill-card"><div class="skill-card-top"><span>${skillMeta[skill].ar}</span><b>${skills[skill].score}%</b></div><div class="skill-track"><span style="width:${skills[skill].score}%"></span></div><p>${skillMeta[skill].topic} · ${skills[skill].total} سؤال</p></article>`).join("")}</div>`:emptyState("ابدأ القياس","أكمل اختبارًا واحدًا لننشئ تحليلًا دقيقًا لمهاراتك.","ابدأ اختبارًا","central")}
      </section>
      <aside class="panel"><div class="card-heading"><div><h2>خطة المراجعة الذكية</h2><p>مرتبة حسب الأولوية</p></div></div>
        <div class="plan-list">${(weak.length?weak.slice(0,4):["grammar","vocabulary","reading"]).map((skill,index)=>`<div class="plan-item"><span class="plan-index">${index+1}</span><div><strong>${skillMeta[skill].ar}</strong><p>${skillMeta[skill].topic}${weak.length?` · مستواك ${skills[skill].score}%`:""}</p></div></div>`).join("")}</div>
        <button class="primary-btn teal" style="width:100%;margin-top:17px" data-start="weak">ابدأ تدريب الخطة</button>
      </aside>
    </div>
    <section class="panel unit-performance-panel">
      <div class="card-heading"><div><h2>مؤشر الإجابات الصحيحة لكل وحدة</h2><p>إجمالي أدائك في جميع المحاولات السابقة</p></div></div>
      <div class="unit-performance-grid">
        ${Object.entries(units).map(([number,unit])=>{
          const performance=unitPerformance[number];
          const level=!performance.total?"not-started":performance.score>=80?"strong":performance.score>=60?"medium":"needs-work";
          const label=!performance.total?"لم تُختبر":performance.score>=80?"متقن":performance.score>=60?"جيد":"يحتاج مراجعة";
          return `<button class="unit-performance-card ${level}" data-unit="${number}">
            <div class="unit-performance-top">
              <span class="unit-performance-number">${number}</span>
              <span class="unit-performance-status">${label}</span>
            </div>
            <h3>${unit.title}</h3>
            <p>${unit.ar}</p>
            <div class="unit-correct-count"><strong>${performance.correct}/${performance.total}</strong><span>إجابة صحيحة</span><b>${performance.total?performance.score+"%":"--"}</b></div>
            <div class="unit-performance-track"><span style="width:${performance.score}%"></span></div>
          </button>`;
        }).join("")}
      </div>
    </section>`;
}

function renderHistory(){
  const attempts=[...store.attempts].reverse();
  setHeader("ذاكرة النتائج",`سجل محاولات ${studentName()}`);
  view.innerHTML=`
    <h2 class="section-title">كل نتائجك في مكان واحد</h2>
    <p class="section-subtitle">يمكنك فتح أي تقرير سابق ومراجعة الإجابات والتوصيات من جديد.</p>
    ${attempts.length?`<div class="history-list">${attempts.map(attempt=>`<article class="history-card"><span class="history-score ${attempt.score<60?"low":""}">${attempt.score}%</span><div><h3>${esc(attempt.title)}</h3><p>${attempt.correct} صحيحة من ${attempt.total} · ${formatDuration(attempt.duration)}</p></div><time class="history-date">${formatDate(attempt.date)}</time><button class="ghost-btn" data-report="${attempt.id}">عرض التقرير</button></article>`).join("")}</div>`:emptyState("ذاكرتك جاهزة","لا توجد محاولات محفوظة بعد. ستظهر نتائجك هنا فور إنهاء أول اختبار.","ابدأ أول اختبار","central")}`;
}

function navigate(page){
  if(!["dashboard","tests","progress","history"].includes(page))page="dashboard";
  state.page=page;setActiveNav(page);
  ({dashboard:renderDashboard,tests:renderTests,progress:renderProgress,history:renderHistory})[page]();
  applyStudentProfile();
  trackEvent("page_view",{page});
  window.scrollTo({top:0,behavior:"smooth"});view.focus({preventScroll:true});
}

function examConfig(kind,unitNumber){
  if(unitNumber){
    const unit=Number(unitNumber);
    return{title:`اختبار الوحدة ${unit}: ${units[unit].title}`,subtitle:units[unit].ar,count:Math.min(10,questions.filter(q=>q.unit===unit).length),minutes:16,kind:"unit",unit};
  }
  return{...configMap[kind]};
}

function ensureImageMinimum(selected,pool,minimum){
  const result=[...selected];
  let needed=Math.max(0,Math.min(minimum,result.length)-result.filter(question=>question.image).length);
  if(!needed)return shuffle(result);
  const candidates=pool.filter(question=>question.image&&!result.some(item=>item.id===question.id));
  for(const candidate of candidates){
    let replaceIndex=result.findIndex(question=>!question.image&&question.skill===candidate.skill);
    if(replaceIndex<0)replaceIndex=result.findIndex(question=>!question.image);
    if(replaceIndex<0)break;
    result[replaceIndex]=candidate;
    needed--;
    if(!needed)break;
  }
  return shuffle(result);
}

function chooseQuestions(config){
  const standardQuestions=questions.filter(q=>q.exam!=="word-mastery");
  let pool=config.kind==="word-mastery"
    ? questions.filter(q=>q.exam==="word-mastery")
    : config.unit
      ? standardQuestions.filter(q=>q.unit===config.unit)
      : standardQuestions;
  const recent=new Set(store.recent);
  let fresh=pool.filter(q=>!recent.has(q.id));
  const weak=weakestSkills();
  if(config.kind==="weak"&&weak.length){
    const priority=new Set(weak.slice(0,3));
    fresh=[...shuffle(fresh.filter(q=>priority.has(q.skill))),...shuffle(fresh.filter(q=>!priority.has(q.skill)))];
    pool=[...shuffle(pool.filter(q=>priority.has(q.skill))),...shuffle(pool.filter(q=>!priority.has(q.skill)))];
  }else{fresh=shuffle(fresh);pool=shuffle(pool)}
  const orderedPool=[...fresh,...pool.filter(question=>!fresh.some(item=>item.id===question.id))].filter((question,index,items)=>items.findIndex(item=>item.id===question.id)===index);
  if(config.kind==="central"){
    const target={general:2,reading:3,grammar:5,vocabulary:4,writing:3,spelling:2,listening:1};
    const selected=[];
    Object.entries(target).forEach(([skill,count])=>{
      const candidates=[...fresh.filter(q=>q.skill===skill),...pool.filter(q=>q.skill===skill&&!fresh.some(f=>f.id===q.id))];
      selected.push(...candidates.filter(q=>!selected.some(s=>s.id===q.id)).slice(0,count));
    });
    return ensureImageMinimum(shuffle(selected).slice(0,config.count),orderedPool,4);
  }
  if(config.kind==="word-mastery"){
    const selected=[];
    ["vocabulary","writing"].forEach(skill=>{
      const candidates=[...fresh.filter(q=>q.skill===skill),...pool.filter(q=>q.skill===skill&&!fresh.some(f=>f.id===q.id))];
      selected.push(...candidates.slice(0,config.count/2));
    });
    return ensureImageMinimum(shuffle(selected),orderedPool,4);
  }
  const selected=orderedPool.slice(0,Math.min(config.count,pool.length));
  return ensureImageMinimum(selected,orderedPool,config.unit?3:2);
}

function shuffleQuestionChoices(question){
  const shuffled=shuffle(question.choices.map((text,index)=>({text,correct:index===question.answer})));
  return{
    ...question,
    choices:shuffled.map(choice=>choice.text),
    answer:shuffled.findIndex(choice=>choice.correct)
  };
}

function openStartModal(config){
  modalRoot.innerHTML=`<div class="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="start-title"><div class="start-modal">
    <div class="modal-top"><div><h2 id="start-title">${esc(config.title)}</h2><p>${esc(config.subtitle)}</p></div><button class="modal-close" data-close-modal aria-label="إغلاق">×</button></div>
    <div class="exam-info"><div><strong>${config.count}</strong><small>سؤالًا</small></div><div><strong>${config.minutes}</strong><small>دقيقة</small></div><div><strong>${config.unit?1:8}</strong><small>${config.unit?"وحدة":"وحدات"}</small></div></div>
    <p class="modal-tips">لن تظهر صحة الإجابات أثناء الاختبار. بعد إكمال جميع الأسئلة ستظهر النتيجة والأخطاء وشرحها والدروس التي تحتاج إلى تركيز أكبر.</p>
    <div class="modal-actions"><button class="ghost-btn" data-close-modal>ليس الآن</button><button class="primary-btn teal" id="confirm-start">ابدأ الاختبار</button></div>
  </div></div>`;
  document.getElementById("confirm-start").addEventListener("click",()=>startExam(config));
}

function startExam(config){
  const selected=chooseQuestions(config).map(question=>
    config.kind==="word-mastery"?shuffleQuestionChoices(question):question
  );
  state.exam={config,questions:selected,index:0,answers:Array(selected.length).fill(null),startedAt:Date.now(),remaining:config.minutes*60};
  trackEvent("exam_start",{meta:{title:config.title,kind:config.kind,unit:config.unit||null,total:selected.length}});
  modalRoot.innerHTML="";document.body.style.overflow="hidden";renderQuestion();
  clearInterval(state.timerId);
  state.timerId=setInterval(()=>{
    if(!state.exam)return;
    state.exam.remaining--;
    const timer=document.getElementById("exam-timer");
    if(timer){timer.textContent=formatDuration(Math.max(0,state.exam.remaining));timer.classList.toggle("warning",state.exam.remaining<=120)}
    if(state.exam.remaining<=0)finishExam(true);
  },1000);
}

function renderQuestion(){
  const exam=state.exam,q=exam.questions[exam.index],letters=["A","B","C","D"];
  const savedAnswer=exam.answers[exam.index];
  const answeredCount=exam.answers.filter(Boolean).length;
  const isLast=exam.index===exam.questions.length-1;
  modalRoot.innerHTML=`<div class="quiz-overlay"><div class="quiz-shell">
    <header class="quiz-header"><button class="quiz-close" data-exit-exam aria-label="الخروج">×</button><div class="quiz-brand"><strong>${esc(exam.config.title)}</strong><small>السؤال ${exam.index+1} من ${exam.questions.length}</small></div><span class="timer" id="exam-timer">${formatDuration(exam.remaining)}</span></header>
    <div class="quiz-progress-wrap"><div class="quiz-progress-label"><span>${skillMeta[q.skill].ar}</span><span>تمت الإجابة عن ${answeredCount} من ${exam.questions.length}</span></div><div class="quiz-progress"><span style="width:${answeredCount/exam.questions.length*100}%"></span></div></div>
    <article class="question-card">
      <div class="question-meta"><span class="question-badge">${skillMeta[q.skill].ar}</span><span class="question-unit">Unit ${q.unit} · ${units[q.unit].title}</span></div>
      ${q.passage?`<div class="passage">${esc(q.passage)}</div>`:""}
      ${q.audio?`<div class="audio-box"><strong>استمع إلى المقطع، ويمكنك إعادته قبل الإجابة:</strong><audio controls preload="metadata" src="${q.audio}"></audio></div>`:""}
      ${q.image?`<figure class="question-image"><img src="${esc(q.image)}" alt="${esc(q.imageAlt||"لوحة صور مرتبطة بالسؤال")}"><figcaption>اختر الإجابة اعتمادًا على الصور المرقمة.</figcaption></figure>`:""}
      <h2>${esc(q.prompt)}</h2>
      <div class="choices">${q.choices.map((choice,index)=>`<button class="choice ${savedAnswer?.selected===index?"selected":""}" data-choice="${index}"><span class="choice-letter">${letters[index]}</span><span class="choice-text">${esc(choice)}</span></button>`).join("")}</div>
      <p class="exam-privacy-note">يمكنك تعديل إجابتك قبل تسليم الاختبار. لن تظهر النتيجة الآن.</p>
      <div class="quiz-actions exam-navigation">
        <button class="ghost-btn" id="previous-question" ${exam.index===0?"disabled":""}>السؤال السابق</button>
        <button class="primary-btn ${isLast?"dark":"teal"}" id="${isLast?"submit-exam":"next-question"}" ${savedAnswer?"":"disabled"}>${isLast?"تسليم الاختبار وعرض النتيجة":"السؤال التالي"}</button>
      </div>
    </article>
  </div></div>`;
}

function selectChoice(index){
  if(!state.exam)return;
  const exam=state.exam,q=exam.questions[exam.index];
  exam.answers[exam.index]={questionId:q.id,selected:index,correct:index===q.answer,skill:q.skill,unit:q.unit};
  document.querySelectorAll(".choice").forEach((choice,i)=>choice.classList.toggle("selected",i===index));
  const action=document.getElementById(exam.index===exam.questions.length-1?"submit-exam":"next-question");
  if(action)action.disabled=false;
  const progressLabel=document.querySelector(".quiz-progress-label span:last-child");
  const progressBar=document.querySelector(".quiz-progress span");
  const answeredCount=exam.answers.filter(Boolean).length;
  if(progressLabel)progressLabel.textContent=`تمت الإجابة عن ${answeredCount} من ${exam.questions.length}`;
  if(progressBar)progressBar.style.width=`${answeredCount/exam.questions.length*100}%`;
}
function nextQuestion(){
  if(!state.exam?.answers[state.exam.index])return;
  if(state.exam.index<state.exam.questions.length-1){state.exam.index++;renderQuestion()}
}
function previousQuestion(){
  if(state.exam&&state.exam.index>0){state.exam.index--;renderQuestion()}
}
function submitExam(){
  const unanswered=state.exam.answers.filter(answer=>!answer).length;
  if(unanswered){showToast(`أجب عن جميع الأسئلة أولًا. المتبقي: ${unanswered}`);return}
  finishExam(false);
}

function finishExam(timedOut){
  const exam=state.exam;if(!exam)return;clearInterval(state.timerId);
  exam.answers=exam.answers.map((answer,index)=>answer||{questionId:exam.questions[index].id,selected:null,correct:false,skill:exam.questions[index].skill,unit:exam.questions[index].unit});
  const correct=exam.answers.filter(a=>a.correct).length;
  const attempt={id:`attempt-${Date.now()}`,studentName:studentName(),title:exam.config.title,kind:exam.config.kind,unit:exam.config.unit||null,date:new Date().toISOString(),score:Math.round(correct/exam.questions.length*100),correct,total:exam.questions.length,duration:Math.max(0,Math.round((Date.now()-exam.startedAt)/1000)),timedOut,answers:exam.answers,questions:exam.questions};
  const attempts=store.attempts;attempts.push(attempt);store.attempts=attempts.slice(-60);
  store.recent=[...store.recent,...exam.questions.map(q=>q.id)];
  trackEvent("exam_complete",{meta:{title:attempt.title,kind:attempt.kind,unit:attempt.unit,score:attempt.score,total:attempt.total,correct:attempt.correct,duration:attempt.duration,answers:attempt.answers.map(answer=>({unit:answer.unit,skill:answer.skill,correct:answer.correct}))}});
  state.exam=null;renderReport(attempt);
}

function attemptSkills(attempt){
  const data={};
  attempt.answers.forEach(answer=>{data[answer.skill]||={correct:0,total:0};data[answer.skill].total++;if(answer.correct)data[answer.skill].correct++});
  return Object.entries(data).map(([skill,value])=>({skill,...value,score:Math.round(value.correct/value.total*100)})).sort((a,b)=>a.score-b.score);
}
function attemptUnits(attempt){
  const data={};
  attempt.answers.forEach(answer=>{
    data[answer.unit]||={correct:0,total:0};
    data[answer.unit].total++;
    if(answer.correct)data[answer.unit].correct++;
  });
  return Object.entries(data).map(([unit,value])=>({unit:Number(unit),...value,score:Math.round(value.correct/value.total*100)})).sort((a,b)=>a.score-b.score||b.total-a.total);
}
function renderReport(attempt){
  document.body.style.overflow="hidden";
  const skills=attemptSkills(attempt),weak=skills.filter(s=>s.score<75).slice(0,3);
  const unitResults=attemptUnits(attempt);
  const focusUnits=unitResults.filter(item=>item.score<80).slice(0,3);
  const wrongAnswers=attempt.answers.map((answer,index)=>({answer,index})).filter(item=>!item.answer.correct);
  const rows=wrongAnswers.map(({answer,index})=>{
    const q=attempt.questions?.find(item=>item.id===answer.questionId)||questions.find(item=>item.id===answer.questionId);if(!q)return"";
    const studentAnswer=answer.selected===null?"لم تتم الإجابة":q.choices[answer.selected];
    return `<article class="review-item wrong-review">${q.image?`<img class="review-question-image" src="${esc(q.image)}" alt="${esc(q.imageAlt||"لوحة صور السؤال")}">`:""}<div class="review-item-head"><h3>${index+1}. ${esc(q.prompt)}</h3><span class="status-pill bad">تحتاج مراجعة</span></div><p>إجابتك: <b dir="ltr">${esc(studentAnswer)}</b></p><p>الإجابة الصحيحة: <b dir="ltr">${esc(q.choices[q.answer])}</b></p><p><strong>سبب الخطأ:</strong> ${esc(q.explanation)}</p><p class="review-detail">${esc(q.detail)}</p></article>`;
  }).join("");
  const plan=weak.length?weak:skills.slice(0,2);
  modalRoot.innerHTML=`<div class="quiz-overlay"><div class="result-shell">
    <div class="result-top"><div><p class="eyebrow">تقرير المحاولة</p><strong>${formatDate(attempt.date)}</strong></div><button class="ghost-btn" data-close-report>العودة إلى اللوحة</button></div>
    <section class="result-summary">
      <div class="result-score"><div><strong>${attempt.score}%</strong><small>النتيجة النهائية</small></div></div>
      <div><h1>${attempt.score>=85?`أداء ممتاز يا ${studentName()}`:attempt.score>=65?`تقدم جيد يا ${studentName()}`:`${studentName()}، هذه بداية نبني عليها`}</h1><p>${attempt.timedOut?"انتهى الوقت، وقد حفظنا كل إجاباتك.":"أكملت الاختبار، وحفظنا النتيجة في سجل تقدمك."}</p></div>
      <div class="result-facts"><div class="result-fact"><strong>${attempt.correct}/${attempt.total}</strong><small>إجابات صحيحة</small></div><div class="result-fact"><strong>${formatDuration(attempt.duration)}</strong><small>الوقت المستخدم</small></div></div>
    </section>
    <div class="result-grid">
      <section class="result-panel"><h2>الإجابات الخاطئة وشرحها</h2><div class="review-list">${rows||`<div class="perfect-result"><strong>رائع، جميع إجاباتك صحيحة.</strong><p>لا توجد أخطاء تحتاج إلى مراجعة في هذه المحاولة.</p></div>`}</div></section>
      <aside class="result-panel">
        <h2>الدروس التي تحتاج تركيزًا</h2>
        <div class="plan-list">${(focusUnits.length?focusUnits:unitResults.slice(0,2)).map((item,index)=>`<div class="plan-item"><span class="plan-index">${index+1}</span><div><strong>الوحدة ${item.unit}: ${units[item.unit].title}</strong><p>${units[item.unit].ar} · مستوى الإتقان ${item.score}%</p></div></div>`).join("")}</div>
        <h2 style="margin-top:22px">المهارات المقترحة</h2>
        <div class="plan-list">${plan.map((item,index)=>`<div class="plan-item"><span class="plan-index">${index+1}</span><div><strong>${skillMeta[item.skill].ar} · ${item.score}%</strong><p>${skillMeta[item.skill].topic}</p></div></div>`).join("")}</div>
        <button class="primary-btn teal" style="width:100%;margin-top:17px" data-result-practice>تدرب على نقاط الضعف</button>
      </aside>
    </div>
  </div></div>`;
}
function closeReport(){modalRoot.innerHTML="";document.body.style.overflow="";navigate("dashboard")}
function exitExam(){
  if(!state.exam)return;
  if(!confirm("هل تريد الخروج؟ لن تُحفظ هذه المحاولة غير المكتملة."))return;
  clearInterval(state.timerId);state.exam=null;modalRoot.innerHTML="";document.body.style.overflow="";
}
function showToast(message){toast.textContent=message;toast.classList.add("show");setTimeout(()=>toast.classList.remove("show"),2200)}

function openFeedbackModal(){
  if(state.exam){showToast("أكمل الاختبار أو اخرج منه أولًا.");return}
  document.body.style.overflow="hidden";
  modalRoot.innerHTML=`<div class="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="feedback-title">
    <form class="start-modal feedback-modal" id="feedback-form">
      <div class="modal-top"><div><h2 id="feedback-title">أرسل ملاحظتك</h2><p>${esc(studentName())}، رأيك يساعدنا على تحسين تجربة مِقياس.</p></div><button class="modal-close" type="button" data-close-feedback aria-label="إغلاق">×</button></div>
      <label for="feedback-category">نوع الملاحظة</label>
      <select id="feedback-category" name="category">
        <option value="suggestion">اقتراح تطوير</option>
        <option value="problem">مشكلة في الموقع</option>
        <option value="question">سؤال أو استفسار</option>
        <option value="content">ملاحظة على سؤال أو محتوى</option>
        <option value="other">أخرى</option>
      </select>
      <label for="feedback-message">الملاحظة</label>
      <textarea id="feedback-message" name="message" minlength="3" maxlength="500" rows="6" placeholder="اكتب ملاحظتك بوضوح..." required></textarea>
      <div class="feedback-form-footer"><small><span id="feedback-count">0</span>/500 حرف</small><button class="primary-btn teal" id="send-feedback" type="submit">إرسال الملاحظة</button></div>
    </form>
  </div>`;
  const form=document.getElementById("feedback-form");
  const message=document.getElementById("feedback-message");
  const count=document.getElementById("feedback-count");
  message.addEventListener("input",()=>count.textContent=message.value.length);
  form.addEventListener("submit",async event=>{
    event.preventDefault();
    const text=message.value.replace(/\s+/g," ").trim();
    if(text.length<3){showToast("اكتب ملاحظة من 3 أحرف على الأقل.");return}
    const button=document.getElementById("send-feedback");
    button.disabled=true;button.textContent="جارٍ الإرسال...";
    try{
      await sendFeedback(form.category.value,text);
      modalRoot.innerHTML="";document.body.style.overflow="";
      showToast("شكرًا لك، وصلت ملاحظتك بنجاح.");
    }catch(error){showToast(error.message);button.disabled=false;button.textContent="إرسال الملاحظة"}
  });
  message.focus();
}

function showStudentOnboarding(){
  document.body.style.overflow="hidden";
  modalRoot.innerHTML=`<div class="modal-backdrop onboarding-backdrop" role="dialog" aria-modal="true" aria-labelledby="student-welcome-title">
    <form class="student-welcome-card" id="student-name-form">
      <div class="welcome-mark"><span></span><span></span><span></span></div>
      <span class="welcome-kicker">أهلًا بك في مِقياس</span>
      <h2 id="student-welcome-title">ما اسم الطالب؟</h2>
      <p>سنستخدم الاسم في التحية ورسائل التشجيع، وسيظهر في لوحة المتابعة التعليمية مع مؤشرات الأداء.</p>
      <label for="student-name-input">اسم الطالب</label>
      <input id="student-name-input" name="studentName" type="text" minlength="2" maxlength="30" autocomplete="name" placeholder="اكتب الاسم الأول" required />
      <small>لن نطلب رقم جوال أو بريدًا إلكترونيًا.</small>
      <button class="primary-btn teal" type="submit">ابدأ رحلتي</button>
    </form>
  </div>`;
  const form=document.getElementById("student-name-form");
  const input=document.getElementById("student-name-input");
  input.focus();
  form.addEventListener("submit",event=>{
    event.preventDefault();
    const name=input.value.replace(/\s+/g," ").trim();
    if(name.length<2){showToast("اكتب اسمًا من حرفين على الأقل.");return}
    store.profile={id:createId("student"),name,createdAt:new Date().toISOString()};
    applyStudentProfile();
    modalRoot.innerHTML="";
    document.body.style.overflow="";
    trackEvent("student_register",{page:"dashboard"});
    startAnalyticsSession();
    navigate(location.hash.replace("#","")||"dashboard");
  });
}

function bootApp(){
  applyStudentProfile();
  if(store.profile){
    startAnalyticsSession();
    navigate(location.hash.replace("#","")||"dashboard");
    return;
  }
  state.page="dashboard";
  setActiveNav("dashboard");
  renderDashboard();
  showStudentOnboarding();
}

document.addEventListener("click",event=>{
  if(event.target.closest("[data-open-feedback]")){openFeedbackModal();return}
  if(event.target.closest("[data-close-feedback]")){modalRoot.innerHTML="";document.body.style.overflow="";return}
  const nav=event.target.closest("[data-nav]");if(nav){event.preventDefault();navigate(nav.dataset.nav);return}
  const start=event.target.closest("[data-start]");if(start){openStartModal(examConfig(start.dataset.start));return}
  const unit=event.target.closest("[data-unit]");if(unit){openStartModal(examConfig("unit",unit.dataset.unit));return}
  if(event.target.closest("[data-close-modal]")){modalRoot.innerHTML="";return}
  const choice=event.target.closest("[data-choice]");if(choice){selectChoice(Number(choice.dataset.choice));return}
  if(event.target.closest("#next-question")){nextQuestion();return}
  if(event.target.closest("#previous-question")){previousQuestion();return}
  if(event.target.closest("#submit-exam")){submitExam();return}
  if(event.target.closest("[data-exit-exam]")){exitExam();return}
  if(event.target.closest("[data-close-report]")){closeReport();return}
  const report=event.target.closest("[data-report]");
  if(report){const attempt=store.attempts.find(a=>a.id===report.dataset.report);attempt?renderReport(attempt):showToast("تعذر العثور على التقرير.");return}
  if(event.target.closest("[data-result-practice]")){modalRoot.innerHTML="";document.body.style.overflow="";openStartModal(examConfig("weak"))}
});

window.addEventListener("hashchange",()=>navigate(location.hash.replace("#","")||"dashboard"));
bootApp();
