let games = [];
let reviewsByGame = {};
let currentRating = 5;
let me = null;

const $ = s => document.querySelector(s);

async function loadMe(){
  const r=await fetch("/api/me",{cache:"no-store"});
  const d=await r.json();
  me=d.loggedIn?d.user:null;
  updateAccountUI();
}
function updateAccountUI(){
  $("#accountBtn").textContent=me?`@${me.username}`:"Account";
  $("#loginHint").textContent=me?`Reviewing as @${me.username}`:"You must be logged in to post reviews.";
  $("#logoutBtn").hidden=!me;
  $("#loginBtn").hidden=!!me;
  $("#registerBtn").hidden=!!me;
}
async function accountRequest(endpoint){
  const payload={username:$("#accountUser").value,password:$("#accountPass").value};
  const r=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
  const d=await r.json();
  $("#accountMessage").textContent=d.error||"";
  if(r.ok){await loadMe(); if(me) $("#accountDialog").close();}
}
async function load() {
  $("#status").textContent = "Refreshing…";
  try {
    const r = await fetch("/api/games", {cache:"no-store"});
    games = await r.json();
    const live = games.filter(g => String(g.source || "").includes("live")).length;
    $("#status").textContent = `${live} live price records • ${new Date().toLocaleTimeString()}`;
    await render();
  } catch(e) {
    $("#status").textContent = "Could not load prices";
    $("#grid").innerHTML = `<div class="empty">Start the GameScope server to load the catalog.</div>`;
  }
}

function ratingFor(id) {
  const list = reviewsByGame[id] || [];
  if (!list.length) return {avg:0,count:0};
  return {avg:list.reduce((a,b)=>a+b.rating,0)/list.length,count:list.length};
}

async function loadReviews(id) {
  try {
    const r = await fetch(`/api/reviews?gameId=${encodeURIComponent(id)}`, {cache:"no-store"});
    reviewsByGame[id] = await r.json();
  } catch { reviewsByGame[id] = []; }
}

async function render() {
  const q = $("#search").value.trim().toLowerCase();
  const platform = $("#platform").value;
  const country = $("#country").value;
  const sale = $("#sale").value;
  const sort = $("#sort").value;

  const filtered = games.filter(g => {
    if (q && !g.title.toLowerCase().includes(q)) return false;
    if (platform !== "all" && g.platform !== platform) return false;
    if (country !== "all" && g.country !== country) return false;
    if (sale === "sale" && !(g.discount > 0)) return false;
    if (sale !== "all" && sale !== "sale" && !(g.discount >= Number(sale))) return false;
    return true;
  });

  for (const g of filtered) if (!reviewsByGame[g.id]) await loadReviews(g.id);

  filtered.sort((a,b) => {
    if (sort === "price") return Number(a.price)-Number(b.price);
    if (sort === "name") return a.title.localeCompare(b.title);
    if (sort === "rating") return ratingFor(b.id).avg-ratingFor(a.id).avg;
    return Number(b.discount)-Number(a.discount);
  });

  if (!filtered.length) {
    $("#grid").innerHTML = `<div class="empty">No games match those filters.</div>`;
    return;
  }

  $("#grid").innerHTML = filtered.map(card).join("");
}

