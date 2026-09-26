/* =========================================================
   لَمْح | LAMH
   منصة المسابقات
   المطور والمصمم / فهد اللهيبي
   ========================================================= */

const SUPABASE_URL = 'https://qgfuqmturtpglngpmtau.supabase.co';
const SUPABASE_KEY = 'sb_publishable_G3ZOB1cLQmEeyvx4UjdNew_9IMSY2Vc';

const db = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

/* ---------- الحالة العامة ---------- */

let participantId = null;
let competitionId = null;
let competition = null;
let competitionCode = null;

let questions = [];
let currentQuestion = 0;

let questionStartedAt = 0;
let waitingTimer = null;
let waitingPollTimer = null;
let waitingCountdownTimer = null;
let waitingGeneration = 0;
let waitingActive = false;
let waitingPollRequest = null;
let waitingStartTimestamp = null;
let serverClockOffset = 0;
let questionDeadline = 0;
let resultPollTimer = null;
let resultGeneration = 0;
let submitting = false;


/* ---------- أدوات ---------- */

const $ = (selector) => document.querySelector(selector);

function syncParticipantAffiliationField() {
  const type = $('#participantType')?.value || 'school';
  const input = $('#school');
  if (!input) return;

  if (type === 'group') {
    input.placeholder = 'اكتب اسم المجموعة أو الفريق';
  } else if (type === 'entity') {
    input.placeholder = 'اكتب اسم الجهة';
  } else {
    input.placeholder = 'اكتب اسم المدرسة';
  }
}

$('#participantType')?.addEventListener('change', syncParticipantAffiliationField);
syncParticipantAffiliationField();

function show(screenId) {
  if (screenId !== 'result') { clearTimeout(resultPollTimer); resultGeneration++; }
  ['join', 'waiting', 'quiz', 'result'].forEach(id => {
    const element = $('#' + id);

    if (element) {
      element.classList.toggle('hidden', id !== screenId);
    }
  });
}

function setMessage(text, isError = false) {
  const element = $('#hello');

  if (!element) return;

  element.textContent = text;
  element.classList.toggle('error', isError);
}

function cleanPhone(value) {
  return value.replace(/[^\d+]/g, '');
}


const SESSION_KEY='lamh_participant_session_v1';

function saveParticipantSession(fullName){
  try{
    localStorage.setItem(SESSION_KEY,JSON.stringify({participantId,competitionId,competitionCode,fullName:fullName||'',savedAt:Date.now()}));
  }catch(e){console.warn('SESSION SAVE',e);}
}

function clearParticipantSession(){
  try{localStorage.removeItem(SESSION_KEY);}catch(e){}
}

async function restoreParticipantSession(){
  try{
    const raw=localStorage.getItem(SESSION_KEY);
    if(!raw)return false;
    const s=JSON.parse(raw);
    if(!s?.participantId||!s?.competitionCode)return false;
    const urlCode=(presetCode||'').toUpperCase();
    if(urlCode&&urlCode!==String(s.competitionCode).toUpperCase())return false;
    const {data,error}=await db.rpc('get_participant_progress',{p_participant_id:s.participantId});
    if(error)throw error;
    participantId=s.participantId;
    competitionId=s.competitionId||data?.competition_id||null;
    competitionCode=String(s.competitionCode).toUpperCase();
    if($('#code'))$('#code').value=competitionCode;
    const waitingHello=$('#waiting h2');
    if(waitingHello)waitingHello.textContent=`أهلًا ${s.fullName||'بك'}، استعد للمسابقة`;
    await loadCompetition();
    return true;
  }catch(e){
    console.warn('SESSION RESTORE',e);
    clearParticipantSession();
    return false;
  }
}

/* =========================================================
   1 ـ دخول المتسابق
   ========================================================= */

const params = new URLSearchParams(window.location.search);
const presetCode = params.get('code');

if (presetCode && $('#code')) {
  $('#code').value = presetCode.toUpperCase();
}

const joinForm = $('#joinForm');

