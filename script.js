let QUESTIONS=[];
let questionsReady=false;
async function loadQuestions(){
  // O banco principal fica dentro do próprio HTML. Assim o jogo funciona
  // mesmo sem questions.json ou conexão com o servidor.
  try{
    const embedded = Array.isArray(window.BQB_QUESTIONS) ? window.BQB_QUESTIONS : [];
    if(embedded.length >= 1){
      QUESTIONS = embedded.map(normalizeQuestion).filter(Boolean);
    }

    // Se houver questions.json, usamos apenas perguntas válidas dele também.
    try{
      const base = typeof serverBase === 'function' ? serverBase() : '';
      const url = (base && base !== 'null') ? base + '/questions.json' : 'questions.json';
      const r = await fetch(url,{cache:'no-store'});
      if(r.ok){
        const data = await r.json();
        if(Array.isArray(data)){
          const external = data.map(normalizeQuestion).filter(Boolean);
          if(external.length > QUESTIONS.length) QUESTIONS = external;
        }
      }
    }catch(e){ console.warn('questions.json opcional:',e); }

    QUESTIONS = dedupeQuestions(QUESTIONS);
    if(!QUESTIONS.length) throw new Error('Nenhuma pergunta válida encontrada.');
    questionsReady = true;
    const el=document.getElementById('questionCount');
    if(el) el.textContent=QUESTIONS.length+' perguntas';
  }catch(e){
    console.error(e);
    questionsReady=false;
    const el=document.getElementById('questionCount');
    if(el) el.textContent='Erro no banco de perguntas';
  }
}

function normalizeQuestion(q){
  if(!Array.isArray(q) || typeof q[0] !== 'string') return null;
  const question=q[0].trim();
  const options=Array.isArray(q[1]) ? q[1].map(x=>String(x).trim()).filter(Boolean) : [];
  let correct=q[2];
  if(typeof correct==='number') correct=options[correct];
  correct=String(correct ?? '').trim();
  const ref=String(q[3] ?? 'Referência bíblica').trim();
  const cat=String(q[4] ?? 'Geral').trim();
  if(!question || options.length < 4 || !correct) return null;
  const four=[...new Set(options)];
  if(four.length < 4 || !four.includes(correct)) return null;
  return [question,four.slice(0,4),correct,ref,cat];
}

function dedupeQuestions(list){
  const seen=new Set(), out=[];
  for(const q of list){
    const key=(q[0]+'|'+q[3]).toLowerCase();
    if(!seen.has(key)){seen.add(key);out.push(q);}
  }
  return out;
}
function dedupeQuestions(list){
  const seen=new Set(),out=[];
  for(const q of list||[]){const k=qKey(q);if(!seen.has(k)){seen.add(k);out.push(q)}}
  return out;
}

/* ===== ONLINE + NÃO REPETIÇÃO + PIX ===== */
const USED_KEY='bqb_used_questions_v2';
let onlineSocket=null, onlineRoom=null, onlinePlayerId=null, pixPaymentId=null, pixPoll=null;
function qKey(q){return q[0]+'|'+q[3]+'|'+q[4]}
function getUsed(){try{return JSON.parse(localStorage.getItem(USED_KEY)||'[]')}catch(e){return []}}
function saveUsed(a){localStorage.setItem(USED_KEY,JSON.stringify(a))}
function shuffleArray(a){for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
function takeFreshQuestions(pool,n){
  pool=dedupeQuestions(pool);
  let used=new Set(getUsed());
  let fresh=pool.filter(q=>!used.has(qKey(q)));
  // Nunca repete enquanto ainda houver perguntas não usadas. Só reinicia depois que o banco inteiro foi consumido.
  if(fresh.length<n){
    const poolKeys=new Set(pool.map(q=>qKey(q)));
    used=new Set([...used].filter(k=>!poolKeys.has(k)));
    fresh=pool.filter(q=>!used.has(qKey(q)));
  }
  shuffleArray(fresh);
  const pick=fresh.slice(0,n);
  saveUsed([...used,...pick.map(q=>qKey(q))]);
  return pick;
}
// Never repeat a question for this player until the available bank is exhausted.
function startGame(){
  if(!questionsReady)return alert('Aguarde o banco de 500 perguntas carregar.');
  const map={geral:null,antigo:'Antigo Testamento',novo:'Novo Testamento',jesus:'Jesus',apostolos:'Apóstolos',profetas:'Profetas',reis:'Reis',salmos:'Salmos',parabolas:'Parábolas'};
  let p=map[state.category]?QUESTIONS.filter(q=>q[4]===map[state.category]):QUESTIONS.slice();
  if(p.length<10)p=QUESTIONS.slice();
  state.daily=false;
  state.pool=takeFreshQuestions(p,Math.min(10,p.length));
  state.index=0;state.score=0;state.correct=0;state.wrong=0;state.answered=false;
  show('game');renderQuestion();tone(520);
}

function todayKey(){
  const d=new Date();
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}
function dailyStorageKey(){
  return 'bqb_daily_'+String(user?.email||user?.id||'player').toLowerCase();
}
function getDailyData(){
  try{
    const d=JSON.parse(localStorage.getItem(dailyStorageKey())||'null');
    return d&&typeof d==='object'?d:null;
  }catch(e){return null}
}
function refreshDailyStatus(){
  const status=document.getElementById('dailyStatus');
  const btn=document.getElementById('dailyStartBtn');
  if(!status||!btn)return;
  const d=getDailyData();
  if(d&&d.date===todayKey()&&d.completed){
    status.textContent='✅ Você já concluiu o desafio de hoje. Volte amanhã para novas 10 perguntas.';
    btn.disabled=true;
    btn.textContent='✅ DESAFIO CONCLUÍDO HOJE';
  }else{
    status.textContent='🔥 Desafio de hoje disponível — 10 perguntas.';
    btn.disabled=false;
    btn.textContent='🔥 COMEÇAR DESAFIO';
  }
}
function startDailyChallenge(){
  if(!user)return show('auth');
  if(!questionsReady)return alert('Aguarde o banco de perguntas carregar.');
  const d=getDailyData();
  if(d&&d.date===todayKey()&&d.completed){
    refreshDailyStatus();
    return alert('Você já concluiu o Desafio Diário de hoje. Novas perguntas estarão disponíveis amanhã.');
  }
  state.daily=true;
  state.pool=takeFreshQuestions(QUESTIONS,10);
  if(state.pool.length!==10)return alert('Não foi possível montar as 10 perguntas.');
  state.index=0;state.score=0;state.correct=0;state.wrong=0;state.answered=false;
  state.dailyStartCoins=Number(user.coins||0);
  show('game');renderQuestion();tone(620);
}

function selectRoomSize(n){window.roomSize=n; if(n===2){document.getElementById('selectedSize').innerHTML='👥 2 JOGADORES<br><small>GRÁTIS</small>';show('rooms');tone(650);return} if(user && user.extraPlayersUnlocked){document.getElementById('selectedSize').innerHTML='👥 '+n+' JOGADORES<br><small>DESBLOQUEADO</small>';show('rooms');tone(650);return} openPix(n)}
function lockedRoom(n){selectRoomSize(n)}
function openPix(n){window.pendingRoomSize=n;document.getElementById('pixModal').classList.remove('hidden');document.getElementById('pixBox').classList.remove('hidden');document.getElementById('pixResult').classList.add('hidden');document.getElementById('pixStatus').textContent='Aguardando confirmação…'}
function closePix(){document.getElementById('pixModal').classList.add('hidden');if(pixPoll)clearInterval(pixPoll)}
async function createPixPayment(){
  try{let r=await fetch(serverBase()+'/api/pix/create',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({playerId:user.id,username:user.username})});let d=await r.json();if(!r.ok)throw new Error(d.error||'Não foi possível gerar o Pix.');pixPaymentId=d.paymentId;document.getElementById('pixCopy').textContent=d.qrCode||d.qrCodeBase64||'Pix gerado. Abra seu banco para pagar.';document.getElementById('pixBox').classList.add('hidden');document.getElementById('pixResult').classList.remove('hidden');pixPoll=setInterval(checkPixStatus,5000);tone(760)}catch(e){alert(e.message)}}
