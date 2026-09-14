
const express = require("express");
const http = require("http");
const crypto = require("crypto");
const QRCode = require("qrcode");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { pingTimeout: 20000, pingInterval: 25000 });

app.use(express.static(path.join(__dirname, "public")));
app.get("/health", (_, res) => res.status(200).send("ok"));

const PORT = process.env.PORT || 3000;
const sessions = new Map();
const PLAYER_GRACE_MS = 5 * 60 * 1000;
const HOST_GRACE_MS = 5 * 60 * 1000;

const ranks = ["A","2","3","4","5","6","7","8","9","10","J","Q","K"];
const suits = [
  {s:"♠", red:false},{s:"♥", red:true},{s:"♦", red:true},{s:"♣", red:false}
];
const deck = suits.flatMap(su => ranks.map(rank => ({
  id:`${rank}${su.s}`, rank, suit:su.s, red:su.red
})));

function shuffle(arr){
  const a=[...arr];
  for(let i=a.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1));
    [a[i],a[j]]=[a[j],a[i]];
  }
  return a;
}
function token(){ return crypto.randomBytes(18).toString("hex"); }
function roomCode(){
  const chars="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code="";
  for(let i=0;i<6;i++) code += chars[Math.floor(Math.random()*chars.length)];
  return code;
}

function createBalancedBoards(count=20){
  // 500 slots / 52 cards => every card appears 9 or 10 times globally.
  const slots=count*25;
  const base=Math.floor(slots/deck.length);
  const extra=slots%deck.length;
  const boosted=new Set(shuffle(deck).slice(0,extra).map(c=>c.id));
  const remaining=new Map(deck.map(c=>[c.id, base+(boosted.has(c.id)?1:0)]));
  const boards=[];

  for(let b=0;b<count;b++){
    const board=[];
    const used=new Set();
    for(let pos=0;pos<25;pos++){
      let candidates=deck.filter(c=>!used.has(c.id) && remaining.get(c.id)>0);
      const max=Math.max(...candidates.map(c=>remaining.get(c.id)));
      candidates=candidates.filter(c=>remaining.get(c.id)>=max-1);
      const pick=candidates[Math.floor(Math.random()*candidates.length)];
      board.push(pick);
      used.add(pick.id);
      remaining.set(pick.id,remaining.get(pick.id)-1);
    }
    boards.push(board);
  }
  return boards;
}

function publicState(s){
  return {
    code:s.code,
    hostName:s.hostName,
    hostConnected:s.hostConnected,
    mode:s.mode,
    started:s.started,
    drawn:s.drawn,
    boards:s.boards,
    winners:s.winners,
    players:[...s.players.values()].map(p=>({
      token:p.token,
      name:p.name,
      avatar:p.avatar,
      tableIndex:p.tableIndex,
      ready:p.ready,
      connected:p.connected
    })),
    tableOwners:Object.fromEntries(s.tableOwners)
  };
}
function broadcast(s){ io.to(s.code).emit("state", publicState(s)); }

function getSession(socket){
  return socket.data.roomCode ? sessions.get(socket.data.roomCode) : null;
}
function markedSet(s){ return new Set(s.drawn.map(c=>c.id)); }
function hasLine(mask){
  for(let r=0;r<5;r++) if([0,1,2,3,4].every(c=>mask[r*5+c])) return true;
  for(let c=0;c<5;c++) if([0,1,2,3,4].every(r=>mask[r*5+c])) return true;
  if([0,6,12,18,24].every(i=>mask[i])) return true;
  if([4,8,12,16,20].every(i=>mask[i])) return true;
  return false;
}
function boardWins(s,board){
  const marked=markedSet(s);
  const mask=board.map(c=>marked.has(c.id));
  if(s.mode==="line") return hasLine(mask);
  if(s.mode==="corners") return [0,4,20,24].every(i=>mask[i]);
  if(s.mode==="full") return mask.every(Boolean);
  return false;
}
function calculateWinners(s){
  if(s.mode==="first10"){
    if(s.drawn.length!==10) return [];
    const marked=markedSet(s);
    const scores=s.boards.map(b=>b.filter(c=>marked.has(c.id)).length);
    const max=Math.max(...scores);
    return scores.map((score,i)=>score===max?i:null).filter(i=>i!==null);
  }
  return s.boards.map((b,i)=>boardWins(s,b)?i:null).filter(i=>i!==null);
}
function clearPlayerTimer(player){
  if(player.removeTimer){ clearTimeout(player.removeTimer); player.removeTimer=null; }
}
function removePlayer(s, playerToken){
  const p=s.players.get(playerToken);
  if(!p) return;
  if(p.tableIndex!==null) s.tableOwners.delete(p.tableIndex);
  s.players.delete(playerToken);
  broadcast(s);
}

