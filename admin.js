const SUPABASE_URL='https://qgfuqmturtpglngpmtau.supabase.co';
const SUPABASE_KEY='sb_publishable_G3ZOB1cLQmEeyvx4UjdNew_9IMSY2Vc';

const db=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
const $=s=>document.querySelector(s);

let adminCode='';
let adminPin='';
let dashboard=null;
let adminRole='owner';
const PLATFORM_ORG_ID='dae22392-84a6-4587-80a5-dbbde41e101d';

$('#publishResultsBtn')?.addEventListener('click',async()=>{
  const published=dashboard?.competition?.results_published===true;
  const actionText=published?'إخفاء النتائج عن المتسابقين؟':'إعلان النتائج لجميع المتسابقين؟';
  if(!confirm(actionText))return;

  const button=$('#publishResultsBtn');
  button.disabled=true;

  try{
    const {error}=await db.rpc('admin_set_results_visibility',{
      p_code:adminCode,
      p_pin:adminPin,
      p_published:!published
    });
    if(error)throw error;
    await loadDashboard();
  }catch(e){
    msg('#publishResultsMsg',e.message||'تعذر تغيير حالة النتائج.',true);
    button.disabled=false;
  }
});

function msg(id,text,error=false){
  const el=$(id);
  if(!el)return;
  el.textContent=text;
  el.classList.toggle('error',error);
}

async function loadDashboard(){
  const {data,error}=await db.rpc('admin_get_dashboard',{
    p_code:adminCode,
    p_pin:adminPin
  });

  if(error)throw error;

  dashboard=Array.isArray(data)?data[0]:data;
  adminRole=dashboard?.role||adminRole||'owner';
  renderDashboard();
  await loadSubscriptionSummary();
}

function renderDashboard(){
  applyRoleUI();
  const c=dashboard.competition;
  const s=dashboard.stats;
  const published=c.results_published===true;
  $('#publishResultsBtn').disabled=!published && c.status!=='finished';
  $('#publishResultsBtn').textContent=published?'إخفاء النتائج عن المتسابقين':'إعلان النتائج للمتسابقين';
  msg('#publishResultsMsg',
    published
      ? 'النتائج ظاهرة حاليًا للمتسابقين. يمكنك إخفاؤها وإعادة مراجعتها.'
      : c.status==='finished'
        ? 'النتائج مخفية. يمكنك إعلانها بعد المراجعة.'
        : 'النتائج مخفية. اختر «منتهية» من إعدادات المسابقة واحفظ قبل الإعلان.'
  );

  $('#dashTitle').textContent=c.title;
  $('#dashCode').textContent=c.slug;
  if($('#roleBadge')) {
    const isPlatformOwner=adminRole==='owner' && c.organization_id===PLATFORM_ORG_ID;
    $('#roleBadge').textContent=isPlatformOwner?'مالك المنصة':adminRole==='owner'?'مدير الجهة':adminRole==='supervisor'?'مشرف':'مراقب';
  }

  $('#statParticipants').textContent=s.participants;
  $('#statCompleted').textContent=s.completed;
  $('#statQuestions').textContent=s.questions;
  $('#statAnswers').textContent=s.answers;

  $('#compTitle').value=c.title||'';
  $('#compOrg').value=c.organization_name||'';
  if($('#compCode')) $('#compCode').value=c.slug||'';
  $('#compSeconds').value=c.seconds_per_question||20;
  $('#compStatus').value=c.status||'waiting';

  if(c.start_at){
    const d=new Date(c.start_at);
    const local=new Date(d.getTime()-d.getTimezoneOffset()*60000);
    $('#compStart').value=local.toISOString().slice(0,16);
  }

  const link=`https://f10f100a-debug.github.io/lamh-app/?code=${encodeURIComponent(c.slug)}`;
  $('#joinLink').value=link;

  $('#qrBox').innerHTML='';
  new QRCode($('#qrBox'),{
    text:link,
    width:190,
    height:190
  });

  renderQuestions(dashboard.questions||[]);
  renderLeaderboard(dashboard.leaderboard||[]);
}

function renderQuestions(items){
  const box=$('#questionsList');
  box.innerHTML='';

  if(!items.length){
    box.innerHTML='<p class="hint">لا توجد أسئلة بعد.</p>';
    return;
  }

  items.forEach(q=>{
    const row=document.createElement('div');
    row.className='question-item';

    const order=document.createElement('div');
    order.className='question-order';
    order.textContent=q.question_order;

    const text=document.createElement('strong');
    text.textContent=q.question_text;

    const actions=document.createElement('div');
    actions.className='question-actions';

    const edit=document.createElement('button');
    edit.textContent='تعديل';
    edit.onclick=()=>editQuestion(q);

    const del=document.createElement('button');
    del.textContent='حذف';
    del.onclick=()=>deleteQuestion(q);

    actions.append(edit,del);
    row.append(order,text,actions);
    box.appendChild(row);
  });
}

