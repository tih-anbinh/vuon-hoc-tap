/* Author: Huy Tran | Email: hqt.msg@gmail.com | Created: 2026-10-14 */
(function(root){
  'use strict';
  const sameAnswers=(left,right)=>[...new Set([...Object.keys(left),...Object.keys(right)])].every(key=>(left[key]||'')===(right[key]||''));
  class ContestClient {
    constructor(options){
      this.options=options;
      this.epoch=0;
      this.reset();
    }
    reset(){
      this.epoch++;
      this.owner=this.options.user()?.id||null;
      this.snapshot=null;this.roomId=null;this.draft={};this.revision=0;this.savedRevision=0;
      this.busy=false;this.submitting=false;this.connected=false;this.issue='';this.notice='';this.dirty=false;this.conflict=false;
      this.serverTime=0;this.receivedAt=0;
      this.changed();
    }
    changed(){this.options.change?.(this);}
    read(key){
      try{return JSON.parse(this.options.storage?.getItem(key)||'null');}
      catch(error){this.issue='Không đọc được bản lưu trên thiết bị.';return null;}
    }
    write(key,value){
      try{this.options.storage?.setItem(key,JSON.stringify(value));}
      catch(error){this.issue='Thiết bị không lưu được bản nháp; hãy giữ trang này mở.';}
    }
    key(){return 'toan3_contest_draft:'+this.owner+':'+this.roomId;}
    rememberKey(){return 'toan3_contest_room:'+this.owner;}
    persistDraft(){this.write(this.key(),{answers:this.draft,revision:this.revision,base_revision:this.savedRevision});}
    now(){return this.serverTime+(this.options.clock()-this.receivedAt);}
    editable(){
      const room=this.snapshot?.room;
      return !this.conflict&&!this.submitting&&room?.status==='active'&&!!this.snapshot.me&&!this.snapshot.me.submitted_at&&
        this.now()>=Date.parse(room.starts_at)&&this.now()<Date.parse(room.ends_at);
    }
    answer(questionId,value){
      if(!this.editable()||!/^\d{0,6}$/.test(value))return false;
      this.draft[String(questionId)]=value;
      this.revision++;this.dirty=true;
      this.persistDraft();
      this.changed();return true;
    }
    discard(){
      this.draft={...(this.snapshot?.me?.answers||{})};this.revision=this.snapshot?.me?.revision||0;
      this.savedRevision=this.revision;this.dirty=false;this.conflict=false;this.issue='';this.notice='';
      this.persistDraft();this.changed();
    }
    async request(action,payload={},roomId=this.roomId){
      if(this.owner!==(this.options.user()?.id||null))this.reset();
      if(!this.owner||!this.options.supa())throw new Error('Cần đăng nhập bằng tài khoản đã duyệt.');
      if(this.busy)return null;
      const epoch=this.epoch,owner=this.owner;
      this.busy=true;this.submitting=action==='submit';this.issue='';this.changed();
      let sentRevision=null;
      try{
        if(action==='save'||action==='submit'){
          if(this.conflict)throw new Error('Stale answers');
          if(this.revision===0)this.revision=1;
          sentRevision=this.revision;
          payload={answers:{...this.draft},revision:this.revision,base_revision:this.savedRevision};
        }
        const {data,error}=await this.options.supa().rpc('toan3_contest',{action,room_id:roomId,payload});
        if(epoch!==this.epoch||owner!==(this.options.user()?.id||null))return null;
        if(error)throw error;
        if(data?.error)throw new Error(data.error);
        if(!data?.room)throw new Error('Phòng thi chưa trả về dữ liệu hợp lệ.');
        const sameRoom=this.roomId===data.room.id;
        this.roomId=data.room.id;this.snapshot=data;this.connected=true;
        this.serverTime=Date.parse(data.server_now);this.receivedAt=this.options.clock();
        this.write(this.rememberKey(),this.roomId);
        if(!sameRoom){
          const pending=this.read(this.key());
          this.draft={...(data.me?.answers||{})};this.revision=data.me?.revision||0;
          this.savedRevision=this.revision;this.dirty=false;
          const unsaved=pending&&Number.isSafeInteger(pending.revision)&&pending.revision>pending.base_revision;
          if(unsaved&&this.editable()){
            this.draft={...pending.answers};this.revision=pending.revision;this.dirty=true;
            if(pending.base_revision!==this.savedRevision&&!sameAnswers(pending.answers,data.me.answers)){
              this.conflict=true;this.issue=contestError(new Error('Stale answers'));
            }
          }else if(unsaved&&data.room.status==='finished'&&!sameAnswers(pending.answers,this.draft)){
            this.notice='Bài đã chốt theo đáp án máy chủ nhận được. Một số thay đổi trên thiết bị chưa kịp đồng bộ nên không được tính.';
          }
        }else if(data.me){
          if(sentRevision!==null&&data.me.revision>=sentRevision){
            const matches=sameAnswers(payload.answers,data.me.answers);
            if(!matches&&this.editable())throw new Error('Stale answers');
            this.savedRevision=sentRevision;
            this.dirty=!matches||this.revision>sentRevision;
          }else if(!this.dirty){
            this.draft={...data.me.answers};this.revision=data.me.revision;this.savedRevision=data.me.revision;
          }
        }
        if(!this.editable()&&(data.room.status==='finished'||data.me?.submitted_at)){
          if(this.dirty&&!sameAnswers(this.draft,data.me?.answers||{})){
            this.notice='Bài đã chốt theo đáp án máy chủ nhận được. Một số thay đổi trên thiết bị chưa kịp đồng bộ nên không được tính.';
          }
          this.draft={...(data.me?.answers||{})};this.revision=data.me?.revision||0;
          this.savedRevision=this.revision;this.dirty=false;
        }
        if(!this.conflict)this.persistDraft();
        return data;
      }catch(error){
        if(epoch!==this.epoch||owner!==(this.options.user()?.id||null))return null;
        this.connected=false;
        if(/Stale answers/i.test(error?.message||''))this.conflict=true;
        this.issue=contestError(error);
        throw error;
      }finally{
        if(epoch===this.epoch){this.busy=false;this.submitting=false;this.changed();}
      }
    }
  }
  function contestError(error){
    const message=String(error?.message||error||'');
    const rules=[
      [/Host is observer only/i,'Cần chạy lại SQL phòng thi bản mới để chủ phòng được tham gia.'],
      [/Stale answers/i,'Bài đã thay đổi ở cửa sổ khác. Bấm "Tải bản đã lưu" trước khi làm tiếp.'],
      [/PGRST202|schema cache|does not exist/i,'Phòng thi chưa được kích hoạt trên máy chủ. Nhờ người quản lý chạy migration phòng thi.'],
      [/too many join/i,'Bạn thử mã phòng nhiều lần. Chờ một phút rồi thử lại nhé.'],
      [/not found|invalid.*code|room unavailable/i,'Không tìm thấy phòng đang mở với mã này.'],
      [/not approved|authentication|account|JWT/i,'Cần đăng nhập bằng tài khoản đã được duyệt.'],
      [/ready|at least|quorum/i,'Cần ít nhất hai bạn và tất cả đều sẵn sàng.'],
      [/full|capacity/i,'Phòng đã đủ sáu bạn.'],
      [/expired|deadline|ended|late|not active|closed/i,'Lượt thi đã đóng hoặc hết giờ. Bấm cập nhật để xem kết quả.'],
      [/not started|countdown/i,'Chờ đếm ngược kết thúc nhé.'],
      [/admin|host only/i,'Chỉ người quản lý phòng được thực hiện thao tác này.'],
      [/permission|member|access/i,'Tài khoản này không có quyền vào phòng.'],
      [/fetch|network|connect/i,'Mất kết nối. Bản nháp chưa đồng bộ; đồng hồ vẫn chạy.']
    ];
    return rules.find(([pattern])=>pattern.test(message))?.[1]||message||'Không kết nối được phòng thi.';
  }
  if(typeof module!=='undefined'&&module.exports)module.exports={ContestClient,contestError};
  else root.Toan3ContestCore={ContestClient,contestError};
  if(!root.document)return;
  const element=document.getElementById('contestBody');
  if(!element)return;
  const topics={mixed:'Ôn tập tổng hợp',addsub:'Cộng, trừ trong 1 000',tables:'Bảng nhân 2 đến 9',division:'Chia trong bảng'};
  const avatarNames=['Mầm xanh','Mặt trời','Giọt nước','Ngôi sao','Cầu vồng','Chiếc lá'];
  const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const user=()=>typeof AUTH_ME==='undefined'?null:AUTH_ME;
  const api=()=>typeof supa==='undefined'?null:supa;
  let client,home=true,index=0,viewKey='',channel=null,channelRoom=null,saveTimer=null,refreshTimer=null;
  let reviewAll=false,practice=null,localMessage='',wireVersion=0,hostAlias='',hostAvatar=0;
  let storage;
  try{storage=root.localStorage;}catch(error){storage=null;}
  client=new ContestClient({user,supa:api,storage,clock:()=>performance.now(),change:()=>{if(client)render();}});
  function avatar(number){
    const safe=Number.isInteger(number)&&number>=0&&number<6?number:0;
    return `<span class="contest-avatar avatar-${safe}" aria-label="${avatarNames[safe]}">${safe+1}</span>`;
  }
  function status(){
    const node=document.getElementById('contestStatus');
    if(node){
      node.textContent=client.issue||client.notice||localMessage||(client.busy?'Đang đồng bộ…':!client.connected&&client.snapshot?'Chưa kết nối':client.dirty?'Chưa đồng bộ':client.snapshot?'Đã đồng bộ':'');
      node.classList.toggle('contest-warning',!!client.issue||!!client.notice||client.dirty);
    }
    document.getElementById('contestDiscard').hidden=!client.conflict;
  }
  function stopChannel(){
    wireVersion++;channelRoom=null;
    if(channel){const old=channel;channel=null;Promise.resolve(api()?.removeChannel(old)).catch(error=>console.warn('[toan3 contest] channel cleanup:',error));}
  }
  function wire(){
    if(home||!client.roomId){if(channel)stopChannel();return;}
    if(channelRoom===client.roomId||typeof api()?.channel!=='function')return;
    stopChannel();channelRoom=client.roomId;
    const version=wireVersion;
    channel=api().channel('toan3-contest:'+client.roomId+':'+client.owner)
      .on('postgres_changes',{event:'UPDATE',schema:'public',table:'toan3_contest_events',filter:'room_id=eq.'+client.roomId},()=>{
        if(version!==wireVersion)return;
        clearTimeout(refreshTimer);refreshTimer=setTimeout(refresh,150);
      }).subscribe();
  }
  async function run(action,payload={},roomId){
    try{
      const result=await client.request(action,payload,roomId);
      if(result){home=false;localMessage='';wire();render();}
      return result;
    }catch(error){status();return null;}
  }
  async function refresh(){
    if(home||client.busy||!client.roomId||!document.body.classList.contains('mode-contest'))return;
    if(client.conflict&&client.now()<Date.parse(client.snapshot.room.ends_at))return;
    if(client.dirty&&client.editable())await run('save');
    else await run('get');
  }
  function reset(){
    clearTimeout(saveTimer);clearTimeout(refreshTimer);stopChannel();
    home=true;viewKey='';index=0;practice=null;localMessage='';hostAlias='';hostAvatar=0;
    client.reset();render();
  }
  function open(){
    if(client.owner!==(user()?.id||null))reset();
    render();if(!home)refresh();
  }
  function heading(title,detail,actions=''){
    return `<div class="contest-heading"><div><h2>${escape(title)}</h2><p>${escape(detail)}</p></div><div class="contest-actions">${actions}</div></div>`;
  }
  function playerFields(alias='',selected=0){
    return `<label>Biệt danh<input name="alias" required maxlength="20" autocomplete="off" placeholder="Tên gọi trong phòng" value="${escape(alias)}"></label>
      <fieldset><legend>Huy hiệu của con</legend><div class="contest-avatar-options">${avatarNames.map((name,number)=>`<label title="${name}"><input type="radio" name="avatar" value="${number}" ${number===selected?'checked':''}>${avatar(number)}</label>`).join('')}</div></fieldset>`;
  }
  function renderHome(){
    const remembered=client.read(client.rememberKey());
    element.innerHTML=heading('Hẹn Thi Cuối Tuần','Phòng riêng · 2–6 bạn')+
      (!user()||!api()?'<p class="contest-empty">Cần đăng nhập bằng tài khoản đã được duyệt để vào phòng thi.</p>':
      `<div class="contest-entry"><section aria-labelledby="contestJoinTitle"><h3 id="contestJoinTitle">Vào cùng bạn</h3>
        <form id="contestJoin"><label>Mã phòng<input name="code" required maxlength="8" minlength="8" pattern="[a-fA-F0-9]{8}" autocomplete="off" autocapitalize="characters" placeholder="Mã 8 ký tự"></label>
        ${playerFields()}
        <button type="submit">Vào phòng</button></form>
        ${remembered?'<button type="button" class="contest-secondary" data-action="resume">Mở lại phòng gần nhất</button>':''}</section>
        ${user().is_admin?`<section aria-labelledby="contestCreateTitle"><h3 id="contestCreateTitle">Mở lượt thi</h3><form id="contestCreate">
          <label>Chủ đề<select name="topic">${Object.entries(topics).map(([value,label])=>`<option value="${value}">${label}</option>`).join('')}</select></label>
          <div class="contest-form-row"><label>Số câu<select name="count"><option>5</option><option selected>10</option><option>15</option></select></label>
          <label>Thời lượng<select name="duration"><option value="600">10 phút</option><option value="900" selected>15 phút</option><option value="1200">20 phút</option></select></label></div>
          <button type="submit">Tạo phòng</button></form></section>`:''}</div>`);
    element.querySelector('#contestJoin')?.addEventListener('submit',async event=>{
      event.preventDefault();const form=new FormData(event.target);
      await run('join',{code:String(form.get('code')).trim().toUpperCase(),alias:String(form.get('alias')).trim(),avatar:Number(form.get('avatar'))},null);
    });
    element.querySelector('#contestCreate')?.addEventListener('submit',async event=>{
      event.preventDefault();const form=new FormData(event.target);
      await run('create',{topic:form.get('topic'),count:Number(form.get('count')),duration:Number(form.get('duration'))},null);
    });
  }
  function playersMarkup(snapshot){
    return `<ul class="contest-players">${snapshot.players.map(player=>`<li>${avatar(player.avatar)}<div><b>${escape(player.alias)}</b><span>${player.submitted_at?'Đã nộp':snapshot.room.status==='waiting'?(player.ready?'Sẵn sàng':'Chưa sẵn sàng'):'Đang làm bài'}</span></div><span class="contest-presence ${player.online?'online':''}">${player.online?'Đang kết nối':'Mất kết nối'}</span></li>`).join('')||'<li>Đang chờ các bạn vào phòng.</li>'}</ul>`;
  }
  function renderLobby(snapshot){
    const {room,me,is_host}=snapshot;
    const canStart=snapshot.players.length>=2&&snapshot.players.every(player=>player.ready);
    element.innerHTML=heading('Phòng '+room.code,topics[room.topic]+' · '+room.count+' câu · '+room.duration/60+' phút',
      '<button type="button" class="contest-secondary" data-action="home">Về sảnh</button>')+
      `<div class="contest-room-code"><span>Mã mời</span><strong>${escape(room.code)}</strong><button type="button" class="contest-secondary" data-action="copy">Chép mã</button></div>`+
      playersMarkup(snapshot)+`<div class="contest-actions">${is_host?
        `<button type="button" data-action="start" ${canStart?'':'disabled'}>Bắt đầu lượt thi</button><button type="button" class="contest-secondary" data-action="cancel">Hủy phòng</button>`:''}
        ${me?`<button type="button" data-action="ready">${me.ready?'Chưa sẵn sàng':'Con sẵn sàng'}</button><button type="button" class="contest-secondary" data-action="leave">${is_host?'Chỉ điều hành':'Rời phòng'}</button>`:''}</div>`+
      (is_host&&!me?`<div class="contest-entry"><section><form id="contestHostJoin">${playerFields(hostAlias,hostAvatar)}<button type="submit" ${snapshot.players.length>=6?'disabled':''}>Con cũng tham gia</button></form></section></div>`:'');
    const form=element.querySelector('#contestHostJoin');
    form?.addEventListener('input',()=>{const fields=new FormData(form);hostAlias=String(fields.get('alias'));hostAvatar=Number(fields.get('avatar'));});
    form?.addEventListener('submit',async event=>{
      event.preventDefault();const fields=new FormData(form);
      await run('join',{code:room.code,alias:String(fields.get('alias')).trim(),avatar:Number(fields.get('avatar'))},null);
    });
  }
  function renderActive(snapshot){
    const {room,me}=snapshot;
    const countdown=client.now()<Date.parse(room.starts_at);
    const ended=client.now()>=Date.parse(room.ends_at);
    element.innerHTML=heading(countdown?'Chuẩn bị bắt đầu':me?.submitted_at?'Đã nộp bài':!me?'Lượt thi đang diễn ra':'Bài thi của con',
      'Phòng '+room.code+' · '+topics[room.topic],'<strong id="contestClock" class="contest-clock" role="timer"></strong>')+
      (countdown?'<div class="contest-countdown" id="contestCountdown"></div>':ended?'<p class="contest-empty">Đã hết giờ. Đang chốt bài đã lưu trên máy chủ.</p>':
        !me||me.submitted_at?'<p class="contest-empty">Chờ các bạn hoàn thành để mở kết quả.</p>':
        `<div class="contest-work"><nav class="contest-question-nav" aria-label="Các câu trong bài">${snapshot.questions.map((question,position)=>`<button type="button" class="contest-qnav" data-question="${position}" aria-label="Câu ${position+1}">${position+1}</button>`).join('')}</nav>
        <section class="contest-question" aria-labelledby="contestPrompt"><span id="contestQuestionNumber"></span><h3 id="contestPrompt"></h3>
        <label for="contestAnswer">Đáp án của con</label><input id="contestAnswer" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="off">
        <div class="contest-actions"><button type="button" class="contest-secondary" data-action="previous">Câu trước</button><button type="button" class="contest-secondary" data-action="next">Câu tiếp</button><button type="button" data-action="submit">Nộp bài</button></div></section></div>`)+
      ((!me||me.submitted_at||countdown)?playersMarkup(snapshot):'');
    const answer=element.querySelector('#contestAnswer');
    if(answer){
      paintQuestion(false);
      answer.addEventListener('input',()=>{
        const cleaned=answer.value.replace(/[^0-9]/g,'').slice(0,6);answer.value=cleaned;
        const question=client.snapshot.questions[index];
        if(question&&client.answer(question.id,cleaned)){
          clearTimeout(saveTimer);saveTimer=setTimeout(()=>{if(!client.busy&&client.editable())run('save');},500);
          paintQuestionNav();
        }
      });
      answer.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();move(1);}});
    }
  }
  function paintQuestion(focus){
    const questions=client.snapshot?.questions||[];
    if(!questions.length)return;
    index=Math.min(Math.max(index,0),questions.length-1);
    const question=questions[index],input=document.getElementById('contestAnswer');
    if(!input)return;
    document.getElementById('contestQuestionNumber').textContent='Câu '+(index+1)+' / '+questions.length;
    document.getElementById('contestPrompt').textContent=question.prompt;
    input.value=client.draft[question.id]||'';
    input.disabled=!client.editable();
    element.querySelector('[data-action="previous"]').disabled=index===0;
    element.querySelector('[data-action="next"]').disabled=index===questions.length-1;
    if(focus)input.focus();paintQuestionNav();
  }
  function paintQuestionNav(){
    element.querySelectorAll('[data-question]').forEach(button=>{
      const position=Number(button.dataset.question),question=client.snapshot.questions[position];
      button.classList.toggle('answered',!!client.draft[question.id]);
      button.setAttribute('aria-current',position===index?'step':'false');
      button.setAttribute('aria-label','Câu '+(position+1)+(client.draft[question.id]?', đã điền':', chưa điền'));
    });
  }
  function move(delta){index+=delta;paintQuestion(true);}
  function renderResults(snapshot){
    const own=snapshot.results.find(result=>result.id===snapshot.me?.id);
    const review=snapshot.review.filter(question=>reviewAll||!question.correct);
    element.innerHTML=heading('Cùng nhìn lại bài thi',own?`Con đúng ${own.correct}/${own.total} câu · Hạng ${own.rank}`:'Phòng '+snapshot.room.code,
      '<button type="button" class="contest-secondary" data-action="home">Về sảnh</button>')+
      `<ol class="contest-results">${snapshot.results.map(result=>`<li><strong class="contest-rank">${result.rank}</strong>${avatar(result.avatar)}<span>${escape(result.alias)}${result.id===snapshot.me?.id?' (con)':''}</span><b>${result.correct}/${result.total}</b></li>`).join('')}</ol>`+
      (snapshot.me?`<section class="contest-review"><div class="contest-heading"><h3>Bài làm của con</h3><label><input id="contestReviewAll" type="checkbox" ${reviewAll?'checked':''}> Xem cả câu đúng</label></div>
      ${review.map(question=>`<article class="contest-review-item"><h4>Câu ${question.id}. ${escape(question.prompt)}</h4><span class="contest-answer-state">${question.correct?'Đúng':question.answer?'Chưa đúng':'Chưa làm'}</span>
      <dl><div><dt>Con trả lời</dt><dd>${escape(question.answer||'Chưa điền')}</dd></div><div><dt>Đáp án đúng</dt><dd>${escape(question.correct_answer)}</dd></div></dl><p>${escape(question.solution)}</p>
      ${!question.correct?`<button type="button" class="contest-secondary" data-practice="${escape(question.skill)}">Luyện lại dạng này</button>`:''}</article>`).join('')||'<p>Con đã làm đúng tất cả các câu.</p>'}</section>`:'')+
      '<div id="contestPractice"></div>';
    document.getElementById('contestReviewAll')?.addEventListener('change',event=>{reviewAll=event.target.checked;viewKey='';render();});
  }
  function render(){
    if(!client)return;
    const snapshot=client.snapshot;
    const phase=home||!snapshot?'home':snapshot.room.status==='active'?
      (client.now()<Date.parse(snapshot.room.starts_at)?'countdown':client.now()>=Date.parse(snapshot.room.ends_at)?'deadline':snapshot.me?.submitted_at?'submitted':'working'):snapshot.room.status;
    const nextKey=JSON.stringify([client.owner,home,snapshot?.room.id,phase,snapshot?.questions.length,
      phase==='waiting'||phase==='submitted'||phase==='countdown'||!snapshot?.me?snapshot?.players:null,reviewAll]);
    if(nextKey!==viewKey){
      viewKey=nextKey;
      if(phase==='home')renderHome();
      else if(phase==='waiting')renderLobby(snapshot);
      else if(phase==='finished')renderResults(snapshot);
      else if(phase==='cancelled')element.innerHTML=heading('Phòng đã hủy','Phòng '+snapshot.room.code,'<button type="button" data-action="home">Về sảnh</button>');
      else renderActive(snapshot);
    }
    element.querySelectorAll('button[type="submit"], [data-action="ready"], [data-action="submit"], [data-action="cancel"], [data-action="leave"], [data-action="resume"]').forEach(button=>{button.disabled=client.busy;});
    const start=element.querySelector('[data-action="start"]');
    if(start)start.disabled=client.busy||snapshot.players.length<2||!snapshot.players.every(player=>player.ready);
    const hostJoin=element.querySelector('#contestHostJoin button[type="submit"]');
    if(hostJoin)hostJoin.disabled=client.busy||snapshot.players.length>=6;
    const answer=element.querySelector('#contestAnswer');
    if(answer)answer.disabled=!client.editable();
    const submit=element.querySelector('[data-action="submit"]');
    if(submit)submit.disabled=client.busy||!client.editable();
    if(!client.dirty&&document.activeElement?.id!=='contestAnswer')paintQuestion(false);
    status();tickClock();
  }
  function tickClock(){
    if(!client.snapshot||home)return;
    const {room}=client.snapshot;
    if(room.status!=='active')return;
    const before=client.now()<Date.parse(room.starts_at);
    const seconds=Math.max(0,Math.ceil(((before?Date.parse(room.starts_at):Date.parse(room.ends_at))-client.now())/1000));
    const clock=document.getElementById('contestClock');
    if(clock)clock.textContent=before?'Sắp bắt đầu':Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0');
    const countdown=document.getElementById('contestCountdown');
    if(countdown)countdown.textContent=before?seconds:'Bắt đầu';
  }
  function practiceQuestion(skill){
    const random=max=>Math.floor(Math.random()*max);
    let left,right,operator,answer;
    if(skill==='addsub'){left=random(501);right=random(501);operator='+';answer=left+right;}
    else if(skill==='division'){right=2+random(8);answer=1+random(10);left=right*answer;operator=':';}
    else{left=2+random(8);right=1+random(10);operator='x';answer=left*right;}
    practice={skill,answer};
    document.getElementById('contestPractice').innerHTML=`<section class="contest-practice"><h3>Luyện lại · Không tính điểm thi</h3><p>${left} ${operator} ${right} = ?</p><form id="contestPracticeForm"><label>Đáp án<input name="answer" inputmode="numeric" pattern="[0-9]{1,6}" required maxlength="6"></label><button type="submit">Kiểm tra</button></form><p id="contestPracticeFeedback" role="status"></p><button type="button" class="contest-secondary" data-action="practice-next">Câu khác</button></section>`;
    document.getElementById('contestPracticeForm').addEventListener('submit',event=>{
      event.preventDefault();const answer=Number(new FormData(event.target).get('answer'));
      document.getElementById('contestPracticeFeedback').textContent=answer===practice.answer?'Đúng rồi!':'Chưa đúng. Đáp án là '+practice.answer+'.';
    });
    document.getElementById('contestPractice').scrollIntoView({block:'nearest'});
    document.querySelector('#contestPracticeForm input').focus();
  }
  element.addEventListener('click',async event=>{
    const button=event.target.closest('button');if(!button||button.disabled)return;
    if(button.dataset.question!==undefined){index=Number(button.dataset.question);paintQuestion(true);return;}
    if(button.dataset.practice){practiceQuestion(button.dataset.practice);return;}
    const action=button.dataset.action;
    if(action==='home'){home=true;viewKey='';stopChannel();render();}
    else if(action==='resume'){const roomId=client.read(client.rememberKey());if(roomId)await run('get',{},roomId);}
    else if(action==='ready')await run('ready',{ready:!client.snapshot.me.ready});
    else if(action==='start')await run('start');
    else if(action==='cancel'&&root.confirm('Hủy phòng đang chờ này?'))await run('cancel');
    else if(action==='leave'){
      const result=await run('leave');
      if(result&&!result.is_host){home=true;client.write(client.rememberKey(),null);client.reset();stopChannel();render();}
    }
    else if(action==='previous')move(-1);
    else if(action==='next')move(1);
    else if(action==='submit'){
      const blank=client.snapshot.questions.filter(question=>!client.draft[question.id]).length;
      if(root.confirm(blank?`Con còn ${blank} câu chưa điền. Nộp bài và khóa đáp án?`:'Nộp bài và khóa đáp án của con?'))await run('submit');
    }else if(action==='copy'){
      try{await navigator.clipboard.writeText(client.snapshot.room.code);localMessage='Đã chép mã phòng.';}
      catch(error){localMessage='Không chép tự động được. Mã phòng: '+client.snapshot.room.code;}
      status();
    }else if(action==='practice-next'&&practice)practiceQuestion(practice.skill);
  });
  document.getElementById('contestRefresh').addEventListener('click',()=>{if(client.roomId&&!home)refresh();else{viewKey='';render();}});
  document.getElementById('contestDiscard').addEventListener('click',async()=>{
    if(root.confirm('Bỏ bản nháp ở cửa sổ này và tải bài đã lưu trên máy chủ?')){
      client.discard();await run('get');paintQuestion(true);
    }
  });
  root.addEventListener('online',refresh);
  root.addEventListener('offline',()=>{client.connected=false;client.issue='Mất kết nối. Bản nháp chưa đồng bộ; đồng hồ vẫn chạy.';status();});
  root.addEventListener('beforeunload',event=>{if(client.dirty){event.preventDefault();event.returnValue='';}});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
  setInterval(refresh,5000);
  setInterval(()=>{
    if(client.owner!==(user()?.id||null)){reset();return;}
    if(!home&&document.body.classList.contains('mode-contest')){
      const oldKey=viewKey;render();
      if(oldKey!==viewKey&&client.snapshot?.room.status==='active')refresh();
    }
  },1000);
  root.Toan3Contest={open,reset};
  render();
})(typeof window!=='undefined'?window:globalThis);