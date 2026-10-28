/* ===== Connection to the Invitations Database (Google Apps Script) ===== */
const API = window.AZUR_CONFIG.apiUrl;
const Q = new URLSearchParams(location.search);
const INVITEE = { email:(Q.get("email")||"").trim(), name:(Q.get("name")||"").trim(), company:(Q.get("company")||"").trim() };
const LIST = (Q.get("list")||"").trim();
let INV = null, RSVP_ON = true, CFG = null, STATS = {};
function loadInvitation(){ return AZUR_API.load(Q.get("inv")); }
let VIEWER = INVITEE.email;
try{ if(!VIEWER){ VIEWER = localStorage.getItem(AZUR_API.prefix+"viewer") || ("guest-"+Math.random().toString(36).slice(2,10)); localStorage.setItem(AZUR_API.prefix+"viewer",VIEWER); } }catch(e){ VIEWER = VIEWER || ("guest-"+Math.random().toString(36).slice(2,10)); }
 
const $ = id => document.getElementById(id);
const esc = s => String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
 
/* ---------- settings from the panel (Details tab) ---------- */
function cfgDefaults(){ return {host:"",kind:"invitation",loc:{mode:"in",address:"",showMap:true,url:"",note:""},allDay:false,showCal:true,
  panel:{on:false,order:["summary","sections","links","gallery","guests","files","sponsors"],summary:{on:false,text:""},sections:{on:false,items:[]},links:{on:false,items:[]},gallery:{on:false,items:[]},guests:{on:false,mode:"names"},files:{on:false,items:[]},sponsors:{on:false,items:[]}},
  rsvp:{on:true,dueOn:false,due:"",capOn:false,cap:0,change:true,fields:{first:"req",last:"req",email:"req",phone:"req",company:"req",idDoc:"off",plate:"off"},questions:[],privacy:""}}; }
function mergeCfg(d,s){ if(!s||typeof s!=="object") return d;
  Object.keys(s).forEach(k=>{ const a=d[k], b=s[k]; if(a&&typeof a==="object"&&!Array.isArray(a)&&b&&typeof b==="object"&&!Array.isArray(b)) mergeCfg(a,b); else if(b!==undefined) d[k]=b; }); return d; }
const PRIV_DEFAULT="I understand that Azur Group will use these details to manage my attendance.";
const isHttps=u=>/^https:\/\/[^\s]+$/i.test(u||"");
const fmtDay=iso=>{ try{ return new Date(iso+"T12:00:00").toLocaleDateString("en-GB",{day:"numeric",month:"long"}); }catch(e){ return iso; } };
let HOST="Azur Group", TIME_TEXT="", MAP_URL="", JOIN_URL="", PANEL_ON=false, ANSWERED=null;
 
/* ---------- sizing ---------- */
/* The card is drawn at its final (largest) size and scaled DOWN while inside the envelope, so text stays sharp. */
let EW,EH,CW,CH,SF=1,K=1,ROT=90,ASPECT=null;
const isWide=()=>innerWidth>700 && innerWidth>innerHeight*1.05;
/* room taken by the RSVP box: on the right (desktop) or at the bottom (phones) */
const sideW=()=>{ const s=$("side"); return s?s.offsetWidth+48:0; }, sideH=()=>{ const s=$("side"); return s?s.offsetHeight+30:0; };
/* Final layout. Phones: card in the space between the top bar and the RSVP box (never touching them), small envelope peeking above.
   Wide screens: card is the hero, smaller envelope peeking out on the left, RSVP box on the right. */
const ENV_END_WIDE=.8, ENV_END_PHONE=.7;
function phoneBox(){ const vh=innerHeight, bar=$("bar"), side=$("side");
  const top=(bar?bar.offsetHeight:44)+8, bottom=(side&&side.offsetTop>0?side.offsetTop:vh-150)-12;
  const peek=EH*ENV_END_PHONE*.14; return {top,bottom,peek,H:Math.max(80,bottom-top-peek)}; }
function finalScale(){ const vw=innerWidth, vh=innerHeight;
  if(isWide()){ const avail=vw-sideW()-24; return Math.min(2.4,(vh*.88)/CH,(avail-EW*ENV_END_WIDE*.2-24)/CW); }
  return Math.min(2.6,(vw*.94)/CW,phoneBox().H/CH); }
function size(){
  const vw=innerWidth, vh=innerHeight;
  // Envelope is always landscape. Landscape / square cards lie flat inside it; portrait cards lie on their side
  // and stand up when they come out (Greenvelope behaviour). Inside the envelope the card is scaled down.
  EW=Math.min(540, vw*.84, vh*(isWide()?.95:.8)); EH=EW*.69;
  const A = ASPECT || 0.7;                       // card width / height (text card = portrait)
  if(A>=1){ ROT=0; CW=EW*.86; CH=CW/A; if(CH>EH*.86){ CH=EH*.86; CW=CH*A; } }
  else { ROT=90; CH=EW*.84; CW=CH*A; if(CW>EH*.84){ CW=EH*.84; CH=CW/A; } }
  SF=finalScale(); K=1/SF;
  const r=document.documentElement.style;
  r.setProperty("--ew",EW+"px"); r.setProperty("--eh",EH+"px"); r.setProperty("--cw",(CW*SF)+"px"); r.setProperty("--ch",(CH*SF)+"px");
  if(!opened && !running) card.style.transform=`rotate(${ROT}deg) scale(${K})`;
}
function finalPose(){
  const vw=innerWidth, vh=innerHeight;
  if(isWide()){
    const e=ENV_END_WIDE, avail=vw-sideW()-24, cw=CW*SF, ew=EW*e, peek=Math.min(ew*.5, Math.max(ew*.2, avail-cw-40));
    const left=(avail-(peek+cw))/2 + 12;                 // composition centred in the space left of the RSVP box
    const envX=left+ew/2-vw/2, cardX=left+peek+cw/2-vw/2, dy=EH*e*.12;
    return { env:`translate(${envX}px, ${dy}px) scale(${e})`, card:`translate(${(cardX-envX)/e}px, ${-dy/e}px) scale(${1/e}) rotate(0deg)`, envOpacity:1 };
  }
  const e=ENV_END_PHONE, b=phoneBox(), off=Math.max(0,(b.bottom-b.top-b.peek-CH*SF)/2), envCy=b.top+off+EH*e/2, cardCy=b.top+off+b.peek+CH*SF/2;
  return { env:`translateY(${envCy-vh/2}px) scale(${e})`, card:`translate(0px, ${(cardCy-envCy)/e}px) scale(${1/e}) rotate(0deg)`, envOpacity:1 };
}
 
