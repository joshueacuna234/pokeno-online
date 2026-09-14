
const socket=io();
let state=null,isHost=false,myPlayerToken=null,hostToken=null,qrDataUrl=null,joinUrl=null;
const $=id=>document.getElementById(id);

function toast(msg){const e=$("toast");e.textContent=msg;e.classList.add("show");clearTimeout(window.__t);window.__t=setTimeout(()=>e.classList.remove("show"),2400)}
function roomFromUrl(){return new URLSearchParams(location.search).get("room")?.trim().toUpperCase()||""}
function modeLabel(m){return {first10:"Más aciertos en los primeros 10",line:"Línea",corners:"4 esquinas",full:"Tabla llena"}[m]||m}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}
function persistRole(){
  if(!state)return;
  if(isHost)localStorage.setItem("pokenoHost",JSON.stringify({code:state.code,hostToken}));
  else localStorage.setItem("pokenoPlayer",JSON.stringify({code:state.code,playerToken:myPlayerToken}));
}
function clearStoredRole(){
  localStorage.removeItem("pokenoHost");localStorage.removeItem("pokenoPlayer");
}
function enterGame(){
  $("landing").classList.add("hidden");$("game").classList.remove("hidden");
  document.querySelectorAll(".host-only").forEach(e=>e.classList.toggle("hidden",!isHost));
  document.querySelectorAll(".player-only").forEach(e=>e.classList.toggle("hidden",isHost));
}
function currentJoinUrl(){return `${location.origin}/?room=${state?.code||roomFromUrl()}`}

async function makeClientQr(url){
  // Server returns a QR on creation; for rejoin we use a small public QR image endpoint fallback.
  // If unavailable, room code still works.
  return `https://api.qrserver.com/v1/create-qr-code/?size=360x360&data=${encodeURIComponent(url)}`;
}
async function refreshInvite(){
  if(!state)return;
  joinUrl=currentJoinUrl();
  if(!qrDataUrl) qrDataUrl=await makeClientQr(joinUrl);
  $("qrImage").src=qrDataUrl;$("modalQr").src=qrDataUrl;
  $("qrCodeText").textContent=state.code;$("modalCode").textContent=state.code;
}

$("createBtn").onclick=()=>{
  const hostName=$("hostName").value.trim()||"Host";
  socket.emit("createSession",{hostName,mode:$("hostMode").value,origin:location.origin},res=>{
    if(!res?.ok)return toast(res?.error||"No se pudo crear.");
    isHost=true;hostToken=res.hostToken;state=res.state;qrDataUrl=res.qrDataUrl;joinUrl=res.joinUrl;
    history.replaceState(null,"",`/?room=${state.code}`);
    persistRole();enterGame();refreshInvite();render();
  });
};
$("joinBtn").onclick=()=>{
  const code=$("joinCode").value.trim().toUpperCase();
  const name=$("playerName").value.trim()||"Jugador";
  if(!code)return toast("Escribe el código.");
  socket.emit("joinSession",{code,name,avatar:$("avatar").value},res=>{
    if(!res?.ok)return toast(res?.error||"No se pudo entrar.");
    isHost=false;myPlayerToken=res.playerToken;state=res.state;
    history.replaceState(null,"",`/?room=${state.code}`);
    persistRole();enterGame();refreshInvite();render();
  });
};

$("startBtn").onclick=()=>socket.emit("startGame",{},r=>{if(!r?.ok)toast(r.error)});
$("drawBtn").onclick=()=>socket.emit("drawCard",{},r=>{if(!r?.ok)toast(r.error)});
$("undoBtn").onclick=()=>socket.emit("undoDraw",{},r=>{if(!r?.ok)toast(r.error)});
$("resetBtn").onclick=()=>{if(confirm("¿Nueva ronda? Se regenerarán las 20 tablas."))socket.emit("resetRound",{},r=>{if(!r?.ok)toast(r.error)})};
$("modeSelect").onchange=e=>socket.emit("setMode",{mode:e.target.value},r=>{if(!r?.ok)toast(r.error)});
$("readyBtn").onclick=()=>socket.emit("toggleReady",{},r=>{if(!r?.ok)toast(r.error)});

$("inviteBtn").onclick=()=>$("inviteModal").classList.remove("hidden");
$("closeInvite").onclick=()=>$("inviteModal").classList.add("hidden");
$("inviteModal").onclick=e=>{if(e.target===$("inviteModal"))$("inviteModal").classList.add("hidden")};
$("copyLinkBtn").onclick=async()=>{await copyText(currentJoinUrl());toast("Enlace copiado.")};
$("shareBtn").onclick=async()=>{
  const url=currentJoinUrl();
  if(navigator.share){try{await navigator.share({title:"POKENO Online",text:`Únete a mi sala ${state.code}`,url});}catch{}}
  else{await copyText(url);toast("Enlace copiado.")}
};
async function copyText(t){try{await navigator.clipboard.writeText(t)}catch{}}

socket.on("state",s=>{
  const old=new Set(state?.winners||[]);
  state=s;
  const nw=(s.winners||[]).filter(i=>!old.has(i));
  if(nw.length)toast(`¡BINGO! ${nw.map(i=>`Tabla ${i+1}`).join(", ")}`);
  persistRole();render();
});
socket.on("sessionClosed",()=>{clearStoredRole();alert("La sala terminó porque el host estuvo desconectado más de 5 minutos.");location.href="/"});

