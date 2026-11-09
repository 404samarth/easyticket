const $ = id => document.getElementById(id);
const state = {
  from:null,to:null,trains:[],toastTimer:null,authMode:"login",user:null,
  selectedTrain:null,selectedClass:null,selectedInventory:null,passengers:[],
  category:"GENERAL",inventoryCache:new Map()
};
const CLASSES=[
  {code:"SL",name:"Sleeper"},{code:"3A",name:"AC 3 Tier"},{code:"CC",name:"AC Chair Car"},
  {code:"2A",name:"AC 2 Tier"},{code:"1A",name:"AC First Class"},{code:"3E",name:"AC 3 Economy"}
];
const today=new Date(),localDate=new Date(today.getTime()-today.getTimezoneOffset()*60000).toISOString().slice(0,10);
$("journeyDate").value=localDate;$("journeyDate").min=localDate;

function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function toast(msg){const el=$("toast");el.textContent=msg;el.classList.add("show");clearTimeout(state.toastTimer);state.toastTimer=setTimeout(()=>el.classList.remove("show"),3000);}
function money(v){return "₹"+Number(v||0).toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2});}
function openModal(id){$(id).hidden=false;document.body.style.overflow="hidden";}
function closeModal(id){$(id).hidden=true;if(!document.querySelector(".overlay:not([hidden])"))document.body.style.overflow="";}
function apiError(data,status){return data?.message||data?.detail||data?.error||`Request failed (${status})`;}
async function api(url,options={}){const res=await fetch(url,{credentials:"same-origin",headers:{"Content-Type":"application/json",...(options.headers||{})},...options});let data;const text=await res.text();try{data=text?JSON.parse(text):{};}catch{data={message:text};}if(!res.ok)throw new Error(apiError(data,res.status));return data;}

function setupAutocomplete(which){
 const input=$(which+"Input"),code=$(which+"Code"),box=$(which+"Suggestions");let timer,items=[];
 const close=()=>{box.classList.remove("open");input.setAttribute("aria-expanded","false");};
 const select=s=>{input.value=`${s.name} (${s.code})`;code.value=s.code;state[which]=s;close();};
 input.addEventListener("input",()=>{clearTimeout(timer);state[which]=null;code.value="";const q=input.value.trim();if(q.length<2){close();return;}box.innerHTML='<div class="suggestion-message">Searching stations…</div>';box.classList.add("open");timer=setTimeout(async()=>{try{items=await api("/api/stations?query="+encodeURIComponent(q));box.innerHTML=items.length?items.map((s,i)=>`<button type="button" class="suggestion-item" data-i="${i}"><span class="suggestion-pin">⌖</span><span class="suggestion-main"><span class="suggestion-name">${esc(s.name)}</span><span class="suggestion-meta">${esc(s.state||"Indian Railways station")}</span></span><span class="suggestion-code">${esc(s.code)}</span></button>`).join(""):'<div class="suggestion-message">No matching stations found.</div>';box.querySelectorAll("[data-i]").forEach(b=>b.addEventListener("click",()=>select(items[+b.dataset.i])));}catch(e){box.innerHTML=`<div class="suggestion-message">${esc(e.message)}</div>`;}},220);});
 input.addEventListener("keydown",e=>{if(e.key==="Escape")close();if(e.key==="Enter"&&box.classList.contains("open")){e.preventDefault();box.querySelector(".suggestion-item")?.click();}});
 document.addEventListener("click",e=>{if(!e.target.closest("#"+which+"Field"))close();});
}
setupAutocomplete("from");setupAutocomplete("to");
$("swapStations").addEventListener("click",()=>{[state.from,state.to]=[state.to,state.from];$("fromInput").value=state.from?`${state.from.name} (${state.from.code})`:"";$("fromCode").value=state.from?.code||"";$("toInput").value=state.to?`${state.to.name} (${state.to.code})`:"";$("toCode").value=state.to?.code||"";});