/* ---------- animation ---------- */
const env=$("env"), back=$("back"), flap=$("flap"), card=$("card");
let running=false, opened=false;
const anim=(el,kf,o)=>el.animate(kf,Object.assign({fill:"forwards",easing:"cubic-bezier(.45,.05,.25,1)"},o)).finished;
const wait=ms=>new Promise(r=>setTimeout(r,ms));
 
function reset(){
  [env,back,flap,card].forEach(el=>el.getAnimations().forEach(a=>a.cancel()));
  env.style.transformStyle="preserve-3d"; back.classList.remove("flat");
  env.querySelector(".front").hidden=false;
  flap.style.zIndex=4; card.style.zIndex=2; env.style.opacity=0;
  $("side").classList.remove("show"); $("bar").classList.remove("show"); opened=false;
}
function showFinal(){
  const p=finalPose();
  env.querySelector(".front").hidden=true; back.classList.add("flat"); env.style.transformStyle="flat";
  env.style.opacity=1; card.style.zIndex=5;
  [env,back,flap,card].forEach(el=>el.getAnimations().forEach(a=>a.cancel()));
  flap.style.zIndex=4; flap.style.transform="none"; card.style.transform=p.card; env.style.transform=p.env; env.style.opacity=p.envOpacity;
  revealUi();
}
let CAL_OK=false, MAP_OK=false, JOIN_OK=false;
/* buttons beside the card are set as soon as the invitation loads (the box is still invisible), so the final layout already leaves room for them */
function setButtons(){ $("calBtn").hidden=!CAL_OK; $("mapBtn").hidden=!MAP_OK; $("joinBtn").hidden=!JOIN_OK; $("replayBtn").hidden=false;
  const vis=[...$("side").querySelectorAll(":scope > .btn")].filter(b=>!b.hidden); vis.forEach(b=>b.classList.remove("wide"));
  if(vis.length%2) vis[vis.length-1].classList.add("wide"); }
function showLater(){ setButtons(); }
function revealUi(){ opened=true; $("bar").classList.add("show"); $("side").classList.add("show"); card.classList.add("ready"); }
/* two-sided cards: tap the card or "Turn over" */
let FLIP_T=null, USER_TURNED=false;
function scheduleFlip(){ clearTimeout(FLIP_T); if(!card.classList.contains("two-sided")) return;
  FLIP_T=setTimeout(()=>{ const f=card.querySelector(".flip"); if(opened && !running && !USER_TURNED && f && !f.classList.contains("turned")) turnCard(); },7000); }
function userTurn(){ USER_TURNED=true; clearTimeout(FLIP_T); turnCard(); }
function turnCard(){ const f=card.querySelector(".flip"); if(!f||!card.classList.contains("two-sided")||!opened) return;
  const t=f.classList.toggle("turned"); $("turnBtn").textContent=t?"View the front":"View the back"; }
 
async function arrive(){
  reset(); env.style.transform=""; card.style.transform=`rotate(${ROT}deg) scale(${K})`; flap.style.transform="";
  if(reduce){ env.style.opacity=1; return; }
  await anim(env,[{opacity:0,transform:"translateY(30px) scale(.94)"},{opacity:1,transform:"none"}],{duration:900,easing:"ease-out"});
  env.getAnimations().forEach(a=>a.cancel()); env.style.opacity=1; env.style.transform="none";
}
async function play(){
  if(running||opened) return; running=true;
  env.classList.remove("tappable"); $("hint").style.opacity=0;
  const p=finalPose();
  // 2. turn it over
  if(reduce){ // gentle version for "Reduce Motion": fade to the back instead of a 3D turn
    await anim(env,[{opacity:1},{opacity:0}],{duration:350,easing:"ease-in"});
  } else {
    await anim(env,[{transform:"rotateY(0deg)"},{transform:"rotateY(-8deg) rotateX(4deg)",offset:.15},{transform:"rotateY(180deg)"}],{duration:1300});
  }
  // swap to flat back so layers stack correctly
  env.getAnimations().forEach(a=>a.cancel()); env.style.transform="none"; env.style.transformStyle="flat";
  env.querySelector(".front").hidden=true; back.classList.add("flat");
  if(reduce) await anim(env,[{opacity:0},{opacity:1}],{duration:350,easing:"ease-out"});
  await wait(250);
  // 3. open the flap
  const fa=anim(flap,[{transform:"perspective(900px) rotateX(0deg)"},{transform:"perspective(900px) rotateX(178deg)"}],{duration:900,easing:"ease-in-out"});
  await wait(470); flap.style.zIndex=1; await fa;
  // 4. card slides up out of the envelope
  const UP=-Math.min(EH*.95, (ROT?CW:CH)*.9+EH*.12);
  await anim(card,[{transform:`translateY(0) rotate(${ROT}deg) scale(${K})`},{transform:`translateY(${UP}px) rotate(${ROT}deg) scale(${K})`}],{duration:1000});
  card.style.zIndex=5;
  // 5. card turns upright and comes forward
  await anim(card,[{transform:`translateY(${UP}px) rotate(${ROT}deg) scale(${K})`},{transform:`translateY(${-EH*.1}px) rotate(0deg) scale(${K*1.02})`}],{duration:900});
  // 6. close the flap again behind the card, then settle side by side (no open triangle left on screen)
  flap.style.zIndex=4;
  anim(flap,[{transform:"perspective(900px) rotateX(178deg)"},{transform:"perspective(900px) rotateX(0deg)"}],{duration:800,easing:"ease-in-out"});
  anim(env,[{transform:"none",opacity:1},{transform:p.env,opacity:p.envOpacity}],{duration:1000});
  await anim(card,[{transform:`translateY(${-EH*.1}px) rotate(0deg) scale(${K*1.02})`},{transform:p.card}],{duration:1000});
  revealUi(); running=false; scheduleFlip();   // two-sided cards turn over by themselves after 7 s
}
 