function card(g) {
  const r = ratingFor(g.id);
  const stars = r.count ? `★ ${r.avg.toFixed(1)} (${r.count})` : "No reviews";
  const sourceLive = String(g.source||"").includes("live");
  const image = g.image ? `style="background-image:url('${escapeAttr(g.image)}')"` : "";
  const price = typeof g.price === "number" ? new Intl.NumberFormat(undefined,{style:"currency",currency:g.currency||"USD"}).format(g.price) : "—";
  const regular = g.regularPrice && g.regularPrice > g.price ? `<span class="regular">${new Intl.NumberFormat(undefined,{style:"currency",currency:g.currency||"USD"}).format(g.regularPrice)}</span>` : "";
  const sale = g.discount > 0 ? `<span class="discount">-${g.discount}%</span>` : "";
  return `<article class="card">
    <div class="cover" ${image}>
      ${sale}
      <span class="platform">${escapeHtml(g.platform)} · ${escapeHtml(g.country||"—")}</span>
    </div>
    <div class="cardbody">
      <div class="title">${escapeHtml(g.title)}</div>
      <div class="meta">${sourceLive ? '<span class="pill live">LIVE</span>' : '<span class="pill fallback">FALLBACK</span>'}</div>
      <div class="rating"><b>★</b> ${stars}</div>
      <div class="priceRow"><div><span class="price">${price}</span>${regular}</div></div>
      <div class="actions">
        ${g.url ? `<button class="buy" onclick="window.open('${escapeAttr(g.url)}','_blank')">Store</button>` : `<button class="buy" disabled>No store link</button>`}
        <button class="reviewBtn" onclick="openReview('${escapeAttr(g.id)}','${escapeAttr(g.title)}')">Reviews</button>
      </div>
    </div>
  </article>`;
}

function escapeHtml(s){return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]))}
function escapeAttr(s){return escapeHtml(s).replace(/`/g,"&#96;")}

async function openReview(id,title) {
  const game=games.find(g=>g.id===id); $("#reviewGameId").value=id; $("#reviewTitle").textContent=`Review ${title}`; $("#reviewPlatform").textContent=game?`Reviewing the ${game.platform} version`:"";
  $("#reviewMessage").textContent="";
  if(!me){ $("#reviewMessage").textContent="Log in or create a GameScope account before posting."; }
  $("#reviewDialog").showModal();
  await loadReviews(id);
  const list = reviewsByGame[id] || [];
  let box = document.querySelector(".reviewList");
  if (!box) { box=document.createElement("div"); box.className="reviewList"; $("#reviewForm").appendChild(box); }
  box.innerHTML = list.length ? list.map(r=>`<div class="reviewItem"><div class="reviewHead"><strong>${escapeHtml(r.username)}</strong><span>★ ${r.rating}/5 · ${escapeHtml(r.platform||"GameScope")}</span></div><div class="reviewText">${escapeHtml(r.text)}</div></div>`).join("") : "<div class='meta'>No reviews yet.</div>";
}

document.querySelectorAll("#ratingStars button").forEach(btn=>{
  btn.addEventListener("click",()=>{
    currentRating=Number(btn.dataset.rating);
    $("#reviewRating").value=currentRating;
    document.querySelectorAll("#ratingStars button").forEach(b=>b.classList.toggle("selected",Number(b.dataset.rating)<=currentRating));
  });
});
document.querySelectorAll("#ratingStars button").forEach(b=>b.classList.toggle("selected",Number(b.dataset.rating)<=5));

$("#reviewForm").addEventListener("submit", async e=>{
  e.preventDefault();
  const payload={
    gameId:$("#reviewGameId").value,
    platform:(games.find(g=>g.id===$("#reviewGameId").value)||{}).platform||"",
    rating:Number($("#reviewRating").value),
    text:$("#reviewText").value
  };
  const r=await fetch("/api/reviews",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
  const data=await r.json();
  if(!r.ok){$("#reviewMessage").textContent=data.error||"Could not post review.";return;}
  $("#reviewMessage").textContent="Review posted.";
  $("#reviewText").value="";
  await loadReviews(payload.gameId);
  await render();
  setTimeout(()=>$("#reviewDialog").close(),500);
});

["search","platform","country","sale","sort"].forEach(id=>$( "#"+id).addEventListener("input",render));
$("#refresh").addEventListener("click",load);
load();

$("#accountBtn").addEventListener("click",()=>{$("#accountMessage").textContent="";$("#accountDialog").showModal();});
$("#loginBtn").addEventListener("click",()=>accountRequest("/api/login"));
$("#registerBtn").addEventListener("click",()=>accountRequest("/api/register"));
$("#logoutBtn").addEventListener("click",async()=>{await fetch("/api/logout",{method:"POST"});await loadMe();$("#accountMessage").textContent="Logged out.";});
loadMe();
