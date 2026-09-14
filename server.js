
const express=require("express");
const http=require("http");
const crypto=require("crypto");
const QRCode=require("qrcode");
const {Server}=require("socket.io");
const path=require("path");
const {spawn}=require("child_process");
const fs=require("fs");
const os=require("os");

const app=express();
const server=http.createServer(app);
const io=new Server(server,{pingTimeout:20000,pingInterval:25000});

// Dynamic player-name TTS using local Piper: no OpenAI API and no paid TTS service.
// Railway/Docker installs Piper and the Spanish-Mexico voice at build time.
const nameAudioCache=new Map();
const nameAudioInFlight=new Map();
const PIPER_BIN=process.env.PIPER_BIN||"/opt/piper/piper/piper";
const PIPER_MODEL=process.env.PIPER_MODEL||"/opt/piper/voice/es_MX-ald-x_low.onnx";

function safePlayerName(value){
  return String(value||"")
    .replace(/[\u0000-\u001F\u007F]/g," ")
    .replace(/\s+/g," ")
    .trim()
    .slice(0,40);
}
function nameCacheKey(name){return safePlayerName(name).toLocaleLowerCase("es");}

function runPiper(text,outputFile){
  return new Promise((resolve,reject)=>{
    const child=spawn(PIPER_BIN,["--model",PIPER_MODEL,"--output_file",outputFile],{
      stdio:["pipe","ignore","pipe"]
    });
    let err="";
    const timer=setTimeout(()=>{child.kill("SIGKILL");reject(new Error("Piper timeout"));},15000);
    child.stderr.on("data",d=>{err+=d.toString()});
    child.on("error",e=>{clearTimeout(timer);reject(e)});
    child.on("close",code=>{
      clearTimeout(timer);
      if(code===0)resolve();else reject(new Error(`Piper terminó con código ${code}: ${err.slice(0,300)}`));
    });
    child.stdin.end(text+"\n");
  });
}
async function generateNameAudio(name){
  const clean=safePlayerName(name),key=nameCacheKey(clean);
  if(!clean)throw new Error("Nombre vacío");
  if(nameAudioCache.has(key))return nameAudioCache.get(key);
  if(nameAudioInFlight.has(key))return nameAudioInFlight.get(key);
  const task=(async()=>{
    const tmp=path.join(os.tmpdir(),`pokeno-name-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.wav`);
    try{
      await runPiper(clean,tmp);
      const buffer=await fs.promises.readFile(tmp);
      // Keep memory bounded on the Free tier.
      if(nameAudioCache.size>=100)nameAudioCache.delete(nameAudioCache.keys().next().value);
      nameAudioCache.set(key,buffer);
      return buffer;
    }finally{
      fs.promises.unlink(tmp).catch(()=>{});
    }
  })().finally(()=>nameAudioInFlight.delete(key));
  nameAudioInFlight.set(key,task);
  return task;
}
function prewarmNameAudio(name){
  generateNameAudio(name).catch(err=>console.warn("No se pudo precargar Piper para nombre:",err.message));
}
app.get("/api/name-audio",async(req,res)=>{
  const name=safePlayerName(req.query.name);
  if(!name)return res.status(400).json({error:"Nombre requerido"});
  try{
    const audio=await generateNameAudio(name);
    res.set({"Content-Type":"audio/wav","Cache-Control":"public, max-age=86400","X-Pokeno-TTS":"piper-local"});
    res.send(audio);
  }catch(err){
    console.warn("Piper TTS falló:",err.message);
    res.status(503).json({error:"TTS local no disponible"});
  }
});
app.get("/api/tts-status",(_,res)=>{
  res.json({
    configured:fs.existsSync(PIPER_BIN)&&fs.existsSync(PIPER_MODEL),
    engine:"Piper local",
    voice:"es_MX-ald-x_low",
    cachedNames:nameAudioCache.size
  });
});

app.use(express.static(path.join(__dirname,"public")));
app.get("/health",(_,res)=>res.status(200).send("ok"));
const PORT=process.env.PORT||3000;

