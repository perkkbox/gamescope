const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const REVIEWS_FILE = path.join(DATA_DIR, "reviews.json");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const SESSIONS_FILE = path.join(DATA_DIR, "sessions.json");
const GAMES_FILE = path.join(DATA_DIR, "games.json");

fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(REVIEWS_FILE)) fs.writeFileSync(REVIEWS_FILE, "[]");
if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, "[]");
if (!fs.existsSync(SESSIONS_FILE)) fs.writeFileSync(SESSIONS_FILE, "[]");
if (!fs.existsSync(GAMES_FILE)) {
  fs.writeFileSync(GAMES_FILE, JSON.stringify([
    {
      id:"steam-730",
      title:"Counter-Strike 2",
      platform:"Steam",
      country:"US",
      price:0,
      regularPrice:0,
      discount:0,
      currency:"USD",
      image:"https://cdn.cloudflare.steamstatic.com/steam/apps/730/header.jpg",
      source:"demo"
    },
    {
      id:"steam-570",
      title:"Dota 2",
      platform:"Steam",
      country:"US",
      price:0,
      regularPrice:0,
      discount:0,
      currency:"USD",
      image:"https://cdn.cloudflare.steamstatic.com/steam/apps/570/header.jpg",
      source:"demo"
    },
    {
      id:"demo-mario",
      title:"Mario Kart World",
      platform:"Nintendo",
      country:"US",
      price:79.99,
      regularPrice:79.99,
      discount:0,
      currency:"USD",
      image:"",
      source:"demo"
    },
    {
      id:"demo-gang-beasts",
      title:"Gang Beasts",
      platform:"Xbox",
      country:"US",
      price:19.99,
      regularPrice:19.99,
      discount:0,
      currency:"USD",
      image:"",
      source:"demo"
    }
  ], null, 2));
}

function json(res, status, body) {
  res.writeHead(status, {"Content-Type":"application/json; charset=utf-8", "Access-Control-Allow-Origin":"*"});
  res.end(JSON.stringify(body));
}

function readJson(file, fallback=[]) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); }
  catch { return fallback; }
}

function writeJson(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
}

function sendFile(res, file) {
  const ext = path.extname(file).toLowerCase();
  const types = {
    ".html":"text/html; charset=utf-8",
    ".css":"text/css; charset=utf-8",
    ".js":"text/javascript; charset=utf-8",
    ".json":"application/json; charset=utf-8",
    ".svg":"image/svg+xml"
  };
  fs.readFile(file, (err, data) => {
    if (err) return json(res, 404, {error:"Not found"});
    res.writeHead(200, {"Content-Type": types[ext] || "application/octet-stream"});
    res.end(data);
  });
}

async function fetchSteamApp(appid, country) {
  const cc = country || "US";
  const url = `https://store.steampowered.com/api/appdetails?appids=${encodeURIComponent(appid)}&cc=${encodeURIComponent(cc.toLowerCase())}&l=en`;
  const r = await fetch(url, {headers: {"User-Agent":"GameScope/2.0"}});
  if (!r.ok) throw new Error(`Steam HTTP ${r.status}`);
  const data = await r.json();
  const item = data[String(appid)]?.data;
  if (!item || !item.price_overview) return null;
  const p = item.price_overview;
  return {
    price: p.final / 100,
    regularPrice: p.initial / 100,
    discount: p.discount_percent || 0,
    currency: p.currency,
    url: item.store_url,
    image: item.header_image,
    title: item.name,
    platform: "Steam",
    country: cc,
    source: "steam-live",
    updatedAt: new Date().toISOString()
  };
}

async function getPrices() {
  const games = readJson(GAMES_FILE, []);
  const out = [];
  for (const g of games) {
    if (g.platform === "Steam" && /^\d+$/.test(String(g.id).replace("steam-",""))) {
      const appid = String(g.id).replace("steam-","");
      try {
        const live = await fetchSteamApp(appid, g.country || "US");
        out.push({...g, ...(live || {}), id:g.id});
      } catch {
        out.push({...g, source:"fallback", updatedAt:new Date().toISOString()});
      }
    } else {
      out.push(g);
    }
  }

  // Optional normalized feed for Xbox/Nintendo/PlayStation/Oculus or other stores.
  // Set PRICE_FEED_URL to a JSON endpoint you control. The endpoint should return:
  // { "games": [ {id,title,platform,country,price,regularPrice,discount,currency,image,url,source} ] }
  if (process.env.PRICE_FEED_URL) {
    try {
      const r = await fetch(process.env.PRICE_FEED_URL, {headers: {"User-Agent":"GameScope/2.0"}});
      if (r.ok) {
        const feed = await r.json();
        if (Array.isArray(feed.games)) {
          const byId = new Map(out.map(g => [g.id, g]));
          for (const item of feed.games) byId.set(item.id, {...byId.get(item.id), ...item, source:item.source || "live-feed", updatedAt:new Date().toISOString()});
          return [...byId.values()];
        }
      }
    } catch {}
  }
  return out;
}