async function checkPixStatus(){if(!pixPaymentId)return;try{let r=await fetch(serverBase()+'/api/pix/status/'+encodeURIComponent(pixPaymentId)+'?playerId='+encodeURIComponent(user.id));let d=await r.json();document.getElementById('pixStatus').textContent='Status: '+(d.status||'pending');if(d.approved){user.extraPlayersUnlocked=true;save();refresh();document.getElementById('pixStatus').textContent='✅ Pagamento confirmado! 3–6 jogadores desbloqueados.';if(pixPoll)clearInterval(pixPoll);tone(900)}}catch(e){}}
function copyPix(){navigator.clipboard?.writeText(document.getElementById('pixCopy').textContent);alert('Código Pix copiado.');}
function serverBase(){
  const configured=(window.BQB_SERVER_URL||localStorage.getItem('bqb_server_url')||'').trim();
  if(configured)return configured.replace(/\/$/,'');
  if(location.protocol==='http:'||location.protocol==='https:')return location.origin;
  return '';
}
function wsUrl(){
  const b=serverBase();
  if(!b)return '';
  try{
    const u=new URL(b);
    u.protocol=u.protocol==='https:'?'wss:':'ws:';
    u.pathname='/ws';
    u.search='';
    u.hash='';
    return u.toString().replace(/\/$/,'');
  }catch(e){return '';}
}
const rtcConfig={iceServers:[{urls:'stun:stun.l.google.com:19302'},{urls:'stun:stun.cloudflare.com:3478'}]};
async function toggleMic(){
  if(audioEnabled){closePeer();updateAudioUI(false,'Áudio desligado.');return;}
  try{
    localAudioStream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
    audioEnabled=true;updateAudioUI(true,'🎙️ Microfone ligado. Conectando ao adversário…');
    await ensurePeer();
    const players=onlineRoom?.players||[];
    if(players.length===2 && players[0]?.id===onlinePlayerId){
      const offer=await peerConnection.createOffer();await peerConnection.setLocalDescription(offer);sendRtc({type:'offer',sdp:offer});
    }else if(players.length===2){
      sendRtc({type:'hello'});
    }
  }catch(e){audioEnabled=false;alert('Não foi possível acessar o microfone. Verifique a permissão do navegador.');}
}
function updateAudioUI(on,msg){
  ['roomMic','battleMic'].forEach(id=>{const b=document.getElementById(id);if(b){b.textContent=on?'🔴 DESLIGAR ÁUDIO':'🎙️ ATIVAR ÁUDIO';b.classList.toggle('mic-on',on)}});
  ['roomAudioState','audioState'].forEach(id=>{const x=document.getElementById(id);if(x)x.textContent=msg||''});
}
async function ensurePeer(){
  if(peerConnection)return peerConnection;
  peerConnection=new RTCPeerConnection(rtcConfig);
  localAudioStream?.getTracks().forEach(t=>peerConnection.addTrack(t,localAudioStream));
  peerConnection.onicecandidate=e=>{if(e.candidate)sendRtc({type:'ice',candidate:e.candidate});};
  peerConnection.ontrack=e=>{const a=document.getElementById('remoteAudio');if(a){a.srcObject=e.streams[0];a.play?.().catch(()=>{});}};
  peerConnection.onconnectionstatechange=()=>{if(['connected'].includes(peerConnection.connectionState))updateAudioUI(true,'🟢 Áudio conectado ao adversário.');};
  return peerConnection;
}
function sendRtc(data){if(onlineSocket?.readyState===1)onlineSocket.send(JSON.stringify({type:'rtc_signal',data}));}
async function handleRtcSignal(data){
  if(!data)return;
  if(!audioEnabled && data.type==='offer'){
    try{localAudioStream=await navigator.mediaDevices.getUserMedia({audio:true});audioEnabled=true;updateAudioUI(true,'🎙️ Microfone ligado.');}catch(e){return;}
  }
  await ensurePeer();
  if(data.type==='hello'){
    const players=onlineRoom?.players||[];
    if(players[0]?.id===onlinePlayerId && audioEnabled){
      const offer=await peerConnection.createOffer();await peerConnection.setLocalDescription(offer);sendRtc({type:'offer',sdp:offer});
    }
    return;
  }
  if(data.type==='offer'){
    await peerConnection.setRemoteDescription(data.sdp);
    const answer=await peerConnection.createAnswer();await peerConnection.setLocalDescription(answer);sendRtc({type:'answer',sdp:answer});
  }else if(data.type==='answer'){
    await peerConnection.setRemoteDescription(data.sdp);
  }else if(data.type==='ice'&&data.candidate){
    try{await peerConnection.addIceCandidate(data.candidate)}catch(e){}
  }
}
function closePeer(){
  try{peerConnection?.close()}catch(e){}
  peerConnection=null;
  localAudioStream?.getTracks().forEach(t=>t.stop());
  localAudioStream=null;audioEnabled=false;updateAudioUI(false,'Áudio desligado.');
}

function connectRoomSocket(code,playerId,name){
  const base=wsUrl();
  if(!base){alert('Servidor online não configurado. Publique esta pasta no Render ou configure BQB_SERVER_URL.');return false;}
  if(onlineSocket)onlineSocket.close();
  onlinePlayerId=playerId;
  onlineSocket=new WebSocket(base+'?code='+encodeURIComponent(code)+'&playerId='+encodeURIComponent(playerId)+'&name='+encodeURIComponent(name));
  onlineSocket.onopen=()=>{document.getElementById('roomMsg').textContent='🟢 Conectado ao servidor. Compartilhe o código com o outro jogador.'};
  onlineSocket.onmessage=e=>{try{handleRoomMessage(JSON.parse(e.data))}catch(err){console.error(err)}};
  onlineSocket.onclose=()=>{if(onlineRoom)document.getElementById('roomMsg').textContent='🔴 Conexão encerrada.'};
  onlineSocket.onerror=()=>{document.getElementById('roomMsg').textContent='🔴 Não foi possível conectar ao servidor online.'};
  return true;
}

function handleRoomMessage(m){
 if(m.type==='room_state'){
   onlineRoom=m;
   renderOnlinePlayers(m.players);
   const readyCount=(m.players||[]).filter(p=>p.ready).length;
   if(m.players.length===2){
     document.getElementById('roomMsg').textContent =
       readyCount===2 ? '🟡 Preparando a batalha...' :
       '🟢 2 jogadores conectados. Os dois devem tocar em ESTOU PRONTO.';
   }
   return;
 }
 if(m.type==='room_error'){alert(m.message||'Erro na sala.');return}
 if(m.type==='rtc_signal'){handleRtcSignal(m.data).catch(()=>{});return}

 if(m.type==='battle_start'){
   // The server sends the complete questions, so the browser does not depend
   // on matching indexes with its local bank.
   battle={
     running:true, online:true, idx:0, me:0, bot:0,
     pool:Array.isArray(m.questions)?m.questions:[],
     answered:false
   };
   show('battle');
   document.getElementById('battleStart').classList.add('hidden');
   renderBattle();
   return;
 }

 if(m.type==='answer_result'){
   if(!battle || !battle.online) return;
   const myScore=(m.scores&&m.scores[onlinePlayerId])||0;
   document.getElementById('battleMe').textContent=myScore;
   const other=Object.keys(m.scores||{}).find(k=>k!==onlinePlayerId);
   document.getElementById('battleBot').textContent=other?(m.scores[other]||0):0;

   const fb=document.getElementById('battleFeedback');
   fb.className='feedback '+(m.correct?'ok':'bad');
   fb.textContent=m.correct?'✅ Você acertou! +10 pontos':'❌ Você errou!';

   document.querySelectorAll('#battleOptions .option').forEach((b,i)=>{
     b.disabled=true;
     if(typeof m.correctIndex==='number' && i===m.correctIndex)b.classList.add('correct');
     if(typeof m.selectedIndex==='number' && i===m.selectedIndex && !m.correct)b.classList.add('wrong');
   });
   battle.answered=true;
   tone(m.correct?900:180);

   if(m.allAnswered){
     fb.textContent += ' ⏳ Próxima pergunta...';
   }else{
     fb.textContent += ' ⏳ Aguardando o adversário...';
   }
   return;
 }

 if(m.type==='next_question'){
   if(!battle) return;
   battle.idx=Number(m.index)||0;
   battle.answered=false;
   renderBattle();
   return;
 }

 if(m.type==='battle_end'){
   if(!battle) return;
   battle.running=false;
   const scores=m.scores||{};
   const my=Number(scores[onlinePlayerId]||0);
   const other=Object.keys(scores).find(k=>k!==onlinePlayerId);
   const op=other?Number(scores[other]||0):0;
   document.getElementById('battleMe').textContent=my;
   document.getElementById('battleBot').textContent=op;
   document.getElementById('battleQuestion').textContent=
     m.winner===onlinePlayerId?'🏆 VOCÊ VENCEU!':
     m.winner?'😔 VOCÊ PERDEU':'🤝 EMPATE!';
   document.getElementById('battleOptions').innerHTML='';
   document.getElementById('battleFeedback').className='feedback ok';
   document.getElementById('battleFeedback').textContent='Batalha encerrada.';
   document.getElementById('battleStart').classList.remove('hidden');
   document.getElementById('battleStart').textContent='⚔️ NOVA BATALHA';
   return;
 }
}

function renderOnlinePlayers(players){
  const list=Array.isArray(players)?players:[];
  document.getElementById('livePlayers').innerHTML=list.map(p=>
    '<b>👤 '+escapeHtml(p.name)+'<br>'+Number(p.score||0)+' pts'+
    (p.ready?' • ✅ Pronto':' • ⏳ Aguardando')+'</b>'
  ).join('');
  const me=list.find(p=>p.id===onlinePlayerId);
  const other=list.find(p=>p.id!==onlinePlayerId);
  if(me)document.getElementById('battleMeName').textContent=me.name;
  if(other)document.getElementById('battleBotName').textContent=other.name;
}

function sendReady(){
  if(!onlineSocket||onlineSocket.readyState!==1){
    return alert('Você ainda não está conectado à sala.');
  }
  onlineSocket.send(JSON.stringify({type:'ready'}));
}