/* ---------- RSVP form (fields, questions and privacy note come from the panel) ---------- */
const people=$("people"); let attending=null;
const FIELD_DEFS={first:["First name","text","given-name"],last:["Last name","text","family-name"],email:["Email","email","email"],phone:["Phone","tel","tel"],company:["Company","text","organization"],idDoc:["DNI / NIE","text","off"],plate:["Car plate","text","off"]};
const FIELD_ROWS=[["first","last"],["email"],["phone","company"],["idDoc"],["plate"]];
const ME_KEY=AZUR_API.prefix+"me";   // details typed last time on this device (prefilled, and keeps the same invitee when the answer changes)
function loadMe(){ try{ return JSON.parse(localStorage.getItem(ME_KEY)||"{}")||{}; }catch(e){ return {}; } }
function saveMe(p){ try{ const k={}; ["first","last","email","phone","company"].forEach(x=>{ if(p&&p[x]) k[x]=p[x]; }); localStorage.setItem(ME_KEY,JSON.stringify(k)); }catch(e){} }
const F=()=>CFG.rsvp.fields;
function personKeys(decline){ const f=F(); const keys=Object.keys(FIELD_DEFS).filter(k=>k==="first"||(f[k]&&f[k]!=="off"));
  return decline ? keys.filter(k=>k==="first"||k==="last"||k==="email") : keys; }
function personBlock(idx,decline){
  const d=document.createElement("div"); d.className="person"; d.dataset.idx=0;
  const keys=personKeys(decline);
  d.innerHTML='<div class="ph"><span>Your details</span></div>'+
    FIELD_ROWS.map(r=>r.filter(k=>keys.includes(k))).filter(r=>r.length).map(r=>r.length>1?`<div class="row">${r.map(k=>field(0,k)).join("")}</div>`:field(0,r[0])).join("");
  return d;
}
function field(i,k){
  const [label,type,auto]=FIELD_DEFS[k], id=`f${i}_${k}`, req=k==="first"||F()[k]==="req";
  const head=`<span>${k==="idDoc"?"ID document":label}${req?"":' <em class="tip">(optional)</em>'}</span>`;
  if(k==="idDoc") return `<label for="${id}"${req?"":' class="opt"'}>${head}<div class="idrow"><select id="${id}_t" aria-label="Document type"><option value="dni">DNI / NIE</option><option value="passport">Passport</option></select><input id="${id}" name="idDoc" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="e.g. 12345678Z"${req?" required":""}></div><em class="err" id="${id}_e"></em></label>`;
  const extra = k==="plate" ? ' autocapitalize="characters" spellcheck="false" placeholder="e.g. 1234 ABC"' : "";
  return `<label for="${id}"${req?"":' class="opt"'}>${head}<input id="${id}" name="${k}" type="${type}" autocomplete="${i?"off":auto}"${req?" required":""}${extra}><em class="err" id="${id}_e"></em></label>`;
}
/* fill the main block: invitation link first, then what this device typed last time, then what was already typed in the form */
function fillPerson(b,keep){ const me=loadMe(), [fn,...ln]=(INVITEE.name||"").split(" ");
  const pre={first:fn||me.first, last:ln.join(" ")||me.last, email:INVITEE.email||me.email, phone:me.phone, company:INVITEE.company||me.company};
  Object.keys(pre).forEach(k=>{ const el=b.querySelector("#f0_"+k), v=(keep&&keep[k])||pre[k]; if(el&&v) el.value=v; }); }
function setAttend(v){
  if(v===true && STATS.full && ANSWERED!=="yes") v=false;
  const was=attending; attending=v; $("yesBtn").setAttribute("aria-pressed",v===true); $("noBtn").setAttribute("aria-pressed",v===false);
  $("formErr").textContent="";
  if(v!==null && (was!==v || !people.children.length)){
    // keep what was typed when switching between "Will attend" and "Will not attend"
    const keep={}; people.querySelectorAll('.person[data-idx="0"] input').forEach(i=>{ if(i.value.trim()) keep[i.name]=i.value.trim(); });
    people.innerHTML="";
    const b=personBlock(0,v===false); people.appendChild(b); fillPerson(b,keep);
  }
  updateQs();
}
$("yesBtn").onclick=()=>setAttend(true);
$("form").addEventListener("input",e=>{ const t=e.target, er=t.id&&$(t.id+"_e"); if(er&&er.textContent){ er.textContent=""; t.removeAttribute("aria-invalid"); }
  const q=t.closest("[data-q]"); if(q){ const qe=q.querySelector(".err"); if(qe) qe.textContent=""; } if(t.id==="consent") $("formErr").textContent=""; });
$("noBtn").onclick=()=>setAttend(false);
/* ID type changed: new example, clear the error */
people.addEventListener("change",e=>{ const t=e.target; if(!/_t$/.test(t.id||"")) return; const inp=$(t.id.slice(0,-2)); if(!inp) return;
  inp.placeholder = t.value==="passport" ? "e.g. PAA123456" : "e.g. 12345678Z"; const er=$(inp.id+"_e"); if(er) er.textContent=""; inp.removeAttribute("aria-invalid"); });
 
/* custom questions */
function renderQuestions(){
  const qs=CFG.rsvp.questions||[];
  $("qs").innerHTML=qs.map(q=>{ const id="q_"+q.id, req=!!q.req, opts=(q.opts||[]);
    if(q.type==="radio"||q.type==="check") return `<fieldset class="q" data-q="${esc(q.id)}"><legend>${esc(q.q)}${req?" <b>*</b>":""}</legend><div class="opts">${opts.map(o=>`<label><input type="${q.type==="radio"?"radio":"checkbox"}" name="${esc(id)}" value="${esc(o)}"><span>${esc(o)}</span></label>`).join("")}</div><em class="err" id="${esc(id)}_e"></em></fieldset>`;
    const input = q.type==="select" ? `<select id="${esc(id)}"><option value="">Choose…</option>${opts.map(o=>`<option>${esc(o)}</option>`).join("")}</select>`
      : q.type==="textarea" ? `<textarea id="${esc(id)}" rows="3"></textarea>` : `<input id="${esc(id)}" type="text">`;
    return `<label class="q${req?"":" opt"}" data-q="${esc(q.id)}" for="${esc(id)}"><span>${esc(q.q)}</span>${input}<em class="err" id="${esc(id)}_e"></em></label>`; }).join("");
  updateQs();
}
function visibleQs(){ return (CFG&&CFG.rsvp.questions||[]).filter(q=>attending===true||(attending===false&&q.att===false)); }
function updateQs(){ if(!CFG) return; const vis=visibleQs().map(q=>q.id);
  $("qs").querySelectorAll("[data-q]").forEach(el=>el.hidden=!vis.includes(el.dataset.q)); $("qs").hidden=!vis.length;
  const f=F(); $("consentBox").hidden=!(attending!==null && CFG.rsvp.consentRequired!==false); }
