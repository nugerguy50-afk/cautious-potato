// ===== Fruitiantor – Blox Fruits Akinator =====
const IMG_BASE = "https://nugerguy50-afk.github.io/.1/images/";
const MODEL = "gemini-3.8-flash";
const WIKI = "https://blox-fruits.fandom.com/api.php";
const CATEGORIES = ["Fruit","Race","Sword","Gun","Weapon / Accessory","Fighting Style","Boss","Enemy / NPC","Island","Sea Event"];
const MIN_Q = 12, MAX_Q = 25, MIN_CONF = 85;
const $ = id => document.getElementById(id);

const SYSTEM = `You are Fruitiantor, the Akinator of the Roblox game Blox Fruits. You read the player's mind.
HOW YOU BEHAVE:
- The player secretly thinks of ONE thing from Blox Fruits in a chosen category. You find it ONLY by asking questions, exactly like Akinator.
- Each turn you ask ONE short question answerable with Yes / Probably / Don't know / Probably not / No.
- Good questions: rarity, element or type, Sea, how it is obtained, Awakening, price, is it a boss drop, does it fly, is it M1 based, does it hit in an area, Natural/Logia/Beast, level needed, etc.
- NEVER ask "is it X?" with a specific name during the question phase. NEVER say the answer. Do NOT guess early.
- Silently track a list of remaining candidates and pick the question that eliminates the most. Use the player's answers strictly: a "No" removes things. Never contradict earlier answers.
- Only guess when ONE candidate remains that fits every answer and you are very sure (confidence 85+). Never guess a closest match to be safe: keep asking instead until you are sure.
- Use Google Search to stay current with the latest Blox Fruits update. Only include things that exist in the game now. Ignore removed or old items. Use exact official names.
OUTPUT: reply with ONLY raw JSON, no markdown.
Question: {"type":"question","text":"...","confidence":0-100}
Guess: {"type":"guess","name":"Exact Name","confidence":0-100}`;

let state;
function fresh(){ state = { cat:"", history:[], rejected:[], busy:false, retry:0 }; }
fresh();

// background bubbles
for (let i=0;i<18;i++){ const b=document.createElement("i"), s=10+Math.random()*50;
  b.style.cssText=`left:${Math.random()*100}%;width:${s}px;height:${s}px;animation-duration:${8+Math.random()*14}s;animation-delay:${-Math.random()*20}s`;
  $("bubbles").appendChild(b); }

CATEGORIES.forEach(c => { const b=document.createElement("button"); b.textContent=c; b.onclick=()=>start(c); $("cats").appendChild(b); });

function view(id){ ["key","menu","game","result","giveup"].forEach(v => $("v-"+v).hidden = v!==id); $("restart").hidden = id==="key"||id==="menu"; $("meter").hidden = id!=="game"; }
function say(t){ const b=$("bubble"); $("say").textContent=t; b.classList.remove("pop"); void b.offsetWidth; b.classList.add("pop"); }
function react(c){ const m=$("mascot"); m.classList.remove("pop","shake","think"); void m.offsetWidth; if(c) m.classList.add(c); }
function err(m){ $("err").textContent=m; $("err").hidden=!m; }
function think(on){ state.busy=on; react(on?"think":""); document.querySelectorAll("#answers button,#back").forEach(b=>b.disabled=on); }

// ----- key -----
if (localStorage.getItem("fruitiantor_key")) { $("key").value = localStorage.getItem("fruitiantor_key"); }
$("saveKey").onclick = () => {
  const k = $("key").value.trim(); if (!k) return err("Paste your Gemini API key first.");
  localStorage.setItem("fruitiantor_key", k); err(""); react("pop");
  say("Excellent. Now choose what you are thinking of, and I shall find it."); view("menu");
};
$("key").addEventListener("keydown", e => { if (e.key==="Enter") $("saveKey").click(); });

// ----- game -----
function start(cat){ fresh(); state.cat=cat; $("catName").textContent=cat; err(""); view("game"); next(); }
document.querySelectorAll("#answers button").forEach(b => b.onclick = () => {
  if (state.busy) return; state.history.push({ q:$("say").textContent, a:b.dataset.a });
  react(b.dataset.a==="No"?"shake":"pop"); next();
});
$("back").onclick = () => { if (!state.busy && state.history.length) { state.history.pop(); next(); } };
$("restart").onclick = () => { fresh(); err(""); react("pop"); say("Think of something new, pirate."); $("meter").hidden=true; $("meterFill").style.width="0"; view("menu"); };
$("right").onclick = () => { react("pop"); say("Ha! Fruitiantor is never wrong. Play again?"); $("right").hidden=$("wrong").hidden=true; };
$("wrong").onclick = () => { state.rejected.push($("guessName").textContent); $("right").hidden=$("wrong").hidden=false;
  if (state.history.length >= MAX_Q || state.rejected.length >= 3) return giveUp();
  view("game"); next(); };