if (joinForm) {

  joinForm.addEventListener('submit', async (event) => {

    event.preventDefault();

    if (submitting) return;

    const fullName = $('#name')?.value.trim() || '';
    const phone = cleanPhone($('#phone')?.value.trim() || '');
    const school = $('#school')?.value.trim() || '';
    const code = ($('#code')?.value.trim() || '').toUpperCase();
    competitionCode = code;

    if (!fullName || !phone || !school || !code) {
      setMessage(
        'يرجى تعبئة الاسم الثلاثي ورقم الجوال والمدرسة ورمز المسابقة.',
        true
      );
      return;
    }

    const nameParts = fullName
      .split(/\s+/)
      .filter(Boolean);

    if (nameParts.length < 3) {
      setMessage('يرجى كتابة الاسم الثلاثي كاملًا.', true);
      return;
    }

    if (!/^05\d{8}$/.test(phone)) {
      setMessage(
        'رقم الجوال يجب أن يكون بصيغة 05XXXXXXXX.',
        true
      );
      return;
    }

    submitting = true;
    setMessage('جارٍ التحقق من المسابقة...');

    const submitButton =
      joinForm.querySelector('button[type="submit"]');

    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = 'جارٍ الدخول...';
    }

    try {

      /*
        الدالة الموجودة فعليًا في Supabase:
        join_competition(
          p_code text,
          p_full_name text,
          p_phone text,
          p_school text
        )
      */

      const { data, error } = await db.rpc(
        'join_competition',
        {
          p_code: code,
          p_full_name: fullName,
          p_phone: phone,
          p_school: school
        }
      );

      if (error) {
        throw error;
      }

      console.log('join_competition:', data);

      const result =
        Array.isArray(data)
          ? data[0]
          : data;

      if (!result) {
        throw new Error(
          'لم ترجع قاعدة البيانات بيانات التسجيل.'
        );
      }

      /*
        دعم أكثر من شكل محتمل لنتيجة JSON
        دون تغيير قاعدة البيانات.
      */

      participantId =
        result.participant_id ??
        result.participantId ??
        result.id ??
        null;

      competitionId =
        result.competition_id ??
        result.competitionId ??
        null;

      /*
        بعض الدوال قد تعيد JSON داخل خاصية أخرى.
      */

      if (!participantId && result.participant) {
        participantId =
          result.participant.id ??
          result.participant.participant_id ??
          null;
      }

      if (!competitionId && result.competition) {
        competitionId =
          result.competition.id ??
          result.competition.competition_id ??
          null;
      }

      /*
        إذا أعادت الدالة code بدل competition_id
        نحصل على المسابقة من الجدول.
      */

      if (!competitionId) {

        const { data: compData, error: compError } =
          await db
            .from('competitions')
            .select('*')
            .eq('code', code)
            .maybeSingle();

        if (compError) {
          throw compError;
        }

        if (compData) {
          competitionId = compData.id;
          competition = compData;
        }
      }

      if (!participantId) {
        throw new Error(
          'تم الاتصال بقاعدة البيانات ولكن لم يتم الحصول على رقم المتسابق.'
        );
      }

      if (!competitionId) {
        throw new Error(
          'لم يتم العثور على المسابقة المرتبطة بهذا الرمز.'
        );
      }

      saveParticipantSession(fullName);

      show('waiting');

      const waitingHello = $('#waiting h2');

      if (waitingHello) {
        waitingHello.textContent =
          `أهلًا ${fullName}، استعد للمسابقة`;
      }

      await loadCompetition();

    } catch (error) {

      console.error('JOIN ERROR:', error);

      let message =
        error?.message ||
        'تعذر الدخول إلى المسابقة.';

      setMessage(message, true);

      show('join');

    } finally {

      submitting = false;

      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = 'دخول المسابقة';
      }
    }
  });
}


/* =========================================================
   2 ـ تحميل المسابقة والأسئلة
   ========================================================= */

function stopWaiting() {
  waitingActive = false;
  waitingGeneration++;
  clearInterval(waitingPollTimer);
  clearInterval(waitingCountdownTimer);
  waitingPollTimer = waitingCountdownTimer = null;
  waitingPollRequest = null;
  waitingStartTimestamp = null;
}

function setWaitingText(text, isCountdown = false) {
  const count = $('#count');
  if (!count) return;
  count.textContent = text;
  count.classList.toggle('waiting-message', !isCountdown);
}

async function loadCompetition() {
  stopWaiting();
  waitingActive = true;
  show('waiting');
  setWaitingText('جارٍ التحقق من موعد المسابقة...');
  startWaitingPolling();
  await pollWaitingCompetition();
}

function startWaitingPolling() {
  clearInterval(waitingPollTimer);
  waitingPollTimer = setInterval(pollWaitingCompetition, 2000);
}