function mins(t){if(!t)return null;const p=String(t).split(":").map(Number);return p.length<2||p.some(Number.isNaN)?null:p[0]*60+p[1];}
function time(t){const m=mins(t);if(m===null)return"—";const h=Math.floor(m/60)%24;return`${String(h).padStart(2,"0")}:${String(m%60).padStart(2,"0")}`;}
function duration(t){const a=mins(t.departureTime),b=mins(t.arrivalTime);if(a===null||b===null)return"—";let d=((Number(t.endDay||t.startDay||1)-Number(t.startDay||1))*1440)+b-a;if(d<0&&!t.endDay)d+=1440;if(d<0)return"—";return`${Math.floor(d/60)}h ${d%60}m`;}
function dayDate(date,day){const d=new Date(date+"T00:00:00");d.setDate(d.getDate()+Math.max(0,(Number(day)||1)-1));return d.toLocaleDateString("en-IN",{day:"2-digit",month:"short"});}
function selectedCategory(){const c=$("category").value;return c==="TATKAL"?"TATKAL":"GENERAL";}
function timeMatch(t){const chosen=[...document.querySelectorAll('[name="timeFilter"]:checked')].map(x=>x.value);if(!chosen.length)return true;const m=mins(t.departureTime);if(m===null)return false;return chosen.some(x=>x==="morning"?m>=360&&m<720:x==="afternoon"?m>=720&&m<1080:m>=1080||m<360);}
function renderResults(){
 const type=$("typeFilter").value,sort=$("sortBy").value;
 let list=state.trains.filter(t=>(type==="all"||(t.trainType||"Other")===type)&&timeMatch(t));
 list.sort((a,b)=>sort==="duration"?durationMinutes(a)-durationMinutes(b):sort==="arrival"?(mins(a.arrivalTime)??99999)-(mins(b.arrivalTime)??99999):(mins(a.departureTime)??99999)-(mins(b.departureTime)??99999));
 $("resultsCount").textContent=`${list.length} ${list.length===1?"train":"trains"} found`;
 if(!list.length){$("trainResults").innerHTML='<div class="empty-state"><h3>No matching trains</h3><p>Try changing the filters or searching another date.</p></div>';return;}
 $("trainResults").innerHTML=list.map(t=>{
  const n=esc(t.trainNumber),id="train-"+String(t.trainNumber).replace(/[^a-zA-Z0-9]/g,"");
  return `<article class="train-card" id="${id}">
   <div class="train-card-top"><div class="train-identity"><span class="train-logo">▤</span><div><div class="train-name">${esc(t.trainName||"Train")}</div><div class="train-number">Train no. ${n}</div></div></div><span class="train-type">${esc(t.trainType||"Express")}</span></div>
   <div class="journey-line"><div class="station-time"><strong>${time(t.departureTime)}</strong><span>${esc(t.boardingStation||state.from.name)}</span><small>${esc(state.from.code)} · ${dayDate($("journeyDate").value,t.startDay)}</small></div><div class="duration"><b>${duration(t)}</b>Journey duration</div><div class="station-time end"><strong>${time(t.arrivalTime)}</strong><span>${esc(t.arrivalStation||state.to.name)}</span><small>${esc(state.to.code)} · ${dayDate($("journeyDate").value,t.endDay)}</small></div></div>
   <div class="card-bottom"><div class="class-chips">${CLASSES.map(c=>`<button class="class-chip" data-class="${c.code}" data-train="${n}" type="button">${c.code}</button>`).join("")}</div><div class="card-actions"><button class="schedule-link" data-schedule="${n}" type="button">Full route ↗</button><span class="expand-hint">Choose class to check availability</span></div></div>
   <div class="availability-panel" id="availability-${id}"><div class="availability-head"><strong>Class-wise availability & fare</strong><small>SIMULATED INVENTORY</small></div><div class="availability-options"><div class="loading-state">Choose a class above to check seats and fare.</div></div></div>
  </article>`;
 }).join("");
 $("trainResults").querySelectorAll(".class-chip").forEach(b=>b.addEventListener("click",()=>checkClass(b.dataset.train,b.dataset.class,b)));
 $("trainResults").querySelectorAll("[data-schedule]").forEach(b=>b.addEventListener("click",()=>openSchedule(b.dataset.schedule)));
}
function durationMinutes(t){const a=mins(t.departureTime),b=mins(t.arrivalTime);if(a===null||b===null)return 999999;let d=(Number(t.endDay||t.startDay||1)-Number(t.startDay||1))*1440+b-a;return d<0?d+1440:d;}
$("searchForm").addEventListener("submit",async e=>{
 e.preventDefault();if(!state.from||!$("fromCode").value){toast("Choose your source station from suggestions.");$("fromInput").focus();return;}if(!state.to||!$("toCode").value){toast("Choose your destination station from suggestions.");$("toInput").focus();return;}if(state.from.code===state.to.code){toast("From and To stations must be different.");return;}
 const date=$("journeyDate").value;if(!date){toast("Choose a journey date.");return;}
 const btn=$("searchButton");btn.disabled=true;btn.querySelector("span").textContent="Searching…";$("resultsSection").hidden=false;$("resultsTitle").textContent=`${state.from.name} → ${state.to.name}`;$("resultsSubtitle").textContent=new Date(date+"T00:00:00").toLocaleDateString("en-IN",{weekday:"long",day:"numeric",month:"long",year:"numeric"});$("trainResults").innerHTML='<div class="loading-state">Searching the railway timetable…</div>';
 try{state.trains=await api(`/api/trains/search?from=${encodeURIComponent(state.from.code)}&to=${encodeURIComponent(state.to.code)}&date=${encodeURIComponent(date)}`);const types=[...new Set(state.trains.map(t=>t.trainType).filter(Boolean))].sort();$("typeFilter").innerHTML='<option value="all">All train types</option>'+types.map(t=>`<option value="${esc(t)}">${esc(t)}</option>`).join("");renderResults();$("resultsSection").scrollIntoView({behavior:"smooth",block:"start"});}
 catch(err){$("trainResults").innerHTML=`<div class="empty-state"><h3>Train search failed</h3><p>${esc(err.message)}</p></div>`;$("resultsCount").textContent="Search unavailable";}
 finally{btn.disabled=false;btn.querySelector("span").textContent="Search trains";}
});
$("typeFilter").addEventListener("change",renderResults);$("sortBy").addEventListener("change",renderResults);
document.querySelectorAll('[name="timeFilter"]').forEach(x=>x.addEventListener("change",renderResults));
$("resetFilters").addEventListener("click",()=>{document.querySelectorAll('[name="timeFilter"]').forEach(x=>x.checked=false);$("typeFilter").value="all";$("sortBy").value="departure";renderResults();});