const ranks=["A","2","3","4","5","6","7","8","9","10","J","Q","K"];
const suits=[{s:"♠",red:false},{s:"♥",red:true},{s:"♦",red:true},{s:"♣",red:false}];
const deck=suits.flatMap(su=>ranks.map(rank=>({id:`${rank}${su.s}`,rank,suit:su.s,red:su.red})));
const FIXED_BOARDS=[[{"id":"3♥","rank":"3","suit":"♥","red":true},{"id":"9♥","rank":"9","suit":"♥","red":true},{"id":"7♣","rank":"7","suit":"♣","red":false},{"id":"A♥","rank":"A","suit":"♥","red":true},{"id":"3♠","rank":"3","suit":"♠","red":false},{"id":"3♣","rank":"3","suit":"♣","red":false},{"id":"5♣","rank":"5","suit":"♣","red":false},{"id":"10♣","rank":"10","suit":"♣","red":false},{"id":"8♥","rank":"8","suit":"♥","red":true},{"id":"10♥","rank":"10","suit":"♥","red":true},{"id":"6♥","rank":"6","suit":"♥","red":true},{"id":"7♦","rank":"7","suit":"♦","red":true},{"id":"Q♠","rank":"Q","suit":"♠","red":false},{"id":"J♣","rank":"J","suit":"♣","red":false},{"id":"J♦","rank":"J","suit":"♦","red":true},{"id":"6♠","rank":"6","suit":"♠","red":false},{"id":"5♠","rank":"5","suit":"♠","red":false},{"id":"Q♦","rank":"Q","suit":"♦","red":true},{"id":"8♦","rank":"8","suit":"♦","red":true},{"id":"10♦","rank":"10","suit":"♦","red":true},{"id":"6♦","rank":"6","suit":"♦","red":true},{"id":"K♥","rank":"K","suit":"♥","red":true},{"id":"A♦","rank":"A","suit":"♦","red":true},{"id":"4♣","rank":"4","suit":"♣","red":false},{"id":"J♠","rank":"J","suit":"♠","red":false}],[{"id":"K♠","rank":"K","suit":"♠","red":false},{"id":"10♣","rank":"10","suit":"♣","red":false},{"id":"9♦","rank":"9","suit":"♦","red":true},{"id":"7♠","rank":"7","suit":"♠","red":false},{"id":"A♥","rank":"A","suit":"♥","red":true},{"id":"8♥","rank":"8","suit":"♥","red":true},{"id":"2♠","rank":"2","suit":"♠","red":false},{"id":"8♣","rank":"8","suit":"♣","red":false},{"id":"4♥","rank":"4","suit":"♥","red":true},{"id":"6♦","rank":"6","suit":"♦","red":true},{"id":"5♦","rank":"5","suit":"♦","red":true},{"id":"K♦","rank":"K","suit":"♦","red":true},{"id":"9♣","rank":"9","suit":"♣","red":false},{"id":"J♣","rank":"J","suit":"♣","red":false},{"id":"3♣","rank":"3","suit":"♣","red":false},{"id":"Q♠","rank":"Q","suit":"♠","red":false},{"id":"3♠","rank":"3","suit":"♠","red":false},{"id":"Q♥","rank":"Q","suit":"♥","red":true},{"id":"4♠","rank":"4","suit":"♠","red":false},{"id":"A♣","rank":"A","suit":"♣","red":false},{"id":"7♦","rank":"7","suit":"♦","red":true},{"id":"3♦","rank":"3","suit":"♦","red":true},{"id":"A♦","rank":"A","suit":"♦","red":true},{"id":"2♣","rank":"2","suit":"♣","red":false},{"id":"5♣","rank":"5","suit":"♣","red":false}],[{"id":"K♣","rank":"K","suit":"♣","red":false},{"id":"8♣","rank":"8","suit":"♣","red":false},{"id":"A♣","rank":"A","suit":"♣","red":false},{"id":"3♦","rank":"3","suit":"♦","red":true},{"id":"2♠","rank":"2","suit":"♠","red":false},{"id":"9♦","rank":"9","suit":"♦","red":true},{"id":"10♣","rank":"10","suit":"♣","red":false},{"id":"J♦","rank":"J","suit":"♦","red":true},{"id":"8♥","rank":"8","suit":"♥","red":true},{"id":"7♥","rank":"7","suit":"♥","red":true},{"id":"8♦","rank":"8","suit":"♦","red":true},{"id":"3♠","rank":"3","suit":"♠","red":false},{"id":"4♠","rank":"4","suit":"♠","red":false},{"id":"2♣","rank":"2","suit":"♣","red":false},{"id":"6♣","rank":"6","suit":"♣","red":false},{"id":"9♠","rank":"9","suit":"♠","red":false},{"id":"7♣","rank":"7","suit":"♣","red":false},{"id":"J♥","rank":"J","suit":"♥","red":true},{"id":"Q♥","rank":"Q","suit":"♥","red":true},{"id":"4♣","rank":"4","suit":"♣","red":false},{"id":"5♣","rank":"5","suit":"♣","red":false},{"id":"Q♠","rank":"Q","suit":"♠","red":false},{"id":"K♥","rank":"K","suit":"♥","red":true},{"id":"6♠","rank":"6","suit":"♠","red":false},{"id":"4♥","rank":"4","suit":"♥","red":true}],[{"id":"J♦","rank":"J","suit":"♦","red":true},{"id":"A♦","rank":"A","suit":"♦","red":true},{"id":"J♣","rank":"J","suit":"♣","red":false},{"id":"3♥","rank":"3","suit":"♥","red":true},{"id":"A♠","rank":"A","suit":"♠","red":false},{"id":"5♥","rank":"5","suit":"♥","red":true},{"id":"3♣","rank":"3","suit":"♣","red":false},{"id":"2♣","rank":"2","suit":"♣","red":false},{"id":"8♥","rank":"8","suit":"♥","red":true},{"id":"K♥","rank":"K","suit":"♥","red":true},{"id":"8♣","rank":"8","suit":"♣","red":false},{"id":"6♣","rank":"6","suit":"♣","red":false},{"id":"10♠","rank":"10","suit":"♠","red":false},{"id":"6♠","rank":"6","suit":"♠","red":false},{"id":"Q♣","rank":"Q","suit":"♣","red":false},{"id":"5♠","rank":"5","suit":"♠","red":false},{"id":"J♠","rank":"J","suit":"♠","red":false},{"id":"7♥","rank":"7","suit":"♥","red":true},{"id":"2♦","rank":"2","suit":"♦","red":true},{"id":"9♣","rank":"9","suit":"♣","red":false},{"id":"4♠","rank":"4","suit":"♠","red":false},{"id":"10♦","rank":"10","suit":"♦","red":true},{"id":"7♣","rank":"7","suit":"♣","red":false},{"id":"9♠","rank":"9","suit":"♠","red":false},{"id":"Q♦","rank":"Q","suit":"♦","red":true}],[{"id":"4♦","rank":"4","suit":"♦","red":true},{"id":"7♠","rank":"7","suit":"♠","red":false},{"id":"2♣","rank":"2","suit":"♣","red":false},{"id":"9♦","rank":"9","suit":"♦","red":true},{"id":"2♥","rank":"2","suit":"♥","red":true},{"id":"6♦","rank":"6","suit":"♦","red":true},{"id":"8♥","rank":"8","suit":"♥","red":true},{"id":"5♥","rank":"5","suit":"♥","red":true},{"id":"10♣","rank":"10","suit":"♣","red":false},{"id":"7♥","rank":"7","suit":"♥","red":true},{"id":"4♥","rank":"4","suit":"♥","red":true},{"id":"A♥","rank":"A","suit":"♥","red":true},{"id":"5♦","rank":"5","suit":"♦","red":true},{"id":"8♣","rank":"8","suit":"♣","red":false},{"id":"8♦","rank":"8","suit":"♦","red":true},{"id":"2♠","rank":"2","suit":"♠","red":false},{"id":"K♥","rank":"K","suit":"♥","red":true},{"id":"A♠","rank":"A","suit":"♠","red":false},{"id":"Q♣","rank":"Q","suit":"♣","red":false},{"id":"2♦","rank":"2","suit":"♦","red":true},{"id":"Q♦","rank":"Q","suit":"♦","red":true},{"id":"3♥","rank":"3","suit":"♥","red":true},{"id":"J♥","rank":"J","suit":"♥","red":true},{"id":"J♦","rank":"J","suit":"♦","red":true},{"id":"K♣","rank":"K","suit":"♣","red":false}],[{"id":"5♦","rank":"5","suit":"♦","red":true},{"id":"5♠","rank":"5","suit":"♠","red":false},{"id":"J♥","rank":"J","suit":"♥","red":true},{"id":"8♠","rank":"8","suit":"♠","red":false},{"id":"Q♣","rank":"Q","suit":"♣","red":false},{"id":"7♠","rank":"7","suit":"♠","red":false},{"id":"K♦","rank":"K","suit":"♦","red":true},{"id":"10♠","rank":"10","suit":"♠","red":false},{"id":"2♠","rank":"2","suit":"♠","red":false},{"id":"Q♦","rank":"Q","suit":"♦","red":true},{"id":"5♣","rank":"5","suit":"♣","red":false},{"id":"9♥","rank":"9","suit":"♥","red":true},{"id":"J♠","rank":"J","suit":"♠","red":false},{"id":"2♦","rank":"2","suit":"♦","red":true},{"id":"3♦","rank":"3","suit":"♦","red":true},{"id":"A♦","rank":"A","suit":"♦","red":true},{"id":"J♣","rank":"J","suit":"♣","red":false},{"id":"6♣","rank":"6","suit":"♣","red":false},{"id":"4♠","rank":"4","suit":"♠","red":false},{"id":"9♣","rank":"9","suit":"♣","red":false},{"id":"9♠","rank":"9","suit":"♠","red":false},{"id":"7♥","rank":"7","suit":"♥","red":true},{"id":"4♦","rank":"4","suit":"♦","red":true},{"id":"6♥","rank":"6","suit":"♥","red":true},{"id":"10♥","rank":"10","suit":"♥","red":true}],[{"id":"7♦","rank":"7","suit":"♦","red":true},{"id":"8♦","rank":"8","suit":"♦","red":true},{"id":"10♦","rank":"10","suit":"♦","red":true},{"id":"4♣","rank":"4","suit":"♣","red":false},{"id":"5♣","rank":"5","suit":"♣","red":false},{"id":"3♠","rank":"3","suit":"♠","red":false},{"id":"2♥","rank":"2","suit":"♥","red":true},{"id":"9♥","rank":"9","suit":"♥","red":true},{"id":"5♠","rank":"5","suit":"♠","red":false},{"id":"K♣","rank":"K","suit":"♣","red":false},{"id":"K♦","rank":"K","suit":"♦","red":true},{"id":"A♠","rank":"A","suit":"♠","red":false},{"id":"J♦","rank":"J","suit":"♦","red":true},{"id":"6♠","rank":"6","suit":"♠","red":false},{"id":"3♥","rank":"3","suit":"♥","red":true},{"id":"9♠","rank":"9","suit":"♠","red":false},{"id":"6♣","rank":"6","suit":"♣","red":false},{"id":"6♥","rank":"6","suit":"♥","red":true},{"id":"Q♦","rank":"Q","suit":"♦","red":true},{"id":"8♥","rank":"8","suit":"♥","red":true},{"id":"A♦","rank":"A","suit":"♦","red":true},{"id":"10♠","rank":"10","suit":"♠","red":false},{"id":"7♣","rank":"7","suit":"♣","red":false},{"id":"2♣","rank":"2","suit":"♣","red":false},{"id":"Q♣","rank":"Q","suit":"♣","red":false}],[{"id":"A♠","rank":"A","suit":"♠","red":false},{"id":"5♠","rank":"5","suit":"♠","red":false},{"id":"2♦","rank":"2","suit":"♦","red":true},{"id":"3♦","rank":"3","suit":"♦","red":true},{"id":"7♦","rank":"7","suit":"♦","red":true},{"id":"2♠","rank":"2","suit":"♠","red":false},{"id":"9♣","rank":"9","suit":"♣","red":false},{"id":"8♥","rank":"8","suit":"♥","red":true},{"id":"10♣","rank":"10","suit":"♣","red":false},{"id":"2♥","rank":"2","suit":"♥","red":true},{"id":"6♣","rank":"6","suit":"♣","red":false},{"id":"K♦","rank":"K","suit":"♦","red":true},{"id":"9♠","rank":"9","suit":"♠","red":false},{"id":"5♦","rank":"5","suit":"♦","red":true},{"id":"Q♠","rank":"Q","suit":"♠","red":false},{"id":"8♣","rank":"8","suit":"♣","red":false},{"id":"5♥","rank":"5","suit":"♥","red":true},{"id":"Q♦","rank":"Q","suit":"♦","red":true},{"id":"4♦","rank":"4","suit":"♦","red":true},{"id":"A♦","rank":"A","suit":"♦","red":true},{"id":"K♣","rank":"K","suit":"♣","red":false},{"id":"K♠","rank":"K","suit":"♠","red":false},{"id":"J♠","rank":"J","suit":"♠","red":false},{"id":"10♥","rank":"10","suit":"♥","red":true},{"id":"7♣","rank":"7","suit":"♣","red":false}],[{"id":"7♥","rank":"7","suit":"♥","red":true},{"id":"9♣","rank":"9","suit":"♣","red":false},{"id":"K♣","rank":"K","suit":"♣","red":false},{"id":"4♦","rank":"4","suit":"♦","red":true},{"id":"4♥","rank":"4","suit":"♥","red":true},{"id":"6♠","rank":"6","suit":"♠","red":false},{"id":"3♦","rank":"3","suit":"♦","red":true},{"id":"Q♣","rank":"Q","suit":"♣","red":false},{"id":"2♠","rank":"2","suit":"♠","red":false},{"id":"2♥","rank":"2","suit":"♥","red":true},{"id":"6♣","rank":"6","suit":"♣","red":false},{"id":"5♣","rank":"5","suit":"♣","red":false},{"id":"Q♥","rank":"Q","suit":"♥","red":true},{"id":"3♣","rank":"3","suit":"♣","red":false},{"id":"K♥","rank":"K","suit":"♥","red":true},{"id":"10♣","rank":"10","suit":"♣","red":false},{"id":"A♥","rank":"A","suit":"♥","red":true},{"id":"A♠","rank":"A","suit":"♠","red":false},{"id":"3♠","rank":"3","suit":"♠","red":false},{"id":"J♥","rank":"J","suit":"♥","red":true},{"id":"6♥","rank":"6","suit":"♥","red":true},{"id":"7♣","rank":"7","suit":"♣","red":false},{"id":"8♠","rank":"8","suit":"♠","red":false},{"id":"K♠","rank":"K","suit":"♠","red":false},{"id":"9♦","rank":"9","suit":"♦","red":true}],[{"id":"10♣","rank":"10","suit":"♣","red":false},{"id":"3♣","rank":"3","suit":"♣","red":false},{"id":"K♦","rank":"K","suit":"♦","red":true},{"id":"9♥","rank":"9","suit":"♥","red":true},{"id":"8♠","rank":"8","suit":"♠","red":false},{"id":"7♣","rank":"7","suit":"♣","red":false},{"id":"8♣","rank":"8","suit":"♣","red":false},{"id":"8♦","rank":"8","suit":"♦","red":true},{"id":"5♣","rank":"5","suit":"♣","red":false},{"id":"A♣","rank":"A","suit":"♣","red":false},{"id":"A♦","rank":"A","suit":"♦","red":true},{"id":"K♣","rank":"K","suit":"♣","red":false},{"id":"3♠","rank":"3","suit":"♠","red":false},{"id":"10♦","rank":"10","suit":"♦","red":true},{"id":"5♦","rank":"5","suit":"♦","red":true},{"id":"5♠","rank":"5","suit":"♠","red":false},{"id":"7♦","rank":"7","suit":"♦","red":true},{"id":"4♣","rank":"4","suit":"♣","red":false},{"id":"6♦","rank":"6","suit":"♦","red":true},{"id":"10♥","rank":"10","suit":"♥","red":true},{"id":"Q♥","rank":"Q","suit":"♥","red":true},{"id":"A♥","rank":"A","suit":"♥","red":true},{"id":"J♦","rank":"J","suit":"♦","red":true},{"id":"3♦","rank":"3","suit":"♦","red":true},{"id":"Q♠","rank":"Q","suit":"♠","red":false}],[{"id":"7♠","rank":"7","suit":"♠","red":false},{"id":"Q♥","rank":"Q","suit":"♥","red":true},{"id":"9♣","rank":"9","suit":"♣","red":false},{"id":"2♦","rank":"2","suit":"♦","red":true},{"id":"J♥","rank":"J","suit":"♥","red":true},{"id":"4♣","rank":"4","suit":"♣","red":false},{"id":"A♣","rank":"A","suit":"♣","red":false},{"id":"4♠","rank":"4","suit":"♠","red":false},{"id":"9♠","rank":"9","suit":"♠","red":false},{"id":"6♠","rank":"6","suit":"♠","red":false},{"id":"2♣","rank":"2","suit":"♣","red":false},{"id":"10♦","rank":"10","suit":"♦","red":true},{"id":"J♣","rank":"J","suit":"♣","red":false},{"id":"A♠","rank":"A","suit":"♠","red":false},{"id":"K♦","rank":"K","suit":"♦","red":true},{"id":"Q♣","rank":"Q","suit":"♣","red":false},{"id":"3♦","rank":"3","suit":"♦","red":true},{"id":"5♥","rank":"5","suit":"♥","red":true},{"id":"8♠","rank":"8","suit":"♠","red":false},{"id":"10♣","rank":"10","suit":"♣","red":false},{"id":"7♦","rank":"7","suit":"♦","red":true},{"id":"4♦","rank":"4","suit":"♦","red":true},{"id":"6♣","rank":"6","suit":"♣","red":false},{"id":"J♦","rank":"J","suit":"♦","red":true},{"id":"5♠","rank":"5","suit":"♠","red":false}],[{"id":"6♠","rank":"6","suit":"♠","red":false},{"id":"7♦","rank":"7","suit":"♦","red":true},{"id":"6♥","rank":"6","suit":"♥","red":true},{"id":"9♠","rank":"9","suit":"♠","red":false},{"id":"A♣","rank":"A","suit":"♣","red":false},{"id":"5♥","rank":"5","suit":"♥","red":true},{"id":"9♥","rank":"9","suit":"♥","red":true},{"id":"Q♦","rank":"Q","suit":"♦","red":true},{"id":"10♦","rank":"10","suit":"♦","red":true},{"id":"7♠","rank":"7","suit":"♠","red":false},{"id":"6♣","rank":"6","suit":"♣","red":false},{"id":"2♥","rank":"2","suit":"♥","red":true},{"id":"J♣","rank":"J","suit":"♣","red":false},{"id":"4♠","rank":"4","suit":"♠","red":false},{"id":"3♦","rank":"3","suit":"♦","red":true},{"id":"K♠","rank":"K","suit":"♠","red":false},{"id":"K♥","rank":"K","suit":"♥","red":true},{"id":"A♦","rank":"A","suit":"♦","red":true},{"id":"9♦","rank":"9","suit":"♦","red":true},{"id":"Q♠","rank":"Q","suit":"♠","red":false},{"id":"10♣","rank":"10","suit":"♣","red":false},{"id":"3♠","rank":"3","suit":"♠","red":false},{"id":"3♣","rank":"3","suit":"♣","red":false},{"id":"4♥","rank":"4","suit":"♥","red":true},{"id":"8♠","rank":"8","suit":"♠","red":false}],[{"id":"A♥","rank":"A","suit":"♥","red":true},{"id":"8♣","rank":"8","suit":"♣","red":false},{"id":"8♠","rank":"8","suit":"♠","red":false},{"id":"K♦","rank":"K","suit":"♦","red":true},{"id":"5♣","rank":"5","suit":"♣","red":false},{"id":"2♠","rank":"2","suit":"♠","red":false},{"id":"3♠","rank":"3","suit":"♠","red":false},{"id":"7♣","rank":"7","suit":"♣","red":false},{"id":"9♦","rank":"9","suit":"♦","red":true},{"id":"Q♥","rank":"Q","suit":"♥","red":true},{"id":"3♥","rank":"3","suit":"♥","red":true},{"id":"9♣","rank":"9","suit":"♣","red":false},{"id":"4♠","rank":"4","suit":"♠","red":false},{"id":"A♠","rank":"A","suit":"♠","red":false},{"id":"J♥","rank":"J","suit":"♥","red":true},{"id":"7♥","rank":"7","suit":"♥","red":true},{"id":"Q♠","rank":"Q","suit":"♠","red":false},{"id":"K♣","rank":"K","suit":"♣","red":false},{"id":"4♥","rank":"4","suit":"♥","red":true},{"id":"5♦","rank":"5","suit":"♦","red":true},{"id":"10♥","rank":"10","suit":"♥","red":true},{"id":"6♦","rank":"6","suit":"♦","red":true},{"id":"4♣","rank":"4","suit":"♣","red":false},{"id":"10♠","rank":"10","suit":"♠","red":false},{"id":"K♠","rank":"K","suit":"♠","red":false}],[{"id":"3♣","rank":"3","suit":"♣","red":false},{"id":"6♣","rank":"6","suit":"♣","red":false},{"id":"Q♠","rank":"Q","suit":"♠","red":false},{"id":"8♠","rank":"8","suit":"♠","red":false},{"id":"5♥","rank":"5","suit":"♥","red":true},{"id":"K♣","rank":"K","suit":"♣","red":false},{"id":"7♥","rank":"7","suit":"♥","red":true},{"id":"K♥","rank":"K","suit":"♥","red":true},{"id":"K♠","rank":"K","suit":"♠","red":false},{"id":"10♠","rank":"10","suit":"♠","red":false},{"id":"4♠","rank":"4","suit":"♠","red":false},{"id":"9♠","rank":"9","suit":"♠","red":false},{"id":"8♣","rank":"8","suit":"♣","red":false},{"id":"9♥","rank":"9","suit":"♥","red":true},{"id":"Q♦","rank":"Q","suit":"♦","red":true},{"id":"2♦","rank":"2","suit":"♦","red":true},{"id":"A♠","rank":"A","suit":"♠","red":false},{"id":"6♠","rank":"6","suit":"♠","red":false},{"id":"6♥","rank":"6","suit":"♥","red":true},{"id":"4♥","rank":"4","suit":"♥","red":true},{"id":"10♥","rank":"10","suit":"♥","red":true},{"id":"7♠","rank":"7","suit":"♠","red":false},{"id":"10♦","rank":"10","suit":"♦","red":true},{"id":"3♥","rank":"3","suit":"♥","red":true},{"id":"J♥","rank":"J","suit":"♥","red":true}],[{"id":"7♣","rank":"7","suit":"♣","red":false},{"id":"7♥","rank":"7","suit":"♥","red":true},{"id":"3♦","rank":"3","suit":"♦","red":true},{"id":"4♥","rank":"4","suit":"♥","red":true},{"id":"A♦","rank":"A","suit":"♦","red":true},{"id":"9♦","rank":"9","suit":"♦","red":true},{"id":"8♦","rank":"8","suit":"♦","red":true},{"id":"8♥","rank":"8","suit":"♥","red":true},{"id":"5♥","rank":"5","suit":"♥","red":true},{"id":"10♥","rank":"10","suit":"♥","red":true},{"id":"4♣","rank":"4","suit":"♣","red":false},{"id":"A♥","rank":"A","suit":"♥","red":true},{"id":"4♦","rank":"4","suit":"♦","red":true},{"id":"Q♥","rank":"Q","suit":"♥","red":true},{"id":"J♠","rank":"J","suit":"♠","red":false},{"id":"10♣","rank":"10","suit":"♣","red":false},{"id":"6♦","rank":"6","suit":"♦","red":true},{"id":"K♥","rank":"K","suit":"♥","red":true},{"id":"2♦","rank":"2","suit":"♦","red":true},{"id":"5♦","rank":"5","suit":"♦","red":true},{"id":"10♦","rank":"10","suit":"♦","red":true},{"id":"K♠","rank":"K","suit":"♠","red":false},{"id":"J♣","rank":"J","suit":"♣","red":false},{"id":"Q♣","rank":"Q","suit":"♣","red":false},{"id":"2♥","rank":"2","suit":"♥","red":true}],[{"id":"K♦","rank":"K","suit":"♦","red":true},{"id":"5♠","rank":"5","suit":"♠","red":false},{"id":"4♦","rank":"4","suit":"♦","red":true},{"id":"Q♠","rank":"Q","suit":"♠","red":false},{"id":"A♣","rank":"A","suit":"♣","red":false},{"id":"10♠","rank":"10","suit":"♠","red":false},{"id":"2♠","rank":"2","suit":"♠","red":false},{"id":"2♣","rank":"2","suit":"♣","red":false},{"id":"9♥","rank":"9","suit":"♥","red":true},{"id":"7♦","rank":"7","suit":"♦","red":true},{"id":"8♠","rank":"8","suit":"♠","red":false},{"id":"5♥","rank":"5","suit":"♥","red":true},{"id":"6♦","rank":"6","suit":"♦","red":true},{"id":"J♠","rank":"J","suit":"♠","red":false},{"id":"J♣","rank":"J","suit":"♣","red":false},{"id":"7♠","rank":"7","suit":"♠","red":false},{"id":"8♦","rank":"8","suit":"♦","red":true},{"id":"K♠","rank":"K","suit":"♠","red":false},{"id":"6♠","rank":"6","suit":"♠","red":false},{"id":"A♥","rank":"A","suit":"♥","red":true},{"id":"3♥","rank":"3","suit":"♥","red":true},{"id":"Q♦","rank":"Q","suit":"♦","red":true},{"id":"4♣","rank":"4","suit":"♣","red":false},{"id":"3♣","rank":"3","suit":"♣","red":false},{"id":"2♦","rank":"2","suit":"♦","red":true}],[{"id":"6♦","rank":"6","suit":"♦","red":true},{"id":"10♠","rank":"10","suit":"♠","red":false},{"id":"7♠","rank":"7","suit":"♠","red":false},{"id":"8♦","rank":"8","suit":"♦","red":true},{"id":"K♣","rank":"K","suit":"♣","red":false},{"id":"4♦","rank":"4","suit":"♦","red":true},{"id":"7♥","rank":"7","suit":"♥","red":true},{"id":"2♣","rank":"2","suit":"♣","red":false},{"id":"Q♥","rank":"Q","suit":"♥","red":true},{"id":"5♠","rank":"5","suit":"♠","red":false},{"id":"Q♣","rank":"Q","suit":"♣","red":false},{"id":"J♠","rank":"J","suit":"♠","red":false},{"id":"2♥","rank":"2","suit":"♥","red":true},{"id":"10♦","rank":"10","suit":"♦","red":true},{"id":"A♥","rank":"A","suit":"♥","red":true},{"id":"5♣","rank":"5","suit":"♣","red":false},{"id":"A♣","rank":"A","suit":"♣","red":false},{"id":"K♦","rank":"K","suit":"♦","red":true},{"id":"2♦","rank":"2","suit":"♦","red":true},{"id":"9♦","rank":"9","suit":"♦","red":true},{"id":"3♥","rank":"3","suit":"♥","red":true},{"id":"8♥","rank":"8","suit":"♥","red":true},{"id":"J♦","rank":"J","suit":"♦","red":true},{"id":"6♥","rank":"6","suit":"♥","red":true},{"id":"5♦","rank":"5","suit":"♦","red":true}],[{"id":"4♣","rank":"4","suit":"♣","red":false},{"id":"7♦","rank":"7","suit":"♦","red":true},{"id":"9♣","rank":"9","suit":"♣","red":false},{"id":"3♠","rank":"3","suit":"♠","red":false},{"id":"Q♣","rank":"Q","suit":"♣","red":false},{"id":"K♣","rank":"K","suit":"♣","red":false},{"id":"6♠","rank":"6","suit":"♠","red":false},{"id":"K♦","rank":"K","suit":"♦","red":true},{"id":"J♠","rank":"J","suit":"♠","red":false},{"id":"2♠","rank":"2","suit":"♠","red":false},{"id":"10♠","rank":"10","suit":"♠","red":false},{"id":"6♣","rank":"6","suit":"♣","red":false},{"id":"8♠","rank":"8","suit":"♠","red":false},{"id":"5♣","rank":"5","suit":"♣","red":false},{"id":"3♣","rank":"3","suit":"♣","red":false},{"id":"3♦","rank":"3","suit":"♦","red":true},{"id":"A♠","rank":"A","suit":"♠","red":false},{"id":"10♥","rank":"10","suit":"♥","red":true},{"id":"A♥","rank":"A","suit":"♥","red":true},{"id":"4♥","rank":"4","suit":"♥","red":true},{"id":"J♦","rank":"J","suit":"♦","red":true},{"id":"Q♥","rank":"Q","suit":"♥","red":true},{"id":"9♥","rank":"9","suit":"♥","red":true},{"id":"7♠","rank":"7","suit":"♠","red":false},{"id":"8♣","rank":"8","suit":"♣","red":false}],[{"id":"3♥","rank":"3","suit":"♥","red":true},{"id":"Q♥","rank":"Q","suit":"♥","red":true},{"id":"5♦","rank":"5","suit":"♦","red":true},{"id":"7♣","rank":"7","suit":"♣","red":false},{"id":"8♥","rank":"8","suit":"♥","red":true},{"id":"2♥","rank":"2","suit":"♥","red":true},{"id":"J♣","rank":"J","suit":"♣","red":false},{"id":"4♥","rank":"4","suit":"♥","red":true},{"id":"9♥","rank":"9","suit":"♥","red":true},{"id":"2♦","rank":"2","suit":"♦","red":true},{"id":"2♠","rank":"2","suit":"♠","red":false},{"id":"J♠","rank":"J","suit":"♠","red":false},{"id":"K♥","rank":"K","suit":"♥","red":true},{"id":"6♥","rank":"6","suit":"♥","red":true},{"id":"4♠","rank":"4","suit":"♠","red":false},{"id":"6♦","rank":"6","suit":"♦","red":true},{"id":"8♦","rank":"8","suit":"♦","red":true},{"id":"J♥","rank":"J","suit":"♥","red":true},{"id":"7♥","rank":"7","suit":"♥","red":true},{"id":"2♣","rank":"2","suit":"♣","red":false},{"id":"A♣","rank":"A","suit":"♣","red":false},{"id":"5♥","rank":"5","suit":"♥","red":true},{"id":"10♠","rank":"10","suit":"♠","red":false},{"id":"9♠","rank":"9","suit":"♠","red":false},{"id":"Q♠","rank":"Q","suit":"♠","red":false}],[{"id":"10♥","rank":"10","suit":"♥","red":true},{"id":"6♦","rank":"6","suit":"♦","red":true},{"id":"5♥","rank":"5","suit":"♥","red":true},{"id":"Q♣","rank":"Q","suit":"♣","red":false},{"id":"Q♦","rank":"Q","suit":"♦","red":true},{"id":"J♥","rank":"J","suit":"♥","red":true},{"id":"J♣","rank":"J","suit":"♣","red":false},{"id":"5♦","rank":"5","suit":"♦","red":true},{"id":"8♠","rank":"8","suit":"♠","red":false},{"id":"10♠","rank":"10","suit":"♠","red":false},{"id":"5♠","rank":"5","suit":"♠","red":false},{"id":"7♠","rank":"7","suit":"♠","red":false},{"id":"K♠","rank":"K","suit":"♠","red":false},{"id":"6♥","rank":"6","suit":"♥","red":true},{"id":"A♣","rank":"A","suit":"♣","red":false},{"id":"4♦","rank":"4","suit":"♦","red":true},{"id":"7♦","rank":"7","suit":"♦","red":true},{"id":"2♥","rank":"2","suit":"♥","red":true},{"id":"9♦","rank":"9","suit":"♦","red":true},{"id":"9♣","rank":"9","suit":"♣","red":false},{"id":"3♠","rank":"3","suit":"♠","red":false},{"id":"9♠","rank":"9","suit":"♠","red":false},{"id":"10♦","rank":"10","suit":"♦","red":true},{"id":"3♥","rank":"3","suit":"♥","red":true},{"id":"K♥","rank":"K","suit":"♥","red":true}]];