async function createBattleRoom(){
  const size=window.roomSize||2;
  if(size!==2)return alert('A Batalha Bíblica está configurada para 1×1.');
  if(!serverBase())return alert('Servidor online não configurado.');

  try{
    const name=document.getElementById('roomName')?.value.trim()||'Sala Bíblica';
    const r=await fetch(serverBase()+'/api/rooms/create',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({name,maxPlayers:2,playerId:user.id,username:user.name})
    });
    const d=await r.json();
    if(!r.ok)throw new Error(d.error||'Não foi possível criar a sala.');

    const c=d.code;
    window.currentRoomCode=c;
    document.getElementById('roomCreateCard').classList.add('hidden');
    document.getElementById('roomLive').classList.remove('hidden');
    document.getElementById('liveCode').textContent=c;
    document.getElementById('roomMsg').textContent='🟢 Sala criada. Compartilhe o código de 6 caracteres.';
    document.getElementById('livePlayers').innerHTML=
      '<b>👤 '+escapeHtml(user.name)+'<br>0 pts • ⏳ Aguardando</b>';

    if(!connectRoomSocket(c,user.id,user.name)){
      document.getElementById('roomLive').classList.add('hidden');
      document.getElementById('roomCreateCard').classList.remove('hidden');
      return;
    }
    tone(760);
  }catch(e){alert(e.message||'Erro ao criar sala.')}
}

function copyRoomCode(){
  const c=document.getElementById('liveCode')?.textContent||'';
  if(navigator.clipboard)navigator.clipboard.writeText(c).catch(()=>{});
  tone(700);
  alert('Código da sala copiado!');
}

function joinRoom(){
  const c=document.getElementById('roomCode').value.trim().toUpperCase();
  if(c.length!==6)return alert('Digite o código de 6 caracteres.');
  if(!serverBase())return alert('Servidor online não configurado.');

  window.currentRoomCode=c;
  document.getElementById('roomCreateCard').classList.add('hidden');
  document.getElementById('roomLive').classList.remove('hidden');
  document.getElementById('liveCode').textContent=c;
  document.getElementById('roomMsg').textContent='🟡 Conectando à sala...';

  if(!connectRoomSocket(c,user.id,user.name)){
    document.getElementById('roomLive').classList.add('hidden');
    document.getElementById('roomCreateCard').classList.remove('hidden');
    return;
  }
  tone(700);
}

function startBattle(){
  if(battle&&battle.online){
    sendReady();
    return;
  }
  // Local/offline 1×1 remains available when there is no online room.
  battle={running:true,online:false,idx:0,me:0,bot:0,pool:takeFreshQuestions(QUESTIONS,5),answered:false};
  document.getElementById('battleStart').textContent='⚔️ BATALHA EM ANDAMENTO';
  renderBattle();
}

function renderBattle(){
  if(!battle)return;

  if(battle.online){
    const q=battle.pool[battle.idx];
    if(!q){
      document.getElementById('battleQuestion').textContent='⏳ Aguardando o servidor...';
      return;
    }
    document.getElementById('battleMe').textContent=battle.me||0;
    document.getElementById('battleQuestion').textContent=String(q[0]||'');
    document.getElementById('battleFeedback').className='feedback hidden';
    document.getElementById('battleFeedback').textContent='';
    const box=document.getElementById('battleOptions');
    box.innerHTML='';
    (q[1]||[]).slice(0,4).forEach((a,i)=>{
      const b=document.createElement('button');
      b.className='option';
      b.textContent=String.fromCharCode(65+i)+') '+a;
      b.onclick=()=>onlineAnswer(i);
      box.appendChild(b);
    });
    return;
  }

  document.getElementById('battleMe').textContent=battle.me;
  document.getElementById('battleBot').textContent=battle.bot;
  const q=battle.pool[battle.idx];
  if(!q){
    const r=battle.me>battle.bot?'🏆 VOCÊ VENCEU!':battle.me<battle.bot?'😔 VOCÊ PERDEU':'🤝 EMPATE!';
    document.getElementById('battleQuestion').textContent=r;
    document.getElementById('battleOptions').innerHTML='';
    document.getElementById('battleFeedback').textContent='';
    document.getElementById('battleStart').textContent='⚔️ NOVA BATALHA';
    battle.running=false;
    if(battle.me>battle.bot){user.coins+=15;user.score+=30;save();}
    return;
  }
  document.getElementById('battleQuestion').textContent=String(q[0]);
  document.getElementById('battleFeedback').className='feedback hidden';
  document.getElementById('battleFeedback').textContent='';
  const box=document.getElementById('battleOptions');
  box.innerHTML='';
  q[1].slice(0,4).forEach((a,i)=>{
    const b=document.createElement('button');
    b.className='option';
    b.textContent=String.fromCharCode(65+i)+') '+a;
    b.onclick=()=>battleAnswer(i);
    box.appendChild(b);
  });
}

function battleAnswer(i){
  if(!battle||!battle.running||battle.online)return;
  const q=battle.pool[battle.idx];
  if(!q)return;
  const ok=i===Number(q[2]);
  document.querySelectorAll('#battleOptions .option').forEach(b=>b.disabled=true);
  const fb=document.getElementById('battleFeedback');
  fb.className='feedback '+(ok?'ok':'bad');
  fb.textContent=ok?'✅ Você acertou!':'❌ Você errou!';
  if(ok)battle.me+=10;
  else if(Math.random()<.5)battle.bot+=10;
  tone(ok?900:180);
  setTimeout(()=>{battle.idx++;renderBattle()},450);
}

function onlineAnswer(i){
  if(!battle||!battle.running||!battle.online)return;
  if(battle.answered)return;
  if(!onlineSocket||onlineSocket.readyState!==1)return alert('Conexão com a sala perdida.');
  battle.answered=true;
  onlineSocket.send(JSON.stringify({type:'answer',index:Number(i)}));
  document.querySelectorAll('#battleOptions .option').forEach(b=>b.disabled=true);
  document.getElementById('battleFeedback').className='feedback';
  document.getElementById('battleFeedback').textContent='⏳ Resposta enviada. Aguardando o adversário...';
}

function leaveRoom(){
  closePeer();
  if(onlineSocket)try{onlineSocket.close()}catch(e){}
  onlineSocket=null;
  onlineRoom=null;
  battle=null;
  window.currentRoomCode=null;
  document.getElementById('roomLive').classList.add('hidden');
  document.getElementById('roomCreateCard').classList.remove('hidden');
  document.getElementById('battleStart').classList.remove('hidden');
  document.getElementById('battleStart').textContent='⚔️ ESTOU PRONTO';
  show('battleMenu');
}


