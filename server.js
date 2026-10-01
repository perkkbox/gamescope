const http=require("http"),fs=require("fs"),path=require("path"),crypto=require("crypto");const {URL}=require("url");
const PORT=process.env.PORT||10000,ROOT=__dirname,DATA=path.join(ROOT,"data");
const defaults={"users.json":[],"sessions.json":[],"reviews.json":[],"steam-catalog.json":{"updatedAt":0,"apps":[]},"steam-cache.json":{}};for(const [f,v] of Object.entries(defaults)){const p=path.join(DATA,f);if(!fs.existsSync(p))fs.writeFileSync(p,JSON.stringify(v,null,2))}
const read=(f,d)=>{try{return JSON.parse(fs.readFileSync(path.join(DATA,f),"utf8"))}catch{return d}};
const write=(f,v)=>fs.writeFileSync(path.join(DATA,f),JSON.stringify(v,null,2));
const send=(r,s,b,t="application/json")=>{r.writeHead(s,{"Content-Type":t+"; charset=utf-8","Cache-Control":"no-store"});r.end(t==="application/json"?JSON.stringify(b):b)};
function cookie(req,n){const x=(req.headers.cookie||"").split(";").map(s=>s.trim()).find(s=>s.startsWith(n+"="));return x?decodeURIComponent(x.slice(n.length+1)):null}
function user(req){const id=cookie(req,"gs_session"),ss=read("sessions.json",[]),s=ss.find(x=>x.id===id&&x.expires>Date.now());if(!s)return null;return read("users.json",[]).find(x=>x.username===s.username)||null}
function hp(p,s=crypto.randomBytes(16).toString("hex")){return {salt:s,hash:crypto.scryptSync(p,s,64).toString("hex")}}
function body(req){return new Promise((ok,no)=>{let d="";req.on("data",c=>d+=c);req.on("end",()=>{try{ok(d?JSON.parse(d):{})}catch(e){no(e)}})})}
async function getj(u,o={}){const r=await fetch(u,o);if(!r.ok)throw Error(r.status);return r.json()}
async function catalog(){
  let c=read("steam-catalog.json",{updatedAt:0,apps:[]});
  if(!Array.isArray(c.apps)) c={updatedAt:0,apps:[]};
  if(c.apps.length && Date.now()-c.updatedAt<86400000) return c.apps;

  try{
    let apps=[];
    if(process.env.STEAM_API_KEY){
      let last=0;
      for(let page=0; page<100; page++){
        let u=new URL("https://partner.steam-api.com/IStoreService/GetAppList/v1/");
        u.searchParams.set("key",process.env.STEAM_API_KEY);
        u.searchParams.set("include_games","true");
        u.searchParams.set("include_dlc","false");
        u.searchParams.set("include_software","false");
        u.searchParams.set("include_videos","false");
        u.searchParams.set("include_hardware","false");
        u.searchParams.set("max_results","50000");
        if(last) u.searchParams.set("last_appid",String(last));

        let j=await getj(u);
        let batch=j.response?.apps||[];
        apps.push(...batch.map(a=>({appid:a.appid,name:a.name})).filter(a=>a.appid&&a.name));

        let next=j.response?.last_appid || batch.at(-1)?.appid || 0;
        if(!batch.length || next<=last || !j.response?.have_more_results) break;
        last=next;
      }
    }else{
      let j=await getj("https://api.steampowered.com/ISteamApps/GetAppList/v2/");
      apps=(j.applist?.apps||[]).map(a=>({appid:a.appid,name:a.name})).filter(a=>a.appid&&a.name);
    }

    // Remove duplicate app IDs and keep the catalog clean.
    const seen=new Set();
    apps=apps.filter(a=>{
      if(seen.has(a.appid)) return false;
      seen.add(a.appid);
      return true;
    });

    write("steam-catalog.json",{updatedAt:Date.now(),apps});
    return apps;
  }catch(e){
    console.error("Steam catalog error:",e.message);
    return c.apps||[];
  }
}
async function details(id,cc){
 const c=read("steam-cache.json",{}),k=id+":"+cc.toLowerCase();if(c[k]&&Date.now()-c[k].at<86400000)return c[k].d;
 try{let j=await getj(`https://store.steampowered.com/api/appdetails?appids=${id}&cc=${cc.toLowerCase()}&l=english`),x=j[String(id)];if(!x?.success)return null;let d=x.data,p=d.price_overview;
  let v={id:"steam-"+id,title:d.name,platform:"Steam",country:cc,price:p?p.final/100:0,regularPrice:p?p.initial/100:0,discount:p?p.discount_percent:0,currency:p?.currency||"USD",image:d.header_image||"",source:"live",url:`https://store.steampowered.com/app/${id}/?cc=${cc.toLowerCase()}`,free:!!d.is_free};c[k]={at:Date.now(),d:v};write("steam-cache.json",c);return v
 }catch{return null}
}
const demos=[
 ["Xbox","Gang Beasts",19.99],["Nintendo","Mario Kart World",79.99],["PlayStation","Astro Bot",59.99],["Meta Quest","Beat Saber",29.99],
 ["Xbox","Forza Horizon 5",59.99],["Nintendo","The Legend of Zelda: Tears of the Kingdom",69.99],["PlayStation","Marvel's Spider-Man 2",69.99],["Meta Quest","SUPERHOT VR",24.99]
].map((x,i)=>({id:"demo-"+i,title:x[1],platform:x[0],country:"US",price:x[2],regularPrice:x[2],discount:0,currency:"USD",image:"",source:"demo"}));
async function games(u){
  const platform=(u.searchParams.get("platform")||"all").toLowerCase();
  const cc=(u.searchParams.get("country")||"US").toUpperCase();
  const q=(u.searchParams.get("q")||"").trim().toLowerCase();
  const sale=u.searchParams.get("sale")==="1";
  const sort=u.searchParams.get("sort")||"featured";

  let out=[];

  if(platform==="all"||platform==="steam"){
    const a=await catalog();
    let cand=q ? a.filter(x=>x.name.toLowerCase().includes(q)) : a;

    // Search results should be more useful than simply taking the first
    // alphabetical records. For a blank search, show the first catalog
    // entries; for a search, prioritize exact/prefix matches.
    if(q){
      cand.sort((a,b)=>{
        const al=a.name.toLowerCase(), bl=b.name.toLowerCase();
        const ae=al===q?0:al.startsWith(q)?1:2;
        const be=bl===q?0:bl.startsWith(q)?1:2;
        return ae-be || al.localeCompare(bl);
      });
    }

    const batch=cand.slice(0,24);
    for(let i=0;i<batch.length;i+=6){
      const chunk=batch.slice(i,i+6);
      const details=await Promise.all(chunk.map(x=>detailsFor(x,cc)));
      out.push(...details.filter(Boolean));
    }
  }

  if(platform==="all"||platform==="xbox"||platform==="nintendo"||platform==="playstation"||platform==="meta quest"||platform==="oculus / meta quest"){
    out.push(...demos.filter(x=>
      (platform==="all"||x.platform.toLowerCase()===platform) &&
      x.country===cc &&
      (!q||x.title.toLowerCase().includes(q))
    ));
  }

  if(sale) out=out.filter(x=>x.discount>0);

  if(sort==="price-low") out.sort((a,b)=>a.price-b.price);
  else if(sort==="price-high") out.sort((a,b)=>b.price-a.price);
  else if(sort==="discount") out.sort((a,b)=>b.discount-a.discount);
  else out.sort((a,b)=>a.title.localeCompare(b.title));

  return out.slice(0,36);
}
async function detailsFor(x,cc){
  return details(x.appid,cc);
}
async function api(req,res,u){
 if(u.pathname==="/api/games")return send(res,200,await games(u));
 if(u.pathname==="/api/status"){let c=read("steam-catalog.json",{});return send(res,200,{steamCatalogCount:c.apps?.length||0,updated:c.updatedAt||0})}
 if(u.pathname==="/api/me")return send(res,200,{user:user(req)?.username||null});
 if(u.pathname==="/api/reviews"&&req.method==="GET")return send(res,200,read("reviews.json",[]));
 if(u.pathname==="/api/logout"&&req.method==="POST"){let id=cookie(req,"gs_session");write("sessions.json",read("sessions.json",[]).filter(x=>x.id!==id));res.setHeader("Set-Cookie","gs_session=; Path=/; HttpOnly; Max-Age=0; SameSite=Lax");return send(res,200,{ok:true})}
 if((u.pathname==="/api/login"||u.pathname==="/api/register")&&req.method==="POST"){let b=await body(req),un=String(b.username||"").trim(),pw=String(b.password||""),us=read("users.json",[]),found=us.find(x=>x.username.toLowerCase()===un.toLowerCase());
  if(u.pathname==="/api/register"){if(!/^[A-Za-z0-9_]{3,24}$/.test(un)||pw.length<6)return send(res,400,{error:"Username/password requirements not met."});if(found)return send(res,409,{error:"Username already exists."});let h=hp(pw);us.push({username:un,...h,createdAt:Date.now()});write("users.json",us)}
  else if(!found||crypto.scryptSync(pw,found.salt,64).toString("hex")!==found.hash)return send(res,401,{error:"Invalid username or password."});
  let sid=crypto.randomBytes(32).toString("hex"),ss=read("sessions.json",[]).filter(x=>x.expires>Date.now());ss.push({id:sid,username:un,expires:Date.now()+2592000000});write("sessions.json",ss);res.setHeader("Set-Cookie",`gs_session=${sid}; Path=/; HttpOnly; Max-Age=2592000; SameSite=Lax`);return send(res,200,{ok:true,user:un})
 }
 if(u.pathname==="/api/reviews"&&req.method==="POST"){let me=user(req);if(!me)return send(res,401,{error:"Log in to post a review."});let b=await body(req),rs=read("reviews.json",[]);rs.unshift({id:crypto.randomUUID(),username:me.username,title:String(b.title||"").trim(),platform:String(b.platform||"").trim(),rating:Math.max(1,Math.min(5,Number(b.rating)||5)),text:String(b.text||"").trim(),createdAt:Date.now()});write("reviews.json",rs);return send(res,201,{ok:true})}
 return send(res,404,{error:"Not found"})
}
const mime={".html":"text/html",".css":"text/css",".js":"text/javascript"};
http.createServer(async(req,res)=>{try{let u=new URL(req.url,`http://${req.headers.host||"localhost"}`);if(u.pathname.startsWith("/api/"))return api(req,res,u);let p=path.join(ROOT,u.pathname==="/"?"index.html":u.pathname);if(!fs.existsSync(p))p=path.join(ROOT,"index.html");res.writeHead(200,{"Content-Type":(mime[path.extname(p)]||"application/octet-stream")+"; charset=utf-8"});fs.createReadStream(p).pipe(res)}catch(e){console.error(e);send(res,500,{error:"Server error"})}}).listen(PORT,"0.0.0.0",()=>console.log("GameScope running on port "+PORT));