function renderLeaderboard(items){
  const box=$('#adminLeaderboard');
  box.innerHTML='';

  if(!items.length){
    box.innerHTML='<p class="hint">لا توجد نتائج مكتملة حتى الآن.</p>';
    return;
  }

  items.forEach(x=>{
    const row=document.createElement('div');
    row.className='leader-admin-row';
    row.innerHTML=`
      <span class="rank">#${x.rank}</span>
      <div>
        <strong>${escapeHtml(x.full_name||'متسابق')}</strong>
        <div class="hint">${escapeHtml(x.school||'')}</div>
      </div>
      <strong>${x.correct_answers} صحيحة</strong>
    `;
    box.appendChild(row);
  });
}

function escapeHtml(v){
  return String(v)
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'","&#039;");
}

$('#loginBtn').onclick=async()=>{
  adminCode=$('#adminCode').value.trim().toUpperCase();
  adminPin=$('#adminPin').value.trim();

  if(!adminCode||!adminPin){
    msg('#loginMsg','أدخل رمز المسابقة ورمز الإدارة.',true);
    return;
  }

  msg('#loginMsg','جارٍ التحقق...');

  try{
    const {data,error}=await db.rpc('admin_login',{
      p_code:adminCode,
      p_pin:adminPin
    });
    if(error)throw error;

    const loginResult=Array.isArray(data)?data[0]:data;
    adminRole=loginResult?.role||'owner';

    await loadDashboard();
    await loadParticipants();
    if(adminRole==='owner'){
      await loadStaff();
      if(dashboard?.competition?.organization_id===PLATFORM_ORG_ID){
        await Promise.all([loadCommercialSettings(),loadSubscriptionRequests()]);
      }
    }

    applyRoleUI();
    $('#loginView').classList.add('hidden');
    $('#dashboardView').classList.remove('hidden');

  }catch(e){
    msg('#loginMsg',e.message||'تعذر الدخول.',true);
  }
};

$('#refreshBtn').onclick=async()=>{
  try{
    await Promise.all([
      loadDashboard(),
      loadParticipants()
    ]);
  }catch(e){
    alert(e.message);
  }
};

$('#saveCompetitionBtn').onclick=async()=>{
  msg('#settingsMsg','جارٍ الحفظ...');

  try{
    const start=$('#compStart').value;
    const startIso=start?new Date(start).toISOString():new Date().toISOString();

    const {error}=await db.rpc('admin_update_competition',{
      p_code:adminCode,
      p_pin:adminPin,
      p_title:$('#compTitle').value.trim(),
      p_organization_name:$('#compOrg').value.trim(),
      p_start_at:startIso,
      p_status:$('#compStatus').value,
      p_seconds_per_question:Number($('#compSeconds').value||20)
    });

    if(error)throw error;

    msg('#settingsMsg','تم حفظ الإعدادات ✓');
    await loadDashboard();

  }catch(e){
    msg('#settingsMsg',e.message,true);
  }
};

$('#copyLinkBtn').onclick=async()=>{
  await navigator.clipboard.writeText($('#joinLink').value);
  $('#copyLinkBtn').textContent='تم النسخ ✓';
  setTimeout(()=>$('#copyLinkBtn').textContent='نسخ الرابط',1200);
};

$('#newQuestionBtn').onclick=()=>{
  $('#questionId').value='';
  $('#questionOrder').value=(dashboard.questions?.length||0)+1;
  $('#questionText').value='';
  $('#optionA').value='';
  $('#optionB').value='';
  $('#optionC').value='';
  $('#optionD').value='';
  $('#correctOption').value='A';
  $('#questionEditorTitle').textContent='إضافة سؤال';
  $('#questionEditor').classList.remove('hidden');
  $('#questionEditor').scrollIntoView({behavior:'smooth'});
};

function editQuestion(q){
  $('#questionId').value=q.id;
  $('#questionOrder').value=q.question_order;
  $('#questionText').value=q.question_text;
  $('#optionA').value=q.option_a;
  $('#optionB').value=q.option_b;
  $('#optionC').value=q.option_c;
  $('#optionD').value=q.option_d;
  $('#correctOption').value=q.correct_option;
  $('#questionEditorTitle').textContent='تعديل السؤال';
  $('#questionEditor').classList.remove('hidden');
  $('#questionEditor').scrollIntoView({behavior:'smooth'});
}