async function pollWaitingCompetition() {
  if (!waitingActive || waitingPollRequest) return;
  const request = {};
  waitingPollRequest = request;
  const generation = waitingGeneration;
  try {
    const { data, error } = await db.rpc('get_public_competition', { p_code: competitionCode });
    if (generation !== waitingGeneration || !waitingActive) return;
    if (error) throw error;
    competition = Array.isArray(data) ? data[0] : data;
    if (!competition) throw new Error('المسابقة غير موجودة.');
    const ministryLogo = $('#ministryLogo');
    if (ministryLogo) {
      ministryLogo.style.display = competition.show_ministry_logo === false ? 'none' : '';
    }

    const participantType = $('#participantType');
    const affiliationLabel = $('#affiliationLabel');
    const affiliationInput = $('#school');
    if (affiliationLabel && affiliationInput) {
      const syncAffiliationField = () => {
        const type = participantType?.value || 'school';
        if (type === 'group') {
          affiliationLabel.textContent = 'اسم المجموعة / الفريق';
          affiliationInput.placeholder = 'اكتب اسم المجموعة أو الفريق';
        } else if (type === 'entity') {
          affiliationLabel.textContent = 'اسم الجهة';
          affiliationInput.placeholder = 'اكتب اسم الجهة';
        } else {
          affiliationLabel.textContent = 'اسم المدرسة';
          affiliationInput.placeholder = 'اكتب اسم المدرسة';
        }
      };

      if (participantType) {
        participantType.value = competition.organization_type === 'group'
          ? 'group'
          : competition.organization_type === 'entity'
            ? 'entity'
            : 'school';
        participantType.addEventListener('change', syncAffiliationField);
      }

      syncAffiliationField();
    }

    const schoolLogo = competition.organization_logo_data_uri || competition.logo_data_uri || competition.logo_url;
    if (schoolLogo) document.querySelectorAll('header.top img.logo').forEach(img => {
      if (img.alt !== 'وزارة التعليم') img.src = schoolLogo;
    });
    const serverNow = new Date(competition.server_now).getTime();
    if (Number.isFinite(serverNow)) serverClockOffset = serverNow - Date.now();
    if (competition.status === 'finished') return finishCompetition();
    const start = competition.start_at ? new Date(competition.start_at).getTime() : NaN;
    if (Number.isFinite(start) && start > Date.now() + serverClockOffset) {
      startWaitingCountdown(start);
    } else if (competition.status === 'live') {
      await startQuiz();
    } else {
      clearInterval(waitingCountdownTimer);
      waitingCountdownTimer = null;
      waitingStartTimestamp = null;
      setWaitingText(Number.isFinite(start)
        ? 'حان الموعد، بانتظار تشغيل المسابقة من المنظم.'
        : 'بانتظار تحديد موعد البداية من المنظم.');
    }
    const note = $('#waitingNote');
    if (note) note.textContent = 'سيبدأ السؤال تلقائيًا عند حلول موعد المسابقة.';
  } catch (error) {
    if (generation !== waitingGeneration || !waitingActive) return;
    const note = $('#waitingNote');
    if (note) note.textContent = 'تعذر تحديث حالة المسابقة. نحاول الاتصال تلقائيًا...';
    if (!waitingCountdownTimer) setWaitingText('بانتظار الاتصال بالمسابقة...');
  } finally {
    if (waitingPollRequest === request) waitingPollRequest = null;
  }
}

function startWaitingCountdown(startTimestamp) {
  if (waitingStartTimestamp === startTimestamp && waitingCountdownTimer) return;
  clearInterval(waitingCountdownTimer);
  waitingStartTimestamp = startTimestamp;
  waitingCountdownTimer = setInterval(updateWaitingCountdown, 100);
  updateWaitingCountdown();
}