const sessions=new Map();
const PLAYER_GRACE_MS=5*60*1000,HOST_GRACE_MS=5*60*1000;

function secureShuffle(arr){
  const a=[...arr];
  for(let i=a.length-1;i>0;i--){const j=crypto.randomInt(i+1);[a[i],a[j]]=[a[j],a[i]]}
  return a;
}
function token(){return crypto.randomBytes(18).toString("hex")}
function roomCode(){const ch="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";let x="";for(let i=0;i<6;i++)x+=ch[crypto.randomInt(ch.length)];return x}
function sanitizeModes(modes){
  const allowed=["first10","line","corners","full"];
  const out=[...new Set((Array.isArray(modes)?modes:[]).filter(x=>allowed.includes(x)))];
  return out.length?out:["line"];
}
function sanitizeConfig(config={}){
  return {
    modes:sanitizeModes(config.modes),
    markingPolicy:["auto","manual","choice"].includes(config.markingPolicy)?config.markingPolicy:"auto",
    autoWinnerDetection:config.autoWinnerDetection!==false,
    requireReady:config.requireReady!==false,
    countdown:Number.isFinite(+config.countdown)?Math.max(0,Math.min(10,+config.countdown)):3,
    maxTables:[1,2,3].includes(+config.maxTables)?+config.maxTables:3,
    roomPassword:String(config.roomPassword||"").slice(0,40),
    autoplayInterval:[2,3,4,5,7,10].includes(+config.autoplayInterval)?+config.autoplayInterval:4,
    autoplayStopOnWinner:config.autoplayStopOnWinner!==false
  };
}
function emptyWins(){return {first10:[],line:[],corners:[],full:[]}}
function createSessionObject(hostName,config){
  let code;do{code=roomCode()}while(sessions.has(code));
  return {
    code,hostToken:token(),cohostCode:roomCode(),hostName:String(hostName||"Host").trim().slice(0,30),
    hosts:new Map(),hostConnected:true,hostTimer:null,status:"lobby",countdownEndsAt:null,
    config:sanitizeConfig(config),drawPile:secureShuffle(deck),drawn:[],
    players:new Map(),spectators:new Map(),tableOwners:new Map(),winners:emptyWins(),
    winnerHistory:[], bingoClaims:[], autoplayTimer:null, autoplayRunning:false,
    paused:false, autoplayIntervalCurrent:null
  };
}
function publicState(s){
  return {
    code:s.code,hostName:s.hostName,hostConnected:s.hosts.size>0,hostCount:s.hosts.size,
    hosts:[...s.hosts.values()].map(h=>({name:h.name,kind:h.kind})),
    status:s.status,countdownEndsAt:s.countdownEndsAt,
    config:s.config,drawn:s.drawn,boards:FIXED_BOARDS,winners:s.winners,
    winnerHistory:s.winnerHistory,bingoClaims:s.bingoClaims,
    players:[...s.players.values()].map(p=>({
      token:p.token,name:p.name,avatar:p.avatar,tableIndices:p.tableIndices,
      ready:p.ready,confirmed:p.confirmed,connected:p.connected,
      markingMode:p.markingMode,manualMarks:p.manualMarks,
      unstableUntil:p.unstableUntil||0,
      progress:Object.fromEntries(p.tableIndices.map(ti=>[String(ti),tableProgress(s,p,ti)]))
    })),
    spectators:[...s.spectators.values()].map(x=>({
      token:x.token,name:x.name,avatar:x.avatar,connected:x.connected,
      unstableUntil:x.unstableUntil||0
    })),
    tableOwners:Object.fromEntries(s.tableOwners),
    autoplayRunning:s.autoplayRunning,
    paused:s.paused,
    autoplayIntervalCurrent:s.autoplayIntervalCurrent||s.config.autoplayInterval
  };
}
function emitState(s){io.to(s.code).emit("state",publicState(s))}
function ses(socket){return socket.data.code?sessions.get(socket.data.code):null}
function effectiveMarks(s,p,tableIndex){
  if(s.config.markingPolicy==="auto" || (s.config.markingPolicy==="choice" && p.markingMode==="auto")){
    return new Set(s.drawn.map(c=>c.id));
  }
  const key=String(tableIndex);
  return new Set(p.manualMarks[key]||[]);
}
function boardMaskFor(s,p,tableIndex){
  const marks=effectiveMarks(s,p,tableIndex);
  return FIXED_BOARDS[tableIndex].map(c=>marks.has(c.id));
}
function hasLine(m){
  for(let r=0;r<5;r++)if([0,1,2,3,4].every(c=>m[r*5+c]))return true;
  for(let c=0;c<5;c++)if([0,1,2,3,4].every(r=>m[r*5+c]))return true;
  return [0,6,12,18,24].every(i=>m[i])||[4,8,12,16,20].every(i=>m[i]);
}
function tableProgress(s,p,ti){
  const mask=boardMaskFor(s,p,ti);
  const rows=[];
  for(let r=0;r<5;r++)rows.push([0,1,2,3,4].map(c=>r*5+c));
  for(let c=0;c<5;c++)rows.push([0,1,2,3,4].map(r=>r*5+c));
  rows.push([0,6,12,18,24],[4,8,12,16,20]);
  const line=Math.max(...rows.map(line=>line.filter(i=>mask[i]).length));
  const corners=[0,4,20,24].filter(i=>mask[i]).length;
  const full=mask.filter(Boolean).length;
  const firstTen=new Set(s.drawn.slice(0,10).map(c=>c.id));
  const first10=FIXED_BOARDS[ti].filter(c=>firstTen.has(c.id)).length;
  return {line,corners,full,first10};
}