$('#cancelQuestionBtn').onclick=()=>{
  $('#questionEditor').classList.add('hidden');
};

$('#saveQuestionBtn').onclick=async()=>{
  msg('#questionMsg','جارٍ الحفظ...');

  try{
    const id=$('#questionId').value||null;

    const {error}=await db.rpc('admin_save_question',{
      p_code:adminCode,
      p_pin:adminPin,
      p_question_id:id,
      p_question_order:Number($('#questionOrder').value),
      p_question_text:$('#questionText').value.trim(),
      p_option_a:$('#optionA').value.trim(),
      p_option_b:$('#optionB').value.trim(),
      p_option_c:$('#optionC').value.trim(),
      p_option_d:$('#optionD').value.trim(),
      p_correct_option:$('#correctOption').value
    });

    if(error)throw error;

    msg('#questionMsg','تم حفظ السؤال ✓');
    $('#questionEditor').classList.add('hidden');
    await loadDashboard();

  }catch(e){
    msg('#questionMsg',e.message,true);
  }
};

async function deleteQuestion(q){
  if(!confirm(`حذف السؤال رقم ${q.question_order}؟`))return;

  try{
    const {error}=await db.rpc('admin_delete_question',{
      p_code:adminCode,
      p_pin:adminPin,
      p_question_id:q.id
    });

    if(error)throw error;

    await loadDashboard();

  }catch(e){
    alert(e.message);
  }
}

$('#changePinBtn').onclick=async()=>{
  const newPin=$('#newPin').value.trim();

  if(!/^\d{6}$/.test(newPin)){
    msg('#pinMsg','اكتب رمزًا جديدًا من 6 أرقام.',true);
    return;
  }

  try{
    const {error}=await db.rpc('admin_change_pin',{
      p_code:adminCode,
      p_old_pin:adminPin,
      p_new_pin:newPin
    });

    if(error)throw error;

    adminPin=newPin;
    $('#adminPin').value=newPin;
    $('#newPin').value='';
    msg('#pinMsg','تم تغيير رمز الإدارة ✓');

  }catch(e){
    msg('#pinMsg',e.message,true);
  }
};



let participants = [];

async function loadParticipants(){
  const {data,error}=await db.rpc('admin_list_participants',{
    p_code:adminCode,
    p_pin:adminPin
  });

  if(error)throw error;

  participants=Array.isArray(data)?data:[];
  renderParticipants(participants);
}

function renderParticipants(items){
  const box=$('#participantsList');
  if(!box)return;

  box.innerHTML='';

  if(!items.length){
    box.innerHTML='<p class="hint">لا يوجد مشاركون حتى الآن.</p>';
    return;
  }

  items.forEach(p=>{
    const row=document.createElement('div');
    row.className='participant-card';

    const head=document.createElement('div');
    head.className='participant-head';

    const identity=document.createElement('div');

    const name=document.createElement('strong');
    name.textContent=p.full_name||'مشارك';

    const meta=document.createElement('div');
    meta.className='participant-meta';
    meta.textContent=
      `${p.mobile||''} • ${p.school||''}`;

    identity.append(name,meta);

    const status=document.createElement('span');
    status.className=
      p.completed
        ? 'participant-status completed'
        : 'participant-status pending';

    status.textContent=
      p.completed ? 'مكتمل' : 'غير مكتمل';

    head.append(identity,status);

    const stats=document.createElement('div');
    stats.className='participant-stats';

    const seconds=
      (Number(p.total_response_ms||0)/1000).toFixed(2);

    stats.innerHTML=`
      <span>الإجابات: <strong>${p.answered_count||0}</strong></span>
      <span>الصحيحة: <strong>${p.correct_answers||0}</strong></span>
      <span>الزمن: <strong>${seconds} ث</strong></span>
    `;

    const actions=document.createElement('div');
    actions.className='participant-actions';

    const editBtn=document.createElement('button');
    editBtn.className='small-btn';
    editBtn.textContent='تعديل';
    editBtn.onclick=()=>editParticipant(p);

    const resetBtn=document.createElement('button');
    resetBtn.className='small-btn warning-btn';
    resetBtn.textContent='تصفير المحاولة';
    resetBtn.onclick=()=>resetParticipant(p);

    const deleteBtn=document.createElement('button'); deleteBtn.className='small-btn danger-btn'; deleteBtn.textContent='حذف'; deleteBtn.onclick=()=>deleteParticipant(p); actions.append(editBtn,resetBtn,deleteBtn);

    row.append(head,stats,actions);
    box.appendChild(row);
  });
}