function giveUp(){ react("shake"); say("Impossible… you beat me! What was it?"); view("giveup"); $("truthWrap").hidden=true; }
$("showTruth").onclick = async () => { const n=$("truth").value.trim(); if(!n) return;
  $("truthWrap").hidden=false; $("truthSrc").textContent="Searching…"; const i=await findImage(n);
  $("truthImg").src=i.url; $("truthSrc").textContent=i.src; say(`${n}! I will remember that next time.`); };

function buildPrompt(forceGuess, nudge){
  const h = state.history.map((x,i)=>`${i+1}. ${x.q} -> ${x.a}`).join("\n") || "(no answers yet)";
  return `Category: ${state.cat}\nAnswers so far:\n${h}\nRejected wrong guesses: ${state.rejected.join(", ")||"none"}\nQuestions asked: ${state.history.length}\n`
   + (forceGuess ? "You have asked enough: now make your single best guess (type guess).\n" : "")
   + (nudge ? "You tried to guess too early or with low confidence. Ask a new question instead (type question).\n" : "")
   + "Respond with JSON only.";
}

async function next(nudge=false){
  think(true); err("");
  const n = state.history.length; $("qNum").textContent = `Question ${n+1}`;
  $("say").textContent = "Hmm… let me think…";
  const force = n >= MAX_Q;
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${localStorage.getItem("fruitiantor_key")}`, {
      method:"POST", headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ systemInstruction:{ parts:[{ text:SYSTEM }] }, contents:[{ role:"user", parts:[{ text:buildPrompt(force,nudge) }] }], tools:[{ google_search:{} }] })
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error?.message || "Gemini request failed");
    const text = (data.candidates?.[0]?.content?.parts||[]).map(p=>p.text||"").join("");
    const m = text.match(/\{[\s\S]*\}/); if (!m) throw new Error("Bad reply from Gemini, press Undo and try again.");
    const out = JSON.parse(m[0]);
    if (out.confidence!=null) $("meterFill").style.width = Math.min(100,out.confidence)+"%";
    if (out.type==="guess") {
      const early = n < MIN_Q || (out.confidence||0) < MIN_CONF || state.rejected.includes(out.name);
      if (early && !force && state.retry < 2) { state.retry++; return next(true); }
    }
    state.retry = 0; think(false);
    if (out.type==="guess") return guess(out);
    react("pop"); say(out.text);
  } catch(e) { think(false); say("Something went wrong…"); err(e.message); }
}

// ----- images -----
const tryImg = url => new Promise(res => { const i=new Image(); i.onload=()=>res(url); i.onerror=()=>res(null); i.src=url; });
async function wikiImage(name){
  const q = p => fetch(`${WIKI}?${p}&format=json&origin=*`).then(r=>r.json());
  let d = await q(`action=query&titles=${encodeURIComponent(name)}&redirects=1&prop=pageimages&pithumbsize=500`);
  let p = Object.values(d.query?.pages||{}); if (p[0]?.thumbnail) return p[0].thumbnail.source;
  d = await q(`action=query&generator=search&gsrsearch=${encodeURIComponent(name)}&gsrlimit=3&prop=pageimages&pithumbsize=500`);
  p = Object.values(d.query?.pages||[]).sort((a,b)=>a.index-b.index); return p.find(x=>x.thumbnail)?.thumbnail.source || null;
}
async function findImage(name){
  const forms=[...new Set([name,name.replace(/\s+/g,"_"),name.replace(/\s+/g,""),name.replace(/\s+/g,"-")])];
  for (const f of forms) for (const ext of ["jpg","png"]) { const u=await tryImg(IMG_BASE+encodeURIComponent(f)+"."+ext); if(u) return {url:u,src:"Fruitiantor library"}; }
  try { const w=await wikiImage(name); if(w) return {url:w,src:"Found online"}; } catch {}
  return { url:IMG_BASE+"Spirit.jpg", src:"No image found" };
}
async function guess(g){
  react("pop"); say(`I sense it… is it ${g.name}?`); view("result");
  $("guessName").textContent=g.name; $("guessImg").removeAttribute("src"); $("imgSrc").textContent="Searching…";
  const i=await findImage(g.name); $("guessImg").src=i.url; $("guessImg").alt=g.name; $("imgSrc").textContent=i.src;
}