function validModesForTable(s,p,ti){
  const valid=[];
  const mask=boardMaskFor(s,p,ti);

  if(s.config.modes.includes("line") && hasLine(mask))valid.push("line");
  if(s.config.modes.includes("corners") && [0,4,20,24].every(i=>mask[i]))valid.push("corners");
  if(s.config.modes.includes("full") && mask.every(Boolean))valid.push("full");

  if(s.config.modes.includes("first10") && s.drawn.length>=10){
    const firstTen=new Set(s.drawn.slice(0,10).map(c=>c.id));
    const activeTables=[...s.tableOwners.keys()];
    if(activeTables.length){
      const scores=activeTables.map(x=>({ti:x,score:FIXED_BOARDS[x].filter(c=>firstTen.has(c.id)).length}));
      const mx=Math.max(...scores.map(x=>x.score));
      const winners=scores.filter(x=>x.score===mx).map(x=>x.ti);
      if(winners.includes(ti))valid.push("first10");
    }
  }
  return valid;
}

function calculateWinners(s){
  const out=emptyWins();
  if(!s.config.autoWinnerDetection)return out;

  for(const p of s.players.values()){
    for(const ti of p.tableIndices){
      for(const mode of validModesForTable(s,p,ti)){
        if(!out[mode].includes(ti))out[mode].push(ti);
      }
    }
  }
  return out;
}