function editParticipant(p){
  $('#participantId').value=p.id;
  $('#participantName').value=p.full_name||'';
  $('#participantMobile').value=p.mobile||'';
  $('#participantSchool').value=p.school||'';

  $('#participantEditor').classList.remove('hidden');

  $('#participantEditor').scrollIntoView({
    behavior:'smooth'
  });
}

async function resetParticipant(p){
  const ok=confirm(
    `هل تريد تصفير محاولة ${p.full_name}؟\nسيتم حذف إجاباته ليبدأ من جديد.`
  );

  if(!ok)return;

  try{
    const {error}=await db.rpc('admin_reset_participant',{
      p_code:adminCode,
      p_pin:adminPin,
      p_participant_id:p.id
    });

    if(error)throw error;

    await Promise.all([
      loadParticipants(),
      loadDashboard()
    ]);

  }catch(e){
    alert(e.message||'تعذر تصفير المحاولة.');
  }
}

$('#saveParticipantBtn')?.addEventListener('click',async()=>{
  msg('#participantMsg','جارٍ الحفظ...');

  const id=$('#participantId').value;
  const fullName=$('#participantName').value.trim();
  const mobile=$('#participantMobile').value.trim();
  const school=$('#participantSchool').value.trim();

  if(!fullName||!mobile||!school){
    msg('#participantMsg','أكمل جميع البيانات.',true);
    return;
  }

  try{
    const {error}=await db.rpc('admin_update_participant',{
      p_code:adminCode,
      p_pin:adminPin,
      p_participant_id:id,
      p_full_name:fullName,
      p_mobile:mobile,
      p_school:school
    });

    if(error)throw error;

    msg('#participantMsg','تم حفظ بيانات المشارك ✓');

    await Promise.all([
      loadParticipants(),
      loadDashboard()
    ]);

    setTimeout(()=>{
      $('#participantEditor').classList.add('hidden');
    },700);

  }catch(e){
    msg(
      '#participantMsg',
      e.message||'تعذر حفظ البيانات.',
      true
    );
  }
});

$('#cancelParticipantBtn')?.addEventListener('click',()=>{
  $('#participantEditor').classList.add('hidden');
});

$('#refreshParticipantsBtn')?.addEventListener('click',async()=>{
  try{
    await loadParticipants();
  }catch(e){
    alert(e.message);
  }
});

$('#participantSearch')?.addEventListener('input',e=>{
  const value=e.target.value.trim().toLowerCase();

  if(!value){
    renderParticipants(participants);
    return;
  }

  const filtered=participants.filter(p=>{
    return [
      p.full_name,
      p.mobile,
      p.school
    ]
    .filter(Boolean)
    .some(v=>String(v).toLowerCase().includes(value));
  });

  renderParticipants(filtered);
});

const params=new URLSearchParams(location.search);
const preset=params.get('code');
if(preset)$('#adminCode').value=preset.toUpperCase();


async function deleteParticipant(p){
  if(!confirm(`حذف المشارك ${p.full_name} نهائيًا؟`)) return;
  try{
    const {error}=await db.rpc('admin_delete_participant',{p_code:adminCode,p_pin:adminPin,p_participant_id:p.id});
    if(error) throw error;
    await Promise.all([loadParticipants(),loadDashboard()]);
  }catch(e){alert(e.message||'تعذر حذف المشارك.');}
}

$('#clearParticipantsBtn')?.addEventListener('click',async()=>{
  if(!confirm('سيتم حذف جميع المشاركين وإجاباتهم ومحاولاتهم. هل أنت متأكد؟')) return;
  try{
    const {error}=await db.rpc('admin_clear_participants',{p_code:adminCode,p_pin:adminPin});
    if(error) throw error;
    await Promise.all([loadParticipants(),loadDashboard()]);
    alert('تم مسح المشاركين وتجهيز المسابقة ✓');
  }catch(e){alert(e.message||'تعذر المسح.');}
});

$('#clearQuestionsBtn')?.addEventListener('click',async()=>{
  if(!confirm('سيتم حذف جميع الأسئلة والإجابات والجلسات. هل أنت متأكد؟')) return;
  try{
    const {error}=await db.rpc('admin_clear_questions',{p_code:adminCode,p_pin:adminPin});
    if(error) throw error;
    await loadDashboard();
    alert('تم مسح الأسئلة ✓');
  }catch(e){alert(e.message||'تعذر المسح.');}
});