/* ===== CONTROLE DE TELAS E CONTAS ===== */
let user=null;
let state={category:'geral',pool:[],index:0,score:0,correct:0,wrong:0,answered:false,daily:false};
let battle=null, peerConnection=null, localAudioStream=null, audioEnabled=false;
const USERS_KEY='bqb_users_v4', SESSION_KEY='bqb_session_v4', DATA_KEY='bqb_data_v4', SETTINGS_KEY='bqb_settings_v4';
function getUsers(){try{return JSON.parse(localStorage.getItem(USERS_KEY)||'{}')}catch(e){return {}}}
function setUsers(v){localStorage.setItem(USERS_KEY,JSON.stringify(v))}
function hashPass(x){let h=2166136261;for(let i=0;i<x.length;i++){h^=x.charCodeAt(i);h=Math.imul(h,16777619)}return (h>>>0).toString(16)}
function makeId(){return 'BR-'+Math.random().toString(36).slice(2,8).toUpperCase()}
function defaultUser(email){return {id:makeId(),email:email.toLowerCase(),name:email.split('@')[0].slice(0,20)||'Jogador',coins:100,score:0,games:0,correct:0,best:0,badge:'Nenhum',extraPlayersUnlocked:false}}
function save(){if(!user)return;const users=getUsers();users[user.email]={...user};setUsers(users);localStorage.setItem(DATA_KEY,JSON.stringify(user));refresh()}
function authMode(mode){show(mode==='signup'?'signup':'login')}
function show(id){document.querySelectorAll('.screen').forEach(x=>x.classList.add('hidden'));const el=document.getElementById(id);if(!el)return;el.classList.remove('hidden');if(id==='home')refresh();if(id==='profile')refreshProfile();if(id==='ranking')refreshRanking();if(id==='store')refreshStore();if(id==='daily')refreshDailyStatus();if(id==='settings')loadSettings();}
function signup(){const email=document.getElementById('signupEmail').value.trim().toLowerCase(),pass=document.getElementById('signupPass').value,pass2=document.getElementById('signupPass2').value,msg=document.getElementById('signupMsg');msg.textContent='';if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return msg.textContent='Digite um e-mail válido.';if(pass.length<6)return msg.textContent='A senha precisa ter pelo menos 6 caracteres.';if(pass!==pass2)return msg.textContent='As senhas não conferem.';const users=getUsers();if(users[email])return msg.textContent='Este e-mail já possui uma conta. Volte ao login.';const u=defaultUser(email);u.passHash=hashPass(pass);users[email]=u;setUsers(users);document.getElementById('signupEmail').value='';document.getElementById('signupPass').value='';document.getElementById('signupPass2').value='';document.getElementById('loginEmail').value=email;document.getElementById('loginPass').value='';show('login');const lm=document.getElementById('loginMsg');if(lm)lm.textContent='✅ Conta criada! Agora faça seu login.';}
function login(){const email=document.getElementById('loginEmail').value.trim().toLowerCase(),pass=document.getElementById('loginPass').value,msg=document.getElementById('loginMsg'),users=getUsers(),u=users[email];msg.textContent='';if(!u||u.passHash!==hashPass(pass))return msg.textContent='E-mail ou senha incorretos.';user={...u};delete user.passHash;if(document.getElementById('rememberLogin')?.checked)localStorage.setItem(SESSION_KEY,email);else localStorage.removeItem(SESSION_KEY);save();show('home');tone(700);}
function autoLogin(){const email=localStorage.getItem(SESSION_KEY);if(!email)return false;const u=getUsers()[email];if(!u)return false;user={...u};delete user.passHash;show('home');return true;}
function logout(){localStorage.removeItem(SESSION_KEY);user=null;document.getElementById('loginPass').value='';document.getElementById('signupPass').value='';document.getElementById('signupPass2').value='';openLoginScreen();}
function refresh(){if(!user)return;const w=document.getElementById('welcome');if(w)w.textContent='Bem-vindo(a), '+(user.name||'JOGADOR').toUpperCase()+'!';const c=document.querySelectorAll('#storeCoins,#profileCoins,#coinsGame');c.forEach(x=>x.textContent=user.coins);}
function refreshProfile(){
  if(!user)return;
  refresh();
  const id=String(user.id||'');
  const email=String(user.email||'');
  const games=Math.max(0,Number(user.games||0));
  const correct=Math.max(0,Number(user.correct||0));
  const score=Math.max(0,Number(user.score||0));
  const best=Math.max(0,Number(user.best||0));
  const coins=Math.max(0,Number(user.coins||0));
  const accuracy=games>0?Math.min(100,Math.round((correct/(games*10))*100)):0;

  document.getElementById('profileAvatar').textContent=(user.name||'J').trim().charAt(0).toUpperCase()||'👤';
  document.getElementById('profileEmail').textContent=email;
  document.getElementById('profileId').textContent=id;
  document.getElementById('profileCoins').textContent=coins;
  document.getElementById('profileScore').textContent=score;
  document.getElementById('profileGames').textContent=games;
  document.getElementById('profileCorrect').textContent=correct;
  document.getElementById('profileBest').textContent=best;
  document.getElementById('profileBadge').textContent=user.badge||'Nenhum';
  document.getElementById('nameInput').value=user.name||'';
  document.getElementById('profileProgress').style.width=accuracy+'%';
  document.getElementById('profileAccuracy').textContent=games>0
    ? accuracy+'% de aproveitamento • '+correct+' acertos em aproximadamente '+(games*10)+' perguntas'
    : 'Nenhuma partida concluída ainda.';
}
function saveName(){
  if(!user)return;
  const input=document.getElementById('nameInput');
  const n=input.value.trim().replace(/\\s+/g,' ');
  if(n.length<2)return alert('Escolha um nome com pelo menos 2 caracteres.');
  user.name=n.slice(0,30);
  save();
  refreshProfile();
  tone(700);
  alert('✅ Nome salvo com sucesso!');
}
async function copyProfileId(){
  if(!user)return;
  const id=String(user.id||'');
  try{
    if(navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(id);
    else{
      const ta=document.createElement('textarea');
      ta.value=id;ta.style.position='fixed';ta.style.opacity='0';
      document.body.appendChild(ta);ta.focus();ta.select();document.execCommand('copy');ta.remove();
    }
    alert('✅ ID copiado!');
  }catch(e){alert('Não foi possível copiar automaticamente. Seu ID é: '+id);}
}
function refreshRanking(){const users=Object.values(getUsers()).sort((a,b)=>(b.score||0)-(a.score||0)).slice(0,20);document.getElementById('rankingList').innerHTML=users.map((u,i)=>`<div class="row"><span>🏅 ${i+1}º ${escapeHtml(u.name||u.email.split('@')[0])}</span><b>${u.score||0} pts</b></div>`).join('')||'<div class="row">Nenhum jogador ainda.</div>'}
function refreshStore(){if(user)document.getElementById('storeCoins').textContent=user.coins}
function buy(kind,cost){if(user.coins<cost)return alert('Moedas insuficientes.');user.coins-=cost;if(kind==='coins500')user.coins+=500;if(kind==='badge')user.badge='🏆 Campeão';save();alert('Compra realizada!')}
function choose(cat){state.category=cat;startGame()}
function escapeHtml(x){return String(x).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function renderQuestion(){
  const q=state.pool[state.index];
  if(!q) return endGame();
  document.getElementById('qNum').textContent=state.index+1;
  document.getElementById('qTotal').textContent=state.pool.length;
  document.getElementById('questionText').textContent=q[0];
  document.getElementById('ref').textContent='📖 '+(q[3]||'Referência bíblica');
  document.getElementById('feedback').className='feedback hidden';
  document.getElementById('nextBtn').classList.add('hidden');
  const box=document.getElementById('options');
  box.innerHTML='';
  const opts=shuffleArray(q[1].slice(0,4));
  opts.forEach((a,index)=>{
    const b=document.createElement('button');
    b.className='option';
    b.textContent=String.fromCharCode(65+index)+') '+a;
    b.onclick=()=>answer(a,q,b);
    box.appendChild(b);
  });
}
function answer(a,q,btn){
  if(state.answered)return;
  state.answered=true;
  const ok=String(a).trim()===String(q[2]).trim();

  document.querySelectorAll('#options .option').forEach(b=>{
    b.disabled=true;
    if(b.textContent.replace(/^[A-D]\)\s*/,'').trim()===String(q[2]).trim())b.classList.add('correct');
  });
  btn.classList.add(ok?'correct':'wrong');

  if(ok){
    state.correct++;state.score+=10;
    user.coins+=state.daily?10:5;
  }else{
    state.wrong++;
    if(state.daily)user.coins=Math.max(0,Number(user.coins||0)-5);
  }

  document.getElementById('score').textContent=state.score;
  document.getElementById('correct').textContent=state.correct;
  document.getElementById('wrong').textContent=state.wrong;
  document.getElementById('coinsGame').textContent=user.coins;

  const fb=document.getElementById('feedback');
  fb.className='feedback '+(ok?'ok':'bad');
  fb.textContent=ok
    ?'✅ Resposta correta! '+(state.daily?'+10 🪙':'')
    :'❌ Resposta incorreta! A correta é: '+q[2]+(state.daily?' (-5 🪙)':'');
  document.getElementById('ref').textContent='📖 '+(q[3]||'Referência bíblica');
  document.getElementById('nextBtn').classList.remove('hidden');
  tone(ok?800:220);
}
function nextQuestion(){state.index++;state.answered=false;renderQuestion()}
function endGame(){
  const daily=!!state.daily;
  const today=todayKey();

  if(daily){
    const reward=(state.correct*10)-(state.wrong*5);
    const before=Number(state.dailyStartCoins||0);
    const after=Number(user.coins||0);

    localStorage.setItem(dailyStorageKey(),JSON.stringify({
      date:today,completed:true,correct:state.correct,wrong:state.wrong,
      score:state.score,reward,coinsBefore:before,coinsAfter:after
    }));

    user.games++;user.score+=state.score;user.correct+=state.correct;
    user.best=Math.max(user.best,state.score);save();

    document.getElementById('finalScore').textContent=state.score+' pontos';
    document.getElementById('finalCorrect').textContent=state.correct;
    document.getElementById('finalWrong').textContent=state.wrong;
    document.getElementById('finalPct').textContent=Math.round(state.correct/state.pool.length*100)+'%';
    document.getElementById('earned').textContent=(reward>=0?'🪙 +'+reward:'🪙 '+reward)+' moedas no Desafio Diário';
    show('result');
    return;
  }

  user.games++;user.score+=state.score;user.correct+=state.correct;
  user.best=Math.max(user.best,state.score);save();
  document.getElementById('finalScore').textContent=state.score+' pontos';
  document.getElementById('finalCorrect').textContent=state.correct;
  document.getElementById('finalWrong').textContent=state.wrong;
  document.getElementById('finalPct').textContent=Math.round(state.correct/state.pool.length*100)+'%';
  document.getElementById('earned').textContent='🪙 +'+(state.correct*5)+' moedas';
  show('result');
}
function loadSettings(){try{const s=JSON.parse(localStorage.getItem(SETTINGS_KEY)||'{}');document.getElementById('sound').checked=s.sound!==false;document.getElementById('notifications').checked=!!s.notifications;document.getElementById('dark').checked=!!s.dark}catch(e){}}
function saveSettings(){localStorage.setItem(SETTINGS_KEY,JSON.stringify({sound:document.getElementById('sound').checked,notifications:document.getElementById('notifications').checked,dark:document.getElementById('dark').checked}))}
function toggleDark(){document.body.classList.toggle('dark',document.getElementById('dark').checked);saveSettings()}
function setTheme(){tone(400)}
function resetLocal(){if(confirm('Apagar somente o progresso desta conta?')){user.coins=100;user.score=0;user.games=0;user.correct=0;user.best=0;save();refreshProfile()}}

/* ===== CAMPEONATO ONLINE: INDIVIDUAL 10 / DUPLAS 1x1, 2x2, 4x4 ===== */
let champWS=null, champRoom=null, champMode=null, champQuestions=[], champIndex=0, champAnswered=false, champMyScore=0;

function champPlayerId(){
  if(user?.id||user?.email) return String(user.id||user.email);
  let id=localStorage.getItem('bqb_champ_guest_id');
  if(!id){
    id='guest_'+(crypto?.randomUUID?.()||Math.random().toString(36).slice(2)+Date.now().toString(36));
    localStorage.setItem('bqb_champ_guest_id',id);
  }
  return id;
}
function champName(){
  const saved=localStorage.getItem('bqb_champ_guest_name')||'Jogador';
  return String(user?.name||saved).slice(0,30);
}
function champWsUrl(code){
  const base=serverBase();
  if(!base) return '';
  const u=new URL(base);
  u.protocol=u.protocol==='https:'?'wss:':'ws:';
  u.pathname='/ws';
  u.search='champ='+encodeURIComponent(code)+'&playerId='+encodeURIComponent(champPlayerId())+'&name='+encodeURIComponent(champName());
  u.hash='';
  return u.toString();
}
function champSetMenu(title,html2){
  const box=document.getElementById('champMenu');
  box.innerHTML='<div class="champ-choice"><h3>'+title+'</h3>'+html2+'</div>';
}
function openChampTeam(){
  show('championship');
  selectChampMode('team1');
  champSetMenu('👥 CAMPEONATO EM DUPLA',`
    <p>Escolha o tamanho da batalha. A equipe vencedora recebe <b>250 moedas para cada integrante</b>.</p>
    <input id="champGuestName" class="champ-input" maxlength="30" placeholder="Seu nome para o campeonato" value="${escapeHtml(champName())}" oninput="localStorage.setItem('bqb_champ_guest_name',this.value.trim()||'Jogador')">
    <div class="champ-mode-grid">
      <button class="champ-mode" onclick="selectChampMode('team1')">⚔️ 1×1</button>
      <button class="champ-mode" onclick="selectChampMode('team2')">👥 2×2</button>
      <button class="champ-mode" onclick="selectChampMode('team4')">👥 4×4</button>
    </div>
    <button class="btn gold" onclick="createChampRoom()">➕ CRIAR SALA</button>
    <input id="champJoinCode" class="champ-input" maxlength="6" placeholder="Digite o código da sala">
    <button class="btn primary" onclick="joinChampRoom()">🚪 ENTRAR COM CÓDIGO</button>
  `);
}
function openChampIndividual(){
  show('championship');
  selectChampMode('individual');
  champSetMenu('🏆 CAMPEONATO INDIVIDUAL',`
    <p>Até <b>10 jogadores</b> • <b>30 perguntas</b> • 1º ganha 500 🪙, 2º 250 🪙 e 3º 125 🪙.</p>
    <input id="champGuestName" class="champ-input" maxlength="30" placeholder="Seu nome para o campeonato" value="${escapeHtml(champName())}" oninput="localStorage.setItem('bqb_champ_guest_name',this.value.trim()||'Jogador')">
    <button class="btn gold" onclick="createChampRoom()">➕ CRIAR SALA PARA 10</button>
    <input id="champJoinCode" class="champ-input" maxlength="6" placeholder="Digite o código da sala">
    <button class="btn primary" onclick="joinChampRoom()">🚪 ENTRAR COM CÓDIGO</button>
  `);
}
function selectChampMode(mode){
  champMode=mode;
  document.querySelectorAll('.champ-mode').forEach(x=>x.classList.remove('active'));
  const map={team1:'1×1',team2:'2×2',team4:'4×4'};
  document.querySelectorAll('.champ-mode').forEach(x=>{if(x.textContent.includes(map[mode]))x.classList.add('active')});
}
async function createChampRoom(){
  if(!champMode) champMode='individual';
  const base=serverBase();
  if(!base){
    alert('❌ Servidor do campeonato não configurado. Abra o jogo pelo endereço publicado no Render ou configure BQB_SERVER_URL.');
    return;
  }
  const createBtn=[...document.querySelectorAll('button')].find(b=>(b.textContent||'').includes('CRIAR SALA'));
  if(createBtn){createBtn.disabled=true;createBtn.textContent='⏳ CRIANDO SALA...';}
  try{
    const r=await fetch(base+'/api/championship/rooms/create',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({mode:champMode,playerId:champPlayerId(),username:champName()})
    });
    let d={};
    try{d=await r.json()}catch(_){}
    if(!r.ok) throw new Error(d.error||('Servidor respondeu '+r.status));
    if(!d.code || String(d.code).length!==6) throw new Error('O servidor não gerou um código válido.');
    await connectChampRoom(String(d.code).toUpperCase(),true);
  }catch(e){
    const msg=e?.message==='Failed to fetch'
      ? 'Não foi possível alcançar o servidor do campeonato. No Render, publique index.html junto com server.js e abra o jogo pelo link do Render.'
      : (e?.message||'Não foi possível criar a sala.');
    alert('❌ '+msg);
  }finally{
    if(createBtn){createBtn.disabled=false;createBtn.textContent=champMode==='individual'?'➕ CRIAR SALA PARA 10':'➕ CRIAR SALA';}
  }
}
function joinChampRoom(){
  const code=(document.getElementById('champJoinCode')?.value||'').trim().toUpperCase();
  if(code.length!==6)return alert('Digite o código de 6 caracteres.');
  connectChampRoom(code,false);
}
function connectChampRoom(code,isHost){
  const url=champWsUrl(code);
  if(!url) return Promise.reject(new Error('Servidor do campeonato não configurado.'));
  try{champWS?.close()}catch(e){}
  return new Promise((resolve,reject)=>{
    let settled=false;
    champWS=new WebSocket(url);
    champWS.onopen=()=>{
      champRoom=code;
      show('champLobby');
      document.getElementById('champRoomCode').textContent=code;
      settled=true;resolve(true);
    };
    champWS.onmessage=e=>{
      let m;try{m=JSON.parse(e.data)}catch(_){return}
      handleChampMessage(m,isHost);
    };
    champWS.onerror=()=>{
      if(!settled) reject(new Error('Não foi possível conectar ao servidor da sala.'));
    };
    champWS.onclose=()=>{
      if(!settled) reject(new Error('A conexão com a sala foi encerrada.'));
    };
  });
}
function handleChampMessage(m,isHost){
  if(m.type==='champ_error'){alert('❌ '+m.message);return}
  if(m.type==='champ_state'){
    champRoom=m.code;champMode=m.mode;
    document.getElementById('champRoomCode').textContent=m.code;
    document.getElementById('champLobbyTitle').textContent='🏆 '+m.title;
    document.getElementById('champLobbyInfo').textContent=m.players.length+'/'+m.maxPlayers+' jogadores • 30 perguntas';
    document.getElementById('champPlayers').innerHTML=m.players.map((p,i)=>`<div class="row"><span>${i+1}. ${p.name}${p.host?' 👑':''}</span><b>${p.ready?'✅':'⏳'}</b></div>`).join('');
    const start=document.getElementById('champStartBtn');
    if(start){
      const complete=m.players.length===m.maxPlayers;
      start.classList.toggle('hidden',!complete);
      start.disabled=!complete;
      start.textContent=complete?'✅ ESTOU PRONTO':'⏳ AGUARDANDO JOGADORES';
    }
  }
  if(m.type==='champ_start'){
    champQuestions=m.questions||[];champIndex=0;champAnswered=false;champMyScore=0;
    show('champGame');renderChampQuestion();
  }
  if(m.type==='champ_answer_result'){
    champAnswered=true;champMyScore=Number(m.myScore||champMyScore);
    if(m.correct) setChampAnswerMessage('✅ RESPOSTA CORRETA'); else { setChampAnswerMessage('❌ VOCÊ PERDEU 5 MOEDAS'); if(window.user){window.user.coins=Math.max(0,Number(window.user.coins||0)-5); if(typeof save==='function')save(); if(typeof refresh==='function')refresh();} }
    document.getElementById('champMyScore').textContent=champMyScore;
    document.getElementById('champWait').textContent='Resposta registrada. Aguardando a próxima pergunta…';
    const btns=document.querySelectorAll('.champ-answer');
    btns.forEach(b=>b.disabled=true);
    if(Number.isInteger(m.selectedIndex)&&btns[m.selectedIndex])btns[m.selectedIndex].classList.add(m.correct?'correct':'wrong');
  }
  if(m.type==='champ_prize'){
    const prize=Math.max(0,Number(m.coins||0));
    if(prize>0&&window.user){
      window.user.coins=Math.max(0,Number(window.user.coins||0))+prize;
      if(typeof save==='function')save();
      if(typeof refresh==='function')refresh();
      if(typeof refreshProfile==='function')refreshProfile();
      alert('🎉 Você recebeu '+prize.toLocaleString('pt-BR')+' moedas!');
    }
  }
  if(m.type==='champ_next'){
    champIndex=m.index;champAnswered=false;renderChampQuestion();
  }
  if(m.type==='champ_end'){
    champRoom=null;showChampResult(m);
  }
}
function startChampionshipRoom(){
  if(champWS?.readyState!==1)return alert('Conexão não está pronta.');
  champWS.send(JSON.stringify({type:'champ_ready'}));
}
function renderChampQuestion(){
  const q=champQuestions[champIndex];if(!q)return;
  document.getElementById('champQCounter').textContent='Pergunta '+(champIndex+1)+'/30';
  document.getElementById('champMyScore').textContent=champMyScore;
  document.getElementById('champWait').textContent='';
  document.getElementById('champQuestion').innerHTML='<div class="qtext">'+escapeHtml(q[0])+'</div><div class="small">'+escapeHtml(q[3]||'')+'</div>';
  document.getElementById('champAnswers').innerHTML=(q[1]||[]).slice(0,4).map((a,i)=>`<button class="champ-answer" onclick="champAnswer(${i})">${String.fromCharCode(65+i)}) ${escapeHtml(a)}</button>`).join('');

  startChampTimer();
}
let champTimerInterval=null;
let champTimeLeft=10;
let champQuestionLocked=false;