function updateWinnerHistory(s,previous){
  const labels={first10:"10 primeras",line:"Línea",corners:"4 esquinas",full:"Tabla llena"};
  for(const mode of Object.keys(s.winners)){
    const before=new Set(previous?.[mode]||[]);
    for(const ti of s.winners[mode]||[]){
      if(before.has(ti))continue;
      const ownerToken=s.tableOwners.get(ti);
      const owner=[...s.players.values()].find(p=>p.token===ownerToken);
      s.winnerHistory.push({
        id:token(),type:"auto",mode,modeLabel:labels[mode],tableIndex:ti,
        playerToken:owner?.token||null,playerName:owner?.name||null,
        at:Date.now(),drawNumber:s.drawn.length
      });
    }
  }
}

function stopAutoplay(s){
  if(s.autoplayTimer){clearInterval(s.autoplayTimer);s.autoplayTimer=null;}
  s.autoplayRunning=false;
}
function autoplayTick(s){
  if(s.status!=="playing"||s.paused||!s.drawPile.length){stopAutoplay(s);emitState(s);return;}
  const previous=s.winners;
  const card=s.drawPile.shift();
  s.drawn.push(card);
  s.winners=calculateWinners(s);
  
  const anyWinner=Object.values(s.winners).some(arr=>arr.length);
  if(s.config.autoplayStopOnWinner && anyWinner)stopAutoplay(s);
  emitState(s);
}
async function roomQr(origin,code){
  const o=/^https?:\/\//.test(String(origin||""))?String(origin).replace(/\/$/,""):"";
  const joinUrl=o?`${o}/?room=${code}`:`/?room=${code}`;
  let qrDataUrl=null;try{qrDataUrl=await QRCode.toDataURL(joinUrl,{margin:1,width:360})}catch{}
  return {joinUrl,qrDataUrl};
}
function removeOldRoomSocketMembership(socket,oldCode){if(oldCode)socket.leave(oldCode)}
function registerHost(s,socket,name,kind){
  s.hosts.set(socket.id,{socketId:socket.id,name:String(name||"Host").trim().slice(0,30),kind});
  s.hostConnected=true;
  socket.join(s.code);
  socket.data.code=s.code;
  socket.data.role="host";
  socket.data.hostKind=kind;
}

