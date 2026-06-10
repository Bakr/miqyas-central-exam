const adminView=document.getElementById("admin-view");
const updateLabel=document.getElementById("last-update");
const refreshButton=document.getElementById("refresh-dashboard");
const adminToken=decodeURIComponent(location.pathname.split("/").filter(Boolean).at(-1)||"");
const pageNames={dashboard:"الرئيسية",tests:"الاختبارات",progress:"تقدمي",history:"السجل"};
const unitNames={1:"Personal Interests",2:"House Designs",3:"Job Paths",4:"Glorious Food",5:"Storylines",6:"Outdoor Activities",7:"Trips",8:"Outfits"};
const feedbackNames={suggestion:"اقتراح تطوير",problem:"مشكلة في الموقع",question:"سؤال أو استفسار",content:"ملاحظة على المحتوى",other:"أخرى"};

function escapeHtml(value){return String(value??"").replace(/[&<>'"]/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[char]))}
function formatDate(value){return new Intl.DateTimeFormat("ar-SA",{dateStyle:"short",timeStyle:"short"}).format(new Date(value))}
function bars(items,labelMap={}){
  if(!items.length)return '<div class="empty-admin">لا توجد بيانات حتى الآن.</div>';
  const max=Math.max(...items.map(item=>item.value),1);
  return `<div class="bars">${items.slice(0,8).map(item=>`<div class="bar-row"><span class="bar-label">${escapeHtml(labelMap[item.label]||item.label)}</span><div class="bar-track"><span style="width:${item.value/max*100}%"></span></div><b>${item.value}</b></div>`).join("")}</div>`;
}
function render(data){
  const o=data.overview;
  const dailyMax=Math.max(...data.daily.map(day=>day.pageViews),1);
  const attempts=data.recentAttempts.length?`<table class="admin-table"><thead><tr><th>الطالب</th><th>الاختبار</th><th>النتيجة</th><th>التاريخ</th></tr></thead><tbody>${data.recentAttempts.map(item=>`<tr><td>${escapeHtml(item.name)}</td><td>${escapeHtml(item.title)}</td><td><span class="score-pill">${item.score}%</span></td><td>${formatDate(item.at)}</td></tr>`).join("")}</tbody></table>`:'<div class="empty-admin">لم تكتمل اختبارات بعد.</div>';
  const students=data.recentStudents.length?`<table class="admin-table"><thead><tr><th>الطالب</th><th>المحاولات</th><th>المتوسط</th><th>آخر نشاط</th></tr></thead><tbody>${data.recentStudents.map(item=>`<tr><td>${escapeHtml(item.name)}</td><td>${item.attempts}</td><td><span class="score-pill">${item.averageScore}%</span></td><td>${formatDate(item.lastSeen)}</td></tr>`).join("")}</tbody></table>`:'<div class="empty-admin">لم يسجل طلاب بعد.</div>';
  const feedback=data.recentFeedback.length?`<div class="feedback-admin-list">${data.recentFeedback.map(item=>`<article class="feedback-admin-item"><div><span class="feedback-type">${feedbackNames[item.category]||feedbackNames.other}</span><time>${formatDate(item.at)}</time></div><p>${escapeHtml(item.message)}</p><footer><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(pageNames[item.page]||item.page||"غير محددة")}</span></footer></article>`).join("")}</div>`:'<div class="empty-admin">لم تصل ملاحظات بعد.</div>';
  adminView.innerHTML=`
    <section class="admin-stats">
      <article class="admin-stat"><strong>${o.students}</strong><span>إجمالي الطلاب</span></article>
      <article class="admin-stat"><strong>${o.activeToday}</strong><span>نشط اليوم</span></article>
      <article class="admin-stat"><strong>${o.pageViews}</strong><span>مشاهدة للصفحات</span></article>
      <article class="admin-stat"><strong>${o.examCompletions}</strong><span>اختبار مكتمل</span></article>
      <article class="admin-stat"><strong>${o.averageScore}%</strong><span>متوسط النتائج</span></article>
      <article class="admin-stat"><strong>${o.completionRate}%</strong><span>نسبة إكمال الاختبارات</span></article>
      <article class="admin-stat"><strong>${o.sessions}</strong><span>جلسات الاستخدام</span></article>
      <article class="admin-stat"><strong>${o.activeWeek}</strong><span>نشط خلال أسبوع</span></article>
      <article class="admin-stat feedback-stat"><strong>${o.feedback}</strong><span>ملاحظة مستلمة</span></article>
    </section>
    <section class="admin-grid">
      <article class="admin-panel"><h2>الصفحات الأكثر زيارة</h2><p>عدد مرات فتح كل صفحة</p>${bars(data.popularPages,pageNames)}</article>
      <article class="admin-panel"><h2>الاختبارات الأكثر بدءًا</h2><p>اهتمام الطلاب بأنواع الاختبارات</p>${bars(data.popularExams)}</article>
      <article class="admin-panel wide"><h2>التفاعل خلال آخر 14 يومًا</h2><p>مشاهدات الصفحات اليومية</p><div class="daily-chart">${data.daily.map(day=>`<div class="day-column"><b>${day.pageViews}</b><span class="day-bar" style="height:${Math.max(3,day.pageViews/dailyMax*100)}%"></span><small>${day.date.slice(5)}</small></div>`).join("")}</div></article>
      <article class="admin-panel wide"><h2>أداء الوحدات</h2><p>نسبة الإجابات الصحيحة المجمعة</p><div class="unit-admin-grid">${Object.entries(data.unitPerformance).map(([unit,item])=>`<div class="unit-admin"><strong>${item.total?item.score+"%":"--"}</strong><span>${unit}. ${unitNames[unit]}</span><span>${item.correct}/${item.total} صحيحة</span></div>`).join("")}</div></article>
      <article class="admin-panel wide"><h2>ملاحظات المستخدمين</h2><p>أحدث الرسائل المرسلة من الطلاب</p>${feedback}</article>
      <article class="admin-panel"><h2>آخر الاختبارات</h2><p>أحدث النتائج المسجلة</p>${attempts}</article>
      <article class="admin-panel"><h2>آخر الطلاب نشاطًا</h2><p>ملخص التفاعل لكل طالب</p>${students}</article>
    </section>`;
  updateLabel.textContent=`آخر تحديث: ${formatDate(data.generatedAt)}`;
}
async function loadDashboard(){
  refreshButton.disabled=true;
  try{
    const response=await fetch(`/api/admin/summary?token=${encodeURIComponent(adminToken)}`,{cache:"no-store"});
    if(!response.ok)throw new Error("تعذر فتح لوحة الإدارة.");
    render(await response.json());
  }catch(error){
    adminView.innerHTML=`<div class="admin-loading">${escapeHtml(error.message)}</div>`;
  }finally{refreshButton.disabled=false}
}
refreshButton.addEventListener("click",loadDashboard);
loadDashboard();
setInterval(loadDashboard,30000);