function clearChampTimer(){
  if(champTimerInterval){clearInterval(champTimerInterval);champTimerInterval=null;}
}
function setChampAnswerMessage(text){
  const el=document.getElementById('champAnswerMsg');
  if(el) el.textContent=text||'';
}
function startChampTimer(){
  clearChampTimer();
  champTimeLeft=10;
  champQuestionLocked=false;
  setChampAnswerMessage('');
  const box=document.getElementById('champTimerBox');
  if(box){box.textContent='⏱️ 10s';box.classList.remove('warning');}
  champTimerInterval=setInterval(()=>{
    champTimeLeft--;
    if(box){
      box.textContent='⏱️ '+Math.max(0,champTimeLeft)+'s';
      box.classList.toggle('warning',champTimeLeft<=3);
    }
    if(champTimeLeft<=0){
      clearChampTimer();
      if(!champQuestionLocked){
        champQuestionLocked=true;
        setChampAnswerMessage('⏰ SEU TEMPO TERMINOU');
        if(typeof champTimeout==='function') champTimeout();
      }
    }
  },1000);
}
function champTimeout(){
  // The server records a timeout as an unanswered question. The player waits
  // for the other competitors before the next question.
  if(champWS && champWS.readyState===1){
    champWS.send(JSON.stringify({type:'champ_timeout'}));
  }
}
function champAnswer(i){
  if(champQuestionLocked) return;
  champQuestionLocked=true;
  clearChampTimer();
  if(champAnswered||champWS?.readyState!==1)return;
  champAnswered=true;
  champWS.send(JSON.stringify({type:'champ_answer',index:i}));
}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function copyChampCode(){
  const code=champRoom||document.getElementById('champRoomCode')?.textContent||'';
  if(!code)return;
  navigator.clipboard?.writeText(code).then(()=>alert('✅ Código copiado!')).catch(()=>alert('Código da sala: '+code));
}
function leaveChampionshipRoom(){
  try{champWS?.close()}catch(e){}
  champWS=null;champRoom=null;show('championship');openChampIndividual();
}
function showChampResult(m){
  const rows=(m.results||[]).slice().sort((a,b)=>a.position-b.position);
  document.getElementById('champFinalPodium').innerHTML='<div class="podium">'+rows.map(r=>{
    const cls=r.position===1?'first':r.position===2?'second':r.position===3?'third':'';
    const prize=r.prize||0;
    return `<div class="podium-row ${cls}"><span>${r.position===1?'🥇':r.position===2?'🥈':r.position===3?'🥉':r.position+'º'} <b>${escapeHtml(r.name)}</b></span><span>🏆 ${r.score} pts ${prize?'• 🪙 +'+prize:''}</span></div>`;
  }).join('')+'</div>';
  show('champResult');
}