function answerOf(q){ const id="q_"+q.id;
  if(q.type==="radio"){ const c=$("qs").querySelector(`input[name="${CSS.escape(id)}"]:checked`); return c?c.value:""; }
  if(q.type==="check") return [...$("qs").querySelectorAll(`input[name="${CSS.escape(id)}"]:checked`)].map(i=>i.value);
  const el=$(id); return el?el.value.trim():""; }
 
/* DNI (8 digits + letter) and NIE (X/Y/Z + 7 digits + letter) are checked; anything else is treated as a passport number */
function idDocOk(v){ v=String(v||"").toUpperCase().replace(/[\s.\-]/g,""); const L="TRWAGMYFPDXBNJZSQVHLCKE"; let m=/^(\d{8})([A-Z])$/.exec(v);
  if(m) return L[parseInt(m[1],10)%23]===m[2]; m=/^([XYZ])(\d{7})([A-Z])$/.exec(v); if(m) return L[parseInt("XYZ".indexOf(m[1])+m[2],10)%23]===m[3];
  if(/^\d{7,8}$/.test(v)||/^[XYZ]\d{7}$/.test(v)) return false; return /^[A-Z0-9]{5,15}$/.test(v)&&/\d/.test(v); }
/* "DNI / NIE": must be a real DNI (8 numbers + letter) or NIE (X/Y/Z + 7 numbers + letter) with the right control letter.
   "Passport": 5–15 letters and numbers. */
function idDocMsg(v,type){ v=String(v||"").toUpperCase().replace(/[\s.\-]/g,"");
  if(type==="passport" && !/^(\d{8}|[XYZ]\d{7})[A-Z]$/.test(v)) return /^[A-Z0-9]{5,15}$/.test(v)&&/\d/.test(v)&&!/^\d{7,8}$/.test(v) ? "" : "Enter a valid passport number";
  const L="TRWAGMYFPDXBNJZSQVHLCKE"; let m=/^(\d{8})([A-Z])$/.exec(v);
  if(m) return L[parseInt(m[1],10)%23]===m[2] ? "" : "The DNI letter doesn’t match the number";
  m=/^([XYZ])(\d{7})([A-Z])$/.exec(v);
  if(m) return L[parseInt("XYZ".indexOf(m[1])+m[2],10)%23]===m[3] ? "" : "The NIE letter doesn’t match the number";
  return "Enter a DNI (12345678Z) or NIE (X1234567L). For other documents choose Passport"; }
function validate(){
  let ok=true; const flag=(el,errEl,m)=>{ if(errEl) errEl.textContent=m; if(el&&el.setAttribute) el.setAttribute("aria-invalid",!!m); if(m&&ok){ ok=false; el&&el.focus&&el.focus(); } };
  people.querySelectorAll("input").forEach(inp=>{
    const v=inp.value.trim(); let m="";
    if(!v && inp.required) m="Required";
    else if(v && inp.type==="email" && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) m="Enter a valid email address";
    else if(v && inp.type==="tel" && v.replace(/\D/g,"").length<7) m="Enter a valid phone number";
    else if(v && inp.name==="idDoc"){ const t=$(inp.id+"_t"); m=idDocMsg(v,t?t.value:"dni"); }
    else if(v && inp.name==="plate" && !/^[A-Z0-9 \-]{4,12}$/i.test(v)) m="Enter a valid car plate";
    flag(inp,$(inp.id+"_e"),m);
  });
  visibleQs().forEach(q=>{ const a=answerOf(q), empty=Array.isArray(a)?!a.length:!a, el=$("qs").querySelector(`[data-q="${CSS.escape(q.id)}"]`);
    const target=el&&(el.querySelector("input,select,textarea")); flag(target,$("q_"+q.id+"_e"),q.req&&empty?"Please answer this question":""); });
  if(!$("consentBox").hidden && !$("consent").checked){ if(ok){ ok=false; $("consent").focus(); } $("formErr").textContent="Please accept the privacy note to continue."; }
  return ok;
}
function collect(){
  const ps=[people.querySelector('.person[data-idx="0"]')].filter(Boolean).map(p=>Object.fromEntries([...p.querySelectorAll("input")].map(i=>[i.name,i.value.trim()])));
  const answers={}; visibleQs().forEach(q=>{ answers[q.id]=answerOf(q); });
  return { invId:INV.id, inviteeEmail:INVITEE.email||"", inviteeName:INVITEE.name||((ps[0]&&[ps[0].first,ps[0].last].filter(Boolean).join(" "))||""), viewerId:VIEWER, attending, people:ps, answers, consent:!$("consentBox").hidden&&$("consent").checked, message:$("msg").value.trim() };
}
function send(payload){
  return new Promise((res,rej)=>{
    AZUR_API.send(payload).then(res,rej);
  });
}
function errText(code){ code=String(code||"");
  if(code==="email_change") return "Keep the same email address when changing your RSVP. Contact the host to change it.";
  if(code==="storage_required") return "Enable browser storage to submit and later change your RSVP.";
  if(code==="timeout") return "Confirmation has not arrived yet. Try again with the same email; your reply may already have been saved.";
  if(code==="https_required") return "Open the published HTTPS website to submit your RSVP.";
  if(code==="invalid_email") return "Enter a valid email address.";
  if(code==="invalid_phone") return "Enter a valid phone number.";
  if(code==="invalid_guests") return "Only one person is allowed per RSVP. Please reload the page.";
  if(code==="closed") return "Replies for this event are closed.";
  if(code==="full") return "Sorry, this event is now full. You can still let the host know you can’t attend.";
  if(code==="already") return "This email already has an RSVP. Use the original browser to change it, or contact the host.";
  if(code==="invalid_id") return "Check the DNI / NIE number: the letter doesn’t match.";
  if(code==="consent") return "Please accept the privacy note to continue.";
  if(/^missing:/.test(code)) return "Please fill in all required fields.";
  if(/^question:/.test(code)) return "Please answer the required questions.";
  if(code==="rsvp_off") return "This invitation doesn’t collect replies.";
  return "Your RSVP could not be sent. Check your connection and try again."; }