io.on("connection",socket=>{
  socket.on("createSession",async({hostName,config,origin},cb)=>{
    const s=createSessionObject(hostName,config);sessions.set(s.code,s);
    registerHost(s,socket,hostName||"Host","primary");prewarmNameAudio(hostName||"Host");
    socket.data.hostToken=s.hostToken;
    const qr=await roomQr(origin,s.code);
    cb?.({ok:true,hostToken:s.hostToken,cohostCode:s.cohostCode,...qr,state:publicState(s)});emitState(s);
  });

  socket.on("createNewSession",async({config,origin},cb)=>{
    const old=ses(socket);if(!old||socket.data.role!=="host")return cb?.({ok:false,error:"Solo el host puede crear otra sesión."});
    const oldCode=old.code,hostName=old.hostName;stopAutoplay(old);
    socket.to(oldCode).emit("sessionReplaced");
    sessions.delete(oldCode);removeOldRoomSocketMembership(socket,oldCode);

    const s=createSessionObject(hostName,config||old.config);sessions.set(s.code,s);
    registerHost(s,socket,hostName||"Host","primary");
    socket.data.hostToken=s.hostToken;
    const qr=await roomQr(origin,s.code);
    cb?.({ok:true,hostToken:s.hostToken,cohostCode:s.cohostCode,...qr,state:publicState(s)});emitState(s);
  });

  socket.on("joinCohost",({hostCode,name},cb)=>{
    const hc=String(hostCode||"").trim().toUpperCase();
    const s=[...sessions.values()].find(room=>String(room.cohostCode).toUpperCase()===hc);
    if(!s)return cb?.({ok:false,error:"Código de host incorrecto o sala inexistente."});
    if(s.hosts.size>=2)return cb?.({ok:false,error:"Esta sesión ya tiene dos hosts conectados."});
    registerHost(s,socket,name||"Segundo host","secondary");prewarmNameAudio(name||"Segundo host");
    cb?.({ok:true,role:"host",hostKind:"secondary",cohostCode:s.cohostCode,state:publicState(s)});
    emitState(s);
  });

  socket.on("joinSession",({code,name,avatar,password,role},cb)=>{
    code=String(code||"").trim().toUpperCase();const s=sessions.get(code);
    if(!s)return cb?.({ok:false,error:"La sala no existe o ya terminó."});
    if(s.config.roomPassword && String(password||"")!==s.config.roomPassword)
      return cb?.({ok:false,error:"Contraseña incorrecta."});

    const joinRole=role==="spectator"?"spectator":"player";
    if(joinRole==="player" && s.status!=="lobby")
      return cb?.({ok:false,error:"La partida ya comenzó. Puedes entrar como espectador."});

    const pt=token();
    if(joinRole==="spectator"){
      const sp={token:pt,name:String(name||"Espectador").trim().slice(0,30),avatar:String(avatar||"👀").slice(0,4),connected:true,timer:null,socketId:socket.id,unstableUntil:0};
      s.spectators.set(pt,sp);prewarmNameAudio(sp.name);socket.join(code);socket.data.code=code;socket.data.role="spectator";socket.data.spectatorToken=pt;
      cb?.({ok:true,role:"spectator",spectatorToken:pt,state:publicState(s)});emitState(s);return;
    }

    const p={token:pt,name:String(name||"Jugador").trim().slice(0,30),avatar:String(avatar||"🙂").slice(0,4),
      tableIndices:[],ready:false,confirmed:false,connected:true,timer:null,socketId:socket.id,unstableUntil:0,
      markingMode:s.config.markingPolicy==="manual"?"manual":"auto",manualMarks:{}};
    s.players.set(pt,p);prewarmNameAudio(p.name);socket.join(code);socket.data.code=code;socket.data.role="player";socket.data.playerToken=pt;
    cb?.({ok:true,role:"player",playerToken:pt,state:publicState(s)});emitState(s);
  });

  socket.on("reconnectSpectator",({code,spectatorToken},cb)=>{
    const s=sessions.get(String(code||"").toUpperCase()),sp=s?.spectators.get(spectatorToken);
    if(!s||!sp)return cb?.({ok:false});
    if(sp.timer)clearTimeout(sp.timer);sp.timer=null;sp.connected=true;sp.socketId=socket.id;sp.unstableUntil=Date.now()+30000;
    socket.join(s.code);socket.data.code=s.code;socket.data.role="spectator";socket.data.spectatorToken=spectatorToken;
    cb?.({ok:true,state:publicState(s)});emitState(s);
  });

  socket.on("reconnectPlayer",({code,playerToken},cb)=>{
    const s=sessions.get(String(code||"").toUpperCase()),p=s?.players.get(playerToken);if(!s||!p)return cb?.({ok:false});
    if(p.timer)clearTimeout(p.timer);p.timer=null;p.connected=true;p.socketId=socket.id;p.unstableUntil=Date.now()+30000;socket.join(s.code);socket.data.code=s.code;socket.data.role="player";socket.data.playerToken=playerToken;
    cb?.({ok:true,state:publicState(s)});emitState(s);
  });

  socket.on("toggleTable",({tableIndex},cb)=>{
    const s=ses(socket),p=s?.players.get(socket.data.playerToken);if(!s||!p)return cb?.({ok:false,error:"Jugador no encontrado."});
    if(s.status!=="lobby")return cb?.({ok:false,error:"La selección está cerrada."});
    if(p.confirmed)return cb?.({ok:false,error:"Desconfirma tus tablas para cambiarlas."});
    const i=Number(tableIndex);if(!Number.isInteger(i)||i<0||i>=20)return cb?.({ok:false,error:"Tabla inválida."});
    if(p.tableIndices.includes(i)){p.tableIndices=p.tableIndices.filter(x=>x!==i);s.tableOwners.delete(i);delete p.manualMarks[String(i)];cb?.({ok:true});return emitState(s)}
    if(p.tableIndices.length>=s.config.maxTables)return cb?.({ok:false,error:`Máximo ${s.config.maxTables} tablas por jugador.`});
    if(s.tableOwners.has(i))return cb?.({ok:false,error:"Esa tabla ya está ocupada."});
    p.tableIndices.push(i);p.tableIndices.sort((a,b)=>a-b);s.tableOwners.set(i,p.token);p.manualMarks[String(i)]=[];
    cb?.({ok:true});emitState(s);
  });

  socket.on("confirmTables",(_,cb)=>{
    const s=ses(socket),p=s?.players.get(socket.data.playerToken);if(!s||!p)return cb?.({ok:false,error:"Jugador no encontrado."});
    if(!p.tableIndices.length)return cb?.({ok:false,error:"Elige al menos una tabla."});
    p.confirmed=!p.confirmed;if(!p.confirmed)p.ready=false;cb?.({ok:true,confirmed:p.confirmed});emitState(s);
  });
  socket.on("setMarkingMode",({mode},cb)=>{
    const s=ses(socket),p=s?.players.get(socket.data.playerToken);if(!s||!p)return cb?.({ok:false,error:"Jugador no encontrado."});
    if(s.config.markingPolicy!=="choice")return cb?.({ok:false,error:"El host fijó el modo de marcado."});
    if(!["auto","manual"].includes(mode))return cb?.({ok:false,error:"Modo inválido."});
    p.markingMode=mode;cb?.({ok:true});emitState(s);
  });
  socket.on("toggleReady",(_,cb)=>{
    const s=ses(socket),p=s?.players.get(socket.data.playerToken);if(!s||!p)return cb?.({ok:false,error:"Jugador no encontrado."});
    if(!p.confirmed)return cb?.({ok:false,error:"Primero confirma tus tablas."});
    p.ready=!p.ready;cb?.({ok:true});emitState(s);
  });

  socket.on("kickParticipant",({token:targetToken,role},cb)=>{
    const s=ses(socket);if(!s||socket.data.role!=="host")return cb?.({ok:false,error:"Solo el host."});
    if(role==="spectator"){
      const sp=s.spectators.get(targetToken);if(!sp)return cb?.({ok:false,error:"Espectador no encontrado."});
      if(sp.socketId)io.to(sp.socketId).emit("kicked");
      s.spectators.delete(targetToken);cb?.({ok:true});emitState(s);return;
    }
    const p=s.players.get(targetToken);if(!p)return cb?.({ok:false,error:"Jugador no encontrado."});
    for(const ti of p.tableIndices)s.tableOwners.delete(ti);
    if(p.socketId)io.to(p.socketId).emit("kicked");
    s.players.delete(targetToken);cb?.({ok:true});emitState(s);
  });

  socket.on("startGame",(_,cb)=>{
    const s=ses(socket);if(!s||socket.data.role!=="host")return cb?.({ok:false,error:"Solo el host."});
    if(s.status!=="lobby")return cb?.({ok:false,error:"La sesión no está en sala de espera."});
    if(!s.players.size)return cb?.({ok:false,error:"Todavía no hay jugadores."});
    const players=[...s.players.values()];
    if(players.some(p=>!p.confirmed))return cb?.({ok:false,error:"Todos deben confirmar sus tablas."});
    if(s.config.requireReady && players.some(p=>!p.ready))return cb?.({ok:false,error:"Todavía hay jugadores que no están listos."});
    const seconds=s.config.countdown;
    s.paused=false;s.status=seconds>0?"countdown":"playing";
    s.countdownEndsAt=seconds>0?Date.now()+seconds*1000:null;
    cb?.({ok:true});emitState(s);
    if(seconds>0)setTimeout(()=>{
      const current=sessions.get(s.code);
      if(current===s && s.status==="countdown"){s.status="playing";s.countdownEndsAt=null;emitState(s)}
    },seconds*1000);
  });

  socket.on("setAutoplayInterval",({seconds},cb)=>{
    const s=ses(socket);if(!s||socket.data.role!=="host")return cb?.({ok:false,error:"Solo el host."});
    const secs=Number(seconds);
    if(![2,3,4,5,7,10].includes(secs))return cb?.({ok:false,error:"Velocidad inválida."});
    s.autoplayIntervalCurrent=secs;
    if(s.autoplayRunning){
      stopAutoplay(s);
      s.autoplayRunning=true;
      s.autoplayTimer=setInterval(()=>autoplayTick(s),secs*1000);
    }
    cb?.({ok:true});emitState(s);
  });

  socket.on("togglePause",(_,cb)=>{
    const s=ses(socket);if(!s||socket.data.role!=="host")return cb?.({ok:false,error:"Solo el host."});
    if(s.status!=="playing")return cb?.({ok:false,error:"La partida no está activa."});
    if(!s.paused){
      stopAutoplay(s);
      s.paused=true;
    }else{
      s.paused=false;
    }
    cb?.({ok:true,paused:s.paused});emitState(s);
  });

  socket.on("closeRoom",(_,cb)=>{
    const s=ses(socket);if(!s||socket.data.role!=="host")return cb?.({ok:false,error:"Solo el host."});
    stopAutoplay(s);
    cb?.({ok:true});
    io.to(s.code).emit("sessionClosed");
    sessions.delete(s.code);
  });

  socket.on("startAutoplay",(_,cb)=>{
    const s=ses(socket);if(!s||socket.data.role!=="host")return cb?.({ok:false,error:"Solo el host."});
    if(s.status!=="playing")return cb?.({ok:false,error:"La partida no está activa."});
    if(s.autoplayRunning)return cb?.({ok:false,error:"Autoplay ya está activo."});
    if(!s.drawPile.length)return cb?.({ok:false,error:"Ya salieron las 52 cartas."});
    s.autoplayRunning=true;
    const secs=s.autoplayIntervalCurrent||s.config.autoplayInterval;
    s.autoplayTimer=setInterval(()=>autoplayTick(s),secs*1000);
    cb?.({ok:true});emitState(s);
  });

  socket.on("stopAutoplay",(_,cb)=>{
    const s=ses(socket);if(!s||socket.data.role!=="host")return cb?.({ok:false,error:"Solo el host."});
    stopAutoplay(s);cb?.({ok:true});emitState(s);
  });

  socket.on("drawCard",(_,cb)=>{
    const s=ses(socket);if(!s||socket.data.role!=="host")return cb?.({ok:false,error:"Solo el host."});
    if(s.status!=="playing")return cb?.({ok:false,error:"La partida todavía no está activa."});
    if(s.paused)return cb?.({ok:false,error:"La partida está pausada."});
    if(s.autoplayRunning)return cb?.({ok:false,error:"Pausa el autoplay antes de sacar manualmente."});
    if(!s.drawPile.length)return cb?.({ok:false,error:"Ya salieron las 52 cartas."});
    const card=s.drawPile.shift();s.drawn.push(card);
    const previous=s.winners;s.winners=calculateWinners(s);
    cb?.({ok:true,card});emitState(s);
  });
  socket.on("undoDraw",(_,cb)=>{
    const s=ses(socket);if(!s||socket.data.role!=="host")return cb?.({ok:false,error:"Solo el host."});
    if(s.autoplayRunning)return cb?.({ok:false,error:"Pausa el autoplay antes de deshacer."});
    if(!s.drawn.length)return cb?.({ok:false,error:"No hay cartas."});
    s.drawPile.unshift(s.drawn.pop());s.winners=calculateWinners(s);cb?.({ok:true});emitState(s);
  });

  socket.on("manualMark",({tableIndex,cardId},cb)=>{
    const s=ses(socket),p=s?.players.get(socket.data.playerToken);if(!s||!p)return cb?.({ok:false,error:"Jugador no encontrado."});
    const manualAllowed=s.config.markingPolicy==="manual"||(s.config.markingPolicy==="choice"&&p.markingMode==="manual");
    if(!manualAllowed)return cb?.({ok:false,error:"El marcado manual no está habilitado."});
    if(s.status!=="playing")return cb?.({ok:false,error:"La partida no está activa."});
    const ti=Number(tableIndex);if(!p.tableIndices.includes(ti))return cb?.({ok:false,error:"Esa tabla no es tuya."});
    const card=FIXED_BOARDS[ti].find(c=>c.id===cardId);if(!card)return cb?.({ok:false,error:"Carta inválida."});
    const arr=p.manualMarks[String(ti)]||[];
    p.manualMarks[String(ti)]=arr.includes(cardId)?arr.filter(x=>x!==cardId):[...arr,cardId];
    const previous=s.winners;s.winners=calculateWinners(s);
    cb?.({ok:true});emitState(s);
  });

  socket.on("claimBingo",({tableIndex,mode},cb)=>{
    const s=ses(socket),p=s?.players.get(socket.data.playerToken);
    if(!s||!p)return cb?.({ok:false,error:"Jugador no encontrado."});
    if(s.status!=="playing")return cb?.({ok:false,error:"La partida no está activa."});

    const ti=Number(tableIndex);
    if(!p.tableIndices.includes(ti))return cb?.({ok:false,error:"Esa tabla no es tuya."});
    if(!s.config.modes.includes(mode))return cb?.({ok:false,error:"Ese tipo de BINGO no está activo."});

    // Block duplicate pending or granted requests for same player/table/mode.
    const duplicate=s.bingoClaims.some(c=>
      c.playerToken===p.token && c.tableIndex===ti && c.requestedMode===mode &&
      ["pending","granted"].includes(c.status)
    );
    if(duplicate)return cb?.({ok:false,error:"Ya solicitaste ese BINGO para esta tabla."});

    // Freeze draw/calling for review.
    stopAutoplay(s);
    s.paused=true;

    const allValid=validModesForTable(s,p,ti);
    const valid=allValid.includes(mode);
    const marks=[...effectiveMarks(s,p,ti)];
    const claim={
      id:token(),playerToken:p.token,playerName:p.name,tableIndex:ti,
      requestedMode:mode,valid,modes:valid?[mode]:[],
      status:valid?"pending":"invalid",
      markSnapshot:marks,
      drawnSnapshot:s.drawn.map(c=>c.id),
      at:Date.now(),drawNumber:s.drawn.length
    };
    s.bingoClaims.push(claim);
    if(s.bingoClaims.length>100)s.bingoClaims=s.bingoClaims.slice(-100);

    if(!valid){
      cb?.({ok:true,valid:false,status:"invalid",modes:[]});
      emitState(s);return;
    }
    cb?.({ok:true,valid:true,status:"pending",modes:[mode]});
    emitState(s);
  });

  socket.on("resolveBingoClaim",({claimId,action},cb)=>{
    const s=ses(socket);
    if(!s||socket.data.role!=="host")return cb?.({ok:false,error:"Solo el host puede resolver BINGO."});

    const claim=s.bingoClaims.find(c=>c.id===claimId);
    if(!claim)return cb?.({ok:false,error:"Solicitud no encontrada."});
    if(claim.status!=="pending")return cb?.({ok:false,error:"Esa solicitud ya fue resuelta."});

    const p=s.players.get(claim.playerToken);
    if(!p)return cb?.({ok:false,error:"El jugador ya no está en la sala."});

    // Validate again at approval time.
    const currentValid=validModesForTable(s,p,claim.tableIndex);
    const stillValid=currentValid.includes(claim.requestedMode)?[claim.requestedMode]:[];

    if(action==="grant" && stillValid.length){
      claim.status="granted";
      claim.modes=stillValid;
      claim.resolvedAt=Date.now();

      const labels={first10:"10 primeras",line:"Línea",corners:"4 esquinas",full:"Tabla llena"};
      for(const mode of stillValid){
        const exists=s.winnerHistory.some(w=>w.type==="granted"&&w.mode===mode&&w.tableIndex===claim.tableIndex&&w.playerToken===claim.playerToken);
        if(!exists){
          s.winnerHistory.push({
            id:token(),type:"granted",mode,modeLabel:labels[mode],
            tableIndex:claim.tableIndex,playerToken:claim.playerToken,
            playerName:claim.playerName,at:Date.now(),drawNumber:s.drawn.length
          });
        }
      }
      cb?.({ok:true,status:"granted",modes:stillValid});
    }else{
      claim.status="rejected";
      claim.resolvedAt=Date.now();
      cb?.({ok:true,status:"rejected"});
    }
    emitState(s);
  });

  socket.on("resetRound",(_,cb)=>{
    const s=ses(socket);if(!s||socket.data.role!=="host")return cb?.({ok:false,error:"Solo el host."});
    stopAutoplay(s);s.paused=false;s.autoplayIntervalCurrent=s.config.autoplayInterval;s.status="lobby";s.countdownEndsAt=null;s.drawPile=secureShuffle(deck);s.drawn=[];s.winners=emptyWins();
    s.winnerHistory=[];s.bingoClaims=[];
    for(const p of s.players.values()){p.ready=false;p.confirmed=false;p.manualMarks={};for(const ti of p.tableIndices)p.manualMarks[String(ti)]=[];}
    cb?.({ok:true});emitState(s);
  });

  socket.on("disconnect",()=>{
    const s=ses(socket);if(!s)return;
    if(socket.data.role==="host"){
      s.hosts.delete(socket.id);
      s.hostConnected=s.hosts.size>0;
      if(s.hosts.size===0){
        stopAutoplay(s);
        io.to(s.code).emit("sessionClosed");
        sessions.delete(s.code);
      }else{
        emitState(s);
      }
    }else if(socket.data.role==="spectator"){
      const sp=s.spectators.get(socket.data.spectatorToken);if(!sp)return;sp.connected=false;emitState(s);
      sp.timer=setTimeout(()=>{if(!sp.connected){s.spectators.delete(sp.token);emitState(s)}},PLAYER_GRACE_MS);
    }else{
      const p=s.players.get(socket.data.playerToken);if(!p)return;p.connected=false;emitState(s);
      p.timer=setTimeout(()=>{if(!p.connected){for(const i of p.tableIndices)s.tableOwners.delete(i);s.players.delete(p.token);emitState(s)}},PLAYER_GRACE_MS);
    }
  });
});

server.listen(PORT,()=>console.log(`POKENO v4.5 en puerto ${PORT}`));