$('#logoInput')?.addEventListener('change',async(e)=>{
  const file=e.target.files?.[0]; if(!file)return;
  if(!file.type.startsWith('image/')){alert('اختر صورة فقط.');return;}
  if(file.size>750*1024){alert('حجم الشعار يجب ألا يتجاوز 750KB.');e.target.value='';return;}
  const reader=new FileReader();
  reader.onload=async()=>{
    try{
      const {error}=await db.rpc('admin_set_competition_logo',{p_code:adminCode,p_pin:adminPin,p_logo_data_uri:reader.result});
      if(error) throw error;
      msg('#logoMsg','تم تحديث شعار الجهة ✓');
      await loadDashboard();
    }catch(err){msg('#logoMsg',err.message||'تعذر حفظ الشعار.',true);}
  };
  reader.readAsDataURL(file);
});

$('#sendNotifyBtn')?.addEventListener('click',async()=>{
  const title=$('#notifyTitle').value.trim(), body=$('#notifyBody').value.trim(), kind=$('#notifyKind').value;
  if(!title||!body){msg('#notifyMsg','اكتب عنوان ونص التنبيه.',true);return;}
  const btn=$('#sendNotifyBtn'); btn.disabled=true; msg('#notifyMsg','جارٍ تجهيز التنبيه...');
  try{
    const {error}=await db.rpc('admin_queue_notification',{p_code:adminCode,p_pin:adminPin,p_title:title,p_body:body,p_kind:kind});
    if(error)throw error;
    msg('#notifyMsg','تم وضع التنبيه في طابور الإرسال ✓');
    $('#notifyBody').value='';
  }catch(e){msg('#notifyMsg',e.message||'تعذر إنشاء التنبيه.',true);}
  finally{btn.disabled=false;}
});


$('#changeCodeBtn')?.addEventListener('click',async()=>{
  const newCode=$('#compCode').value.trim().toUpperCase();
  if(!/^[A-Z0-9]{2,12}$/.test(newCode)){
    msg('#codeMsg','اكتب رمزًا من 2 إلى 12 حرفًا أو رقمًا بالإنجليزية.',true);
    return;
  }
  if(newCode===adminCode){
    msg('#codeMsg','هذا هو الرمز الحالي.');
    return;
  }
  if(!confirm(`تغيير رمز المسابقة من ${adminCode} إلى ${newCode}؟\nسيتغير رابط وQR الدخول.`)) return;

  const btn=$('#changeCodeBtn');
  btn.disabled=true;
  msg('#codeMsg','جارٍ تغيير الرمز...');
  try{
    const {data,error}=await db.rpc('admin_change_competition_code',{
      p_code:adminCode,
      p_pin:adminPin,
      p_new_code:newCode
    });
    if(error)throw error;
    const result=Array.isArray(data)?data[0]:data;
    adminCode=result?.code||newCode;
    $('#adminCode').value=adminCode;
    $('#compCode').value=adminCode;
    const u=new URL(location.href);
    u.searchParams.set('code',adminCode);
    history.replaceState(null,'',u.toString());
    msg('#codeMsg','تم تغيير رمز المسابقة ✓');
    await loadDashboard();
  }catch(e){
    msg('#codeMsg',e.message||'تعذر تغيير رمز المسابقة.',true);
  }finally{
    btn.disabled=false;
  }
});


function applyRoleUI(){
  const platformOwner=adminRole==='owner' && dashboard?.competition?.organization_id===PLATFORM_ORG_ID;

  document.querySelectorAll('.owner-only').forEach(el=>{
    el.classList.toggle('hidden',adminRole!=='owner');
  });

  document.querySelectorAll('.platform-owner-only').forEach(el=>{
    el.classList.toggle('hidden',!platformOwner);
  });

  ['commercialPanel','subscriptionRequestsPanel','platformSecurityPanel'].forEach(id=>{
    const el=$('#'+id);
    if(el) el.classList.toggle('hidden',!platformOwner);
  });

  const viewer=adminRole==='viewer';
  const mutationIds=[
    'saveCompetitionBtn','newQuestionBtn','clearQuestionsBtn','saveQuestionBtn',
    'clearParticipantsBtn','saveParticipantBtn','logoInput','sendNotifyBtn',
    'publishResultsBtn'
  ];
  mutationIds.forEach(id=>{
    const el=$('#'+id);
    if(el) el.disabled=viewer;
  });

  if(viewer){
    ['compTitle','compOrg','compStart','compSeconds','compStatus','questionOrder','questionText',
     'optionA','optionB','optionC','optionD','correctOption','participantName','participantMobile',
     'participantSchool','notifyTitle','notifyKind','notifyBody'
    ].forEach(id=>{const el=$('#'+id);if(el)el.disabled=true;});
  }
}