const canChange=()=>CFG.rsvp.change!==false && !STATS.closed;
function markDone(att){
  ANSWERED=att?"yes":"no"; try{ localStorage.setItem(AZUR_API.prefix+"rsvp:"+INV.id,ANSWERED); }catch(e){}
  $("barText").innerHTML = att ? '<span class="done">✓ You are attending</span>' : '<span class="done">✓ RSVP received</span>';
  $("barBtn").textContent="Change RSVP"; $("barBtn").hidden=!canChange();
  $("rsvpHead").textContent="Your RSVP"; $("rsvpChoices").hidden=true; $("rsvpDone").hidden=false; $("rsvpNote").hidden=true;
  $("rsvpDoneText").innerHTML = att ? "<b>✓</b> You are attending" : "<b>✓</b> You will not attend";
  $("rsvpChange").hidden=!canChange(); $("editBtn").hidden=!canChange();
}
$("form").onsubmit=async e=>{
  e.preventDefault(); $("formErr").textContent="";
  if(attending===null){ $("formErr").textContent="Choose “Will attend” or “Will not attend” to continue."; return; }
  if(!validate()) return;
  const btn=$("submitBtn"); btn.disabled=true; btn.textContent="Sending…";
  try{
    const data=collect(); await send(data); saveMe(data.people[0]);
    const first=(data.people[0]&&data.people[0].first)||INVITEE.name.split(" ")[0]||"";
    $("thxTitle").textContent= attending ? "See you there" : "Thank you";
    $("thxText").textContent= attending
      ? `${first?first+", your":"Your"} RSVP is confirmed. Your response has been saved.`
      : `${first?first+", we":"We"}'re sorry you can't join us. Thank you for letting us know.`;
    $("form").hidden=true; $("thanks").hidden=false;
    markDone(attending);
    if(!isWide() && opened && !running){ size(); showFinal(); }
  }catch(err){
    const code=err&&err.message;
    if(code==="full"){ STATS.full=true; applyRsvpState(); }
    if(code==="closed"){ STATS.closed=true; applyRsvpState(); }
    $("formErr").textContent=errText(code);
  }finally{ btn.disabled=false; btn.textContent="Submit RSVP"; }
};
/* deadline, capacity and earlier answers */
function applyRsvpState(){
  if(!RSVP_ON) return;
  const R=CFG.rsvp, note=$("rsvpNote");
  try{ ANSWERED=ANSWERED||localStorage.getItem(AZUR_API.prefix+"rsvp:"+INV.id); }catch(e){}
  if(ANSWERED){ markDone(ANSWERED==="yes"); }
  if(STATS.closed){
    $("barBtn").hidden=true;
    if(!ANSWERED){ $("rsvpHead").textContent="RSVP closed"; $("rsvpChoices").hidden=true; note.hidden=false;
      note.textContent=R.due?`Replies closed on ${fmtDay(R.due)}.`:"Replies are closed."; $("barText").textContent="Replies for this event are closed"; }
    return;
  }
  const fullNow=!!STATS.full && ANSWERED!=="yes";
  $("sideYes").disabled=fullNow; $("yesBtn").disabled=fullNow; $("fullNote").hidden=!fullNow;
  if(!ANSWERED){ const msgs=[]; if(fullNow) msgs.push("This event is full"); else if(R.dueOn&&R.due) msgs.push(`Please reply by ${fmtDay(R.due)}`);
    note.hidden=!msgs.length; note.textContent=msgs.join(" · "); }
}
 
/* ---------- open / close modal ---------- */
let lastFocus=null;
function openRsvp(){ lastFocus=document.activeElement; $("scrim").hidden=false; setTimeout(()=>($("thanks").hidden?($("yesBtn").disabled?$("noBtn"):$("yesBtn")):($("editBtn").hidden?$("closeBtn"):$("editBtn"))).focus(),50); }
function closeRsvp(){ $("scrim").hidden=true; lastFocus&&lastFocus.focus&&lastFocus.focus(); }
$("sideYes").onclick=()=>{ $("thanks").hidden=true; $("form").hidden=false; setAttend(true); openRsvp(); setTimeout(()=>{ const f=$("f0_first"); if(f && !f.value) f.focus(); },80); };
$("sideNo").onclick=()=>{ $("thanks").hidden=true; $("form").hidden=false; setAttend(false); openRsvp(); };
$("rsvpChange").onclick=()=>{ $("thanks").hidden=true; $("form").hidden=false; openRsvp(); };
$("barBtn").onclick=openRsvp; $("closeBtn").onclick=closeRsvp;
$("scrim").onclick=e=>{ if(e.target===$("scrim")) closeRsvp(); };
addEventListener("keydown",e=>{ if(e.key!=="Escape") return;
  if(!$("lightbox").hidden) return closeLightbox();
  if(!$("infoScrim").hidden) return closeInfo();
  if(!$("scrim").hidden) closeRsvp(); });
$("editBtn").onclick=()=>{ $("thanks").hidden=true; $("form").hidden=false; $("yesBtn").focus(); };
$("turnBtn").onclick=userTurn;
card.addEventListener("click",e=>{ if(opened&&!running) userTurn(); });
card.addEventListener("keydown",e=>{ if((e.key==="Enter"||e.key===" ")&&opened){ e.preventDefault(); userTurn(); } });
$("replayBtn").onclick=async()=>{ clearTimeout(FLIP_T); USER_TURNED=false; const f=card.querySelector(".flip.turned"); if(f){ f.classList.remove("turned"); $("turnBtn").textContent="View the back"; } if(running) return; await arrive(); await wait(400); play(); };
 
