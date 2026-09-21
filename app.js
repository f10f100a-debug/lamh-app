/* =========================================================
   لَمْح | LAMH
   منصة المسابقات
   المطور والمصمم / فهد اللهيبي
   ========================================================= */

const SUPABASE_URL = 'ضع_رابط_SUPABASE_الكامل_هنا';
const SUPABASE_KEY = 'ضع_sb_publishable_هنا';

const db = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

/* ---------- الحالة العامة ---------- */

let participantId = null;
let competitionId = null;
let competition = null;

let questions = [];
let currentQuestion = 0;

let questionStartedAt = 0;
let waitingTimer = null;
let submitting = false;


/* ---------- أدوات ---------- */

const $ = (selector) => document.querySelector(selector);

function show(screenId) {
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


/* =========================================================
   1 ـ دخول المتسابق
   ========================================================= */

const joinForm = $('#joinForm');

if (joinForm) {

  joinForm.addEventListener('submit', async (event) => {

    event.preventDefault();

    if (submitting) return;

    const fullName = $('#name')?.value.trim() || '';
    const phone = cleanPhone($('#phone')?.value.trim() || '');
    const school = $('#school')?.value.trim() || '';
    const code = ($('#code')?.value.trim() || '').toUpperCase();

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

async function loadCompetition() {

  try {

    if (!competition) {

      const { data, error } = await db
        .from('competitions')
        .select('*')
        .eq('id', competitionId)
        .single();

      if (error) {
        throw error;
      }

      competition = data;
    }

    const { data: questionData, error: questionError } =
      await db
        .from('questions')
        .select('*')
        .eq('competition_id', competitionId);

    if (questionError) {
      throw questionError;
    }

    questions = questionData || [];

    /*
      ترتيب مرن حسب العمود الموجود.
    */

    questions.sort((a, b) => {

      const aOrder =
        a.question_order ??
        a.position ??
        a.order_no ??
        a.sort_order ??
        0;

      const bOrder =
        b.question_order ??
        b.position ??
        b.order_no ??
        b.sort_order ??
        0;

      return aOrder - bOrder;
    });

    if (questions.length === 0) {

      const count = $('#count');

      if (count) {
        count.textContent = 'بانتظار إضافة الأسئلة';
      }

      return;
    }

    const startValue =
      competition.start_at ??
      competition.starts_at ??
      competition.start_time ??
      null;

    if (!startValue) {

      startQuiz();
      return;
    }

    const startTimestamp =
      new Date(startValue).getTime();

    if (Number.isNaN(startTimestamp)) {

      startQuiz();
      return;
    }

    if (Date.now() >= startTimestamp) {

      startQuiz();
      return;
    }

    startWaitingCountdown(startTimestamp);

  } catch (error) {

    console.error('LOAD ERROR:', error);

    const count = $('#count');

    if (count) {
      count.textContent =
        'تعذر تحميل بيانات المسابقة';
    }
  }
}


/* =========================================================
   3 ـ غرفة الانتظار
   ========================================================= */

function startWaitingCountdown(startTimestamp) {

  clearInterval(waitingTimer);

  function updateCountdown() {

    const remaining =
      startTimestamp - Date.now();

    if (remaining <= 0) {

      clearInterval(waitingTimer);

      const count = $('#count');

      if (count) {
        count.textContent = 'ابدأ!';
      }

      setTimeout(startQuiz, 300);
      return;
    }

    const totalSeconds =
      Math.ceil(remaining / 1000);

    const hours =
      Math.floor(totalSeconds / 3600);

    const minutes =
      Math.floor((totalSeconds % 3600) / 60);

    const seconds =
      totalSeconds % 60;

    const count = $('#count');

    if (!count) return;

    if (hours > 0) {

      count.textContent =
        `${String(hours).padStart(2, '0')}:` +
        `${String(minutes).padStart(2, '0')}:` +
        `${String(seconds).padStart(2, '0')}`;

    } else {

      count.textContent =
        `${String(minutes).padStart(2, '0')}:` +
        `${String(seconds).padStart(2, '0')}`;
    }
  }

  updateCountdown();

  waitingTimer =
    setInterval(updateCountdown, 250);
}


/* =========================================================
   4 ـ بدء المسابقة
   ========================================================= */

function startQuiz() {

  clearInterval(waitingTimer);

  currentQuestion = 0;

  show('quiz');

  renderQuestion();
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


function renderQuestion() {

  const question =
    questions[currentQuestion];

  if (!question) {

    finishCompetition();
    return;
  }

  const qnum = $('#qnum');
  const questionElement = $('#question');
  const answersElement = $('#answers');

  if (qnum) {

    qnum.textContent =
      `السؤال ${currentQuestion + 1} من ${questions.length}`;
  }

  if (questionElement) {

    questionElement.textContent =
      getQuestionText(question);
  }

  if (!answersElement) return;

  answersElement.innerHTML = '';

  const options =
    getQuestionOptions(question);

  if (options.length === 0) {

    answersElement.innerHTML =
      '<p>لا توجد خيارات لهذا السؤال.</p>';

    return;
  }

  options.forEach((option, index) => {

    const button =
      document.createElement('button');

    button.type = 'button';
    button.className = 'answer';

    button.textContent =
      typeof option === 'object'
        ? (
            option.text ??
            option.label ??
            option.value ??
            `الخيار ${index + 1}`
          )
        : String(option);

    button.addEventListener(
      'click',
      () => submitAnswer(
        question,
        index,
        button
      )
    );

    answersElement.appendChild(button);
  });

  /*
    يبدأ قياس زمن الاستجابة
    لحظة ظهور السؤال.
  */

  questionStartedAt =
    performance.now();
}


/* =========================================================
   6 ـ إرسال الإجابة
   ========================================================= */

async function submitAnswer(
  question,
  selectedIndex,
  selectedButton
) {

  if (submitting) return;

  submitting = true;

  const responseMs =
    Math.max(
      0,
      Math.round(
        performance.now() -
        questionStartedAt
      )
    );

  const buttons =
    document.querySelectorAll(
      '#answers button'
    );

  buttons.forEach(button => {
    button.disabled = true;
  });

  selectedButton?.classList.add(
    'selected'
  );

  try {

    /*
      الدالة التي تحققنا منها فعليًا:

      submit_answer(
        p_participant_id uuid,
        p_question_id uuid,
        p_selected_index integer,
        p_response_ms ...
      )
    */

    const { data, error } =
      await db.rpc(
        'submit_answer',
        {
          p_participant_id:
            participantId,

          p_question_id:
            question.id,

          p_selected_index:
            selectedIndex,

          p_response_ms:
            responseMs
        }
      );

    if (error) {
      throw error;
    }

    console.log(
      'submit_answer:',
      data
    );

    /*
      لا نسمح بإجابة ثانية.
      الانتقال للسؤال التالي بعد اعتماد الإجابة.
    */

    setTimeout(() => {

      submitting = false;

      currentQuestion++;

      if (
        currentQuestion >=
        questions.length
      ) {

        finishCompetition();

      } else {

        renderQuestion();
      }

    }, 450);

  } catch (error) {

    console.error(
      'ANSWER ERROR:',
      error
    );

    submitting = false;

    alert(
      error?.message ||
      'تعذر تسجيل الإجابة.'
    );

    /*
      نعيد تفعيل الخيارات فقط
      إذا رفض الخادم الطلب.
    */

    buttons.forEach(button => {
      button.disabled = false;
    });

    selectedButton?.classList.remove(
      'selected'
    );
  }
}


/* =========================================================
   7 ـ نهاية المسابقة
   ========================================================= */

async function finishCompetition() {

  clearInterval(waitingTimer);

  show('result');

  const score = $('#score');

  if (score) {

    score.textContent =
      'تم استلام إجاباتك بنجاح ✓';
  }

  /*
    محاولة قراءة ترتيب المتسابق.
    عدم نجاح قراءة الترتيب لا يؤثر
    على حفظ الإجابات.
  */

  try {

    const { data, error } =
      await db
        .from('leaderboard')
        .select('*')
        .eq(
          'competition_id',
          competitionId
        );

    if (!error && data) {

      console.log(
        'Leaderboard:',
        data
      );
    }

  } catch (error) {

    console.log(
      'Leaderboard unavailable:',
      error
    );
  }
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

      participantId = null;
      competitionId = null;
      competition = null;

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

show('join');