function tone(freq){try{if(document.getElementById('sound')&&!document.getElementById('sound').checked)return;const C=window.AudioContext||window.webkitAudioContext;if(!C)return;const c=new C(),o=c.createOscillator(),g=c.createGain();o.frequency.value=freq;g.gain.value=.035;o.connect(g);g.connect(c.destination);o.start();o.stop(c.currentTime+.08)}catch(e){}}
/* ===== MÚSICA AMBIENTE + EFEITOS ===== */
let ambientCtx=null,ambientNodes=[],ambientTimer=null;
function startAmbient(){
  try{
    if(ambientCtx)return;
    if(document.getElementById('sound')&&!document.getElementById('sound').checked)return;
    const C=window.AudioContext||window.webkitAudioContext;if(!C)return;
    ambientCtx=new C();const master=ambientCtx.createGain();master.gain.value=.018;master.connect(ambientCtx.destination);
    const notes=[196,246.94,293.66,392,293.66,246.94];let i=0;
    ambientTimer=setInterval(()=>{
      if(!ambientCtx)return;const o=ambientCtx.createOscillator(),g=ambientCtx.createGain();
      o.type='sine';o.frequency.value=notes[i++%notes.length];g.gain.setValueAtTime(0,ambientCtx.currentTime);g.gain.linearRampToValueAtTime(.18,ambientCtx.currentTime+.8);g.gain.exponentialRampToValueAtTime(.001,ambientCtx.currentTime+3.8);o.connect(g);g.connect(master);o.start();o.stop(ambientCtx.currentTime+4);
    },1800);
  }catch(e){}
}
function stopAmbient(){try{clearInterval(ambientTimer);ambientTimer=null;ambientCtx?.close();ambientCtx=null}catch(e){}}
function ensureAudio(){try{startAmbient();if(ambientCtx?.state==='suspended')ambientCtx.resume()}catch(e){}}
document.addEventListener('pointerdown',ensureAudio,{once:false,passive:true});
document.addEventListener('click',e=>{if(e.target.closest('button')){ensureAudio();tone(520)}});

function initApp(){if(!autoLogin())show('login')}

loadQuestions();
initApp();

/* ===== CONFIGURAÇÕES: PERSISTÊNCIA E CONTROLE GLOBAL ===== */
(function(){
  const defaults={sound:true,music:true,notifications:true,dark:true,color:'green'};
  window.gameSettings=Object.assign({},defaults,JSON.parse(localStorage.getItem('bqb_settings')||'{}'));

  function saveSettings(){localStorage.setItem('bqb_settings',JSON.stringify(window.gameSettings));}

  window.applyGameSettings=function(){
    const s=window.gameSettings;
    document.body.classList.toggle('light-theme',!s.dark);
    document.body.classList.remove('theme-blue','theme-green','theme-black');
    document.body.classList.add('theme-'+(s.color||'green'));

    const map=[
      ['soundToggle',s.sound],['musicToggle',s.music],
      ['notificationToggle',s.notifications],['darkToggle',s.dark]
    ];
    map.forEach(([id,val])=>{const e=document.getElementById(id);if(e)e.checked=!!val;});
    ['blue','green','black'].forEach(c=>{
      const e=document.getElementById('color'+c.charAt(0).toUpperCase()+c.slice(1));
      if(e)e.classList.toggle('active',s.color===c);
    });

    // Connect settings to common audio flags used by the game.
    window.soundEnabled=!!s.sound;
    window.musicEnabled=!!s.music;
    window.notificationsEnabled=!!s.notifications;
  };

  window.toggleSoundSetting=function(v){
    window.gameSettings.sound=!!v; saveSettings(); applyGameSettings();
    if(v && typeof tone==='function') tone(700);
  };
  window.toggleMusicSetting=function(v){
    window.gameSettings.music=!!v; saveSettings(); applyGameSettings();
    if(typeof updateBackgroundAudio==='function') updateBackgroundAudio();
  };
  window.toggleNotificationSetting=function(v){
    window.gameSettings.notifications=!!v; saveSettings(); applyGameSettings();
  };
  window.toggleDarkSetting=function(v){
    window.gameSettings.dark=!!v; saveSettings(); applyGameSettings();
  };
  window.setGameColor=function(c){
    if(!['blue','green','black'].includes(c))return;
    window.gameSettings.color=c; saveSettings(); applyGameSettings();
    if(typeof tone==='function' && window.gameSettings.sound) tone(800);
  };

  // Override tone so the Sons switch controls every call to the game's effects.
  const oldTone=window.tone;
  window.tone=function(freq=700,dur=80){
    if(window.gameSettings.sound===false)return;
    if(typeof oldTone==='function')return oldTone(freq,dur);
  };

  // Patch common AudioContext/HTMLAudio playback points used by this game.
  window.playGameAudio=function(audio){
    if(!window.gameSettings.sound || !audio)return;
    try{audio.currentTime=0;audio.play().catch(()=>{});}catch(e){}
  };

  document.addEventListener('DOMContentLoaded',applyGameSettings);
  setTimeout(applyGameSettings,0);
})();

/* ===== LOJA BÍBLICA: TEMA DOURADO + PACOTES DE MOEDAS ===== */
(function(){
  const coinPackages=[
    {id:'coins150',coins:150,price:'R$ 2,00',title:'Pacote Inicial',icon:'🪙'},
    {id:'coins400',coins:400,price:'R$ 5,00',title:'Pacote Popular',icon:'💰'},
    {id:'coins2000',coins:2000,price:'R$ 25,00',title:'Pacote Grande',icon:'💎'},
    {id:'coins5000',coins:5000,price:'R$ 50,00',title:'Pacote Premium',icon:'🏆'},
    {id:'coins10000',coins:10000,price:'R$ 90,00',title:'Pacote Especial',icon:'👑'}
  ];
  window.coinPackages=coinPackages;

  function currentUserKey(){
    return window.user ? (window.user.email || window.user.id || 'guest') : 'guest';
  }
  function saveUserCoins(){
    if(typeof save==='function') save();
    try{
      localStorage.setItem('bqb_coins_'+currentUserKey(),String(Math.max(0,Number(window.user?.coins||0))));
    }catch(e){}
  }

  window.renderCoinShop=function(){
    const box=document.getElementById('coinPackages');
    if(!box)return;
    const bal=document.getElementById('shopCoins');
    if(bal)bal.textContent=Math.max(0,Number(window.user?.coins||0));
    box.innerHTML=coinPackages.map(p=>`
      <div class="coin-card">
        <div class="coin-icon">${p.icon}</div>
        <div class="coin-title">${p.title}</div>
        <div class="coin-amount">🪙 ${p.coins.toLocaleString('pt-BR')}</div>
        <div class="coin-price">${p.price}</div>
        <button class="btn gold" onclick="buyCoinPackage('${p.id}')">💳 COMPRAR</button>
      </div>
    `).join('');
  };

  window.buyCoinPackage=function(id){
    const p=coinPackages.find(x=>x.id===id);
    if(!p)return;
    if(!window.user){
      alert('Faça login para comprar moedas.');
      return;
    }
    const ok=confirm(`Comprar ${p.coins.toLocaleString('pt-BR')} moedas por ${p.price}?\\n\\nO pagamento será feito com dinheiro real.`);
    if(!ok)return;

    /*
      PAGAMENTO REAL:
      A confirmação abaixo NÃO é simulada.
      O servidor/Mercado Pago deverá confirmar o pagamento antes
      de creditar as moedas. Até essa integração, nenhum saldo é alterado.
    */
    alert('💳 A compra precisa ser conectada ao Mercado Pago/Pix para confirmar o pagamento.\\n\\nNenhuma moeda foi adicionada ao saldo.');
  };

  window.activateGoldTheme=function(){
    window.gameSettings=window.gameSettings||{};
    window.gameSettings.color='gold';
    window.gameSettings.premiumColor='gold';
    try{localStorage.setItem('bqb_settings',JSON.stringify(window.gameSettings));}catch(e){}
    document.body.classList.remove('theme-blue','theme-green','theme-black');
    document.body.classList.add('theme-gold');
    document.documentElement.style.setProperty('--theme-main','#d4a017');
    if(typeof applyGameSettings==='function'){
      // Preserve the gold override after normal settings.
      setTimeout(function(){
        document.body.classList.remove('theme-blue','theme-green','theme-black');
        document.body.classList.add('theme-gold');
      },0);
    }
    alert('✨ Tema dourado ativado!');
  };

  // When the shop is opened, refresh the balance and packages.
  const oldShow=window.show;
  if(typeof oldShow==='function'){
    window.show=function(id){
      const result=oldShow.apply(this,arguments);
      if(id==='biblicalThemes')setTimeout(renderCoinShop,20);
      return result;
    };
  }

  document.addEventListener('DOMContentLoaded',renderCoinShop);
})();