function inventoryUrl(train,cls){const quota=selectedCategory();return `/api/inventory?trainNumber=${encodeURIComponent(train.trainNumber)}&from=${encodeURIComponent(state.from.code)}&to=${encodeURIComponent(state.to.code)}&date=${encodeURIComponent($("journeyDate").value)}&travelClass=${encodeURIComponent(cls)}&quota=${encodeURIComponent(quota)}`;}
async function checkClass(trainNumber,cls,button){
 const train=state.trains.find(t=>String(t.trainNumber)===String(trainNumber));if(!train)return;
 const card=button.closest(".train-card"),panel=card.querySelector(".availability-panel"),opts=panel.querySelector(".availability-options");
 card.querySelectorAll(".class-chip").forEach(b=>b.classList.toggle("selected",b===button));panel.classList.add("open");opts.innerHTML='<div class="loading-state">Checking simulated availability…</div>';
 try{
  const category=$("category").value,quota=selectedCategory(),key=[trainNumber,cls,$("journeyDate").value,quota].join("|");
  const data=await api(inventoryUrl(train,cls));state.inventoryCache.set(key,data);
  opts.innerHTML=`<button type="button" class="availability-option" data-book-class="${cls}" data-train="${esc(trainNumber)}"><strong>${cls} · ${CLASSES.find(c=>c.code===cls).name}</strong><span>${Number(data.availableSeats)} seats available</span><small>Fare per passenger</small><em>${money(data.farePerPassenger)}</em><small>Choose this class →</small></button>`;
  opts.querySelector("[data-book-class]").addEventListener("click",()=>beginBooking(train,cls,data,category));
 }catch(err){opts.innerHTML=`<div class="empty-state"><p>${esc(err.message)}</p></div>`;}
}
function beginBooking(train,cls,data,category){
 state.selectedTrain=train;state.selectedClass=cls;state.selectedInventory=data;state.category=category;
 $("availabilityTitle").textContent=`${cls} · ${CLASSES.find(c=>c.code===cls).name}`;
 $("availabilityTrain").textContent=`${train.trainNumber} · ${train.trainName}`;
 $("classAvailability").innerHTML=`<div class="class-choice active"><label><input type="radio" checked> ${cls} · ${CLASSES.find(c=>c.code===cls).name}</label><span>${data.availableSeats} seats available</span><strong>${money(data.farePerPassenger)} / person</strong></div>`;
 $("continueBooking").disabled=Number(data.availableSeats)<1;openModal("availabilityModal");
}
$("continueBooking").addEventListener("click",async()=>{
 try{await refreshUser();if(!state.user){closeModal("availabilityModal");state.authMode="login";renderAuthMode();openModal("authModal");toast("Please log in before booking.");return;}
 closeModal("availabilityModal");const count=Math.min(6,Math.max(1,Number($("passengerCount").value)||1));state.passengers=Array.from({length:count},()=>({name:"",age:"",gender:"",berthPreference:"NO_PREFERENCE"}));renderPassengerFields();$("passengerJourney").textContent=`${state.selectedTrain.trainName} · ${state.from.name} to ${state.to.name}`;$("fareSummary").innerHTML=`${count} passenger(s) × ${money(state.selectedInventory.farePerPassenger)}<br><strong>Total ${money(count*Number(state.selectedInventory.farePerPassenger))}</strong>`;openModal("passengerModal");
 }catch(e){toast(e.message);}
});
function renderPassengerFields(){
 $("passengerFields").innerHTML=state.passengers.map((p,i)=>`<div class="passenger-card" data-passenger="${i}"><h3>Passenger ${i+1}</h3><label>Full name<input required maxlength="100" data-p="name" value="${esc(p.name)}" placeholder="Passenger full name"></label><div class="passenger-grid"><label>Age<input required type="number" min="1" max="120" data-p="age" value="${esc(p.age)}" placeholder="Age"></label><label>Gender<select required data-p="gender"><option value="">Select</option><option value="MALE" ${p.gender==="MALE"?"selected":""}>Male</option><option value="FEMALE" ${p.gender==="FEMALE"?"selected":""}>Female</option><option value="OTHER" ${p.gender==="OTHER"?"selected":""}>Other</option></select></label></div><label>Berth preference<select data-p="berthPreference"><option value="NO_PREFERENCE" ${p.berthPreference==="NO_PREFERENCE"?"selected":""}>No preference</option><option value="LOWER" ${p.berthPreference==="LOWER"?"selected":""}>Lower</option><option value="MIDDLE" ${p.berthPreference==="MIDDLE"?"selected":""}>Middle</option><option value="UPPER" ${p.berthPreference==="UPPER"?"selected":""}>Upper</option><option value="SIDE_LOWER" ${p.berthPreference==="SIDE_LOWER"?"selected":""}>Side lower</option><option value="SIDE_UPPER" ${p.berthPreference==="SIDE_UPPER"?"selected":""}>Side upper</option></select></label></div>`).join("");
 $("passengerFields").querySelectorAll(".passenger-card").forEach((card,i)=>card.querySelectorAll("[data-p]").forEach(el=>el.addEventListener("change",()=>{state.passengers[i][el.dataset.p]=el.value;})));
 $("addPassenger").disabled=state.passengers.length>=6;$("passengerLimit").textContent=`${state.passengers.length}/6 passengers`;
}
$("addPassenger").addEventListener("click",()=>{if(state.passengers.length>=6)return;state.passengers.push({name:"",age:"",gender:"",berthPreference:"NO_PREFERENCE"});renderPassengerFields();const n=state.passengers.length;$("fareSummary").innerHTML=`${n} passenger(s) × ${money(state.selectedInventory.farePerPassenger)}<br><strong>Total ${money(n*Number(state.selectedInventory.farePerPassenger))}</strong>`;});
$("passengerForm").addEventListener("submit",async e=>{
 e.preventDefault();const cards=[...$("passengerFields").querySelectorAll(".passenger-card")];
 const passengers=cards.map(card=>({name:card.querySelector('[data-p="name"]').value.trim(),age:Number(card.querySelector('[data-p="age"]').value),gender:card.querySelector('[data-p="gender"]').value,berthPreference:card.querySelector('[data-p="berthPreference"]').value}));
 if(passengers.some(p=>!p.name||!p.age||p.age<1||p.age>120||!p.gender)){toast("Complete all passenger details correctly.");return;}
 const btn=$("confirmBooking");btn.disabled=true;btn.textContent="Processing simulated payment…";
 try{
  const payload={trainNumber:String(state.selectedTrain.trainNumber),from:state.from.code,to:state.to.code,journeyDate:$("journeyDate").value,travelClass:state.selectedClass,quota:selectedCategory(),paymentMethod:$("paymentMethod").value,passengers};
  const result=await api("/api/bookings",{method:"POST",body:JSON.stringify(payload)});
  renderTicket(result,passengers);closeModal("passengerModal");openModal("ticketModal");toast("Booking confirmed. Your PNR is "+result.pnr);
 }catch(err){if(/log in/i.test(err.message)){closeModal("passengerModal");openModal("authModal");}toast(err.message);}
 finally{btn.disabled=false;btn.textContent="Confirm & pay (simulated)";}
});
function renderTicket(r,passengers){
 const pnr=esc(r.pnr);
 $("ticketDetails").innerHTML=`<div class="ticket-grid"><div class="pnr-cell"><small>YOUR 10-DIGIT PNR</small><strong>${pnr}</strong><small>CONFIRMED · SIMULATED PAYMENT</small></div><div class="ticket-cell"><small>Train</small><strong>${esc(state.selectedTrain.trainName)} (${esc(r.trainNumber)})</strong></div><div class="ticket-cell"><small>Journey date</small><strong>${new Date(r.journeyDate+"T00:00:00").toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"})}</strong></div><div class="ticket-cell"><small>From</small><strong>${esc(state.from.name)} (${esc(r.from)})</strong></div><div class="ticket-cell"><small>To</small><strong>${esc(state.to.name)} (${esc(r.to)})</strong></div><div class="ticket-cell"><small>Class / Category</small><strong>${esc(r.travelClass)} / ${esc(state.category==="SENIOR_CITIZEN"?"Senior Citizen":r.quota)}</strong></div><div class="ticket-cell"><small>Passengers</small><strong>${passengers.length}</strong></div><div class="ticket-cell"><small>Fare per passenger</small><strong>${money(r.farePerPassenger)}</strong></div><div class="ticket-cell"><small>Total fare</small><strong>${money(r.totalFare)}</strong></div><div class="ticket-cell"><small>Payment</small><strong>${esc(r.paymentStatus)} · ${esc(r.paymentType)}</strong></div><div class="ticket-cell"><small>Booking ID</small><strong>${esc(r.bookingId)}</strong></div><div class="ticket-cell"><small>Passengers</small><strong>${passengers.map(p=>esc(p.name)).join(", ")}</strong></div></div>`;
}
$("printTicket").addEventListener("click",()=>window.print());

