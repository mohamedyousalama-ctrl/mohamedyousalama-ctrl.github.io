const ADMIN_USER = "admin";
const ADMIN_PASS = "Weekend@2026";
const EXAM_MS = 45 * 60 * 1000;
const STORE_KEY = "tw_academy_v3";
const SUBS_KEY = "tw_academy_subs_v3";
const $ = (s, r) => (r||document).querySelector(s);
const app = () => document.getElementById("app");
const now = () => Date.now();
const pad = n => String(n).padStart(2,"0");
function fmt(ms){const s=Math.max(0,Math.floor(ms/1000));return pad(Math.floor(s/3600))+":"+pad(Math.floor((s%3600)/60))+":"+pad(s%60);}
function loadState(){try{return JSON.parse(localStorage.getItem(STORE_KEY)||"null")}catch(e){return null}}
function saveState(s){localStorage.setItem(STORE_KEY,JSON.stringify(s))}
function loadSubs(){try{return JSON.parse(localStorage.getItem(SUBS_KEY)||"[]")}catch(e){return []}}
function saveSubs(a){localStorage.setItem(SUBS_KEY,JSON.stringify(a))}
function catById(id){return CATEGORIES.find(c=>c.id===id)}
function letter(i){return ["أ","ب","ج","د","هـ","و"][i]||String(i+1)}
function escapeHtml(s){
  return String(s==null?"":s)
    .split("&").join("&#38;")
    .split("<").join("&#60;")
    .split(">").join("&#62;")
    .split('"').join("&#34;")
    .split("'").join("&#39;");
}
let state=loadState()||{view:"home",profile:{name:"",email:"",years:"",role:"",branch:""},answers:{},idx:0,startedAt:null,elapsed:0,lastTick:null,submitted:false,submittedAt:null};
let adminUnlock=sessionStorage.getItem("tw_admin")==="1";
let tickTimer=null;
function persist(){saveState(state)}
function currentRole(){return state.profile.role||state.answers.p1||""}
function currentBranch(){return state.profile.branch||state.answers.p2||""}
function materialize(q){
  if(q.type!=="price") return q;
  const table=PRICE[currentBranch()]||{};
  const correctVal=table[q.key];
  if(correctVal==null){
    return { ...q, type:"single", correct:"ask", options:[
      {id:"guess", t:"أخمّن سعر فرع آخر."},
      {id:"ask", t:"أفتح ركاز الفرع وأؤكد السعر قبل أن أنطق رقمًا."},
      {id:"old", t:"أستخدم سعر حملة قديمة."},
      {id:"free", t:"أقول إنها مجانية."}
    ]};
  }
  const uniq=[];
  Object.keys(PRICE).forEach(function(b){const v=PRICE[b][q.key]; if(v!=null && uniq.indexOf(v)<0) uniq.push(v);});
  uniq.sort(function(a,b){return a-b});
  return { ...q, type:"single", correct:String(correctVal), options: uniq.map(function(v){return {id:String(v), t:v+" ريال"}}) };
}
function activeQuestions(){
  const role=currentRole();
  return QUESTIONS.map(materialize).filter(function(q){return !q.roles||!role||role==="supervisor"||q.roles.indexOf(role)>=0});
}
function startClock(){
  stopClock(); state.lastTick=now();
  tickTimer=setInterval(function(){
    if(!state.startedAt||state.submitted) return;
    const t=now();
    if(document.hidden){state.lastTick=t; persist(); return;}
    state.elapsed += (t-(state.lastTick||t)); state.lastTick=t; persist();
    const el=document.getElementById("liveTimer");
    if(el){
      const left=Math.max(0,EXAM_MS-state.elapsed);
      el.textContent=fmt(left);
      if(left<5*60*1000) el.classList.add("low"); else el.classList.remove("low");
      if(left<=0&&!state.submitted&&state.view==="exam"){stopClock(); finish(true);}
    }
  },1000);
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
    const area=q.area||((catById(q.cat)||{}).area);
    if(!area||!byArea[area]) return;
    byArea[area].max += q.points;
    if(String(answers[q.id])===String(q.correct)) byArea[area].got += q.points;
    else if(q.critical) gates.push({id:q.id,title:q.title});
  });
  const areas=CERT_AREAS.map(function(a){const v=byArea[a.id]; const pct=v.max?Math.round(v.got/v.max*100):null; return {id:a.id,name:a.name,weight:a.weight,got:v.got,max:v.max,pct:pct}});
  const usable=areas.filter(function(a){return a.pct!=null});
  let weighted=0; usable.forEach(function(a){weighted += a.pct*(a.weight/100)});
  const overall=Math.round(weighted);
  return {overall:overall,areas:areas,gates:gates,passed:overall>=80&&usable.every(function(a){return a.pct>=70})&&gates.length===0};
}
function download(filename,text,type){const blob=new Blob([text],{type:type||"application/json"}); const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download=filename; a.click();}
function payload(){if(state.answers.p1) state.profile.role=state.answers.p1; if(state.answers.p2) state.profile.branch=state.answers.p2; return {version:3,brand:"THE WEEKEND",profile:state.profile,answers:state.answers,startedAt:state.startedAt,elapsedMs:state.elapsed,elapsed:fmt(state.elapsed),submittedAt:state.submittedAt,score:scoreSubmission(state.answers)}}
function render(){
  try{
    if(state.view==="home") return renderHome();
    if(state.view==="login") return renderLogin();
    if(state.view==="exam") return renderExam();
    if(state.view==="done") return renderDone();
    if(state.view==="admin") return renderAdmin();
    renderHome();
  }catch(err){ app().innerHTML="<div class='screen'><h1>تعذر التشغيل</h1><p class='lead'>"+escapeHtml(err&&err.message)+"</p></div>"; }
}
function renderHome(){
  app().innerHTML='<div class="screen"><div class="brand"><div class="logo"><b>THE WEEKEND ACADEMY</b><span>ذا ويكند</span></div><div class="chip">45 دقيقة</div></div><h1>اختبار الأكاديمية</h1><p class="lead">درجة تعلّم حسب الدور والفرع.</p><div class="card"><div class="row"><span>النجاح</span><b>80٪ ولا مجال تحت 70٪ وبلا خطأ حرج</b></div><div class="row"><span>الوقت</span><b>عداد تنازلي 45:00</b></div></div><div style="height:16px"></div><button class="btn btn-gold" onclick="goLogin()">دخول بالاسم والبريد</button>'+(state.profile.email&&!state.submitted?'<button class="btn btn-ghost" onclick="resume()">متابعة '+escapeHtml(state.profile.name||"")+'</button>':'')+'<div class="footer-link"><button onclick="goAdmin()">لوحة المسؤول</button></div></div>';
}
function goLogin(){state.view="login";persist();render()}
function resume(){if(!state.startedAt) state.startedAt=now(); state.view="exam";persist();startClock();render()}
function goAdmin(){state.view="admin";persist();render()}
function goHome(){state.view="home";persist();render()}
function renderLogin(){const p=state.profile; app().innerHTML='<div class="screen"><div class="brand"><div class="logo"><b>THE WEEKEND</b><span>تسجيل الدخول</span></div><button class="chip" onclick="goHome()">رجوع</button></div><div class="field"><label>الاسم</label><input id="nm" value="'+escapeHtml(p.name)+'"></div><div class="field"><label>البريد</label><input id="em" type="email" value="'+escapeHtml(p.email)+'"></div><div class="field"><label>سنوات الخبرة</label><input id="yr" value="'+escapeHtml(p.years||"")+'"></div><button class="btn btn-gold" onclick="startExam()">بدء العداد والاختبار</button></div>'}
function startExam(){const name=$("#nm").value.trim(); const email=$("#em").value.trim().toLowerCase(); if(name.length<2) return alert("اكتب الاسم"); if(!/.+@.+\..+/.test(email)) return alert("بريد غير صحيح"); const same=state.profile.email===email&&state.profile.name===name; if(!same){state.answers={};state.idx=0;state.elapsed=0;state.submitted=false;state.submittedAt=null;} state.profile={name:name,email:email,years:$("#yr").value.trim(),role:state.profile.role||"",branch:state.profile.branch||""}; if(!state.startedAt||!same) state.startedAt=now(); state.view="exam"; persist(); startClock(); render();}
function renderExam(){
  const list=activeQuestions(); if(state.idx>=list.length) state.idx=Math.max(0,list.length-1);
  const q=list[state.idx]; const total=list.length; const pct=Math.round(state.idx/Math.max(total,1)*100); const cat=catById(q.cat); const val=state.answers[q.id]; let body="";
  if(q.type==="text") body='<div class="field"><textarea id="ans">'+escapeHtml(val||"")+'</textarea></div>';
  else if(q.type==="multi") body=q.options.map(function(o,i){const on=Array.isArray(val)&&val.indexOf(o.id)>=0; return '<label class="opt '+(on?"on":"")+'"><input type="checkbox" class="hidden" '+(on?"checked":"")+' onchange="toggleMulti(\''+q.id+'\',\''+o.id+'\')"><b class="k">'+letter(i)+'</b><span>'+escapeHtml(o.t)+'</span></label>'}).join("");
  else body=q.options.map(function(o,i){const on=String(val)===String(o.id); return '<div class="opt '+(on?"on":"")+'" onclick="pick(\''+q.id+'\',\''+String(o.id)+'\')"><b class="k">'+letter(i)+'</b><span>'+escapeHtml(o.t)+'</span></div>'}).join("");
  app().innerHTML='<div class="screen"><div class="topbar"><div class="chip">'+(state.idx+1)+' / '+total+'</div><div class="progress"><div class="bar" style="width:'+pct+'%"></div></div><div class="timerbox"><span>متبقي</span><div class="timer" id="liveTimer">'+fmt(Math.max(0,EXAM_MS-state.elapsed))+'</div></div></div><div class="meta"><span>'+escapeHtml(state.profile.name||"")+(currentBranch()?" • "+currentBranch():"")+'</span><span>'+pct+'%</span></div>'+(cat?'<p class="qcat">'+cat.n+' — '+escapeHtml(cat.name)+'</p>':'')+(q.critical?'<div class="gate">خطأ حرج يسقط الاعتماد</div>':'')+'<h2 class="qtitle">'+escapeHtml(q.title)+'</h2><p class="qtext">'+escapeHtml(q.text)+'</p>'+body+'<div class="nav"><button class="btn btn-ghost" '+(state.idx===0?"disabled":"")+' onclick="prevQ()">السابق</button><button class="btn btn-gold" onclick="nextQ()">'+(state.idx===total-1?"تسليم":"حفظ والتالي")+'</button></div><div class="footer-link"><button onclick="pauseHome()">حفظ والخروج</button></div></div>';
}
function pick(id,opt){state.answers[id]=opt; if(id==="p1") state.profile.role=opt; if(id==="p2") state.profile.branch=opt; persist(); render();}
function toggleMulti(id,opt){const cur=Array.isArray(state.answers[id])?state.answers[id].slice():[]; const i=cur.indexOf(opt); if(i>=0) cur.splice(i,1); else cur.push(opt); state.answers[id]=cur; persist(); render();}
function captureText(){const list=activeQuestions(); const q=list[state.idx]; if(q&&q.type==="text"){const t=document.getElementById("ans"); if(t) state.answers[q.id]=t.value;}}
function prevQ(){captureText(); if(state.idx>0) state.idx--; persist(); render();}
function nextQ(){captureText(); const list=activeQuestions(); const q=list[state.idx]; if(!answered(q)&&!confirm("لم تُجب. المتابعة؟")) return; if(state.idx<list.length-1){state.idx++; persist(); render(); return;} finish(false);}
function pauseHome(){captureText(); stopClock(); state.view="home"; persist(); render();}
function finish(auto){if(!auto&&!confirm("تسليم الاختبار؟")) return; state.submitted=true; state.submittedAt=new Date().toISOString(); const data=payload(); const subs=loadSubs().filter(function(s){return s.profile.email!==data.profile.email}); subs.unshift(data); saveSubs(subs); stopClock(); state.view="done"; persist(); render();}
function renderDone(){const sc=scoreSubmission(state.answers); app().innerHTML='<div class="screen"><div class="brand"><div class="logo"><b>THE WEEKEND</b><span>'+(sc.passed?"ناجح أولي":"غير مكتمل")+'</span></div><div class="chip">'+fmt(state.elapsed)+'</div></div><p class="lead">'+escapeHtml(state.profile.name)+" • "+escapeHtml(currentRole())+" • "+escapeHtml(currentBranch())+'</p><div class="done-score">'+sc.overall+'%</div><div class="list">'+sc.areas.filter(function(a){return a.pct!=null}).map(function(a){return '<div class="row"><span>'+escapeHtml(a.name)+'</span><b class="'+(a.pct>=80?"good":a.pct<70?"weak":"")+'">'+a.pct+'%</b></div>'}).join("")+'</div>'+(sc.gates.length?'<div class="gate">'+sc.gates.map(function(g){return g.title}).join("، ")+'</div>':'')+'<button class="btn btn-gold" onclick="exportMine()">تحميل JSON للمسؤول</button><button class="btn btn-ghost" onclick="goAdmin()">لوحة المسؤول</button></div>'}
function exportMine(){download("weekend-academy-"+state.profile.email+".json", JSON.stringify(payload(),null,2))}
function renderAdmin(){if(!adminUnlock){app().innerHTML='<div class="screen"><div class="brand"><div class="logo"><b>THE WEEKEND</b><span>لوحة المسؤول</span></div><button class="chip" onclick="goHome()">رجوع</button></div><div class="field"><label>اسم المسؤول</label><input id="adm" value="admin"></div><div class="field"><label>كلمة المرور</label><input id="pin" type="password"></div><button class="btn btn-gold" onclick="unlock()">دخول</button></div>'; return;} const subs=loadSubs(); app().innerHTML='<div class="screen"><div class="brand"><div class="logo"><b>THE WEEKEND</b><span>النتائج</span></div><button class="chip" onclick="goHome()">الرئيسية</button></div><p class="lead">'+subs.length+' محاولة على هذا الجهاز.</p><button class="btn btn-gold" onclick="document.getElementById(\x27imp\x27).click()">استيراد JSON</button><div class="field" style="margin-top:12px"><label>لصق JSON</label><textarea id="pasteBox"></textarea></div><button class="btn btn-ghost" onclick="importPaste()">حفظ الملصوق</button><input id="imp" type="file" accept="application/json,.json" class="hidden" multiple onchange="importFiles(event)"><button class="btn btn-ghost" onclick="exportCSV()">CSV</button><div style="height:12px"></div>'+subs.map(function(s,i){return '<div class="admin-item" onclick="openSub('+i+')"><b>'+escapeHtml(s.profile.name||"")+'</b><div class="small">'+escapeHtml(s.profile.email||"")+' • '+escapeHtml(s.profile.branch||"")+' • '+(s.score?s.score.overall:0)+'٪</div></div>'}).join("")+'<div id="subDetail"></div></div>'}
function unlock(){const u=(( $("#adm")&&$("#adm").value)||"").trim().toLowerCase(); const pw=($("#pin")&&$("#pin").value)||""; if(u!==ADMIN_USER||pw!==ADMIN_PASS) return alert("بيانات الدخول غير صحيحة"); adminUnlock=true; sessionStorage.setItem("tw_admin","1"); render();}
function openSub(i){const s=loadSubs()[i]; if(!s) return; const sc=s.score||scoreSubmission(s.answers||{}); document.getElementById("subDetail").innerHTML='<h2 style="font-size:18px">'+escapeHtml(s.profile.name)+'</h2><div class="done-score">'+sc.overall+'%</div><div class="list">'+(sc.areas||[]).filter(function(a){return a.pct!=null}).map(function(a){return '<div class="row"><span>'+escapeHtml(a.name)+'</span><b>'+a.pct+'%</b></div>'}).join("")+'</div><pre class="detail">'+escapeHtml(JSON.stringify(s.answers,null,2))+'</pre>'}
function importFiles(e){const files=[].slice.call(e.target.files); let left=files.length; if(!left) return; const acc=loadSubs(); files.forEach(function(f){const r=new FileReader(); r.onload=function(){try{const data=JSON.parse(r.result); if(!data.profile||!data.answers) throw new Error("bad"); data.score=data.score||scoreSubmission(data.answers); const idx=acc.findIndex(function(x){return x.profile&&x.profile.email===data.profile.email}); if(idx>=0) acc[idx]=data; else acc.unshift(data);}catch(err){alert("ملف غير صالح")} left--; if(!left){saveSubs(acc); render();}}; r.readAsText(f);});}
function importPaste(){try{const data=JSON.parse(document.getElementById("pasteBox").value); if(!data.profile||!data.answers) throw new Error("bad"); data.score=data.score||scoreSubmission(data.answers); const acc=loadSubs(); const idx=acc.findIndex(function(x){return x.profile&&x.profile.email===data.profile.email}); if(idx>=0) acc[idx]=data; else acc.unshift(data); saveSubs(acc); render();}catch(err){alert("JSON غير صالح")}}
function exportCSV(){const subs=loadSubs(); const lines=["name,email,role,branch,elapsed,overall,passed,gates"]; subs.forEach(function(s){const sc=s.score||scoreSubmission(s.answers||{}); const row=[s.profile.name,s.profile.email,s.profile.role,s.profile.branch,s.elapsed,sc.overall,sc.passed,(sc.gates||[]).length]; lines.push(row.map(function(v){return '"'+String(v==null?"":v).split('"').join('""')+'"'}).join(","));}); download("weekend-academy.csv", lines.join("\n"), "text/csv")}
window.goLogin=goLogin; window.resume=resume; window.goAdmin=goAdmin; window.goHome=goHome; window.startExam=startExam; window.pick=pick; window.toggleMulti=toggleMulti; window.prevQ=prevQ; window.nextQ=nextQ; window.pauseHome=pauseHome; window.exportMine=exportMine; window.unlock=unlock; window.openSub=openSub; window.importFiles=importFiles; window.importPaste=importPaste; window.exportCSV=exportCSV;
if(state.view==="exam"&&!state.submitted) startClock();
render();