async function loadStaff(){
  if(adminRole!=='owner')return;
  const {data,error}=await db.rpc('admin_list_staff',{p_code:adminCode,p_pin:adminPin});
  if(error)throw error;
  renderStaff(Array.isArray(data)?data:[]);
}

function renderStaff(items){
  const box=$('#staffList');
  if(!box)return;
  box.innerHTML='';
  if(!items.length){
    box.innerHTML='<p class="hint">لا يوجد مشرفون إضافيون حتى الآن.</p>';
    return;
  }

  items.forEach(s=>{
    const row=document.createElement('div');
    row.className='participant-card';

    const head=document.createElement('div');
    head.className='participant-head';

    const identity=document.createElement('div');
    const name=document.createElement('strong');
    name.textContent=s.full_name||'مشرف';
    const meta=document.createElement('div');
    meta.className='participant-meta';
    meta.textContent=`${s.email||''} • ${s.role==='supervisor'?'مشرف':'مراقب'}`;
    identity.append(name,meta);

    const status=document.createElement('span');
    status.className=s.active?'participant-status completed':'participant-status pending';
    status.textContent=s.active?'فعال':'موقوف';
    head.append(identity,status);

    const actions=document.createElement('div');
    actions.className='participant-actions';

    const toggle=document.createElement('button');
    toggle.className='small-btn';
    toggle.textContent=s.active?'إيقاف':'تفعيل';
    toggle.onclick=()=>setStaffActive(s,!s.active);

    const del=document.createElement('button');
    del.className='small-btn danger-btn';
    del.textContent='حذف';
    del.onclick=()=>deleteStaff(s);

    actions.append(toggle,del);
    row.append(head,actions);
    box.appendChild(row);
  });
}

$('#saveStaffBtn')?.addEventListener('click',async()=>{
  const fullName=$('#staffName').value.trim();
  const email=$('#staffEmail').value.trim();
  const role=$('#staffRole').value;
  const pin=$('#staffPin').value.trim();

  if(!fullName||!email||!/^[0-9]{6}$/.test(pin)){
    msg('#staffMsg','أدخل الاسم والبريد ورمز دخول من 6 أرقام.',true);
    return;
  }

  const btn=$('#saveStaffBtn');
  btn.disabled=true;
  msg('#staffMsg','جارٍ الحفظ...');
  try{
    const {error}=await db.rpc('admin_add_staff',{
      p_code:adminCode,
      p_pin:adminPin,
      p_full_name:fullName,
      p_email:email,
      p_role:role,
      p_staff_pin:pin
    });
    if(error)throw error;
    $('#staffName').value='';
    $('#staffEmail').value='';
    $('#staffPin').value='';
    msg('#staffMsg','تم حفظ المشرف ✓');
    await loadStaff();
  }catch(e){
    msg('#staffMsg',e.message||'تعذر حفظ المشرف.',true);
  }finally{
    btn.disabled=false;
  }
});

async function setStaffActive(staff,active){
  try{
    const {error}=await db.rpc('admin_set_staff_active',{
      p_code:adminCode,p_pin:adminPin,p_staff_id:staff.id,p_active:active
    });
    if(error)throw error;
    await loadStaff();
  }catch(e){alert(e.message||'تعذر تحديث المشرف.');}
}

async function deleteStaff(staff){
  if(!confirm(`حذف ${staff.full_name} من المشرفين؟`))return;
  try{
    const {error}=await db.rpc('admin_delete_staff',{
      p_code:adminCode,p_pin:adminPin,p_staff_id:staff.id
    });
    if(error)throw error;
    await loadStaff();
  }catch(e){alert(e.message||'تعذر حذف المشرف.');}
}

$('#refreshStaffBtn')?.addEventListener('click',async()=>{
  try{await loadStaff();}catch(e){alert(e.message||'تعذر تحديث المشرفين.');}
});


async function loadCommercialSettings(){
  if(adminRole!=='owner')return;
  const {data,error}=await db.rpc('owner_get_commercial_settings',{
    p_code:adminCode,
    p_pin:adminPin
  });
  if(error)throw error;

  const r=Array.isArray(data)?data[0]:data;
  $('#bankName').value=r?.bank_name||'';
  $('#accountName').value=r?.account_name||'';
  $('#iban').value=r?.iban||'';
  $('#transferNote').value=r?.transfer_note||'';

  const box=$('#plansOwnerView');
  if(!box)return;
  box.innerHTML='';

  (r?.plans||[]).forEach(plan=>{
    const card=document.createElement('div');
    card.className='stat';

    const name=document.createElement('span');
    name.textContent=plan.name||plan.code;

    const price=document.createElement('strong');
    price.textContent=`${Number(plan.monthly_price||0).toFixed(0)} ر.س`;

    const meta=document.createElement('small');
    meta.className='hint';
    meta.textContent=
      plan.code==='free'
      ? `تجريبية • ${plan.max_questions_per_competition} سؤال • ${plan.max_participants} مشارك`
      : `${plan.max_competitions} مسابقة • ${plan.max_questions_per_competition} سؤال • ${plan.max_participants} مشارك`;

    card.append(name,price,meta);
    box.appendChild(card);
  });
}