/* ---------- event details panel ---------- */
const MEDIA={};
function fetchMedia(id){ return AZUR_API.media(id); }
function block(title,html){ return `<div class="iblock">${title?`<h4>${esc(title)}</h4>`:""}${html}</div>`; }
function partnerSignature(){
  return '<div class="partner-signature" aria-label="Event partners">'+[
    ['AzurGroup','Azur Group'],['DBH','Destination by Hyatt'],['EV','Engel & Völkers']
  ].map(([file,name])=>`<img src="assets/${file}_Black.svg" alt="${esc(name)}" class="partner-${file.toLowerCase()}" loading="lazy">`).join('')+'</div>';
}
function renderInfo(){
  const P=CFG.panel, out=[], online=CFG.loc.mode==="online"; let signatureShown=false;
  out.push(`<div class="ihead"><h3>${esc(INV.title)}</h3><p>Hosted by ${esc(HOST)}</p></div>`);
  const cal=CAL_OK?`<div class="ilinks"><a class="btn" href="${esc($("calBtn").href)}" target="_blank" rel="noopener">Add to calendar</a></div>`:"";
  out.push(block("When",`<p>${esc(INV.dateText)}\n${esc(TIME_TEXT)}</p>${cal}`));
  if(online) out.push(block("Where",`<p>Online${CFG.loc.note?"\n"+esc(CFG.loc.note):""}</p>${JOIN_URL?`<div class="ilinks"><a class="btn" href="${esc(JOIN_URL)}" target="_blank" rel="noopener">Join online</a></div>`:""}`));
  else if(INV.location||CFG.loc.address||MAP_URL) out.push(block("Where",`<p>${esc([INV.location,CFG.loc.address].filter(Boolean).join("\n"))}</p>${MAP_URL?`<div class="ilinks"><a class="btn" href="${esc(MAP_URL)}" target="_blank" rel="noopener">View on map</a></div>`:""}`));
  (P.order||[]).forEach(k=>{ const b=P[k]; if(!b||!b.on) return;
    if(k==="summary"&&b.text){ out.push(block("",`<p>${esc(b.text)}</p>${partnerSignature()}`)); signatureShown=true; }
    if(k==="sections") (b.items||[]).forEach(s=>out.push(block(s.t,`<p>${esc(s.b)}</p>`)));
    if(k==="links"&&(b.items||[]).length) out.push(block("Links",`<div class="ilinks">${b.items.filter(l=>isHttps(l.u)).map(l=>`<a class="btn" href="${esc(l.u)}" target="_blank" rel="noopener">${esc(l.l||"Open link")}</a>`).join("")}</div>`));
    if(k==="gallery"&&(b.items||[]).length) out.push(block("Gallery",`<div class="gal${b.items.length===1?" one":""}">${b.items.map((g,i)=>`<button type="button" data-photo="${esc(g.id)}" aria-label="Open photo ${i+1}"></button>`).join("")}</div>`));
    if(k==="guests"&&STATS.attending!=null){ const n=STATS.attending, names=STATS.names||[];
      out.push(block("Guest list", n ? (b.mode==="names"&&names.length ? `<ul class="glist">${names.map(x=>`<li>${esc(x)}</li>`).join("")}</ul>${n>names.length?`<p style="margin-top:8px">and ${n-names.length} more guest${n-names.length>1?"s":""}</p>`:""}` : `<p>${n} ${n===1?"person has":"people have"} confirmed.</p>`) : `<p>No confirmations yet.</p>`)); }
    if(k==="files"&&(b.items||[]).length) out.push(block("Downloads",`<div class="ilinks">${b.items.map(f=>`<button type="button" class="btn" data-file="${esc(f.id)}" data-name="${esc(f.name)}">${esc(f.name)}${f.size?` · ${esc(f.size)}`:""}</button>`).join("")}</div>`));
    if(k==="sponsors"&&(b.items||[]).length) out.push(block("Sponsors",`<div class="spons">${b.items.map(s=>{ const inner=s.logo?`<b data-logo="${esc(s.logo)}" data-alt="${esc(s.name||"Sponsor")}">${esc(s.name||"")}</b>`:`<b>${esc(s.name)}</b>`;
      return isHttps(s.url)?`<a href="${esc(s.url)}" target="_blank" rel="noopener">${inner}</a>`:`<span>${inner}</span>`; }).join("")}</div>`));
  });
  if(!signatureShown) out.push(block("",`<p>We look forward to welcoming you.</p>${partnerSignature()}`));
  out.push(`<button class="btn viewinv" type="button" data-viewinv>View the invitation</button>`);
  $("infoBody").innerHTML=out.join("");
  $("infoBody").querySelectorAll("[data-photo]").forEach(b=>fetchMedia(b.dataset.photo).then(j=>{ const im=new Image(); im.alt=""; im.onload=()=>{ b.appendChild(im); b.classList.add("ok"); }; im.src=j.data; }).catch(()=>{ b.remove(); }));
  /* sponsor logos: the name shows while the logo loads, then the logo replaces it (the name stays if it can't load) */
  $("infoBody").querySelectorAll("[data-logo]").forEach(el=>fetchMedia(el.dataset.logo).then(j=>{ const im=new Image(); im.alt=el.dataset.alt; im.onload=()=>el.replaceWith(im); im.src=j.data; }).catch(()=>{}));
}
let infoBuilt=false, infoFocus=null;
function openInfo(){ infoFocus=document.activeElement; if(!infoBuilt){ renderInfo(); infoBuilt=true; } $("infoScrim").hidden=false; setTimeout(()=>$("infoClose").focus(),50); }
function closeInfo(){ $("infoScrim").hidden=true; infoFocus&&infoFocus.focus&&infoFocus.focus(); }
$("infoBtn").onclick=openInfo; $("infoClose").onclick=closeInfo;
$("infoScrim").onclick=e=>{ if(e.target===$("infoScrim")) closeInfo(); };
function closeLightbox(){ $("lightbox").hidden=true; }
$("lightbox").onclick=closeLightbox;
$("infoBody").addEventListener("click",e=>{ if(!e.target.closest("[data-viewinv]")) return; closeInfo(); if(!opened&&!running) setTimeout(play,250); });
$("infoBody").addEventListener("click",async e=>{
  const ph=e.target.closest("[data-photo]"); if(ph){ try{ const j=await fetchMedia(ph.dataset.photo); $("lbImg").src=j.data; $("lightbox").hidden=false; }catch(err){} return; }
  const fb=e.target.closest("[data-file]"); if(!fb) return;
  const label=fb.textContent; fb.disabled=true; fb.textContent="Preparing…";
  try{ const j=await fetchMedia(fb.dataset.file); const blob=await (await fetch(j.data)).blob(); const url=URL.createObjectURL(blob);
    const a=document.createElement("a"); a.href=url; a.download=(fb.dataset.name||"document").replace(/[\\/:*?"<>|]/g,"-")+".pdf"; a.target="_blank"; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),60000); fb.textContent=label; }
  catch(err){ fb.textContent="Not available"; }
  finally{ fb.disabled=false; }
});
 
/* ---------- boot ---------- */
/* ---------- envelope colour chosen in the panel (liner = three tones lighter) ---------- */
const hex2rgb=h=>{ const m=/^#?([0-9a-f]{6})$/i.exec(h||""); if(!m) return null; const n=parseInt(m[1],16); return [n>>16&255,n>>8&255,n&255]; };
const rgb2hex=(r,g,b)=>"#"+[r,g,b].map(v=>Math.round(Math.max(0,Math.min(255,v))).toString(16).padStart(2,"0")).join("");
function rgb2hsl(r,g,b){ r/=255;g/=255;b/=255; const mx=Math.max(r,g,b),mn=Math.min(r,g,b); let h=0,s=0,l=(mx+mn)/2;
  if(mx!==mn){ const d=mx-mn; s=l>.5?d/(2-mx-mn):d/(mx+mn); h=mx===r?(g-b)/d+(g<b?6:0):mx===g?(b-r)/d+2:(r-g)/d+4; h/=6; } return [h,s,l]; }
function hsl2rgb(h,s,l){ if(!s) return [l*255,l*255,l*255]; const q=l<.5?l*(1+s):l+s-l*s,p=2*l-q;
  const f=t=>{ t=(t+1)%1; return t<1/6?p+(q-p)*6*t:t<1/2?q:t<2/3?p+(q-p)*(2/3-t)*6:p; }; return [f(h+1/3)*255,f(h)*255,f(h-1/3)*255]; }
function shade(hex,tones){ const c=hex2rgb(hex); if(!c) return hex; const [h,s,l]=rgb2hsl(...c); return rgb2hex(...hsl2rgb(h,s,Math.max(0,Math.min(.96,l+tones*.08)))); }
/* paper grain, generated once */
(function(){ try{ const c=document.createElement("canvas"); c.width=c.height=180; const g=c.getContext("2d"), d=g.createImageData(180,180);
  for(let i=0;i<d.data.length;i+=4){ const v=238+Math.random()*17; d.data[i]=d.data[i+1]=d.data[i+2]=v; d.data[i+3]=255; }
  g.putImageData(d,0,0); const url=c.toDataURL("image/png");
  document.documentElement.style.setProperty("--grain",`url(${url})`);
  document.querySelectorAll(".grainimg").forEach(im=>im.setAttribute("href",url)); }catch(e){} })();
const FONT_LOADED={};
function loadFont(name,data){ if(!name||FONT_LOADED[name]) return; FONT_LOADED[name]=1;
  if(data){ try{ const f=new FontFace(name,`url(${data})`); document.fonts.add(f); f.load().catch(()=>{}); }catch(e){} return; } // E&V brand fonts come from the Invitations Database
  if(/^EV /.test(name)) return;
  const l=document.createElement("link"); l.rel="stylesheet"; l.href="https://fonts.googleapis.com/css2?family="+encodeURIComponent(name).replace(/%20/g,"+")+"&display=swap"; document.head.appendChild(l); }
function textOn(col){ const [R,G,B]=hex2rgb(col).map(v=>{ v/=255; return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4); }); return (.2126*R+.7152*G+.0722*B)>.3; }
function applyEnvelope(o){
  // Azurean campaign theme; takes precedence over legacy spreadsheet colours.
  const col = window.AZUR_CONFIG.envelopeColor || o.envColor || "#3B4344";
  const liner = window.AZUR_CONFIG.linerColor || o.linerColor || "#5D727C";
  const light = textOn(col);
  document.getElementById("paperBg").setAttribute("fill",col);
  document.getElementById("weaveBg").setAttribute("fill",liner);
  document.querySelector(".front").style.backgroundColor=col;
  document.querySelector(".panel").style.background=shade(col,-.3);
  const root=document.documentElement.style;
  // text on the front: editable text, font, size and colour (auto contrast when empty)
  const txt = o.envText==null ? "You are invited" : String(o.envText);
  const el=document.getElementById("envText"); el.textContent=txt; el.hidden=!txt.trim();
  root.setProperty("--env-font",'"Bodoni Moda", Georgia, serif');
  const size=parseFloat(o.envTextSize); if(size>0) root.setProperty("--env-size",String(Math.min(12,Math.max(2,size))));
  root.setProperty("--env-text",window.AZUR_CONFIG.envelopeTextColor || "#E0DCD6");
  document.querySelector(".front .to").style.color = light ? "#555b69" : "#a8a397";
  // optional stamp (PNG, may be transparent) + postmark only when there is a stamp
  const bgUrl = o.bg || (/^[a-z0-9-]+$/.test(o.bgPreset||"") ? "bg/"+o.bgPreset+".jpg" : "");
  if(bgUrl) $("bgImg").style.backgroundImage=`url("${bgUrl}")`;   // default (none chosen) = White grain
  const st=document.getElementById("stampImg");
  // Three SVG partner logos replace the single legacy stamp.
  st.hidden=true;
  const ss=parseFloat(o.stampSize); if(ss>0) root.setProperty("--stamp-w",Math.min(90,Math.max(8,ss))+"%");
}
function loadDesign(){
  if(!INV.design) return Promise.resolve();
  const load=(src,alt)=>new Promise(res=>{ if(!src) return res(null); const img=new Image(); img.alt=alt; img.onload=()=>res(img); img.onerror=()=>res(null); img.src=src; });
  return Promise.all([load(INV.design,INV.title), load(INV.designBack,INV.title+" (back)")]).then(([front,back])=>{
    if(!front) return;
    ASPECT=front.naturalWidth/front.naturalHeight;
    card.classList.add("has-design"); card.innerHTML="";
    const flip=document.createElement("div"); flip.className="flip";
    const cf=document.createElement("div"); cf.className="cf"; cf.appendChild(front); flip.appendChild(cf);
    if(back){ const cb=document.createElement("div"); cb.className="cb"; cb.appendChild(back); flip.appendChild(cb);
      card.classList.add("two-sided"); card.setAttribute("role","button"); card.setAttribute("tabindex","0"); card.setAttribute("aria-label","Turn the card over");
      $("turnBtn").hidden=false; setButtons(); }
    card.appendChild(flip); size();
  });
}
/* text for the calendar event: who, when, where, welcome message, sections, links and the invitation link */
function calDetails(online, where){
  const P=CFG.panel, on=k=>PANEL_ON_RAW && P[k] && P[k].on, out=[];
  out.push(INV.title, "Hosted by "+HOST, "");
  out.push("When: "+[INV.dateText, TIME_TEXT].filter(Boolean).join(", "));
  if(online) out.push("Where: Online"+(JOIN_URL?" – "+JOIN_URL:"")+(CFG.loc.note?"\n"+CFG.loc.note:""));
  else if(where) out.push("Where: "+where+(MAP_URL?"\nMap: "+MAP_URL:""));
  if(on("summary") && P.summary.text) out.push("", P.summary.text);
  if(on("sections")) (P.sections.items||[]).forEach(x=>{ if(x.t||x.b) out.push("", (x.t?x.t+": ":"")+(x.b||"")); });
  if(on("links")){ const l=(P.links.items||[]).filter(x=>isHttps(x.u)); if(l.length) out.push("", l.map(x=>(x.l||"Link")+": "+x.u).join("\n")); }
  out.push("", "Your invitation: "+location.origin+location.pathname+"?inv="+encodeURIComponent(INV.id));
  let t=out.join("\n").replace(/\n{3,}/g,"\n\n");
  if(t.length>1500) t=t.slice(0,1480).replace(/\s+\S*$/,"")+"…";
  return t;
}
let PANEL_ON_RAW=false;
function fillInvitation(){
  CFG=mergeCfg(cfgDefaults(),INV.cfg||null);
  if(!INV.cfg){ if(/save the date/i.test(INV.type)) CFG.kind="save"; CFG.rsvp.on=/rsvp/i.test(INV.type); }
  STATS=INV.stats||{};
  const R=CFG.rsvp, online=CFG.loc.mode==="online"; PANEL_ON_RAW = CFG.panel.on!==false && !!INV.cfg;
  RSVP_ON = CFG.kind!=="save" && R.on!==false;
  applyEnvelope(INV);
  document.title = INV.title + " · " + (window.AZUR_CONFIG.brand || "Azur Group");
  HOST = CFG.host || window.AZUR_CONFIG.brand || "Azur Group"; $("cHost").textContent = HOST;
  if(INVITEE.name) $("toLine").textContent = "For "+INVITEE.name;
  $("cEyebrow").textContent = CFG.kind==="save" ? "Save the date" : "You are invited to";
  $("cTitle").textContent = INV.title;
  const allDay = CFG.allDay || /^all day$/i.test(INV.time||"");
  const hasTime = !allDay && INV.time && INV.time!=="TBC";
  TIME_TEXT = allDay ? "All day" : hasTime ? (INV.endTime ? INV.time+" – "+INV.endTime : INV.time) : "Time to be confirmed";
  const place = online ? "Online" : INV.location;
  $("cWhen").innerHTML = [INV.dateText, TIME_TEXT, place].filter(Boolean).map(esc).join("<br>");
  const d=(INV.dateIso||"").replace(/-/g,""); const m=/^(\d{1,2})[:.](\d{2})/.exec(INV.time||"");
  let dates="";
  const me=/^(\d{1,2})[:.](\d{2})/.exec(INV.endTime||"");
  if(d && m && !allDay){ const h=+m[1], mi=m[2]; const pad=n=>String(n).padStart(2,"0");
    const end = me ? `${pad(+me[1])}${me[2]}00` : `${pad(Math.min(23,h+3))}${mi}00`;
    dates=`${d}T${pad(h)}${mi}00/${d}T${end}&ctz=Europe/Madrid`; }
  else if(d){ const nd=new Date(INV.dateIso+"T12:00:00"); nd.setDate(nd.getDate()+1); dates=`${d}/${nd.toISOString().slice(0,10).replace(/-/g,"")}`; }
  // map: the Google Maps link, or a search for the address / venue
  const where=[INV.location,CFG.loc.address].filter(Boolean).join(", ");
  MAP_URL = online || CFG.loc.showMap===false ? "" : (isHttps(INV.mapsUrl) ? INV.mapsUrl : (where ? "https://www.google.com/maps/search/?api=1&query="+encodeURIComponent(where) : ""));
  JOIN_URL = online && isHttps(CFG.loc.url) ? CFG.loc.url : "";
  const calLoc = online ? JOIN_URL : (MAP_URL || where);
  const details = calDetails(online, where);
  if(dates) $("calBtn").href="https://calendar.google.com/calendar/render?action=TEMPLATE&text="+encodeURIComponent(INV.title)+"&dates="+dates+"&location="+encodeURIComponent(calLoc||"")+"&details="+encodeURIComponent(details);
  if(MAP_URL) $("mapBtn").href=MAP_URL;
  if(JOIN_URL) $("joinBtn").href=JOIN_URL;
  PANEL_ON = CFG.panel.on!==false && !!INV.cfg;
  CAL_OK = !!dates && CFG.showCal!==false;
  MAP_OK = !!MAP_URL && !PANEL_ON;     // with the details panel, map and online link live inside it
  JOIN_OK = !!JOIN_URL && !PANEL_ON;
  $("infoBtn").hidden = !PANEL_ON;
  $("side").hidden=false;
  renderQuestions();
  $("consentText").textContent = R.privacy || PRIV_DEFAULT;
  setButtons();
  if(!RSVP_ON){ $("rsvpBox").hidden=true; $("barBtn").hidden=true; $("barText").textContent=INV.title; }
  else applyRsvpState();
}
(function(){
  if(INVITEE.name){ $("whoName").textContent=INVITEE.name; $("toLine").textContent="For "+INVITEE.name; }
 
  size();
  let t; addEventListener("resize",()=>{ clearTimeout(t); t=setTimeout(()=>{ size(); if(opened && !running) showFinal(); },150); });
  const touch = matchMedia("(hover: none)").matches;
  const filled = loadInvitation().then(inv=>{ INV=inv; fillInvitation(); });
  const ready = filled.then(()=>loadDesign()).then(()=>{
      // No automatic view tracking in this version.
      return true; });
  /* links from the email: &open=details / &open=rsvp show that screen straight away, no animation.
     The closed envelope waits behind it: closing the screen leaves "View the invitation". */
  const OPEN=(Q.get("open")||"").toLowerCase();
  if(OPEN==="details"||OPEN==="rsvp") filled.then(()=>{
    if(OPEN==="rsvp" && RSVP_ON && !STATS.closed){ $("thanks").hidden=!ANSWERED; $("form").hidden=!!ANSWERED; openRsvp(); }
    else if(PANEL_ON) openInfo();
    else if(RSVP_ON && !STATS.closed) openRsvp();
  }).catch(()=>{});
  const fonts = document.fonts ? document.fonts.ready : Promise.resolve();
  env.classList.add("loading");
  Promise.race([fonts, wait(1200)]).then(arrive).then(()=>ready).then(()=>{   /* the envelope is on screen while the invitation loads; it opens once everything is in */
    env.classList.remove("loading");
    $("hintText").textContent = touch ? "Tap the envelope to open" : "Click the envelope to open";
    env.classList.add("tappable");
    const go=()=>play();
    env.addEventListener("click",go);
    env.addEventListener("keydown",e=>{ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); go(); } });

  }).catch(err=>{
    env.classList.remove("loading");
    const h=$("hint"); h.classList.add("err");
    $("hintText").textContent = err && err.message==="missing" ? "This link is incomplete. Please use the button in your invitation email."
      : err && /not_found|archived/.test(err.message) ? "This invitation is no longer available."
      : err && /not_initialized|invalid_config/.test(err.message) ? "Event setup is incomplete. Please contact the organiser."
      : "The invitation couldn’t be loaded. Check your connection and refresh the page.";
  });
})();