async function refreshUser(){try{state.user=await api("/api/auth/me");$("authButton").textContent=state.user.fullName?.split(" ")[0]||"My account";}catch{state.user=null;$("authButton").textContent="Login / Register";}return state.user;}
function renderAuthMode(){const reg=state.authMode==="register";$("authTitle").textContent=reg?"Create your account":"Welcome back";$("authSubtitle").textContent=reg?"Register to book your journey.":"Log in to continue with your booking.";$("registerFields").hidden=!reg;$("registerFields").querySelectorAll("input").forEach(i=>i.required=reg);$("authForm").elements.password.autocomplete=reg?"new-password":"current-password";$("authSubmit").textContent=reg?"Create account":"Log in";$("authSwitch").innerHTML=reg?'Already registered? <button type="button" id="toggleAuthMode">Log in</button>':'New to EasyTicket? <button type="button" id="toggleAuthMode">Create an account</button>';$("toggleAuthMode").addEventListener("click",()=>{state.authMode=reg?"login":"register";renderAuthMode();});}
function openAccountDrawer(){
 $("accountDrawer").classList.add("open");
 $("drawerBackdrop").classList.add("open");
 $("accountDrawer").setAttribute("aria-hidden","false");
}
function closeAccountDrawer(){
 $("accountDrawer").classList.remove("open");
 $("drawerBackdrop").classList.remove("open");
 $("accountDrawer").setAttribute("aria-hidden","true");
}
async function openAccount(){
 await refreshUser();
 if(state.user){
  $("drawerUserName").textContent=state.user.fullName||"My account";
  openAccountDrawer();
 }else{
  state.authMode="login";
  renderAuthMode();
  openModal("authModal");
 }
}
$("authButton").addEventListener("click",openAccount);
$("accountButton").addEventListener("click",openAccount);
$("closeAccountDrawer").addEventListener("click",closeAccountDrawer);
$("drawerBackdrop").addEventListener("click",closeAccountDrawer);
$("drawerBookNow").addEventListener("click",()=>{
 closeAccountDrawer();
 $("searchPanel").scrollIntoView({behavior:"smooth"});
});
$("drawerLogout").addEventListener("click",async()=>{
 try{
  await api("/api/auth/logout",{method:"POST"});
  state.user=null;
  $("authButton").textContent="Login / Register";
  closeAccountDrawer();
  toast("Logged out successfully.");
 }catch(e){toast(e.message);}
});

// Account Manager and Change Password
function openChangePassword() {
 closeAccountDrawer();
 $("changePasswordForm").reset();
 openModal("changePasswordModal");
}

async function openAccountManager() {
 closeAccountDrawer();
 const form = $("accountManagerForm");
 form.reset();

 try {
  const profile = await api("/api/account/profile");
  form.elements.fullName.value = profile.full_name || profile.fullName || "";
  form.elements.email.value = profile.email || "";
  form.elements.phone.value = profile.phone || "";
  openModal("accountManagerModal");
 } catch (e) {
  toast(e.message);
 }
}

$("drawerChangePassword").addEventListener("click", openChangePassword);
$("drawerAccountManager").addEventListener("click", openAccountManager);

$("changePasswordForm").addEventListener("submit", async e => {
 e.preventDefault();

 const form = e.currentTarget;
 const values = new FormData(form);
 const currentPassword = values.get("currentPassword");
 const newPassword = values.get("newPassword");
 const confirmPassword = values.get("confirmPassword");

 if (newPassword !== confirmPassword) {
  toast("New password and confirmation do not match.");
  return;
 }

 const button = form.querySelector('button[type="submit"]');
 button.disabled = true;
 button.textContent = "Updating…";

 try {
  const result = await api("/api/account/change-password", {
   method: "POST",
   body: JSON.stringify({currentPassword, newPassword})
  });

  form.reset();
  closeModal("changePasswordModal");
  toast(result.message || "Password changed successfully.");
 } catch (err) {
  toast(err.message);
 } finally {
  button.disabled = false;
  button.textContent = "Update Password";
 }
});

$("accountManagerForm").addEventListener("submit", async e => {
 e.preventDefault();

 const form = e.currentTarget;
 const values = new FormData(form);
 const payload = {
  fullName: String(values.get("fullName") || "").trim(),
  email: String(values.get("email") || "").trim(),
  phone: String(values.get("phone") || "").trim()
 };

 const button = form.querySelector('button[type="submit"]');
 button.disabled = true;
 button.textContent = "Saving…";

 try {
  const result = await api("/api/account/profile", {
   method: "PUT",
   body: JSON.stringify(payload)
  });

  await refreshUser();
  $("drawerUserName").textContent = result.fullName || payload.fullName;
  closeModal("accountManagerModal");
  toast(result.message || "Account details updated successfully.");
 } catch (err) {
  toast(err.message);
 } finally {
  button.disabled = false;
  button.textContent = "Save Changes";
 }
});