$('#saveCommercialBtn')?.addEventListener('click',async()=>{
  if(adminRole!=='owner')return;
  const btn=$('#saveCommercialBtn');
  btn.disabled=true;
  msg('#commercialMsg','جارٍ الحفظ...');

  try{
    const {error}=await db.rpc('owner_update_commercial_settings',{
      p_code:adminCode,
      p_pin:adminPin,
      p_bank_name:$('#bankName').value.trim(),
      p_account_name:$('#accountName').value.trim(),
      p_iban:$('#iban').value.trim(),
      p_transfer_note:$('#transferNote').value.trim()
    });

    if(error)throw error;
    msg('#commercialMsg','تم حفظ الإعدادات التجارية ✓');
    await loadCommercialSettings();
  }catch(e){
    msg('#commercialMsg',e.message||'تعذر حفظ الإعدادات التجارية.',true);
  }finally{
    btn.disabled=false;
  }
});

$('#refreshCommercialBtn')?.addEventListener('click',async()=>{
  try{await loadCommercialSettings();}
  catch(e){msg('#commercialMsg',e.message||'تعذر تحديث البيانات.',true);}
});


async function loadSubscriptionRequests(){
  if(adminRole!=='owner')return;
  const box=$('#subscriptionRequestsList');
  if(!box)return;
  box.innerHTML='<p class="hint">جارٍ تحميل الطلبات...</p>';

  const {data,error}=await db.rpc('owner_list_subscription_requests',{
    p_code:adminCode,
    p_pin:adminPin
  });
  if(error)throw error;

  const items=Array.isArray(data)?data:(data||[]);
  if(!items.length){
    box.innerHTML='<p class="hint">لا توجد طلبات اشتراك حتى الآن.</p>';
    return;
  }

  box.innerHTML='';
  items.forEach(r=>{
    const row=document.createElement('div');
    row.className='question-item';
    const statusLabel={
      receipt_uploaded:'بانتظار المراجعة',
      under_review:'تحت المراجعة',
      approved:'مفعّل',
      rejected:'مرفوض'
    }[r.status]||r.status;

    row.innerHTML=`
      <div style="flex:1">
        <strong>${escapeHtml(r.organization_name||'')}</strong>
        <div class="hint">${escapeHtml(r.request_number||'')} • ${escapeHtml(r.contact_name||'')} • ${escapeHtml(r.phone||'')}</div>
        <div class="hint">الباقة الحالية:</div>
        <select class="request-plan-select" ${r.status==='approved'?'disabled':''} style="max-width:220px;margin:6px 0 8px">
          <option value="school" ${r.plan_code==='school'?'selected':''}>مدرسة — 150 ر.س</option>
          <option value="pro" ${r.plan_code==='pro'?'selected':''}>احترافية — 200 ر.س</option>
        </select>
        <div class="hint">الحالة: ${escapeHtml(statusLabel)}</div>
        ${r.email?`<div class="hint">${escapeHtml(r.email)}</div>`:''}
        ${r.owner_note?`<div class="hint">ملاحظة: ${escapeHtml(r.owner_note)}</div>`:''}
        ${r.competition_code?`<div class="hint">رمز المسابقة: <strong>${escapeHtml(r.competition_code)}</strong></div>`:''}
      </div>
      <div class="actions" style="flex-wrap:wrap">
        <button class="small-btn receipt-btn" type="button">عرض الإيصال</button>
        ${r.status!=='approved'&&r.status!=='rejected'?'<button class="small-btn review-btn" type="button">تحت المراجعة</button>':''}
        ${r.status!=='approved'?'<button class="small-btn approve-btn" type="button">اعتماد وتفعيل</button>':''}
        ${r.status!=='approved'&&r.status!=='rejected'?'<button class="small-btn danger-btn reject-btn" type="button">رفض</button>':''}
      </div>`;

    row.querySelector('.request-plan-select')?.addEventListener('change',async(e)=>{
      const nextPlan=e.target.value;
      const previous=r.plan_code;
      e.target.disabled=true;
      try{
        const {error}=await db.rpc('owner_change_subscription_request_plan',{
          p_code:adminCode,
          p_pin:adminPin,
          p_request_id:r.id,
          p_plan_code:nextPlan
        });
        if(error)throw error;
        r.plan_code=nextPlan;
        msg('#subscriptionRequestsMsg','تم تغيير باقة الطلب ✓');
      }catch(err){
        e.target.value=previous;
        msg('#subscriptionRequestsMsg',err.message||'تعذر تغيير الباقة.',true);
      }finally{
        if(r.status!=='approved') e.target.disabled=false;
      }
    });

    row.querySelector('.receipt-btn')?.addEventListener('click',()=>{
      if(r.receipt_data_uri){
        const w=window.open();
        if(w)w.document.write('<img src="'+r.receipt_data_uri+'" style="max-width:100%;height:auto">');
      }
    });

    row.querySelector('.review-btn')?.addEventListener('click',()=>reviewSubscriptionRequest(r.id,'under_review'));
    row.querySelector('.approve-btn')?.addEventListener('click',()=>reviewSubscriptionRequest(r.id,'approved'));
    row.querySelector('.reject-btn')?.addEventListener('click',()=>reviewSubscriptionRequest(r.id,'rejected'));
    box.appendChild(row);
  });
}