function render(){
  if(!state)return;
  $("roomCode").textContent=state.code;$("roleText").textContent=isHost?"Host":"Jugador";
  $("hostOffline").classList.toggle("hidden",state.hostConnected);
  $("playerCount").textContent=state.players.length;
  $("readyCount").textContent=state.players.filter(p=>p.ready).length;
  $("drawCount").textContent=`${state.drawn.length} / 52`;
  $("modeSelect").value=state.mode;$("modeReadOnly").textContent=modeLabel(state.mode);$("modeReadOnly").classList.toggle("hidden",isHost);
  $("lobbyBanner").classList.toggle("hidden",state.started);
  $("startBtn").textContent=state.started?"Partida iniciada":"Iniciar partida";$("startBtn").disabled=state.started;

  const me=state.players.find(p=>p.token===myPlayerToken);
  if(!isHost){
    $("readyBtn").textContent=me?.ready?"✓ Estoy listo":"Estoy listo";
    $("readyBtn").disabled=me?.tableIndex==null||state.started;
    $("boardsHeading").textContent=me?.tableIndex==null?"Elige tu tabla":`Tu tabla: ${me.tableIndex+1}`;
    $("boardsSub").textContent=state.started?"La partida está en curso.":(me?.ready?"Ya estás listo para jugar.":"Puedes cambiar de tabla antes de estar listo.");
  }else{
    $("boardsHeading").textContent="Tablas de la sesión";$("boardsSub").textContent="El host controla el sorteo; cada jugador reserva una tabla.";
  }

  const curr=state.drawn.at(-1),cc=$("currentCard");
  cc.textContent=curr?`${curr.rank}${curr.suit}`:"?";cc.className="playing-card"+(curr?.red?" red":"");
  $("history").innerHTML=state.drawn.slice().reverse().slice(0,25).map(c=>`<div class="mini ${c.red?"red":""}">${c.rank}${c.suit}</div>`).join("");

  $("players").innerHTML=state.players.length?state.players.map(p=>`
    <div class="player ${p.connected?"":"off"}">
      <div class="player-main"><span class="avatar">${escapeHtml(p.avatar)}</span><span class="player-name">${escapeHtml(p.name)}</span></div>
      <span class="badge ${p.ready?"ready":""}">${!p.connected?"Reconectando…":p.tableIndex==null?"Sin tabla":p.ready?`✓ T${p.tableIndex+1}`:`T${p.tableIndex+1}`}</span>
    </div>`).join(""):`<div style="color:#9aabb4">Esperando jugadores…</div>`;

  const marked=new Set(state.drawn.map(c=>c.id)),winners=new Set(state.winners||[]);
  const myTable=me?.tableIndex??null;
  $("boards").innerHTML=state.boards.map((board,i)=>{
    const ownerToken=state.tableOwners[String(i)],owner=state.players.find(p=>p.token===ownerToken);
    const occupied=!!ownerToken,isMine=myTable===i;
    const clickable=!isHost&&!state.started&&(!occupied||isMine)&&!me?.ready;
    return `<div class="board ${occupied?"occupied":""} ${isMine?"mine":""} ${winners.has(i)?"winner":""} ${clickable?"clickable":""}" data-table="${i}">
      <div class="board-title"><span>TABLA ${i+1}</span><span class="owner">${owner?`${escapeHtml(owner.avatar)} ${escapeHtml(owner.name)}`:"Disponible"}</span></div>
      <div class="card-grid">${board.map(c=>`<div class="cell ${c.red?"red":""} ${marked.has(c.id)?"marked":""}"><span>${c.rank}${c.suit}</span></div>`).join("")}</div>
    </div>`;
  }).join("");

  if(!isHost)document.querySelectorAll(".board.clickable").forEach(el=>el.onclick=()=>socket.emit("claimTable",{tableIndex:Number(el.dataset.table)},r=>{if(!r?.ok)toast(r.error)}));

  const wb=$("winnerBanner");
  if(winners.size){
    const names=[...winners].map(i=>{
      const ot=state.tableOwners[String(i)],o=state.players.find(p=>p.token===ot);
      return o?`Tabla ${i+1} — ${o.avatar} ${o.name}`:`Tabla ${i+1}`;
    });
    wb.textContent=`🏆 BINGO: ${names.join(" · ")}`;wb.classList.remove("hidden");
  }else wb.classList.add("hidden");

  refreshInvite();
}

async function tryRestore(){
  const room=roomFromUrl();
  if(room){$("joinCode").value=room;$("roomHint").textContent=`Te invitaron a la sala ${room}`;$("roomHint").classList.remove("hidden")}
  const h=JSON.parse(localStorage.getItem("pokenoHost")||"null");
  if(h?.code && h?.hostToken && (!room||room===h.code)){
    return socket.emit("reconnectHost",h,res=>{
      if(!res?.ok)return;
      isHost=true;hostToken=h.hostToken;state=res.state;history.replaceState(null,"",`/?room=${state.code}`);enterGame();refreshInvite();render();
    });
  }
  const p=JSON.parse(localStorage.getItem("pokenoPlayer")||"null");
  if(p?.code&&p?.playerToken&&(!room||room===p.code)){
    socket.emit("reconnectPlayer",p,res=>{
      if(!res?.ok)return;
      isHost=false;myPlayerToken=p.playerToken;state=res.state;history.replaceState(null,"",`/?room=${state.code}`);enterGame();refreshInvite();render();
    });
  }
}
tryRestore();