$("authForm").addEventListener("submit",async e=>{
 e.preventDefault();
 const form=e.currentTarget;
 const f=new FormData(form),reg=state.authMode==="register";
 const payload=reg?{fullName:f.get("fullName"),phone:f.get("phone"),email:f.get("email"),password:f.get("password")}:{email:f.get("email"),password:f.get("password")};
 const btn=$("authSubmit");btn.disabled=true;btn.textContent="Please wait…";
 try{state.user=await api(reg?"/api/auth/register":"/api/auth/login",{method:"POST",body:JSON.stringify(payload)});$("authButton").textContent=state.user.fullName?.split(" ")[0]||"My account";closeModal("authModal");toast(reg?"Account created successfully.":"Login successful.");}
 catch(err){toast(err.message);}finally{btn.disabled=false;renderAuthMode();}
});
async function openSchedule(trainNumber){
 openModal("scheduleModal");
 $("scheduleTitle").textContent="Train "+trainNumber;
 $("scheduleMeta").textContent="Loading complete route…";
 $("scheduleList").innerHTML='<div class="loading-state">Loading route stops…</div>';

 try {
  const stops = await api(`/api/trains/${encodeURIComponent(trainNumber)}/schedule?from=${encodeURIComponent(state.from.code)}&to=${encodeURIComponent(state.to.code)}`);
  if (!Array.isArray(stops) || !stops.length) throw new Error("No route stops found.");

  $("scheduleTitle").textContent=`${stops[0].trainName || "Train"} · ${trainNumber}`;
  $("scheduleMeta").textContent=`${stops[0].sourceName || ""} (${stops[0].sourceCode || ""}) → ${stops[0].destinationName || ""} (${stops[0].destinationCode || ""})`;

  function haltMinutes(stop) {
   const arrival = mins(stop.arrivalTime);
   const departure = mins(stop.departureTime);
   if (arrival === null || departure === null) return null;
   return Math.max(0, departure - arrival);
  }

  function isHalt(stop, index) {
   return index === 0 || index === stops.length - 1 || (haltMinutes(stop) !== null && haltMinutes(stop) >= 2);
  }

  function haltLabel(stop, index) {
   if (index === 0) return "Origin station";
   if (index === stops.length - 1) return "Destination station";
   const duration = haltMinutes(stop);
   return `${duration} min halt`;
  }

  function stationCard(stop, index) {
   const duration = haltMinutes(stop);
   return `
    <div class="schedule-halt">
     <div class="schedule-timeline-marker"><span></span></div>
     <div class="schedule-halt-content">
      <div class="schedule-halt-top">
       <div>
        <strong>${esc(stop.stationName || "Station")}</strong>
        <small>${esc(stop.stationCode || "")} · ${haltLabel(stop, index)}</small>
       </div>
       <span class="schedule-day">Day ${esc(stop.journeyDay || 1)}</span>
      </div>
      <div class="schedule-times">
       <div><small>ARRIVAL</small><b>${time(stop.arrivalTime)}</b></div>
       <div><small>DEPARTURE</small><b>${time(stop.departureTime)}</b></div>
       ${duration !== null && index !== 0 && index !== stops.length - 1
         ? `<div><small>HALT</small><b>${duration} min</b></div>` : ""}
      </div>
     </div>
    </div>`;
  }

  let html = "";
  let haltCount = 0;
  let passingCount = 0;
  let index = 0;

  while (index < stops.length) {
   if (!isHalt(stops[index], index)) {
    index++;
    continue;
   }

   const currentIndex = index;
   html += stationCard(stops[index], index);
   haltCount++;

   const intermediate = [];
   let next = index + 1;

   while (next < stops.length && !isHalt(stops[next], next)) {
    intermediate.push(stops[next]);
    next++;
   }

   if (intermediate.length) {
    passingCount += intermediate.length;
    html += `
     <details class="schedule-intermediate">
      <summary>
       <span class="schedule-intermediate-icon">＋</span>
       <span>View ${intermediate.length} intermediate ${intermediate.length === 1 ? "station" : "stations"}</span>
       <small>${esc(stops[currentIndex].stationName)} → ${esc(stops[next].stationName)}</small>
      </summary>
      <div class="schedule-intermediate-list">
       ${intermediate.map(stop => `
        <div class="schedule-pass-station">
         <span class="schedule-pass-dot"></span>
         <div><strong>${esc(stop.stationName || "Station")}</strong><small>${esc(stop.stationCode || "")} · Day ${esc(stop.journeyDay || 1)}</small></div>
         <span>${time(stop.arrivalTime)}</span>
        </div>`).join("")}
      </div>
     </details>`;
   }

   index = next;
  }

  $("scheduleSummary").innerHTML = `
   <div class="schedule-stat"><strong>${haltCount}</strong><span>Halt stations</span></div>
   <div class="schedule-stat"><strong>${passingCount}</strong><span>Intermediate stations</span></div>
   <div class="schedule-stat"><strong>${stops.length}</strong><span>Total route stations</span></div>`;

  $("scheduleList").innerHTML = html;
 } catch(e) {
  $("scheduleList").innerHTML=`<div class="empty-state">${esc(e.message)}</div>`;
 }
}
document.querySelectorAll("[data-close]").forEach(b=>b.addEventListener("click",()=>closeModal(b.dataset.close)));
document.querySelectorAll(".overlay").forEach(o=>o.addEventListener("click",e=>{if(e.target===o)closeModal(o.id);}));
document.addEventListener("keydown",e=>{if(e.key==="Escape")document.querySelectorAll(".overlay:not([hidden])").forEach(o=>closeModal(o.id));});
$("mobileMenu").addEventListener("click",()=>$("navLinks").classList.toggle("open"));
refreshUser();


// Booking History
function historyDate(value) {
 if (!value) return "—";
 const d = new Date(String(value).length === 10 ? value + "T00:00:00" : value);
 return Number.isNaN(d.getTime())
  ? String(value)
  : d.toLocaleDateString("en-IN", {day:"2-digit",month:"short",year:"numeric"});
}