async function reviewSubscriptionRequest(id,action){
  const labels={approved:'اعتماد هذا الطلب وتفعيل الاشتراك؟',rejected:'رفض هذا الطلب؟',under_review:'نقل الطلب إلى تحت المراجعة؟'};
  if(!confirm(labels[action]||'متابعة؟'))return;

  let note='';
  if(action==='rejected') note=prompt('سبب الرفض أو الملاحظة للعميل:','')||'';
  else if(action==='under_review') note=prompt('ملاحظة اختيارية:','')||'';

  msg('#subscriptionRequestsMsg','جارٍ تحديث الطلب...');
  const {data,error}=await db.rpc('owner_review_subscription_request',{
    p_code:adminCode,
    p_pin:adminPin,
    p_request_id:id,
    p_action:action,
    p_note:note
  });
  if(error){
    msg('#subscriptionRequestsMsg',error.message||'تعذر تحديث الطلب.',true);
    return;
  }
  const r=Array.isArray(data)?data[0]:data;
  msg('#subscriptionRequestsMsg',
    action==='approved'
      ? 'تم اعتماد الاشتراك وإنشاء حساب الجهة. رمز المسابقة: '+(r?.competition_code||'')
      : 'تم تحديث حالة الطلب ✓'
  );
  await loadSubscriptionRequests();
}

$('#refreshSubscriptionRequestsBtn')?.addEventListener('click',async()=>{
  try{await loadSubscriptionRequests();}
  catch(e){msg('#subscriptionRequestsMsg',e.message||'تعذر تحميل الطلبات.',true);}
});


async function loadSubscriptionSummary(){
  const box=$('#subscriptionSummary');
  if(!box)return;

  const {data,error}=await db.rpc('admin_get_subscription_summary',{
    p_code:adminCode,
    p_pin:adminPin
  });

  if(error){
    box.innerHTML='';
    msg('#subscriptionSummaryMsg',error.message||'تعذر تحميل بيانات الاشتراك.',true);
    return;
  }

  const r=Array.isArray(data)?data[0]:data;
  if(!r?.available){
    box.innerHTML='<p class="hint">لا توجد بيانات اشتراك مرتبطة بهذه المسابقة.</p>';
    return;
  }

  if($('#subscriptionStatusBadge')){
    $('#subscriptionStatusBadge').textContent=r.status==='active'?'مفعّل':(r.status||'');
  }

  const items=[
    ['الباقة',r.plan_name||r.plan_code||'—'],
    ['المسابقات',String(r.max_competitions??'—')],
    ['الأسئلة لكل مسابقة',String(r.max_questions_per_competition??'—')],
    ['المشاركون',String(r.max_participants??'—')]
  ];

  box.innerHTML='';
  items.forEach(([label,value])=>{
    const d=document.createElement('div');
    d.className='stat';
    const s=document.createElement('span');
    s.textContent=label;
    const strong=document.createElement('strong');
    strong.textContent=value;
    d.append(s,strong);
    box.appendChild(d);
  });

  msg('#subscriptionSummaryMsg',
    r.is_platform_owner
      ? 'حساب مالك منصة لَمْح.'
      : 'هذه هي حدود باقة الجهة الحالية.'
  );
}