io.on("connection", socket => {
  socket.on("createSession", async ({hostName,mode,origin}, cb)=>{
    let code;
    do{ code=roomCode(); }while(sessions.has(code));

    const hostToken=token();
    const s={
      code,
      hostToken,
      hostSocketId:socket.id,
      hostConnected:true,
      hostName:String(hostName||"Host").trim().slice(0,30),
      hostRemoveTimer:null,
      mode:["first10","line","corners","full"].includes(mode)?mode:"line",
      started:false,
      boards:createBalancedBoards(20),
      drawPile:shuffle(deck),
      drawn:[],
      players:new Map(),
      tableOwners:new Map(),
      winners:[]
    };
    sessions.set(code,s);
    socket.join(code);
    socket.data.roomCode=code;
    socket.data.role="host";
    socket.data.hostToken=hostToken;

    const safeOrigin = /^https?:\/\//.test(String(origin||"")) ? String(origin).replace(/\/$/,"") : "";
    const joinUrl = safeOrigin ? `${safeOrigin}/?room=${code}` : `/?room=${code}`;
    let qrDataUrl=null;
    try{ qrDataUrl=await QRCode.toDataURL(joinUrl,{margin:1,width:360}); }catch{}

    cb?.({ok:true,code,hostToken,joinUrl,qrDataUrl,state:publicState(s)});
    broadcast(s);
  });

  socket.on("reconnectHost", ({code,hostToken}, cb)=>{
    code=String(code||"").toUpperCase();
    const s=sessions.get(code);
    if(!s || s.hostToken!==hostToken) return cb?.({ok:false});
    if(s.hostRemoveTimer){clearTimeout(s.hostRemoveTimer);s.hostRemoveTimer=null;}
    s.hostSocketId=socket.id;
    s.hostConnected=true;
    socket.join(code);
    socket.data.roomCode=code;
    socket.data.role="host";
    socket.data.hostToken=hostToken;
    cb?.({ok:true,state:publicState(s)});
    broadcast(s);
  });

  socket.on("joinSession", ({code,name,avatar}, cb)=>{
    code=String(code||"").trim().toUpperCase();
    const s=sessions.get(code);
    if(!s) return cb?.({ok:false,error:"La sala no existe o ya terminó."});

    const playerToken=token();
    const p={
      token:playerToken,
      socketId:socket.id,
      name:String(name||"Jugador").trim().slice(0,30),
      avatar:String(avatar||"🙂").slice(0,4),
      tableIndex:null,
      ready:false,
      connected:true,
      removeTimer:null
    };
    s.players.set(playerToken,p);
    socket.join(code);
    socket.data.roomCode=code;
    socket.data.role="player";
    socket.data.playerToken=playerToken;
    cb?.({ok:true,playerToken,state:publicState(s)});
    broadcast(s);
  });

  socket.on("reconnectPlayer", ({code,playerToken}, cb)=>{
    code=String(code||"").trim().toUpperCase();
    const s=sessions.get(code);
    const p=s?.players.get(playerToken);
    if(!s || !p) return cb?.({ok:false});
    clearPlayerTimer(p);
    p.socketId=socket.id;
    p.connected=true;
    socket.join(code);
    socket.data.roomCode=code;
    socket.data.role="player";
    socket.data.playerToken=playerToken;
    cb?.({ok:true,state:publicState(s)});
    broadcast(s);
  });

  socket.on("claimTable", ({tableIndex}, cb)=>{
    const s=getSession(socket);
    if(!s || socket.data.role!=="player") return cb?.({ok:false,error:"No estás como jugador."});
    const p=s.players.get(socket.data.playerToken);
    if(!p) return cb?.({ok:false,error:"Jugador no encontrado."});

    tableIndex=Number(tableIndex);
    if(!Number.isInteger(tableIndex)||tableIndex<0||tableIndex>=20) return cb?.({ok:false,error:"Tabla inválida."});
    const owner=s.tableOwners.get(tableIndex);
    if(owner && owner!==p.token) return cb?.({ok:false,error:"Esa tabla ya está ocupada."});

    if(p.tableIndex!==null) s.tableOwners.delete(p.tableIndex);
    p.tableIndex=tableIndex;
    p.ready=false;
    s.tableOwners.set(tableIndex,p.token);
    cb?.({ok:true});
    broadcast(s);
  });

  socket.on("toggleReady", (_,cb)=>{
    const s=getSession(socket);
    const p=s?.players.get(socket.data.playerToken);
    if(!s||!p) return cb?.({ok:false,error:"Jugador no encontrado."});
    if(p.tableIndex===null) return cb?.({ok:false,error:"Primero elige una tabla."});
    p.ready=!p.ready;
    cb?.({ok:true,ready:p.ready});
    broadcast(s);
  });

  socket.on("startGame", (_,cb)=>{
    const s=getSession(socket);
    if(!s||socket.data.role!=="host") return cb?.({ok:false,error:"Solo el host puede iniciar."});
    if(!s.players.size) return cb?.({ok:false,error:"Todavía no hay jugadores."});
    s.started=true;
    cb?.({ok:true});
    broadcast(s);
  });

  socket.on("drawCard", (_,cb)=>{
    const s=getSession(socket);
    if(!s||socket.data.role!=="host") return cb?.({ok:false,error:"Solo el host puede sortear."});
    if(!s.started) return cb?.({ok:false,error:"Primero inicia la partida."});
    if(!s.drawPile.length) return cb?.({ok:false,error:"Ya salieron las 52 cartas."});
    const card=s.drawPile.shift();
    s.drawn.push(card);
    s.winners=calculateWinners(s);
    cb?.({ok:true,card});
    broadcast(s);
  });

  socket.on("undoDraw", (_,cb)=>{
    const s=getSession(socket);
    if(!s||socket.data.role!=="host") return cb?.({ok:false,error:"Solo el host puede deshacer."});
    if(!s.drawn.length) return cb?.({ok:false,error:"No hay cartas para deshacer."});
    s.drawPile.unshift(s.drawn.pop());
    s.winners=calculateWinners(s);
    cb?.({ok:true});
    broadcast(s);
  });

  socket.on("resetRound", (_,cb)=>{
    const s=getSession(socket);
    if(!s||socket.data.role!=="host") return cb?.({ok:false,error:"Solo el host puede reiniciar."});
    s.started=false;
    s.boards=createBalancedBoards(20);
    s.drawPile=shuffle(deck);
    s.drawn=[];
    s.winners=[];
    s.tableOwners.clear();
    for(const p of s.players.values()){ p.tableIndex=null; p.ready=false; }
    cb?.({ok:true});
    broadcast(s);
  });

  socket.on("setMode", ({mode},cb)=>{
    const s=getSession(socket);
    if(!s||socket.data.role!=="host") return cb?.({ok:false,error:"Solo el host puede cambiar modalidad."});
    if(!["first10","line","corners","full"].includes(mode)) return cb?.({ok:false,error:"Modalidad inválida."});
    s.mode=mode;
    s.winners=calculateWinners(s);
    cb?.({ok:true});
    broadcast(s);
  });

  socket.on("disconnect", ()=>{
    const s=getSession(socket);
    if(!s) return;

    if(socket.data.role==="host"){
      s.hostConnected=false;
      broadcast(s);
      s.hostRemoveTimer=setTimeout(()=>{
        if(!s.hostConnected){
          io.to(s.code).emit("sessionClosed");
          sessions.delete(s.code);
        }
      },HOST_GRACE_MS);
      return;
    }

    if(socket.data.role==="player"){
      const p=s.players.get(socket.data.playerToken);
      if(!p) return;
      p.connected=false;
      clearPlayerTimer(p);
      p.removeTimer=setTimeout(()=>removePlayer(s,p.token),PLAYER_GRACE_MS);
      broadcast(s);
    }
  });
});

server.listen(PORT, ()=>console.log(`POKENO Online escuchando en puerto ${PORT}`));