function makeToken() {
  return require("crypto").randomBytes(32).toString("hex");
}
function hashPassword(password, salt) {
  return require("crypto").scryptSync(password, salt, 64).toString("hex");
}
function currentUser(req) {
  const token = (req.headers.cookie || "").split(";").map(x=>x.trim()).find(x=>x.startsWith("gamescope_session="))?.split("=")[1];
  if (!token) return null;
  const sessions = readJson(SESSIONS_FILE, []);
  const session = sessions.find(s => s.token === token && new Date(s.expiresAt) > new Date());
  if (!session) return null;
  return readJson(USERS_FILE, []).find(u => u.id === session.userId) || null;
}
function setSession(res, userId) {
  const token = makeToken();
  const sessions = readJson(SESSIONS_FILE, []).filter(s => new Date(s.expiresAt) > new Date());
  sessions.push({token,userId,expiresAt:new Date(Date.now()+1000*60*60*24*30).toISOString()});
  writeJson(SESSIONS_FILE, sessions);
  res.setHeader("Set-Cookie", `gamescope_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${60*60*24*30}`);
}
function sanitizeUsername(s) {
  return String(s||"").trim().slice(0,24).replace(/[^a-zA-Z0-9 _-]/g,"");
}

function sanitizeReview(body, user) {
  const text = String(body.text || "").trim().slice(0, 1000);
  const rating = Number(body.rating);
  const gameId = String(body.gameId || "").trim().slice(0, 100);
  const platform = String(body.platform || "").trim().slice(0, 30);
  if (!user || !text || !gameId || !platform || !Number.isInteger(rating) || rating < 1 || rating > 5) return null;
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
    gameId, platform, userId:user.id, username:user.username, rating, text,
    createdAt: new Date().toISOString()
  };
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin":"*",
        "Access-Control-Allow-Methods":"GET,POST,OPTIONS",
        "Access-Control-Allow-Headers":"Content-Type"
      });
      return res.end();
    }

    if (url.pathname === "/api/games" && req.method === "GET") {
      return json(res, 200, await getPrices());
    }


    if (url.pathname === "/api/me" && req.method === "GET") {
      const user = currentUser(req);
      return json(res, 200, user ? {loggedIn:true, user:{id:user.id,username:user.username}} : {loggedIn:false});
    }

    if (url.pathname === "/api/register" && req.method === "POST") {
      let raw = "";
      req.on("data", c => raw += c);
      req.on("end", () => {
        try {
          const b = JSON.parse(raw);
          const username = sanitizeUsername(b.username);
          const password = String(b.password || "");
          if (username.length < 3 || password.length < 8) return json(res,400,{error:"Username must be 3+ characters and password must be 8+ characters."});
          const users = readJson(USERS_FILE, []);
          if (users.some(u => u.username.toLowerCase() === username.toLowerCase())) return json(res,409,{error:"That username is already taken."});
          const salt = require("crypto").randomBytes(16).toString("hex");
          const user = {id:require("crypto").randomUUID(),username,passwordHash:hashPassword(password,salt),salt,createdAt:new Date().toISOString()};
          users.push(user); writeJson(USERS_FILE,users); setSession(res,user.id);
          return json(res,201,{loggedIn:true,user:{id:user.id,username:user.username}});
        } catch { return json(res,400,{error:"Invalid request."}); }
      });
      return;
    }

    if (url.pathname === "/api/login" && req.method === "POST") {
      let raw = "";
      req.on("data", c => raw += c);
      req.on("end", () => {
        try {
          const b = JSON.parse(raw);
          const users = readJson(USERS_FILE, []);
          const user = users.find(u => u.username.toLowerCase() === String(b.username||"").toLowerCase());
          if (!user || hashPassword(String(b.password||""),user.salt) !== user.passwordHash) return json(res,401,{error:"Incorrect username or password."});
          setSession(res,user.id);
          return json(res,200,{loggedIn:true,user:{id:user.id,username:user.username}});
        } catch { return json(res,400,{error:"Invalid request."}); }
      });
      return;
    }

    if (url.pathname === "/api/logout" && req.method === "POST") {
      res.setHeader("Set-Cookie","gamescope_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0");
      return json(res,200,{loggedIn:false});
    }

    if (url.pathname === "/api/reviews" && req.method === "GET") {
      const gameId = url.searchParams.get("gameId");
      const reviews = readJson(REVIEWS_FILE, []);
      return json(res, 200, gameId ? reviews.filter(r => r.gameId === gameId) : reviews);
    }

    if (url.pathname === "/api/reviews" && req.method === "POST") {
      let raw = "";
      req.on("data", chunk => raw += chunk);
      req.on("end", () => {
        try {
          const user = currentUser(req);
          if (!user) return json(res,401,{error:"Log in to post a review."});
          const review = sanitizeReview(JSON.parse(raw), user);
          if (!review) return json(res, 400, {error:"Please provide a username, 1–5 star rating, game ID, and review text."});
          const reviews = readJson(REVIEWS_FILE, []);
          reviews.push(review);
          writeJson(REVIEWS_FILE, reviews);
          return json(res, 201, review);
        } catch {
          return json(res, 400, {error:"Invalid JSON."});
        }
      });
      return;
    }

    let pathname = decodeURIComponent(url.pathname);
    if (pathname === "/") pathname = "/index.html";
    const file = path.join(ROOT, pathname.replace(/^\/+/, ""));
    if (!file.startsWith(ROOT)) return json(res, 403, {error:"Forbidden"});
    return sendFile(res, file);
  } catch (e) {
    return json(res, 500, {error:"Server error"});
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`GameScope running on http://localhost:${PORT}`);
  console.log(process.env.PRICE_FEED_URL ? "External normalized price feed enabled." : "External normalized price feed disabled; fallback data used for non-Steam stores.");
});
