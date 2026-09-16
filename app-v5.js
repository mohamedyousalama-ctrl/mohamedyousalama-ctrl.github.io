const ADMIN_USER = "admin";
const ADMIN_PASS = "Weekend@2026";
const EXAM_MS = 25 * 60 * 1000;
const STORE_KEY = "tw_academy_v5";
const CLOUD = "https://crudcrud.com/api/fa054632acfd4163940c140ee788800b/results";
const $ = (s, r) => (r||document).querySelector(s);
const app = () => document.getElementById("app");
const now = () => Date.now();
const pad = n => String(n).padStart(2,"0");
function fmt(ms){const s=Math.max(0,Math.floor(ms/1000));return pad(Math.floor(s/3600))+":"+pad(Math.floor((s%3600)/60))+":"+pad(s%60);}
function escapeHtml(s){return String(s==null?"":s).split("&").join("&#38;").split("<").join("&#60;").split(">").join("&#62;").split('"').join("&#34;").split("'").join("&#39;");}
function loadState(){try{return JSON.parse(localStorage.getItem(STORE_KEY)||"null")}catch(e){return null}}
function saveState(s){localStorage.setItem(STORE_KEY, JSON.stringify(s))}
function lockKey(email){return "tw_lock_v5_"+(email||"").toLowerCase()}
function readLock(email){try{return JSON.parse(localStorage.getItem(lockKey(email))||"null")}catch(e){return null}}
function writeLock(){if(!state.profile.email) return; localStorage.setItem(lockKey(state.profile.email), JSON.stringify({startedAt:state.startedAt,answers:state.answers,idx:state.idx,submitted:state.submitted,profile:state.profile}));}
function persist(){saveState(state); writeLock();}
function catById(id){return CATEGORIES.find(c=>c.id===id)}
function letter(i){return ["أ","ب","ج","د","هـ","و"][i]||String(i+1)}
function currentRole(){return state.profile.role||state.answers.p1||""}
function currentBranch(){return state.profile.branch||state.answers.p2||""}
function usedMs(){return state.startedAt ? Math.max(0, now()-state.startedAt) : 0}
function leftMs(){return Math.max(0, EXAM_MS - usedMs())}
let state=loadState()||{view:"home",profile:{name:"",email:"",years:"",role:"",branch:""},answers:{},idx:0,startedAt:null,submitted:false,submittedAt:null};
let adminUnlock=sessionStorage.getItem("tw_admin")==="1";
let tickTimer=null;
let cloudCache=[];
function materialize(q){
  if(q.type!=="price") return q;
  const table=PRICE[currentBranch()]||{};
  const correctVal=table[q.key];
  if(correctVal==null) return { ...q, type:"single", correct:"ask", options:[{id:"guess",t:"أخمّن سعر فرع آخر."},{id:"ask",t:"أفتح ركاز الفرع وأؤكد السعر قبل أن أنطق رقمًا."},{id:"old",t:"أستخدم سعر حملة قديمة."},{id:"free",t:"أقول إنها مجانية."}] };
  const uniq=[]; Object.keys(PRICE).forEach(function(b){const v=PRICE[b][q.key]; if(v!=null&&uniq.indexOf(v)<0) uniq.push(v)}); uniq.sort(function(a,b){return a-b});
  return { ...q, type:"single", correct:String(correctVal), options: uniq.map(function(v){return {id:String(v), t:v+" ريال"}}) };
}
function activeQuestions(){const role=currentRole(); return QUESTIONS.map(materialize).filter(function(q){return !q.roles||!role||role==="supervisor"||q.roles.indexOf(role)>=0})}
function startClock(){
  stopClock();
  tickTimer=setInterval(function(){
    if(!state.startedAt||state.submitted) return;
    const el=document.getElementById("liveTimer"); const left=leftMs();
    if(el){ el.textContent=fmt(left); if(left<5*60*1000) el.classList.add("low"); else el.classList.remove("low"); }
    if(left<=0){ stopClock(); finish(true); }
  },250);
}
function stopClock(){if(tickTimer) clearInterval(tickTimer); tickTimer=null}
function answered(q){const v=state.answers[q.id]; if(q.type==="text") return !!(v&&String(v).trim()); if(q.type==="multi") return Array.isArray(v)&&v.length>0; return v!=null&&v!==""}
function scoreSubmission(answers){
  const role=(answers&&answers.p1)||currentRole();
  const qs=QUESTIONS.map(materialize).filter(function(q){return !q.roles||!role||role==="supervisor"||q.roles.indexOf(role)>=0});
  const byArea={}; CERT_AREAS.forEach(function(a){byArea[a.id]={got:0,max:0,name:a.name,weight:a.weight}});
  const gates=[];
  qs.forEach(function(q){
    if(!q.points||!q.correct) return;
    const area=q.area||((catById(q.cat)||{}).area); if(!area||!byArea[area]) return;
    byArea[area].max += q.points;
    if(String(answers[q.id])===String(q.correct)) byArea[area].got += q.points; else if(q.critical) gates.push({id:q.id,title:q.title});
  });
  const areas=CERT_AREAS.map(function(a){const v=byArea[a.id]; const pct=v.max?Math.round(v.got/v.max*100):null; return {id:a.id,name:a.name,weight:a.weight,got:v.got,max:v.max,pct:pct}});
  const usable=areas.filter(function(a){return a.pct!=null}); let weighted=0; usable.forEach(function(a){weighted += a.pct*(a.weight/100)});
  const overall=Math.round(weighted);
  return {overall:overall,areas:areas,gates:gates,passed:overall>=80&&usable.every(function(a){return a.pct>=70})&&gates.length===0};
}
function payload(){
  if(state.answers.p1) state.profile.role=state.answers.p1; if(state.answers.p2) state.profile.branch=state.answers.p2;
  const sc=scoreSubmission(state.answers); const qs=activeQuestions();
  return {version:5,brand:"THE WEEKEND",profile:state.profile,answers:state.answers,startedAt:state.startedAt,elapsedMs:usedMs(),elapsed:fmt(usedMs()),submittedAt:state.submittedAt,score:sc,review:qs.map(function(q){return {id:q.id,title:q.title,type:q.type,answer:state.answers[q.id]==null?null:state.answers[q.id],correct:q.correct||null,ok:q.correct?String(state.answers[q.id])===String(q.correct):null}})} ;
}
async function cloudSave(data){
  try{
    const list=await (await fetch(CLOUD)).json();
    const email=(data.profile.email||"").toLowerCase();
    const prev=(list||[]).find(function(x){return x.profile && (x.profile.email||"").toLowerCase()===email});
    const body=JSON.stringify(data);
    if(prev&&prev._id) await fetch(CLOUD+"/"+prev._id,{method:"PUT",headers:{"Content-Type":"application/json"},body:body});
    else await fetch(CLOUD,{method:"POST",headers:{"Content-Type":"application/json"},body:body});
    return true;
  }catch(e){ return false; }
}
async function cloudLoad(){
  try{
    const list=await (await fetch(CLOUD)).json();
    cloudCache=(list||[]).filter(function(x){return x.profile && x.profile.email!=="ping@theweekend.sa"}).sort(function(a,b){return (b.submittedAt||"").localeCompare(a.submittedAt||"")});
  }catch(e){ cloudCache=cloudCache||[]; }
  return cloudCache;
}
function render(){try{ if(state.view==="home") return renderHome(); if(state.view==="login") return renderLogin(); if(state.view==="exam") return renderExam(); if(state.view==="done") return renderDone(); if(state.view==="admin") return renderAdmin(); renderHome(); }catch(err){ app().innerHTML="<div class='screen'><h1>تعذر التشغيل</h1><p class='lead'>"+escapeHtml(err&&err.message)+"</p></div>"; }}
function renderHome(){app().innerHTML='<div class="screen"><div class="brand"><div class="logo"><b>THE WEEKEND ACADEMY</b><span>ذا ويكند</span></div><div class="chip">25 دقيقة</div></div><h1>اختبار الأكاديمية</h1><p class="lead">بعد تسجيل الاسم والبريد يبدأ عدّاد 25 دقيقة ولا يتوقف إذا أغلقت الصفحة أو حدّثت المتصفح.</p><div class="card"><div class="row"><span>النجاح</span><b>80٪ ولا مجال تحت 70٪ وبلا خطأ حرج</b></div><div class="row"><span>النتائج</span><b>تُحفظ تلقائيًا في لوحة المسؤول</b></div></div><div style="height:16px"></div><button class="btn btn-gold" onclick="goLogin()">دخول بالاسم والبريد</button>'+(state.profile.email&&!state.submitted?'<button class="btn btn-ghost" onclick="resume()">متابعة '+escapeHtml(state.profile.name||"")+'</button>':'')+'<div class="footer-link"><button onclick="goAdmin()">لوحة المسؤول</button></div></div>'}
function goLogin(){state.view="login";persist();render()}
function resume(){if(!state.startedAt) state.startedAt=now(); if(state.submitted||leftMs()<=0){finish(true); return;} state.view="exam"; persist(); startClock(); render();}
function goAdmin(){state.view="admin";persist();render()}
function goHome(){state.view="home";persist();render()}
function renderLogin(){const p=state.profile; app().innerHTML='<div class="screen"><div class="brand"><div class="logo"><b>THE WEEKEND</b><span>تسجيل الدخول</span></div><button class="chip" onclick="goHome()">رجوع</button></div><p class="lead">الوقت يبدأ من أول دخول لهذا البريد: 25 دقيقة متصلة.</p><div class="field"><label>الاسم</label><input id="nm" value="'+escapeHtml(p.name)+'"></div><div class="field"><label>البريد</label><input id="em" type="email" value="'+escapeHtml(p.email)+'"></div><div class="field"><label>سنوات الخبرة</label><input id="yr" value="'+escapeHtml(p.years||"")+'"></div><button class="btn btn-gold" onclick="startExam()">بدء الاختبار</button></div>'}
function startExam(){
  const name=$("#nm").value.trim(); const email=$("#em").value.trim().toLowerCase();
  if(name.length<2) return alert("اكتب الاسم"); if(!/.+@.+\..+/.test(email)) return alert("بريد غير صحيح");
  const lock=readLock(email);
  state.profile={name:name,email:email,years:$("#yr").value.trim(),role:(lock&&lock.profile&&lock.profile.role)||"",branch:(lock&&lock.profile&&lock.profile.branch)||""};
  if(lock&&lock.startedAt){
    state.startedAt=lock.startedAt; state.answers=lock.answers||{}; state.idx=lock.idx||0; state.submitted=!!lock.submitted;
    if(state.submitted){ state.view="done"; persist(); render(); return; }
    if(leftMs()<=0){ finish(true); return; }
  } else { state.answers={}; state.idx=0; state.submitted=false; state.submittedAt=null; state.startedAt=now(); }
  state.view="exam"; persist(); startClock(); render();
}
function renderExam(){
  const list=activeQuestions(); if(state.idx>=list.length) state.idx=Math.max(0,list.length-1);
  const q=list[state.idx]; const total=list.length; const pct=Math.round(state.idx/Math.max(total,1)*100); const cat=catById(q.cat); const val=state.answers[q.id]; let body="";
  if(q.type==="text") body='<div class="field"><textarea id="ans">'+escapeHtml(val||"")+'</textarea></div>';
  else if(q.type==="multi") body=q.options.map(function(o,i){const on=Array.isArray(val)&&val.indexOf(o.id)>=0; return '<label class="opt '+(on?"on":"")+'"><input type="checkbox" class="hidden" '+(on?"checked":"")+' onchange="toggleMulti(\''+q.id+'\',\''+o.id+'\')"><b class="k">'+letter(i)+'</b><span>'+escapeHtml(o.t)+'</span></label>'}).join("");
  else body=q.options.map(function(o,i){const on=String(val)===String(o.id); return '<div class="opt '+(on?"on":"")+'" onclick="pick(\''+q.id+'\',\''+String(o.id)+'\')"><b class="k">'+letter(i)+'</b><span>'+escapeHtml(o.t)+'</span></div>'}).join("");
  app().innerHTML='<div class="screen"><div class="topbar"><div class="chip">'+(state.idx+1)+' / '+total+'</div><div class="progress"><div class="bar" style="width:'+pct+'%"></div></div><div class="timerbox"><span>متبقي</span><div class="timer" id="liveTimer">'+fmt(leftMs())+'</div></div></div><div class="meta"><span>'+escapeHtml(state.profile.name||"")+(currentBranch()?" • "+currentBranch():"")+'</span><span>'+pct+'%</span></div>'+(cat?'<p class="qcat">'+cat.n+' — '+escapeHtml(cat.name)+'</p>':'')+(q.critical?'<div class="gate">خطأ حرج يسقط الاعتماد</div>':'')+'<h2 class="qtitle">'+escapeHtml(q.title)+'</h2><p class="qtext">'+escapeHtml(q.text)+'</p>'+body+'<div class="nav"><button class="btn btn-ghost" '+(state.idx===0?"disabled":"")+' onclick="prevQ()">السابق</button><button class="btn btn-gold" onclick="nextQ()">'+(state.idx===total-1?"تسليم وحفظ النتيجة":"حفظ والتالي")+'</button></div></div>';
}
function pick(id,opt){state.answers[id]=opt; if(id==="p1") state.profile.role=opt; if(id==="p2") state.profile.branch=opt; persist(); render();}
function toggleMulti(id,opt){const cur=Array.isArray(state.answers[id])?state.answers[id].slice():[]; const i=cur.indexOf(opt); if(i>=0) cur.splice(i,1); else cur.push(opt); state.answers[id]=cur; persist(); render();}
function captureText(){const list=activeQuestions(); const q=list[state.idx]; if(q&&q.type==="text"){const t=document.getElementById("ans"); if(t) state.answers[q.id]=t.value; persist();}}
function prevQ(){captureText(); if(state.idx>0) state.idx--; persist(); render();}
function nextQ(){captureText(); const list=activeQuestions(); const q=list[state.idx]; if(!answered(q)&&!confirm("لم تُجب. المتابعة؟")) return; if(state.idx<list.length-1){state.idx++; persist(); render(); return;} finish(true);}
async function finish(auto){ if(state.submitted && state.view==="done") return; state.submitted=true; state.submittedAt=new Date().toISOString(); persist(); stopClock(); state.view="done"; persist(); render(); const ok=await cloudSave(payload()); const note=document.getElementById("saveNote"); if(note) note.textContent=ok?"النتيجة وصلت لوحة المسؤول.":"تعذر الرفع. أبقِ الاتصال وافتح الصفحة مرة أخرى."; }
function renderDone(){const sc=scoreSubmission(state.answers); app().innerHTML='<div class="screen"><div class="brand"><div class="logo"><b>THE WEEKEND</b><span>'+(sc.passed?"ناجح أولي":"غير مكتمل")+'</span></div><div class="chip">'+fmt(usedMs())+'</div></div><p class="lead">'+escapeHtml(state.profile.name)+" • "+escapeHtml(currentRole())+" • "+escapeHtml(currentBranch())+'</p><div class="done-score">'+sc.overall+'%</div><p class="small" id="saveNote">جاري حفظ النتيجة للمسؤول…</p><div class="list">'+sc.areas.filter(function(a){return a.pct!=null}).map(function(a){return '<div class="row"><span>'+escapeHtml(a.name)+'</span><b class="'+(a.pct>=80?"good":a.pct<70?"weak":"")+'">'+a.pct+'%</b></div>'}).join("")+'</div>'+(sc.gates.length?'<div class="gate">'+sc.gates.map(function(g){return g.title}).join("، ")+'</div>':'')+'</div>'; cloudSave(payload()).then(function(ok){const note=document.getElementById("saveNote"); if(note) note.textContent=ok?"النتيجة وصلت لوحة المسؤول.":"تعذر الرفع.";});}
function renderAdmin(){if(!adminUnlock){app().innerHTML='<div class="screen"><div class="brand"><div class="logo"><b>THE WEEKEND</b><span>لوحة المسؤول</span></div><button class="chip" onclick="goHome()">رجوع</button></div><div class="field"><label>اسم المسؤول</label><input id="adm" value="admin"></div><div class="field"><label>كلمة المرور</label><input id="pin" type="password"></div><button class="btn btn-gold" onclick="unlock()">دخول</button></div>'; return;} app().innerHTML='<div class="screen"><div class="brand"><div class="logo"><b>THE WEEKEND</b><span>النتائج</span></div><button class="chip" onclick="goHome()">الرئيسية</button></div><p class="lead" id="adminLead">جاري جلب النتائج…</p><button class="btn btn-gold" onclick="refreshAdmin()">تحديث</button><div id="adminList"></div><div id="subDetail"></div></div>'; refreshAdmin();}
function unlock(){const u=(( $("#adm")&&$("#adm").value)||"").trim().toLowerCase(); const pw=($("#pin")&&$("#pin").value)||""; if(u!==ADMIN_USER||pw!==ADMIN_PASS) return alert("بيانات الدخول غير صحيحة"); adminUnlock=true; sessionStorage.setItem("tw_admin","1"); render();}
async function refreshAdmin(){const lead=document.getElementById("adminLead"); const box=document.getElementById("adminList"); if(lead) lead.textContent="جاري الجلب…"; const list=await cloudLoad(); if(lead) lead.textContent=list.length+" نتيجة محفوظة تلقائيًا."; if(!box) return; if(!list.length){box.innerHTML='<p class="small">لا نتائج بعد.</p>'; return;} box.innerHTML=list.map(function(s,i){return '<div class="admin-item" onclick="openSub('+i+')"><b>'+escapeHtml(s.profile&&s.profile.name||"")+'</b><div class="small">'+escapeHtml(s.profile&&s.profile.email||"")+' • '+escapeHtml(s.profile&&s.profile.role||"")+' • '+escapeHtml(s.profile&&s.profile.branch||"")+' • '+(s.score?s.score.overall:0)+'٪ • '+(s.elapsed||"")+'</div></div>'}).join("");}
function openSub(i){const s=cloudCache[i]; if(!s) return; const sc=s.score||scoreSubmission(s.answers||{}); const rows=(s.review||[]).map(function(r){const mark=r.ok===true?" ✓":(r.ok===false?" ✗":""); const ans=Array.isArray(r.answer)?r.answer.join("، "):(r.answer==null?"—":r.answer); return '<div class="card" style="margin-top:8px"><div class="qcat">'+escapeHtml(r.title)+mark+'</div><div class="detail">'+escapeHtml(String(ans))+'</div></div>'}).join(""); document.getElementById("subDetail").innerHTML='<h2 style="font-size:18px">'+escapeHtml(s.profile.name)+'</h2><div class="small">'+escapeHtml(s.profile.email)+' • '+escapeHtml(s.profile.role||"")+' • '+escapeHtml(s.profile.branch||"")+'</div><div class="done-score">'+sc.overall+'%</div><div class="list">'+(sc.areas||[]).filter(function(a){return a.pct!=null}).map(function(a){return '<div class="row"><span>'+escapeHtml(a.name)+'</span><b>'+a.pct+'%</b></div>'}).join("")+'</div>'+rows;}
window.goLogin=goLogin; window.resume=resume; window.goAdmin=goAdmin; window.goHome=goHome; window.startExam=startExam; window.pick=pick; window.toggleMulti=toggleMulti; window.prevQ=prevQ; window.nextQ=nextQ; window.unlock=unlock; window.openSub=openSub; window.refreshAdmin=refreshAdmin;
if(state.view==="exam" && !state.submitted){ if(!state.startedAt) state.startedAt=now(); if(leftMs()<=0) finish(true); else startClock(); }
render();
