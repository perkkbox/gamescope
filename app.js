let S={p:"all",c:"US",q:"",sale:false,sort:"featured",user:null};
const $=x=>document.querySelector(x);
async function api(u,o={}){const r=await fetch(u,{...o,headers:{"Content-Type":"application/json",...(o.headers||{})}});const j=await r.json();if(!r.ok)throw Error(j.error||"Request failed");return j}
const esc=s=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
function money(g){if(g.free)return "Free";try{return new Intl.NumberFormat(undefined,{style:"currency",currency:g.currency||"USD"}).format(g.price||0)}catch{return "$"+Number(g.price||0).toFixed(2)}}
function card(g){
  const url=g.url||"";
  const image=g.image
    ? `<img loading="lazy" src="${esc(g.image)}" alt="${esc(g.title)}">`
    : `<div class="placeholder">🎮</div>`;
  const old=g.regularPrice&&g.discount?money({...g,price:g.regularPrice}):"";
  return `<article class="card" data-url="${esc(url)}" tabindex="0" role="link" aria-label="Open ${esc(g.title)}">
    <div class="cover">${image}</div>
    <div class="body">
      <div class="badges"><span>${esc(g.platform)}</span><span class="${g.source==="live"?"live":"fallback"}">${g.source==="live"?"LIVE":"CATALOG"}</span></div>
      <div class="title">${esc(g.title)}</div>
      <div class="meta">${esc(g.country||"US")}</div>
      <div class="price">${money(g)} ${g.discount?`<span class="sale">-${g.discount}%</span>`:""}</div>
      ${old?`<span class="old">${old}</span>`:""}
      <button class="storeBtn" type="button">View Store ↗</button>
    </div>
  </article>`;
}
async function games(){
  const p=new URLSearchParams({platform:S.p,country:S.c,q:S.q,sale:S.sale?"1":"0",sort:S.sort});
  $("#grid").innerHTML="<p>Loading games…</p>";
  try{
    const a=await api("/api/games?"+p);
    $("#grid").innerHTML=a.length?a.map(card).join(""):"<p>No games matched.</p>";
    $("#heading").textContent=S.q?`Results for “${esc(S.q)}”`:"Games";
    $("#info").textContent=`${a.length} shown · prices cached up to 24h`;
  }catch(e){
    console.error(e);
    $("#grid").innerHTML=`<p class="err">${esc(e.message)}</p>`;
  }
}
async function status(){
  try{
    const s=await api("/api/status");
    $("#count").textContent=Number(s.steamCatalogCount||0).toLocaleString();
  }catch(e){
    console.error(e);
    $("#count").textContent="Unavailable";
  }
}
async function me(){
  try{
    const x=await api("/api/me");S.user=x.user;
    $("#acct").innerHTML=x.user
      ?`<span class="hello">Hi, ${esc(x.user)}</span><button id="logout">Log out</button>`
      :`<button id="login">Log in</button><button id="register" class="accent">Create account</button>`;
    $("#logout")?.addEventListener("click",async()=>{await api("/api/logout",{method:"POST"});me()});
    $("#login")?.addEventListener("click",login);
    $("#register")?.addEventListener("click",register);
  }catch(e){console.error(e)}
}
function show(h){$("#modalbody").innerHTML=h;$("#modal").hidden=false}
function login(){show(`<h2>Log in</h2><form id="form"><input id="un" placeholder="Username" required><input id="pw" type="password" placeholder="Password" required><button class="accent">Log in</button><p id="msg"></p></form>`)}
function register(){show(`<h2>Create account</h2><form id="form"><input id="un" placeholder="Username" required><input id="pw" type="password" placeholder="Password (6+ characters)" minlength="6" required><button class="accent">Create account</button><p id="msg"></p></form>`)}
async function reviews(){
  try{
    const a=await api("/api/reviews");
    $("#reviews").innerHTML=a.length?a.map(r=>`<div class="review"><div class="reviewtop"><b>${esc(r.title)}</b><span class="stars">${"★".repeat(r.rating)}${"☆".repeat(5-r.rating)}</span></div><div>${esc(r.text)}</div><div class="reviewmeta">by ${esc(r.username)} · ${esc(r.platform)} · ${new Date(r.createdAt).toLocaleDateString()}</div></div>`).join(""):"<p style='color:#98a2b2'>No reviews yet.</p>";
  }catch(e){$("#reviews").innerHTML=`<p class="err">${esc(e.message)}</p>`}
}
$("#close").onclick=()=>$("#modal").hidden=true;
$("#platforms").onclick=e=>{if(e.target.dataset.p){document.querySelectorAll("#platforms button").forEach(x=>x.classList.remove("active"));e.target.classList.add("active");S.p=e.target.dataset.p.toLowerCase();games()}};
$("#country").onchange=e=>{S.c=e.target.value;games()};
$("#sale").onchange=e=>{S.sale=e.target.checked;games()};
$("#sort").onchange=e=>{S.sort=e.target.value;games()};
$("#go").onclick=()=>{S.q=$("#q").value.trim();games()};
$("#q").onkeydown=e=>{if(e.key==="Enter"){S.q=e.target.value.trim();games()}};

$("#grid").addEventListener("click",e=>{
  const cardEl=e.target.closest(".card");
  if(!cardEl)return;
  const url=cardEl.dataset.url;
  if(url){
    window.open(url,"_blank","noopener,noreferrer");
  }
});
$("#grid").addEventListener("keydown",e=>{
  if(e.key!=="Enter"&&e.key!==" ")return;
  const cardEl=e.target.closest(".card");if(!cardEl)return;
  e.preventDefault();
  const url=cardEl.dataset.url;if(url)window.open(url,"_blank","noopener,noreferrer");
});

$("#modal").addEventListener("submit",async e=>{
  e.preventDefault();
  try{
    if(e.target.id==="form"){
      const registerMode=$("#modalbody").textContent.includes("Create account");
      await api(registerMode?"/api/register":"/api/login",{method:"POST",body:JSON.stringify({username:$("#un").value,password:$("#pw").value})});
      $("#modal").hidden=true;me();
    }else if(e.target.id==="reviewform"){
      await api("/api/reviews",{method:"POST",body:JSON.stringify({title:$("#rt").value,platform:$("#rp").value,rating:+$("#rr").value,text:$("#rx").value})});
      $("#modal").hidden=true;reviews();
    }
  }catch(err){$("#msg").textContent=err.message;$("#msg").className="err"}
});
$("#review").onclick=()=>{if(!S.user)return login();show(`<h2>Write a review</h2><form id="reviewform"><input id="rt" placeholder="Game title" required><select id="rp"><option>Steam</option><option>Xbox</option><option>Nintendo</option><option>PlayStation</option><option>Oculus / Meta Quest</option></select><select id="rr"><option value="5">5 stars</option><option value="4">4 stars</option><option value="3">3 stars</option><option value="2">2 stars</option><option value="1">1 star</option></select><textarea id="rx" placeholder="Your review" required></textarea><button class="accent">Post review</button><p id="msg"></p></form>`)};

me();status();games();reviews();