/* ===== 20 BORDAS DE PERFIL COMPRADAS COM MOEDAS ===== */
(function(){
  const borderCatalog=[
    ['gold','Dourada Real','#ffd54a','#9c6b00'],
    ['ruby','Rubi Flamejante','#ff334d','#78000d'],
    ['sapphire','Safira Celestial','#2e8cff','#062e83'],
    ['emerald','Esmeralda Viva','#24e889','#075d39'],
    ['purple','Ametista Mística','#c15cff','#4d087c'],
    ['rose','Rosa Imperial','#ff5fa2','#7c123f'],
    ['ice','Gelo Brilhante','#bdf5ff','#237b9c'],
    ['fire','Fogo Sagrado','#ff8b1f','#9e1f00'],
    ['ocean','Oceano Profundo','#18d8e8','#063b73'],
    ['violet','Violeta Real','#805cff','#261078'],
    ['sun','Sol Radiante','#fff06a','#e38c00'],
    ['forest','Floresta Anciã','#56d46c','#064c25'],
    ['night','Noite Estrelada','#8aa9ff','#121d55'],
    ['silver','Prata Lunar','#e9f2ff','#65768d'],
    ['bronze','Bronze Antigo','#e7a45d','#63320f'],
    ['rainbow','Arco-Íris','#ff5c7a','#4c5cff'],
    ['divine','Luz Divina','#fff','#a67c00'],
    ['dark','Ônix Sombrio','#9fa7b3','#111'],
    ['royal','Realeza Azul','#55b7ff','#162a8b'],
    ['christmas','Estrela Dourada','#fff0a8','#8c2500']
  ].map((x,i)=>({id:x[0],name:x[1],c1:x[2],c2:x[3],price:10000}));

  function userKey(){return window.user?(window.user.email||window.user.id||'guest'):'guest'}
  function ownedKey(){return 'bqb_profile_borders_'+userKey()}
  function activeKey(){return 'bqb_active_profile_border_'+userKey()}
  function getOwned(){try{return JSON.parse(localStorage.getItem(ownedKey())||'[]')}catch(e){return[]}}
  function setOwned(a){localStorage.setItem(ownedKey(),JSON.stringify(a))}
  function getActive(){return localStorage.getItem(activeKey())||''}

  window.renderBorderShop=function(){
    const box=document.getElementById('borderGrid');if(!box)return;
    const owned=getOwned(),active=getActive();
    box.innerHTML=borderCatalog.map((b,i)=>{
      const isOwned=owned.includes(b.id),isActive=active===b.id;
      return `<div class="border-card ${isOwned?'owned':''} ${isActive?'active':''}">
        <div class="border-preview" style="--bc:${b.c1};--bc2:${b.c2}">👤</div>
        <div class="border-title">${i+1}. ${b.name}</div>
        <div class="border-cost">🪙 10.000</div>
        <button onclick="buyOrUseBorder('${b.id}')">${isActive?'✨ ATIVA':isOwned?'🎨 USAR':'🪙 COMPRAR'}</button>
      </div>`;
    }).join('');
  };

  window.buyOrUseBorder=function(id){
    const b=borderCatalog.find(x=>x.id===id);if(!b)return;
    let owned=getOwned();
    if(!owned.includes(id)){
      const coins=Math.max(0,Number(window.user?.coins||0));
      if(coins<10000){
        alert('❌ Você não tem moedas suficientes. Continue jogando!');
        return;
      }
      const ok=confirm('Comprar a borda '+b.name+' por 10.000 moedas?');
      if(!ok)return;
      window.user.coins=coins-10000;
      owned.push(id);
      setOwned(owned);
      if(typeof save==='function')save();
      if(typeof refresh==='function')refresh();
      alert('✅ Borda comprada! Agora você pode ativá-la.');
    }
    activateProfileBorder(id);
  };

  window.activateProfileBorder=function(id){
    const b=borderCatalog.find(x=>x.id===id);if(!b)return;
    if(!getOwned().includes(id))return;
    localStorage.setItem(activeKey(),id);
    const avatar=document.getElementById('profileAvatar');
    document.body.classList.add('profile-border-active');
    document.documentElement.style.setProperty('--profile-border',b.c1);
    if(avatar)avatar.title='Borda: '+b.name;
    renderBorderShop();
    if(typeof refreshProfile==='function')refreshProfile();
  };

  window.applyProfileBorder=function(){
    const id=getActive(),b=borderCatalog.find(x=>x.id===id);
    if(!b)return;
    document.body.classList.add('profile-border-active');
    document.documentElement.style.setProperty('--profile-border',b.c1);
    const avatar=document.getElementById('profileAvatar');
    if(avatar)avatar.title='Borda: '+b.name;
  };

  const oldShow=window.show;
  if(typeof oldShow==='function'){
    window.show=function(id){
      const r=oldShow.apply(this,arguments);
      if(id==='biblicalThemes'){
        setTimeout(function(){renderCoinShop();renderBorderShop();applyProfileBorder();},30);
      }
      if(id==='profile')setTimeout(applyProfileBorder,30);
      return r;
    };
  }
  document.addEventListener('DOMContentLoaded',function(){setTimeout(applyProfileBorder,50)});
})();