function historyDateTime(value) {
 if (!value) return "—";
 const d = new Date(value);
 return Number.isNaN(d.getTime())
  ? String(value)
  : d.toLocaleString("en-IN", {day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"});
}

function renderBookingHistory(bookings) {
 const container = $("bookingHistoryList");

 if (!bookings.length) {
  container.innerHTML = `
   <div class="empty-state">
    <h3>No bookings yet</h3>
    <p>Your confirmed tickets will appear here after you book a journey.</p>
    <button type="button" class="primary-btn history-book-btn" id="historyBookNow">Find trains</button>
   </div>`;
  $("historyBookNow").addEventListener("click", showBookNow);
  return;
 }

 container.innerHTML = bookings.map(b => {
  const status = String(b.bookingStatus || "UNKNOWN").toUpperCase();
  const passengers = Array.isArray(b.passengers) ? b.passengers : [];
  const timeline = Array.isArray(b.statusHistory) ? b.statusHistory : [];
  const paymentStatus = b.paymentStatus || "NOT AVAILABLE";

  return `
   <article class="history-card">
    <div class="history-card-top">
     <div>
      <span class="history-pnr-label">PNR</span>
      <strong class="history-pnr">${esc(b.pnr)}</strong>
     </div>
     <span class="history-status ${status === "CONFIRMED" ? "confirmed" : status === "CANCELLED" ? "cancelled" : ""}">${esc(status)}</span>
    </div>

    <div class="history-train">
     <div>
      <strong>${esc(b.trainName || "Train " + b.trainNumber)}</strong>
      <small>Train no. ${esc(b.trainNumber)}</small>
     </div>
     <span class="history-class">${esc(b.travelClass)} · ${esc(b.quota)}</span>
    </div>

    <div class="history-route">
     <div><strong>${esc(b.fromCode)}</strong><span>${esc(b.fromName)}</span></div>
     <span class="history-route-arrow">→</span>
     <div><strong>${esc(b.toCode)}</strong><span>${esc(b.toName)}</span></div>
    </div>

    <div class="history-summary">
     <div><small>Journey date</small><strong>${esc(historyDate(b.journeyDate))}</strong></div>
     <div><small>Passengers</small><strong>${esc(b.passengerCount)}</strong></div>
     <div><small>Total fare</small><strong>${esc(money(b.totalFare))}</strong></div>
    </div>

    <details class="history-details">
     <summary>View booking details</summary>
     <div class="history-detail-content">
      <h4>Passenger details</h4>
      ${passengers.length ? passengers.map((p,i) => `
       <div class="history-passenger">
        <strong>${i+1}. ${esc(p.passengerName)}</strong>
        <span>${esc(p.age)} years · ${esc(p.gender)} · ${esc(p.berthPreference || "No preference")}</span>
        <small>Seat: ${esc(p.seatNumber || "Not assigned")} · ${esc(p.passengerStatus || "—")}</small>
       </div>`).join("") : '<p class="history-muted">No passenger details available.</p>'}

      <h4>Payment information</h4>
      <div class="history-info-grid">
       <div><small>Payment status</small><strong>${esc(paymentStatus)}</strong></div>
       <div><small>Payment method</small><strong>${esc(b.paymentMethod || "—")}</strong></div>
       <div><small>Amount</small><strong>${esc(money(b.paidAmount ?? b.totalFare))}</strong></div>
       <div><small>Transaction reference</small><strong>${esc(b.transactionReference || "—")}</strong></div>
       <div><small>Paid at</small><strong>${esc(historyDateTime(b.paidAt))}</strong></div>
       <div><small>Booked at</small><strong>${esc(historyDateTime(b.bookedAt))}</strong></div>
      </div>

      <h4>Booking status timeline</h4>
      ${timeline.length ? `<div class="history-timeline">${timeline.map(t => `
       <div class="history-timeline-item">
        <strong>${esc(t.newStatus)}</strong>
        <span>${esc(t.remarks || "")}</span>
        <small>${esc(historyDateTime(t.changedAt))}</small>
       </div>`).join("")}</div>` : '<p class="history-muted">No status updates available.</p>'}
     </div>
    </details>

    <div class="history-card-actions">
     <button type="button" class="secondary-btn" data-cancel-booking="${esc(b.bookingId)}" ${status !== "CONFIRMED" ? "disabled" : ""}>Cancel Ticket</button>
     <button type="button" class="secondary-btn" data-transaction-booking="${esc(b.bookingId)}">Transaction Details</button>
     <button type="button" class="secondary-btn" data-food-train>Food on Train</button>
     <button type="button" class="secondary-btn" data-connecting-train>Book Connecting Train</button>
    </div>
   </article>`;
 }).join("");

 container.querySelectorAll("[data-cancel-booking]").forEach(button => {
  button.addEventListener("click", () => cancelBooking(button.dataset.cancelBooking));
 });

 container.querySelectorAll("[data-transaction-booking]").forEach(button => {
  button.addEventListener("click", () => showTransactionHistory(button.dataset.transactionBooking));
 });

 container.querySelectorAll("[data-food-train]").forEach(button => {
  button.addEventListener("click", () => window.open("https://www.swiggy.com/", "_blank", "noopener,noreferrer"));
 });

 container.querySelectorAll("[data-connecting-train]").forEach(button => {
  button.addEventListener("click", showBookNow);
 });
}

async function cancelBooking(bookingId) {
 const confirmed = window.confirm(
  "Cancel this entire booking? All passengers on this PNR will be cancelled together. The refund shown by EasyTicket is simulated and will not be transferred to your bank."
 );

 if (!confirmed) return;

 try {
  const result = await api(`/api/bookings/${encodeURIComponent(bookingId)}/cancel`, {
   method: "POST"
  });

  const refund = result?.refundAmount != null
   ? money(result.refundAmount)
   : "the booking amount";

  toast(`Ticket cancelled. Simulated refund: ${refund}`);
  await loadBookingHistory();
 } catch (err) {
  toast(err.message || "Unable to cancel this ticket.");
 }
}

async function loadBookingHistory() {
 const container = $("bookingHistoryList");
 container.innerHTML = '<div class="loading-state">Loading your bookings…</div>';

 try {
  const bookings = await api("/api/bookings/history");
  renderBookingHistory(Array.isArray(bookings) ? bookings : []);
 } catch (err) {
  container.innerHTML = `<div class="empty-state"><h3>Unable to load bookings</h3><p>${esc(err.message)}</p><button type="button" class="secondary-btn" id="retryBookingHistory">Try again</button></div>`;
  $("retryBookingHistory").addEventListener("click", loadBookingHistory);
 }
}


// Public EasyTicket PNR Status
function renderPnrStatus(booking) {
 const passengers = booking.passengers || [];
 const history = booking.statusHistory || [];

 const journeyDate = booking.journeyDate
  ? new Date(String(booking.journeyDate).slice(0, 10) + "T00:00:00").toLocaleDateString("en-IN", {
      day: "2-digit", month: "short", year: "numeric"
    })
  : "—";

 const dateTime = value => {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? esc(value) :
   d.toLocaleString("en-IN", {dateStyle:"medium", timeStyle:"short"});
 };

 $("pnrStatusResult").innerHTML = `
  <article class="history-card pnr-result-card">
   <div class="history-card-top">
    <div>
     <span class="history-pnr-label">EASYTICKET PNR</span>
     <strong class="history-pnr">${esc(booking.pnr)}</strong>
    </div>
    <span class="history-status">${esc(booking.bookingStatus || "UNKNOWN")}</span>
   </div>

   <div class="pnr-result-body">
    <div class="pnr-train-heading">
     <div>
      <strong>${esc(booking.trainName || "Train")}</strong>
      <span>Train No. ${esc(booking.trainNumber)}</span>
     </div>
     <span>${esc(booking.travelClass || "—")} · ${esc(booking.quota || "—")}</span>
    </div>

    <div class="pnr-route">
     <div><strong>${esc(booking.fromCode)}</strong><span>${esc(booking.fromName)}</span></div>
     <div class="pnr-route-arrow">→</div>
     <div><strong>${esc(booking.toCode)}</strong><span>${esc(booking.toName)}</span></div>
    </div>

    <div class="pnr-detail-grid">
     <div><small>JOURNEY DATE</small><strong>${esc(journeyDate)}</strong></div>
     <div><small>PASSENGERS</small><strong>${esc(booking.passengerCount)}</strong></div>
     <div><small>BOOKING STATUS</small><strong>${esc(booking.bookingStatus)}</strong></div>
     <div><small>BOOKED ON</small><strong>${dateTime(booking.bookedAt)}</strong></div>
    </div>

    <div class="pnr-subsection">
     <h3>Passenger Status</h3>
     ${passengers.length ? passengers.map((passenger, i) => `
      <div class="pnr-passenger-row">
       <strong>Passenger ${i + 1}</strong>
       <span>${esc(passenger.passengerStatus || "—")}</span>
       <small>Seat / Berth: ${esc(passenger.seatNumber || "Not allotted")}</small>
      </div>
     `).join("") : '<p class="pnr-muted">No passenger details available.</p>'}
    </div>

    <div class="pnr-subsection">
     <h3>Booking Status Timeline</h3>
     ${history.length ? `
      <div class="pnr-timeline">
       ${history.map(item => `
        <div class="pnr-timeline-item">
         <strong>${esc(item.newStatus || "Status updated")}</strong>
         <span>${esc(item.remarks || "")}</span>
         <small>${dateTime(item.changedAt)}</small>
        </div>
       `).join("")}
      </div>
     ` : '<p class="pnr-muted">No additional status updates available.</p>'}
    </div>
   </div>
  </article>`;
}

async function showPnrStatus() {
 closeAccountDrawer();

 $("bookingHistorySection").hidden = true;
 $("transactionHistorySection").hidden = true;
 $("cancellationHistorySection").hidden = true;
 $("pnrStatusSection").hidden = false;
 $("resultsSection").hidden = true;
 $("howItWorks").hidden = true;

 $("navBookNow").classList.remove("active");
 $("navBookingHistory").classList.remove("active");
 $("navTransactionHistory").classList.remove("active");
 $("navCancellationHistory").classList.remove("active");
 $("navPnrStatus").classList.add("active");

 $("navLinks").classList.remove("open");
 $("pnrStatusSection").scrollIntoView({behavior:"smooth", block:"start"});
}

$("navPnrStatus").addEventListener("click", e => {
 e.preventDefault();
 showPnrStatus();
});

$("pnrSearchForm").addEventListener("submit", async e => {
 e.preventDefault();

 const pnr = $("pnrInput").value.trim().toUpperCase();
 if (!pnr) {
  toast("Please enter an EasyTicket PNR.");
  return;
 }

 const result = $("pnrStatusResult");
 result.innerHTML = '<div class="loading-state">Checking PNR status…</div>';

 try {
  const booking = await api("/api/pnr/" + encodeURIComponent(pnr));
  renderPnrStatus(booking);
 } catch (error) {
  result.innerHTML = `
   <div class="empty-state">
    <h3>PNR not found</h3>
    <p>${esc(error.message)}</p>
   </div>`;
 }
});

async function showBookingHistory() {
 closeAccountDrawer();
 const user = await refreshUser();

 if (!user) {
  state.authMode = "login";
  renderAuthMode();
  openModal("authModal");
  toast("Please log in to view your booking history.");
  return;
 }

 $("bookingHistorySection").hidden = false;
 $("transactionHistorySection").hidden = true;
 $("cancellationHistorySection").hidden = true;
 $("pnrStatusSection").hidden = true;
 $("navPnrStatus").classList.remove("active");
 $("navCancellationHistory").classList.remove("active");
 $("navTransactionHistory").classList.remove("active");
 $("resultsSection").hidden = true;
 $("howItWorks").hidden = true;
 $("bookingHistorySection").scrollIntoView({behavior:"smooth", block:"start"});
 $("navLinks").classList.remove("open");
 $("navBookNow").classList.remove("active");
 $("navBookingHistory").classList.add("active");

 await loadBookingHistory();
}

function showBookNow() {
 $("bookingHistorySection").hidden = true;
 $("transactionHistorySection").hidden = true;
 $("cancellationHistorySection").hidden = true;
 $("pnrStatusSection").hidden = true;
 $("navPnrStatus").classList.remove("active");
 $("navCancellationHistory").classList.remove("active");
 $("navBookingHistory").classList.remove("active");
 $("navTransactionHistory").classList.remove("active");
 $("resultsSection").hidden = true;
 $("howItWorks").hidden = false;
 $("searchPanel").scrollIntoView({behavior:"smooth", block:"start"});
 $("navLinks").classList.remove("open");
 $("navBookingHistory").classList.remove("active");
 $("navBookNow").classList.add("active");
}

$("navBookingHistory").addEventListener("click", e => {
 e.preventDefault();
 showBookingHistory();
});

$("navBookNow").addEventListener("click", e => {
 e.preventDefault();
 showBookNow();
});

$("drawerBookingHistory").addEventListener("click", showBookingHistory);
$("refreshBookingHistory").addEventListener("click", loadBookingHistory);


// Transaction History
function renderTransactionHistory(transactions) {
 const container = $("transactionHistoryList");

 if (!transactions.length) {
  container.innerHTML = `
   <div class="empty-state">
    <h3>No transactions yet</h3>
    <p>Your payment records will appear here after you make a booking.</p>
    <button type="button" class="primary-btn" id="transactionBookNow">Find trains</button>
   </div>`;
  $("transactionBookNow").addEventListener("click", showBookNow);
  return;
 }

 container.innerHTML = transactions.map(t => {
  const status = String(t.paymentStatus || "UNKNOWN").toUpperCase();
  const statusClass = status === "SUCCESS" ? "success"
    : status === "FAILED" ? "failed" : "";

  return `
   <article class="transaction-card" id="transaction-booking-${esc(t.bookingId)}">
    <div class="transaction-card-top">
     <div>
      <span class="transaction-label">TRANSACTION REFERENCE</span>
      <strong class="transaction-reference">${esc(t.transactionReference)}</strong>
     </div>
     <span class="transaction-status ${statusClass}">${esc(status)}</span>
    </div>

    <div class="transaction-amount">
     <small>Amount paid</small>
     <strong>${esc(money(t.amount))}</strong>
    </div>

    <div class="transaction-details-grid">
     <div><small>Payment method</small><strong>${esc(t.paymentMethod || "—")}</strong></div>
     <div><small>Payment date</small><strong>${esc(historyDateTime(t.paidAt))}</strong></div>
     <div><small>PNR</small><strong>${esc(t.pnr || "—")}</strong></div>
     <div><small>Booking status</small><strong>${esc(t.bookingStatus || "—")}</strong></div>
    </div>

    <div class="transaction-journey">
     <div>
      <strong>${esc(t.trainName || "Train " + t.trainNumber)}</strong>
      <small>Train no. ${esc(t.trainNumber)} · ${esc(t.travelClass || "—")}</small>
     </div>
     <div class="transaction-route">
      <span><strong>${esc(t.fromCode)}</strong><small>${esc(t.fromName)}</small></span>
      <b>→</b>
      <span><strong>${esc(t.toCode)}</strong><small>${esc(t.toName)}</small></span>
     </div>
     <small class="transaction-journey-date">Journey date: ${esc(historyDate(t.journeyDate))}</small>
    </div>
   </article>`;
 }).join("");
}

async function loadTransactionHistory() {
 const container = $("transactionHistoryList");
 container.innerHTML = '<div class="loading-state">Loading your transactions…</div>';

 try {
  const transactions = await api("/api/transactions/history");
  renderTransactionHistory(Array.isArray(transactions) ? transactions : []);
 } catch (err) {
  container.innerHTML = `
   <div class="empty-state">
    <h3>Unable to load transactions</h3>
    <p>${esc(err.message)}</p>
    <button type="button" class="secondary-btn" id="retryTransactionHistory">Try again</button>
   </div>`;
  $("retryTransactionHistory").addEventListener("click", loadTransactionHistory);
 }
}

async function showTransactionHistory(bookingId = null) {
 closeAccountDrawer();
 const user = await refreshUser();

 if (!user) {
  state.authMode = "login";
  renderAuthMode();
  openModal("authModal");
  toast("Please log in to view your transaction history.");
  return;
 }

 $("bookingHistorySection").hidden = true;
 $("transactionHistorySection").hidden = false;
 $("cancellationHistorySection").hidden = true;
 $("pnrStatusSection").hidden = true;
 $("navPnrStatus").classList.remove("active");
 $("navCancellationHistory").classList.remove("active");
 $("resultsSection").hidden = true;
 $("howItWorks").hidden = true;

 $("navLinks").classList.remove("open");
 $("navBookNow").classList.remove("active");
 $("navBookingHistory").classList.remove("active");
 $("navTransactionHistory").classList.add("active");

 $("transactionHistorySection").scrollIntoView({behavior:"smooth", block:"start"});
 await loadTransactionHistory();

 if (bookingId !== null) {
  const target = $("transaction-booking-" + bookingId);
  if (target) target.scrollIntoView({behavior:"smooth", block:"center"});
  else toast("No transaction record was found for this booking.");
 }
}

$("navTransactionHistory").addEventListener("click", e => {
 e.preventDefault();
 showTransactionHistory();
});

$("drawerTransactionHistory").addEventListener("click", showTransactionHistory);
$("refreshTransactionHistory").addEventListener("click", loadTransactionHistory);


// Cancellation History
function renderCancellationHistory(cancellations) {
 const container = $("cancellationHistoryList");

 if (!cancellations.length) {
  container.innerHTML = `
   <div class="empty-state">
    <h3>No cancelled tickets</h3>
    <p>Your cancelled bookings and simulated refund records will appear here.</p>
    <button type="button" class="primary-btn" id="cancellationBookNow">Find trains</button>
   </div>`;
  $("cancellationBookNow").addEventListener("click", showBookNow);
  return;
 }

 container.innerHTML = cancellations.map(c => `
  <article class="transaction-card">
   <div class="transaction-card-top">
    <div>
     <span class="transaction-label">CANCELLATION REFERENCE</span>
     <strong class="transaction-reference">${esc(c.cancellationReference)}</strong>
    </div>
    <span class="transaction-status success">${esc(c.refundStatus || "SIMULATED")}</span>
   </div>

   <div class="transaction-amount">
    <small>Simulated refund amount</small>
    <strong>${esc(money(c.refundAmount))}</strong>
   </div>

   <div class="transaction-details-grid">
    <div><small>PNR</small><strong>${esc(c.pnr || "—")}</strong></div>
    <div><small>Cancellation date</small><strong>${esc(historyDateTime(c.cancelledAt))}</strong></div>
    <div><small>Journey date</small><strong>${esc(historyDate(c.journeyDate))}</strong></div>
    <div><small>Passengers</small><strong>${esc(c.passengerCount)}</strong></div>
    <div><small>Refund type</small><strong>Simulated · Not a real bank refund</strong></div>
    <div><small>Class</small><strong>${esc(c.travelClass || "—")}</strong></div>
   </div>

   <div class="transaction-journey">
    <strong>${esc(c.trainName || "Train " + c.trainNumber)}</strong>
    <small>Train no. ${esc(c.trainNumber)}</small>
    <div class="transaction-route">
     <span><strong>${esc(c.fromCode)}</strong><small>${esc(c.fromName)}</small></span>
     <b>→</b>
     <span><strong>${esc(c.toCode)}</strong><small>${esc(c.toName)}</small></span>
    </div>
   </div>
  </article>
 `).join("");
}

async function loadCancellationHistory() {
 const container = $("cancellationHistoryList");
 container.innerHTML = '<div class="loading-state">Loading cancellation records…</div>';

 try {
  const cancellations = await api("/api/cancellations/history");
  renderCancellationHistory(Array.isArray(cancellations) ? cancellations : []);
 } catch (err) {
  container.innerHTML = `
   <div class="empty-state">
    <h3>Unable to load cancellation history</h3>
    <p>${esc(err.message)}</p>
    <button type="button" class="secondary-btn" id="retryCancellationHistory">Try again</button>
   </div>`;
  $("retryCancellationHistory").addEventListener("click", loadCancellationHistory);
 }
}

async function showCancellationHistory() {
 closeAccountDrawer();
 const user = await refreshUser();

 if (!user) {
  state.authMode = "login";
  renderAuthMode();
  openModal("authModal");
  toast("Please log in to view your cancellation history.");
  return;
 }

 $("bookingHistorySection").hidden = true;
 $("transactionHistorySection").hidden = true;
 $("cancellationHistorySection").hidden = false;
 $("pnrStatusSection").hidden = true;
 $("navPnrStatus").classList.remove("active");
 $("resultsSection").hidden = true;
 $("howItWorks").hidden = true;

 $("navLinks").classList.remove("open");
 $("navBookNow").classList.remove("active");
 $("navBookingHistory").classList.remove("active");
 $("navTransactionHistory").classList.remove("active");
 $("navCancellationHistory").classList.add("active");

 $("cancellationHistorySection").scrollIntoView({behavior:"smooth", block:"start"});
 await loadCancellationHistory();
}

$("navCancellationHistory").addEventListener("click", e => {
 e.preventDefault();
 showCancellationHistory();
});

$("drawerCancellationHistory").addEventListener("click", showCancellationHistory);
$("refreshCancellationHistory").addEventListener("click", loadCancellationHistory);
