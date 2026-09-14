const socket=io(),$=id=>document.getElementById(id);const ranks=["A","2","3","4","5","6","7","8","9","10","J","Q","K"],suits=[{s:"♠",red:false},{s:"♥",red:true},{s:"♦",red:true},{s:"♣",red:false}],fullDeck=suits.flatMap(su=>ranks.map(rank=>({id:rank+su.s,rank,suit:su.s,red:su.red})));let state=null,isHost=false,isPhysical=false,isSpectator=false,myToken=null,spectatorToken=null,hostToken=null,qrData=null,physicalPile=[],physicalDrawn=[],busy=false,lastCountdownKey="",selectedBingoTable=null,lastClaimCount=0,lastGrantedCount=0;
function toast(x){const e=$("toast");e.textContent=x;e.classList.add("show");clearTimeout(window.tt);window.tt=setTimeout(()=>e.classList.remove("show"),2300)}
function beep(kind){
  const toggle=kind==="draw"?$("soundDraw"):kind==="claim"?$("soundClaim"):$("soundWin");
  if(toggle && !toggle.checked)return;
  try{
    const C=window.AudioContext||window.webkitAudioContext,a=new C(),o=a.createOscillator(),g=a.createGain();
    o.connect(g);g.connect(a.destination);o.frequency.value=kind==="draw"?520:kind==="claim"?720:880;g.gain.value=.06;o.start();
    setTimeout(()=>{o.stop();a.close()},kind==="win"?350:160);
  }catch{}
}function roomFromUrl(){return new URLSearchParams(location.search).get("room")?.toUpperCase()||""}function shuffle(a){a=[...a];for(let i=a.length-1;i>0;i--){const u=new Uint32Array(1);crypto.getRandomValues(u);const j=u[0]%(i+1);[a[i],a[j]]=[a[j],a[i]]}return a}
function configFromForm(){return {modes:[...document.querySelectorAll(".modeCheck:checked")].map(x=>x.value),markingPolicy:$("markingPolicy").value,autoWinnerDetection:$("autoWinnerDetection").checked,requireReady:$("requireReady").checked,countdown:+$("countdownSeconds").value,maxTables:+$("maxTables").value,roomPassword:$("roomPassword").value,autoplayInterval:+$("autoplayInterval").value,autoplayStopOnWinner:$("autoplayStopOnWinner").checked}}
function setUI(){document.querySelectorAll(".online").forEach(e=>e.classList.toggle("hidden",isPhysical));document.querySelectorAll(".physicalOnly").forEach(e=>e.classList.toggle("hidden",!isPhysical));document.querySelectorAll(".host").forEach(e=>e.classList.toggle("hidden",!isHost||isPhysical));document.querySelectorAll(".player").forEach(e=>e.classList.toggle("hidden",isHost||isPhysical||isSpectator));document.querySelectorAll(".spectator").forEach(e=>e.classList.toggle("hidden",!isSpectator));document.querySelectorAll(".caller").forEach(e=>e.classList.toggle("hidden",!(isHost||isPhysical)));$("callerView").classList.toggle("hidden",!(isHost||isPhysical));$("playerView").classList.toggle("hidden",isHost||isPhysical||isSpectator);$("spectatorView").classList.toggle("hidden",!isSpectator)}function enter(){$("landing").classList.add("hidden");$("game").classList.remove("hidden");setUI()}
function suitWord(s){return {"♦":"brillo","♠":"negro","♥":"rojo","♣":"trébol"}[s]}function rankWord(r){if(r==="A")return"as";if(["J","Q","K"].includes(r))return r;return r}function speakCard(c){if(!$("voiceToggle").checked||!("speechSynthesis"in window))return;speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(`${rankWord(c.rank)} de ${suitWord(c.suit)}`);u.lang="es-ES";u.rate=.9;speechSynthesis.speak(u)}function flashCard(c){if(!$("overlayToggle").checked)return;const e=$("overlayCard");e.textContent=c.rank+c.suit;e.className="overlay-card"+(c.red?" red":"");$("overlay").classList.remove("hidden");clearTimeout(window.ov);window.ov=setTimeout(()=>$("overlay").classList.add("hidden"),1800)}$("overlay").onclick=()=>$("overlay").classList.add("hidden");
function renderDeck(d){const hit=new Set(d.map(c=>c.id));$("deckGrid").innerHTML=fullDeck.map(c=>`<div class="deckcard ${c.red?"red":""} ${hit.has(c.id)?"drawn":""}">${c.rank}${c.suit}</div>`).join("")}function renderCaller(d){const c=d.at(-1),e=$("current");e.textContent=c?c.rank+c.suit:"?";e.className="bigcard"+(c?.red?" red":"");$("drawCount").textContent=`${d.length} / 52`;renderDeck(d)}function esc(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function modeName(k){return {first10:"10 primeras",line:"Línea",corners:"4 esquinas",full:"Tabla llena"}[k]}function ownerForTable(i){const tok=state.tableOwners[String(i)];return state.players.find(p=>p.token===tok)}function winnerNames(arr){return arr.map(i=>{const p=ownerForTable(i);return p?`T${i+1} — ${p.name}`:`T${i+1}`}).join(" · ")}
function showCountdown(){if(!state||state.status!=="countdown"||!state.countdownEndsAt){$("countdown").classList.add("hidden");return}const key=String(state.countdownEndsAt);if(key!==lastCountdownKey)lastCountdownKey=key;$("countdown").classList.remove("hidden");const tick=()=>{if(!state||state.status!=="countdown")return $("countdown").classList.add("hidden");const n=Math.max(1,Math.ceil((state.countdownEndsAt-Date.now())/1000));$("countdownNumber").textContent=n;if(Date.now()<state.countdownEndsAt)setTimeout(tick,150);else $("countdown").classList.add("hidden")};tick()}
function renderModes(){if(!state)return;$("modes").innerHTML=["first10","line","corners","full"].map(k=>{const on=state.config.modes.includes(k),w=state.winners[k]||[];return `<div class="modepill ${on?"":"off"}"><b>${modeName(k)}</b><span class="${w.length?"win":""}">${on?(w.length?winnerNames(w):"En juego"):"Desactivado"}</span></div>`}).join("")}
function marksForPlayerTable(p,ti){if(state.config.markingPolicy==="auto"||(state.config.markingPolicy==="choice"&&p.markingMode==="auto"))return new Set(state.drawn.map(c=>c.id));return new Set(p.manualMarks[String(ti)]||[])}
function boardHtml(board,ti,marks,cls="",manual=false,ownerText=""){return `<div class="board ${cls}" data-ti="${ti}"><div class="boardtop"><span>TABLA ${ti+1}</span><span>${ownerText}</span></div><div class="cards">${board.map(c=>`<div class="cell ${c.red?"red":""} ${marks.has(c.id)?"hit":""} ${manual?"manual":""}" data-card="${c.id}"><span>${c.rank}${c.suit}</span></div>`).join("")}</div></div>`}
function renderPlayer(){const me=state.players.find(p=>p.token===myToken);if(!me)return;const game=state.status==="playing"||state.status==="countdown";$("playerLobby").classList.toggle("hidden",game);$("playerGame").classList.toggle("hidden",!game);$("confirmBtn").classList.toggle("hidden",game);$("readyBtn").classList.toggle("hidden",game);$("confirmBtn").textContent=me.confirmed?"Desconfirmar tablas":"Confirmar tablas";$("readyBtn").textContent=me.ready?"✓ Estoy listo":"Estoy listo";$("readyBtn").disabled=!me.confirmed;
$("markModeBox").classList.toggle("hidden",state.config.markingPolicy!=="choice"||me.confirmed);$("playerMarkMode").value=me.markingMode;
if(!game){$("bingoClaimBar").innerHTML="";$("boards").innerHTML=state.boards.map((b,i)=>{const owner=ownerForTable(i),mine=me.tableIndices.includes(i),can=!owner||mine;return boardHtml(b,i,new Set(),`${mine?"mine ":""}${can&&!me.confirmed?"clickable":"unavailable"}`,owner?esc(owner.name):"Disponible")}).join("");document.querySelectorAll("#boards .board.clickable").forEach(e=>e.onclick=()=>socket.emit("toggleTable",{tableIndex:+e.dataset.ti},r=>{if(!r?.ok)toast(r.error)}))}
else{const manual=state.config.markingPolicy==="manual"||(state.config.markingPolicy==="choice"&&me.markingMode==="manual");renderBingoClaimBar(me);$("myBoards").innerHTML=me.tableIndices.map(ti=>boardHtml(state.boards[ti],ti,marksForPlayerTable(me,ti),"mine",manual,"Tu tabla")).join("");if(manual)document.querySelectorAll("#myBoards .cell.manual").forEach(e=>e.onclick=()=>{const board=e.closest(".board");socket.emit("manualMark",{tableIndex:+board.dataset.ti,cardId:e.dataset.card},r=>{if(!r?.ok)toast(r.error)})})}}

function renderBingoClaimBar(me){
  if(!me||state.status!=="playing"){ $("bingoClaimBar").innerHTML=""; return; }
  $("bingoClaimBar").innerHTML=me.tableIndices.map(ti=>
    `<button class="btn bingo-btn" data-ti="${ti}">BINGO · Tabla ${ti+1}</button>`
  ).join("");
  document.querySelectorAll("#bingoClaimBar .bingo-btn").forEach(btn=>{
    btn.onclick=()=>{
      selectedBingoTable=+btn.dataset.ti;
      const active=state.config.modes||[];
      $("bingoTypeOptions").innerHTML=active.map(mode=>`<button class="btn" data-mode="${mode}">${modeName(mode)}</button>`).join("");
      $("bingoTypeModal").classList.remove("hidden");
      document.querySelectorAll("#bingoTypeOptions button").forEach(b=>b.onclick=()=>{
        socket.emit("claimBingo",{tableIndex:selectedBingoTable,mode:b.dataset.mode},r=>{
          $("bingoTypeModal").classList.add("hidden");
          if(!r?.ok)return toast(r.error||"No se pudo solicitar BINGO.");
          if(r.valid)toast("Solicitud válida enviada al host.");
          else toast("BINGO rechazado: no cumple esa modalidad.");
        });
      });
    };
  });
}

function renderGrantedWinners(){
  if(!state)return;
  const granted=(state.winnerHistory||[]).filter(w=>w.type==="granted");
  const banner=$("grantedWinnerBanner");
  if(!granted.length){banner.classList.add("hidden");return;}

  // Group by mode so simultaneous/tied winners can appear together.
  const groups={};
  for(const w of granted){
    if(!groups[w.mode])groups[w.mode]=[];
    if(!groups[w.mode].some(x=>x.playerToken===w.playerToken&&x.tableIndex===w.tableIndex))groups[w.mode].push(w);
  }
  const lines=Object.entries(groups).map(([mode,items])=>{
    const names=[...new Set(items.map(x=>x.playerName||`Tabla ${x.tableIndex+1}`))];
    const who=names.length===1?names[0]:names.slice(0,-1).join(", ")+" y "+names[names.length-1];
    return `${who} ganó ${modeName(mode)}`;
  });
  banner.innerHTML=lines.join("<br>");
  banner.classList.remove("hidden");
}

function openClaimReview(pending){
  if(!pending.length)return;
  const names=[...new Set(pending.map(c=>c.playerName))];
  const title=names.length===1?`${names[0]} ha solicitado BINGO`:`${names.slice(0,-1).join(", ")} y ${names[names.length-1]} han solicitado BINGO`;
  $("claimReviewTitle").textContent=title;

  $("claimReviewContent").innerHTML=`<div class="claim-review-grid">${pending.map(c=>{
    const board=state.boards[c.tableIndex];
    const marks=new Set(c.markSnapshot||[]);
    const drawn=(c.drawnSnapshot||[]).map(id=>fullDeck.find(x=>x.id===id)).filter(Boolean);
    return `<div class="claim-review-item">
      <h3>${esc(c.playerName)} · Tabla ${c.tableIndex+1} · ${modeName(c.requestedMode)}</h3>
      <div class="cards review-table">${board.map(card=>`<div class="cell ${card.red?"red":""} ${marks.has(card.id)?"review-mark":""}"><span>${card.rank}${card.suit}</span></div>`).join("")}</div>
      <div class="review-drawn">${drawn.map(x=>`<div class="mini ${x.red?"red":""}">${x.rank}${x.suit}</div>`).join("")}</div>
      <div class="claim-actions">
        <button class="btn grant-btn" data-claim="${c.id}" data-action="grant">Conceder BINGO</button>
        <button class="btn reject-btn" data-claim="${c.id}" data-action="reject">Rechazar</button>
      </div>
    </div>`;
  }).join("")}</div>`;

  $("claimReviewModal").classList.remove("hidden");
  document.querySelectorAll("#claimReviewContent .claim-actions button").forEach(btn=>{
    btn.onclick=()=>socket.emit("resolveBingoClaim",{claimId:btn.dataset.claim,action:btn.dataset.action},r=>{
      if(!r?.ok)return toast(r.error||"No se pudo resolver.");
      toast(r.status==="granted"?"BINGO concedido.":"BINGO rechazado.");
    });
  });
}

function renderClaimsAndHistory(){
  if(!state)return;

  if(isHost){
    const claims=state.bingoClaims||[];
    const pending=claims.filter(c=>c.status==="pending");

    $("claims").innerHTML=claims.length?claims.slice().reverse().slice(0,20).map(c=>{
      let label="Solicitud pendiente",cls="pending";
      if(c.status==="invalid"){label="✕ BINGO inválido";cls="invalid"}
      if(c.status==="granted"){label="✓ BINGO concedido";cls="granted"}
      if(c.status==="rejected"){label="✕ BINGO rechazado";cls="rejected"}
      return `<div class="claim-item ${cls}">
        <b>${label} · ${esc(c.playerName||"Jugador")} · T${c.tableIndex+1}</b>
        <div>${modeName(c.requestedMode)}</div>
        <div class="claim-meta">Carta #${c.drawNumber}</div>
      </div>`;
    }).join(""):`<div class="muted">Sin solicitudes.</div>`;

    if(pending.length){
      $("claimReviewModal").classList.remove("hidden");
      openClaimReview(pending);
    }else{
      $("claimReviewModal").classList.add("hidden");
    }

    const wh=state.winnerHistory||[];
    $("winnerHistory").innerHTML=wh.length?wh.slice().reverse().map(w=>
      `<div class="winner-item"><b>${esc(w.modeLabel)} · T${w.tableIndex+1}${w.playerName?` — ${esc(w.playerName)}`:""}</b><div class="claim-meta">Concedido por el host · Carta #${w.drawNumber}</div></div>`
    ).join(""):`<div class="muted">Aún no hay BINGOS concedidos.</div>`;
  }
  renderGrantedWinners();
}

function renderTableProgress(){
  if(!isHost||!state)return;
  const rows=[];
  for(const p of state.players){
    for(const ti of p.tableIndices){
      const pr=p.progress?.[String(ti)]||{line:0,corners:0,full:0,first10:0};
      rows.push(`<div class="progress-card"><b>${esc(p.name)} · T${ti+1}${p.unstableUntil>Date.now()?' · <span class="connection-bad">Conexión inestable</span>':''}</b><div class="progress-row"><span class="progress-chip">10: ${pr.first10}</span><span class="progress-chip">Línea: ${pr.line}/5</span><span class="progress-chip">Esq: ${pr.corners}/4</span><span class="progress-chip">Full: ${pr.full}/25</span></div></div>`);
    }
  }
  $("tableProgress").innerHTML=rows.length?rows.join(""):`<div class="muted">Sin tablas asignadas.</div>`;
}

function renderFullscreenViewer(){
  if(!state)return;
  const c=state.drawn.at(-1),e=$("fsCurrent");
  e.textContent=c?`${c.rank}${c.suit}`:"?";
  e.className="overlay-card"+(c?.red?" red":"");
  const hit=new Set(state.drawn.map(c=>c.id));
  $("fsDeck").innerHTML=fullDeck.map(c=>`<div class="deckcard ${c.red?"red":""} ${hit.has(c.id)?"drawn":""}">${c.rank}${c.suit}</div>`).join("");
}

function renderOnline(){if(!state)return;$("roomLine").innerHTML=`Sala <b>${state.code}</b> · ${isHost?"Host":isSpectator?"Espectador":"Jugador"}`;$("codeStat").textContent=state.code;$("offline").classList.toggle("hidden",state.hostConnected);$("playersCount").textContent=state.players.length;$("status").textContent={lobby:"Sala de espera",countdown:"Iniciando…",playing:"Partida en curso"}[state.status]||state.status;renderCaller(state.drawn);renderModes();showCountdown();
const cats=state.config.modes.map(k=>[modeName(k),state.winners[k]||[]]).filter(x=>x[1].length);
if(isHost&&cats.length&&state.config.autoWinnerDetection){
  $("winner").innerHTML="<b>Posibles BINGOS detectados:</b><br>"+cats.map(x=>`${x[0]}: ${winnerNames(x[1])}`).join("<br>");
  $("winner").classList.remove("hidden");
}else $("winner").classList.add("hidden");
$("history").innerHTML=state.drawn.slice().reverse().slice(0,25).map(c=>`<div class="mini ${c.red?"red":""}">${c.rank}${c.suit}</div>`).join("");$("players").innerHTML=state.players.map(p=>`<div class="p ${p.connected?"":"off"}"><span>${p.avatar} ${esc(p.name)}${p.unstableUntil>Date.now()?' <span class="connection-bad">⚠</span>':''}</span><span>${p.tableIndices.length?p.tableIndices.map(i=>"T"+(i+1)).join(", "):"Sin tabla"} · <span class="${p.confirmed?"status-confirmed":"status-waiting"}">${p.confirmed?"Confirmado":"Sin confirmar"}</span>${p.ready?" ✓":""}${isHost?` <button class="btn kick-btn" data-token="${p.token}" data-role="player">Expulsar</button>`:""}</span></div>`).join("");
$("spectators").innerHTML=(state.spectators||[]).length?(state.spectators||[]).map(s=>`<div class="p ${s.connected?"":"off"}"><span>${s.avatar} ${esc(s.name)}${s.unstableUntil>Date.now()?' <span class="connection-bad">⚠</span>':''}</span><span>Espectador${isHost?` <button class="btn kick-btn" data-token="${s.token}" data-role="spectator">Expulsar</button>`:""}</span></div>`).join(""):`<div class="muted">Sin espectadores.</div>`;
if(isHost)document.querySelectorAll(".kick-btn").forEach(b=>b.onclick=()=>{if(confirm("¿Expulsar a esta persona?"))socket.emit("kickParticipant",{token:b.dataset.token,role:b.dataset.role},r=>{if(!r?.ok)toast(r.error)})});
$("autoplayBtn").textContent=state.autoplayRunning?"Pausar autoplay":"Iniciar autoplay";
if(!isHost&&!isSpectator)renderPlayer();renderClaimsAndHistory();renderTableProgress();renderFullscreenViewer();
$("pauseBtn").textContent=state.paused?"Reanudar":"Pausar";
$("liveSpeed").value=String(state.autoplayIntervalCurrent||state.config.autoplayInterval);
}
function onNew(c){if(isHost||isPhysical){beep("draw");speakCard(c);flashCard(c)}}function updateInvite(qr){if(qr)qrData=qr;if(!state)return;$("qr").src=qrData||"";$("modalQr").src=qrData||"";$("codeBig").textContent=state.code;$("modalCode").textContent=state.code}
$("createBtn").onclick=()=>{const config=configFromForm();if(!config.modes.length)return toast("Elige al menos una modalidad.");socket.emit("createSession",{hostName:$("hostName").value.trim()||"Host",config,origin:location.origin},r=>{if(!r?.ok)return toast(r?.error||"Error");isHost=true;isPhysical=false;isSpectator=false;hostToken=r.hostToken;state=r.state;history.replaceState(null,"",`/?room=${state.code}`);updateInvite(r.qrDataUrl);enter();renderOnline()})};
$("newSessionBtn").onclick=()=>{if(!confirm("¿Crear una NUEVA SESIÓN? Se cerrará esta sala para todos, se perderá la ronda actual y se generará otro código."))return;socket.emit("createNewSession",{config:state.config,origin:location.origin},r=>{if(!r?.ok)return toast(r.error);hostToken=r.hostToken;state=r.state;history.replaceState(null,"",`/?room=${state.code}`);updateInvite(r.qrDataUrl);renderOnline();toast("Nueva sesión creada.")})};
$("joinBtn").onclick=()=>socket.emit("joinSession",{code:$("joinCode").value.trim().toUpperCase(),name:$("playerName").value.trim()||($("joinRole").value==="spectator"?"Espectador":"Jugador"),avatar:$("avatar").value,password:$("joinPassword").value,role:$("joinRole").value},r=>{if(!r?.ok)return toast(r?.error||"Error");isHost=false;isPhysical=false;isSpectator=r.role==="spectator";state=r.state;if(isSpectator){spectatorToken=r.spectatorToken;localStorage.setItem("pokenoSpectator",JSON.stringify({code:state.code,spectatorToken}))}else{myToken=r.playerToken;localStorage.setItem("pokenoPlayer",JSON.stringify({code:state.code,playerToken:myToken}))}history.replaceState(null,"",`/?room=${state.code}`);enter();renderOnline()});
$("physicalBtn").onclick=()=>{isPhysical=true;isHost=false;isSpectator=false;physicalPile=shuffle(fullDeck);physicalDrawn=[];$("roomLine").textContent="Modo tablas físicas";enter();$("status").textContent="Cantador independiente";renderCaller([])};$("exitPhysical").onclick=()=>location.href="/";
$("confirmBtn").onclick=()=>socket.emit("confirmTables",{},r=>{if(!r?.ok)toast(r.error)});$("readyBtn").onclick=()=>socket.emit("toggleReady",{},r=>{if(!r?.ok)toast(r.error)});$("playerMarkMode").onchange=e=>socket.emit("setMarkingMode",{mode:e.target.value},r=>{if(!r?.ok)toast(r.error)});
$("startBtn").onclick=()=>socket.emit("startGame",{},r=>{if(!r?.ok)toast(r.error)});$("liveSpeed").onchange=e=>socket.emit("setAutoplayInterval",{seconds:+e.target.value},r=>{if(!r?.ok)toast(r.error)});
$("pauseBtn").onclick=()=>socket.emit("togglePause",{},r=>{if(!r?.ok)toast(r.error)});
$("autoplayBtn").onclick=()=>socket.emit(state?.autoplayRunning?"stopAutoplay":"startAutoplay",{},r=>{if(!r?.ok)toast(r.error)});$("drawBtn").onclick=()=>{if(isPhysical){if(!physicalPile.length)return toast("Ya salieron las 52 cartas.");const c=physicalPile.shift();physicalDrawn.push(c);renderCaller(physicalDrawn);onNew(c);return}if(busy)return;busy=true;socket.emit("drawCard",{},r=>{busy=false;if(!r?.ok)toast(r.error)})};$("undoBtn").onclick=()=>{if(isPhysical){if(!physicalDrawn.length)return;physicalPile.unshift(physicalDrawn.pop());renderCaller(physicalDrawn);return}if(busy)return;busy=true;socket.emit("undoDraw",{},r=>{busy=false;if(!r?.ok)toast(r.error)})};$("resetBtn").onclick=()=>{if(!confirm("¿NUEVA RONDA? Se conservarán jugadores y tablas, pero se borrarán cartas sorteadas, marcas, BINGOS y reclamos de esta ronda."))return;socket.emit("resetRound",{},r=>{if(!r?.ok)toast(r.error)})};
socket.on("state",s=>{
  const oldCard=state?.drawn?.at(-1)?.id,neu=s.drawn.at(-1)?.id;
  const newClaims=(s.bingoClaims||[]).filter(c=>c.status==="pending").length;
  const newGranted=(s.winnerHistory||[]).length;
  state=s;
  if(isHost&&neu&&neu!==oldCard)onNew(s.drawn.at(-1));
  if(isHost&&newClaims>lastClaimCount)beep("claim");
  if(newGranted>lastGrantedCount)beep("win");
  lastClaimCount=newClaims;lastGrantedCount=newGranted;
  renderOnline();
});socket.on("kicked",()=>{localStorage.removeItem("pokenoPlayer");localStorage.removeItem("pokenoSpectator");alert("El host te expulsó de la sesión.");location.href="/"});socket.on("sessionClosed",()=>{localStorage.removeItem("pokenoHost");localStorage.removeItem("pokenoPlayer");localStorage.removeItem("pokenoSpectator");alert("La sala terminó.");location.href="/"});socket.on("sessionReplaced",()=>{if(!isHost){localStorage.removeItem("pokenoPlayer");localStorage.removeItem("pokenoSpectator");alert("El host creó una nueva sesión.");location.href="/"}});
$("closeRoomBtn").onclick=()=>{if(!confirm("¿Cerrar la sala para todos? Esta acción termina la sesión."))return;socket.emit("closeRoom",{},r=>{if(!r?.ok)toast(r.error);else location.href="/"})};
$("closeBingoType").onclick=()=>$("bingoTypeModal").classList.add("hidden");
$("closeClaimReview").onclick=()=>$("claimReviewModal").classList.add("hidden");
$("fullscreenBtn").onclick=async()=>{$("fullscreenViewer").classList.remove("hidden");renderFullscreenViewer();try{await $("fullscreenViewer").requestFullscreen?.()}catch{}};
$("exitFullscreenBtn").onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen()}catch{}$("fullscreenViewer").classList.add("hidden")};
$("inviteBtn").onclick=()=>$("inviteModal").classList.remove("hidden");$("closeModal").onclick=()=>$("inviteModal").classList.add("hidden");$("copyBtn").onclick=async()=>{await navigator.clipboard.writeText(`${location.origin}/?room=${state.code}`);toast("Enlace copiado.")};$("shareBtn").onclick=async()=>{const url=`${location.origin}/?room=${state.code}`;if(navigator.share)await navigator.share({title:"POKENO",text:`Únete a la sala ${state.code}`,url});else navigator.clipboard.writeText(url)};
(async()=>{
  // A host refresh intentionally ends the old session. Never restore host authority from localStorage.
  localStorage.removeItem("pokenoHost");

  const room=roomFromUrl();
  if(room){
    $("joinCode").value=room;
    $("roomHint").textContent=`Te invitaron a la sala ${room}`;
    $("roomHint").classList.remove("hidden");
  }

  const p=JSON.parse(localStorage.getItem("pokenoPlayer")||"null");
  if(p?.code&&p?.playerToken&&(!room||room===p.code))
    socket.emit("reconnectPlayer",p,r=>{
      if(r?.ok){isHost=false;isSpectator=false;myToken=p.playerToken;state=r.state;enter();renderOnline()}
      else localStorage.removeItem("pokenoPlayer");
    });

  const sp=JSON.parse(localStorage.getItem("pokenoSpectator")||"null");
  if(sp?.code&&sp?.spectatorToken&&(!room||room===sp.code))
    socket.emit("reconnectSpectator",sp,r=>{
      if(r?.ok){isHost=false;isSpectator=true;spectatorToken=sp.spectatorToken;state=r.state;enter();renderOnline()}
      else localStorage.removeItem("pokenoSpectator");
    });
})();