function updateWaitingCountdown() {
  if (!waitingActive || waitingStartTimestamp === null) return;
  const remaining = waitingStartTimestamp - (Date.now() + serverClockOffset);
  if (remaining <= 0) {
    clearInterval(waitingCountdownTimer);
    waitingCountdownTimer = null;
    waitingStartTimestamp = null;
    // Refresh the effective server status when a scheduled waiting period ends.
    if (competition?.status === 'live') {
      void startQuiz();
    } else {
      setWaitingText('حان الموعد، بانتظار تشغيل المسابقة من المنظم.');
      void pollWaitingCompetition();
    }
    return;
  }
  const total = Math.ceil(remaining / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const parts = hours > 0 ? [hours, minutes, seconds] : [minutes, seconds];
  setWaitingText(parts.map(value => String(value).padStart(2, '0')).join(':'), true);
}

document.addEventListener('visibilitychange', () => {
  if (!document.hidden && waitingActive) {
    updateWaitingCountdown();
    void pollWaitingCompetition();
  }
});


/* =========================================================
   4 ـ بدء المسابقة
   ========================================================= */

async function startQuiz(){
  stopWaiting();
  clearInterval(waitingTimer);
  show('quiz');
  await renderQuestion();
}


/* =========================================================
   5 ـ عرض السؤال
   ========================================================= */

function getQuestionText(question) {

  return (
    question.question_text ??
    question.text ??
    question.question ??
    question.title ??
    ''
  );
}


function getQuestionOptions(question) {

  let options =
    question.options ??
    question.answers ??
    question.choices ??
    [];

  if (typeof options === 'string') {

    try {
      options = JSON.parse(options);
    } catch {
      options = [];
    }
  }

  /*
    دعم الأعمدة المنفصلة إن وجدت.
  */

  if (
    (!Array.isArray(options) || options.length === 0) &&
    (
      question.option_a ||
      question.option_b ||
      question.option_c ||
      question.option_d
    )
  ) {

    options = [
      question.option_a,
      question.option_b,
      question.option_c,
      question.option_d
    ].filter(value => value != null);
  }

  return Array.isArray(options)
    ? options
    : [];
}


async function renderQuestion(){
  try{
    const {data,error}=await db.rpc('get_current_question',{p_participant_id:participantId});
    if(error) throw error;
    const r=Array.isArray(data)?data[0]:data;
    if(r?.completed) return finishCompetition();
    const q=r?.question;
    if(!q) throw new Error('تعذر تحميل السؤال.');
    let session=r;
    if(r.needs_start){
      const started=await db.rpc('start_question_session',{p_participant_id:participantId,p_question_id:q.id});
      if(started.error) throw started.error;
      session=Array.isArray(started.data)?started.data[0]:started.data;
    }
    currentQuestion=q;
    const qnum=$('#qnum'),qe=$('#question'),ae=$('#answers');
    if(qnum)qnum.textContent=`السؤال ${q.order||q.question_order}`;
    if(qe)qe.textContent=q.text||q.question_text||'';
    if(ae)ae.innerHTML='';
    [q.option_a,q.option_b,q.option_c,q.option_d].forEach((option,index)=>{
      if(option==null)return;
      const b=document.createElement('button');b.type='button';b.className='answer';b.textContent=String(option);
      b.onclick=()=>submitAnswer(q,index,b);ae?.appendChild(b);
    });
    questionStartedAt=performance.now();
    startServerQuestionCountdown(session.expires_at,q.id,session.remaining_ms);
  }catch(e){console.error('QUESTION ERROR',e);setMessage(e.message||'تعذر تحميل السؤال.',true);}
}
function startServerQuestionCountdown(expiresAt,qid,remainingMs){
  clearInterval(waitingTimer);
  let timer=$('#questionTimer');
  if(!timer){timer=document.createElement('div');timer.id='questionTimer';timer.className='countdown';$('#quiz')?.insertBefore(timer,$('#question'));}
  const initial = Number.isFinite(remainingMs) ? remainingMs : new Date(expiresAt).getTime() - (Date.now() + serverClockOffset);
  questionDeadline = performance.now() + Math.max(0, initial);
  const tick=()=>{
    const remain=questionDeadline-performance.now();
    timer.textContent=`${Math.max(0,Math.ceil(remain/1000))} ث`;
    if(remain<=0){
      document.querySelectorAll('#answers button').forEach(b=>b.disabled=true);
      clearInterval(waitingTimer);
      void expireServerQuestion(qid);
    }
  };
  waitingTimer=setInterval(tick,100);tick();
}
async function expireServerQuestion(qid){
  if(submitting)return;submitting=true;
  try{const {data,error}=await db.rpc('expire_question_session',{p_participant_id:participantId,p_question_id:qid});if(error)throw error;submitting=false;
    const result=Array.isArray(data)?data[0]:data;
    if(result?.expired===false) return startServerQuestionCountdown(null,qid,result.remaining_ms);
    await renderQuestion();
  }
  catch(e){submitting=false;console.error('EXPIRE ERROR',e);const timer=$('#questionTimer');if(timer)timer.textContent='جارٍ إعادة الاتصال...';waitingTimer=setTimeout(()=>expireServerQuestion(qid),2000);}
}


/* =========================================================
   6 ـ إرسال الإجابة
   ========================================================= */

async function submitAnswer(question,selectedIndex,selectedButton){
  if(submitting)return;submitting=true;
  const responseMs=Math.max(0,Math.round(performance.now()-questionStartedAt));
  const buttons=document.querySelectorAll('#answers button');buttons.forEach(b=>b.disabled=true);selectedButton?.classList.add('selected');
  try{
    const {data,error}=await db.rpc('submit_answer',{p_participant_id:participantId,p_question_id:question.id,p_selected_index:selectedIndex,p_response_ms:responseMs});
    if(error)throw error;
    clearInterval(waitingTimer);
    const r=Array.isArray(data)?data[0]:data;
    await new Promise(res=>setTimeout(res,r?.timed_out?150:250));
    submitting=false;await renderQuestion();
  }catch(e){
    submitting=false;
    const expired=performance.now()>=questionDeadline;
    buttons.forEach(b=>b.disabled=expired);selectedButton?.classList.remove('selected');
    if(expired){clearInterval(waitingTimer);waitingTimer=setTimeout(()=>expireServerQuestion(question.id),1000);}
    alert(e.message||'تعذر تسجيل الإجابة.');
  }
}


/* =========================================================
   7 ـ نهاية المسابقة
   ========================================================= */

async function finishCompetition(){
  stopWaiting();
  clearInterval(waitingTimer);show('result');
  clearTimeout(resultPollTimer);
  const generation=++resultGeneration;
  await refreshPublishedResult(generation);
}

function showResultDetails(visible){
  document.querySelectorAll('#result .result-stats, #result .leaderboard-box, #result .result-note, #result .trophy').forEach(el=>el.classList.toggle('hidden',!visible));
  const title=$('#result h2');if(title)title.textContent=visible?'نتائج المسابقة':'تم استلام إجاباتك';
}

async function refreshPublishedResult(generation){
  if(generation!==resultGeneration)return;
  let published=false;
  showResultDetails(false);
  const score=$('#score'),rankEl=$('#resultRank'),correctEl=$('#resultCorrect'),timeEl=$('#resultTime'),leaderboardEl=$('#leaderboard');
  if(score)score.textContent='بانتظار إعلان النتائج من المنظم. ستظهر هنا تلقائيًا.';if(leaderboardEl)leaderboardEl.innerHTML='';
  try{
    const {data,error}=await db.rpc('get_final_result',{p_participant_id:participantId});if(error)throw error;
    if(generation!==resultGeneration)return;
    const r=Array.isArray(data)?data[0]:data;
    if(r?.results_published!==true)return;
    published=true;showResultDetails(true);
    if(score)score.textContent=`أجبت بشكل صحيح عن ${r?.correct??0} من ${r?.total_questions??0}`;
    if(rankEl)rankEl.textContent=r?.rank?`#${r.rank}`:'—';
    if(correctEl)correctEl.textContent=`${r?.correct??0}/${r?.total_questions??0}`;
    if(timeEl)timeEl.textContent=`${(Number(r?.total_response_ms||0)/1000).toFixed(2)} ث`;
    if(competitionCode&&leaderboardEl){
      const {data:leaders}=await db.rpc('get_competition_leaderboard',{p_code:competitionCode,p_limit:5});
      if(generation!==resultGeneration)return;
      if(Array.isArray(leaders)&&leaders.length)leaders.forEach(x=>{
        const row=document.createElement('div');row.className='leader-row';
        const rk=document.createElement('span');rk.className='leader-rank';rk.textContent=`#${x.rank}`;
        const id=document.createElement('div');id.className='leader-identity';
        const n=document.createElement('strong');n.textContent=x.full_name||'متسابق';
        const s=document.createElement('small');s.textContent=x.school||'';
        id.append(n,s);const sc=document.createElement('span');sc.className='leader-score';sc.textContent=`${x.correct_answers??0} صحيحة`;
        row.append(rk,id,sc);leaderboardEl.appendChild(row);
      }); else leaderboardEl.textContent='لا توجد نتائج مكتملة حتى الآن.';
    }
  }catch(e){if(generation!==resultGeneration)return;showResultDetails(false);published=false;if(score)score.textContent='تعذر التحقق من إعلان النتائج. سنحاول تلقائيًا...';}
  finally{if(!published&&generation===resultGeneration)resultPollTimer=setTimeout(()=>refreshPublishedResult(generation),3000);}
}

/* =========================================================
   8 ـ العودة
   ========================================================= */

const againButton = $('#again');

if (againButton) {

  againButton.addEventListener(
    'click',
    () => {

      clearInterval(waitingTimer);

      stopWaiting();
      clearParticipantSession();
      participantId = null;
      competitionId = null;
      competition = null;
      competitionCode = null;

      questions = [];
      currentQuestion = 0;
      questionStartedAt = 0;
      submitting = false;

      if (joinForm) {
        joinForm.reset();
      }

      setMessage('');

      show('join');
    }
  );
}


/* ---------- البداية ---------- */

(async()=>{
  ['join','waiting','quiz','result'].forEach(id=>$('#'+id)?.classList.add('hidden'));
  const restored=await restoreParticipantSession();
  if(!restored)show('join');
})();