/* ===== FINAL FIXES ===== */
(function(){
  const guestKey='bqb_guest_wallet_v1';
  function deviceKey(){let k=localStorage.getItem('bqb_device_id');if(!k){k='D-'+Math.random().toString(36).slice(2)+Date.now().toString(36);localStorage.setItem('bqb_device_id',k)}return k}
  function walletKey(){return window.user?(window.user.email||window.user.id):guestKey}
  function getGuestCoins(){return Math.max(0,Number(localStorage.getItem('bqb_guest_coins')||0))}
  function addGuestCoins(n){localStorage.setItem('bqb_guest_coins',String(getGuestCoins()+Math.max(0,n)))}
  function hasRealPurchase(){return localStorage.getItem('bqb_real_purchase_'+deviceKey())==='1'}
  function markRealPurchase(){localStorage.setItem('bqb_real_purchase_'+deviceKey(),'1')}

  /* Profile was missing its public entry function. */
  window.showProfile=function(){
    if(!window.user){show('login');return}
    show('profile');
    if(typeof refreshProfile==='function')refreshProfile();
    if(typeof applyProfileBorder==='function')applyProfileBorder();
  };

  /* Battle menu was referenced by the home button but not defined. */
  window.showBattleMenu=function(){
    if(!window.user){show('login');return}
    show('battleMenu');
    const menu=document.getElementById('battleMenu');
    if(menu && !document.getElementById('quickBattleJoin')){
      const box=document.createElement('div'); box.id='quickBattleJoin'; box.className='card';
      box.innerHTML='<h3>🚪 ENTRAR EM UMA SALA</h3><input id="quickBattleCode" class="champ-input" maxlength="6" placeholder="Código de 6 caracteres"><button class="btn secondary" id="quickBattleJoinBtn">ENTRAR NA SALA</button>';
      menu.appendChild(box);
      document.getElementById('quickBattleJoinBtn').onclick=function(){
        const c=document.getElementById('quickBattleCode').value.trim().toUpperCase();
        if(c.length!==6)return alert('Digite o código de 6 caracteres.');
        show('rooms');
        const input=document.getElementById('roomCode');if(input)input.value=c;
        setTimeout(()=>joinRoom(),50);
      };
    }
  };

  /* Battle: reset room UI and always provide create/join path. */
  const oldLeave=window.leaveRoom;
  window.leaveRoom=function(){
    try{onlineSocket?.close()}catch(e){}
    onlineSocket=null;onlineRoom=null;onlinePlayerId=null;window.currentRoomCode=null;
    if(typeof closePeer==='function')closePeer();
    document.getElementById('roomLive')?.classList.add('hidden');
    document.getElementById('roomCreateCard')?.classList.remove('hidden');
    document.getElementById('roomMsg')&&(document.getElementById('roomMsg').textContent='Sala pronta para nova partida.');
    show('battleMenu');
  };

  /* Make server URLs work both on Render and local development. */
  window.serverBase=function(){
    const configured=(window.BQB_SERVER_URL||localStorage.getItem('bqb_server_url')||'').trim();
    if(configured)return configured.replace(/\/$/,'');
    if(location.protocol==='http:'||location.protocol==='https:')return location.origin;
    return '';
  };
  window.wsUrl=function(){
    const b=serverBase();if(!b)return '';
    try{const u=new URL(b);u.protocol=u.protocol==='https:'?'wss:':'ws:';u.pathname='/ws';u.search='';u.hash='';return u.toString()}catch(e){return ''}
  };

  /* Settings: use one source of truth and make the colors visibly affect every screen. */
  window.loadSettings=function(){
    const s=window.gameSettings||{sound:true,music:true,notifications:true,dark:true,color:'green'};
    window.gameSettings=s;
    const ids=[['soundToggle',s.sound],['musicToggle',s.music],['notificationToggle',s.notifications],['darkToggle',s.dark]];
    ids.forEach(([id,v])=>{const e=document.getElementById(id);if(e)e.checked=!!v});
    applyGameSettings();
  };
  const oldApply=window.applyGameSettings;
  window.applyGameSettings=function(){
    const s=window.gameSettings||{};
    document.body.classList.toggle('light-theme',s.dark===false);
    document.body.classList.remove('theme-blue','theme-green','theme-black','theme-gold');
    document.body.classList.add('theme-'+(s.color||'green'));
    ['blue','green','black'].forEach(c=>document.getElementById('color'+c[0].toUpperCase()+c.slice(1))?.classList.toggle('active',s.color===c));
    document.getElementById('soundToggle')&&(document.getElementById('soundToggle').checked=s.sound!==false);
    document.getElementById('musicToggle')&&(document.getElementById('musicToggle').checked=s.music!==false);
    document.getElementById('notificationToggle')&&(document.getElementById('notificationToggle').checked=s.notifications!==false);
    document.getElementById('darkToggle')&&(document.getElementById('darkToggle').checked=s.dark!==false);
    window.soundEnabled=s.sound!==false;window.musicEnabled=s.music!==false;window.notificationsEnabled=s.notifications!==false;
    if(oldApply && oldApply!==window.applyGameSettings){try{oldApply()}catch(e){}}
  };
  window.setGameColor=function(c){if(!['blue','green','black'].includes(c))return;window.gameSettings=window.gameSettings||{};window.gameSettings.color=c;window.gameSettings.premiumColor=null;localStorage.setItem('bqb_settings',JSON.stringify(window.gameSettings));applyGameSettings();};
  window.toggleDarkSetting=function(v){window.gameSettings.dark=!!v;localStorage.setItem('bqb_settings',JSON.stringify(window.gameSettings));applyGameSettings()};

  /* Gold theme is locked until the first confirmed real-money purchase. */
  window.activateGoldTheme=function(){
    if(!hasRealPurchase())return alert('🔒 O Tema Dourado é liberado somente depois da primeira compra com dinheiro real.');
    window.gameSettings=window.gameSettings||{};window.gameSettings.color='gold';window.gameSettings.premiumColor='gold';localStorage.setItem('bqb_settings',JSON.stringify(window.gameSettings));
    document.body.classList.remove('theme-blue','theme-green','theme-black');document.body.classList.add('theme-gold');
  };

  /* Coin purchases: no login gate. A guest/device can start the real checkout. */
  window.buyCoinPackage=async function(id){
    const p=(window.coinPackages||[]).find(x=>x.id===id);if(!p)return;
    if(!serverBase())return alert('Servidor online não configurado. Publique no Render para habilitar compras.');
    const email=(window.user?.email||prompt('Digite seu e-mail para o pagamento:')||'').trim();
    if(!email || !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email))return alert('Digite um e-mail válido para continuar o pagamento.');
    try{
      const r=await fetch(serverBase()+'/api/store/create',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({packageId:p.id,deviceId:deviceKey(),email})});
      const d=await r.json();if(!r.ok)throw new Error(d.error||'Não foi possível iniciar o pagamento.');
      localStorage.setItem('bqb_pending_payment',d.paymentId);
      const box=document.getElementById('coinPackages');
      if(box){let st=document.getElementById('paymentStatusBox');if(!st){st=document.createElement('div');st.id='paymentStatusBox';box.after(st)}st.innerHTML='<b>💳 Pagamento iniciado.</b><p>Conclua no Mercado Pago. Depois toque em verificar pagamento.</p><button class="btn primary" onclick="checkCoinPayment()">🔄 VERIFICAR PAGAMENTO</button>'}
      window.open(d.initPoint,'_blank','noopener');
      if(window.BQB_PAYMENT_POLL)clearInterval(window.BQB_PAYMENT_POLL);
      window.BQB_PAYMENT_POLL=setInterval(window.checkCoinPayment,5000);
    }catch(e){alert('❌ '+e.message)}
  };
  window.checkCoinPayment=async function(){
    const paymentId=localStorage.getItem('bqb_pending_payment');if(!paymentId)return;
    try{
      const r=await fetch(serverBase()+'/api/store/status/'+encodeURIComponent(paymentId)+'?deviceId='+encodeURIComponent(deviceKey()));
      const d=await r.json();if(!r.ok)throw new Error(d.error||'Erro ao consultar pagamento');
      if(d.approved){
        if(window.user){window.user.coins=Math.max(0,Number(window.user.coins||0))+Number(d.coins||0);save();}
        else addGuestCoins(Number(d.coins||0));
        markRealPurchase();localStorage.removeItem('bqb_pending_payment');
        if(window.BQB_PAYMENT_POLL)clearInterval(window.BQB_PAYMENT_POLL);
        alert('✅ Pagamento confirmado! +'+Number(d.coins||0).toLocaleString('pt-BR')+' moedas. Tema Dourado desbloqueado.');
        renderCoinShop?.();refresh?.();
      }
    }catch(e){console.warn(e)}
  };

  /* Transfer guest purchases to the account when the user logs in. */
  const oldLogin=window.login;
  window.login=function(){oldLogin();setTimeout(()=>{const gc=getGuestCoins();if(window.user&&gc>0){window.user.coins=Number(window.user.coins||0)+gc;localStorage.removeItem('bqb_guest_coins');save();}},50)};

  /* Championship: every player must be able to mark ready. */
  const oldChampHandler=window.handleChampMessage;
  window.handleChampMessage=function(m,isHost){
    oldChampHandler(m,isHost);
    if(m.type==='champ_state'){
      const me=(m.players||[]).find(p=>p.id===champPlayerId());
      const btn=document.getElementById('champStartBtn');
      if(btn){btn.classList.toggle('hidden',m.players.length!==m.maxPlayers);btn.textContent=me?.ready?'⏳ PRONTO — AGUARDANDO':'✅ ESTOU PRONTO';btn.disabled=!!me?.ready;}
    }
    if(m.type==='champ_timeout'){
      if(m.playerId===champPlayerId()){setChampAnswerMessage('⏰ SEU TEMPO TERMINOU');document.querySelectorAll('.champ-answer').forEach(b=>b.disabled=true);}
    }
  };

  /* Prevent accidental call to nonexistent auth screen. */
  const oldShow=window.show;
  window.show=function(id){
    if(id==='auth')id='login';
    const result=oldShow(id);
    if(id==='settings')setTimeout(loadSettings,0);
    if(id==='profile')setTimeout(()=>{refreshProfile?.();applyProfileBorder?.()},0);
    if(id==='biblicalThemes')setTimeout(()=>{renderCoinShop?.();renderBorderShop?.()},0);
    return result;
  };

  /* Re-apply settings after login and on startup. */
  setTimeout(()=>{try{applyGameSettings();applyProfileBorder?.()}catch(e){}},50);
})();

(function(){
  const SESSION='bqb_session_v4';
  function hideAll(){
    document.querySelectorAll('.screen').forEach(el=>el.classList.add('hidden'));
  }
  function loginOnly(){
    hideAll();
    const el=document.getElementById('login');
    if(el) el.classList.remove('hidden');
  }
  function signupOnly(){
    hideAll();
    const el=document.getElementById('signup');
    if(el) el.classList.remove('hidden');
  }
  function menuOnly(){
    hideAll();
    const el=document.getElementById('home');
    if(el) el.classList.remove('hidden');
  }
  window.openLoginScreen=loginOnly;
  window.openSignupScreen=signupOnly;

  // Re-define show only for authenticated/game navigation; auth screens remain isolated.
  const oldShow=window.show;
  window.show=function(id){
    if(id==='login'){ loginOnly(); return; }
    if(id==='signup'){ signupOnly(); return; }
    if(id==='home'){
      if(!window.user && !localStorage.getItem(SESSION)){ loginOnly(); return; }
      menuOnly(); if(typeof refresh==='function') refresh(); return;
    }
    if(typeof oldShow==='function') oldShow(id);
  };

  // On page load: never show the menu behind the login.
  const boot=()=>{
    hideAll();
    const email=localStorage.getItem(SESSION);
    const users=typeof getUsers==='function'?getUsers():{};
    if(email && users[email]){
      if(typeof user!=='undefined') window.user={...users[email]};
      if(typeof window.user==='object' && window.user) delete window.user.passHash;
      menuOnly();
      if(typeof refresh==='function') refresh();
    }else{
      localStorage.removeItem(SESSION);
      loginOnly();
    }
  };
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
