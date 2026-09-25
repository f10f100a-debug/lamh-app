ALTER TABLE public.competitions ADD COLUMN results_published boolean NOT NULL DEFAULT false;
CREATE SCHEMA IF NOT EXISTS lamh_private;
REVOKE ALL ON SCHEMA lamh_private FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.leaderboard FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE FUNCTION lamh_private.get_competition_leaderboard(p_code text, p_limit integer DEFAULT 10)
 RETURNS TABLE(rank bigint, full_name text, school text, correct_answers bigint, total_response_ms numeric)
 LANGUAGE sql
 SECURITY INVOKER
 SET search_path TO 'public'
AS $function$
with target as (
  select id
  from public.competitions
  where upper(slug)=upper(trim(p_code))
  limit 1
),
qcount as (
  select competition_id, count(*)::bigint as total_questions
  from public.questions
  group by competition_id
),
eligible as (
  select l.*
  from public.leaderboard l
  join target t on t.id=l.competition_id
  join qcount q on q.competition_id=l.competition_id
  where l.answered_count >= q.total_questions
    and q.total_questions > 0
),
ranked as (
  select
    row_number() over (
      order by correct_answers desc, total_response_ms asc, participant_id
    ) as rank,
    full_name,
    school,
    correct_answers,
    total_response_ms
  from eligible
)
select rank, full_name, school, correct_answers, total_response_ms
from ranked
order by rank
limit greatest(1, least(coalesce(p_limit,10),100));
$function$;

CREATE OR REPLACE FUNCTION lamh_private.get_final_result(p_participant_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO 'public'
AS $function$
declare
 v_p public.participants; v_total integer; v_answered integer; v_correct integer; v_ms bigint;
 v_rank bigint; v_finished boolean;
begin
 select * into v_p from public.participants where id=p_participant_id;
 if v_p.id is null then raise exception 'المشارك غير موجود'; end if;
 select count(*)::int into v_total from public.questions where competition_id=v_p.competition_id;
 select count(*)::int,coalesce(sum(case when is_correct then 1 else 0 end),0)::int,coalesce(sum(response_ms),0)::bigint
 into v_answered,v_correct,v_ms
 from public.answers where participant_id=p_participant_id and competition_id=v_p.competition_id;
 v_finished:=v_total>0 and v_answered>=v_total;
 if v_finished then
   select rank into v_rank from (
     select participant_id,row_number() over(order by correct_answers desc,total_response_ms asc,participant_id) rank
     from public.leaderboard
     where competition_id=v_p.competition_id and answered_count>=v_total
   ) x where participant_id=p_participant_id;
 end if;
 return jsonb_build_object('completed',v_finished,'total_questions',v_total,'answered',v_answered,'correct',v_correct,'total_response_ms',v_ms,'rank',v_rank);
end;
$function$;

CREATE OR REPLACE FUNCTION lamh_private.get_participant_result(p_participant_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY INVOKER
 SET search_path TO 'public'
AS $function$
with qcount as (
  select competition_id, count(*)::bigint as total_questions
  from public.questions
  group by competition_id
),
eligible as (
  select
    l.*,
    q.total_questions
  from public.leaderboard l
  join qcount q on q.competition_id=l.competition_id
  where l.answered_count >= q.total_questions
    and q.total_questions > 0
),
ranked as (
  select
    e.*,
    row_number() over (
      partition by e.competition_id
      order by e.correct_answers desc, e.total_response_ms asc, e.participant_id
    ) as rank_no
  from eligible e
),
self as (
  select
    l.*,
    q.total_questions,
    (l.answered_count >= q.total_questions and q.total_questions > 0) as completed
  from public.leaderboard l
  join qcount q on q.competition_id=l.competition_id
  where l.participant_id=p_participant_id
)
select jsonb_build_object(
  'participant_id', s.participant_id,
  'full_name', s.full_name,
  'school', s.school,
  'correct_answers', s.correct_answers,
  'answered_count', s.answered_count,
  'total_questions', s.total_questions,
  'total_response_ms', s.total_response_ms,
  'rank', case when s.completed then r.rank_no else null end,
  'completed', s.completed
)
from self s
left join ranked r on r.participant_id=s.participant_id;
$function$;

CREATE OR REPLACE FUNCTION lamh_private.get_participant_progress(p_participant_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO 'public'
AS $function$
declare
  v_p public.participants;
  v_total integer;
  v_answered integer;
  v_correct integer;
  v_next uuid;
  v_next_order integer;
begin
  select * into v_p from public.participants where id=p_participant_id;
  if v_p.id is null then raise exception 'المشارك غير موجود'; end if;

  select count(*)::int into v_total
  from public.questions where competition_id=v_p.competition_id;

  select count(*)::int,coalesce(sum(case when is_correct then 1 else 0 end),0)::int
  into v_answered,v_correct
  from public.answers where participant_id=p_participant_id and competition_id=v_p.competition_id;

  select q.id,q.question_order into v_next,v_next_order
  from public.questions q
  where q.competition_id=v_p.competition_id
    and not exists(select 1 from public.answers a where a.participant_id=p_participant_id and a.question_id=q.id)
  order by q.question_order
  limit 1;

  return jsonb_build_object(
    'participant_id',v_p.id,
    'competition_id',v_p.competition_id,
    'total_questions',v_total,
    'answered',v_answered,
    'correct',v_correct,
    'completed',(v_total>0 and v_answered>=v_total),
    'next_question_id',v_next,
    'next_question_order',v_next_order
  );
end;
$function$;

CREATE OR REPLACE FUNCTION lamh_private.submit_answer(p_participant_id uuid, p_question_id uuid, p_selected_index integer, p_response_ms bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO 'public'
AS $function$
declare
  v_comp public.competitions; v_q public.questions; v_session public.question_sessions; v_existing public.answers;
  v_selected text; v_correct boolean; v_now timestamptz:=clock_timestamp(); v_elapsed bigint; v_limit bigint; v_response bigint; v_timed_out boolean;
begin
  if p_selected_index not between -1 and 3 then raise exception 'خيار الإجابة غير صحيح'; end if;
  select q.* into v_q from public.questions q where q.id=p_question_id;
  if v_q.id is null then raise exception 'السؤال غير موجود'; end if;
  select c.* into v_comp from public.competitions c where c.id=v_q.competition_id;
  if v_comp.id is null then raise exception 'المسابقة غير موجودة'; end if;
  if not exists(select 1 from public.participants p where p.id=p_participant_id and p.competition_id=v_comp.id)
    then raise exception 'المشارك غير مرتبط بهذه المسابقة'; end if;

  select * into v_existing from public.answers where participant_id=p_participant_id and question_id=p_question_id limit 1;
  if v_existing.id is not null then
    return jsonb_build_object('accepted',true,'already_answered',true,'is_correct',v_existing.is_correct,'selected_option',v_existing.selected_option,'response_ms',v_existing.response_ms);
  end if;

  if not coalesce(((v_comp.status = 'live' and (v_comp.start_at is null or v_comp.start_at <= v_now))
    or (v_comp.status = 'waiting' and v_comp.start_at <= v_now)), false) then raise exception 'المسابقة ليست مباشرة الآن'; end if;
  select * into v_session from public.question_sessions where participant_id=p_participant_id and question_id=p_question_id limit 1;
  if v_session.id is null then raise exception 'لم يبدأ مؤقت السؤال بعد'; end if;

  v_elapsed:=greatest(0,extract(epoch from (v_now-v_session.started_at))*1000)::bigint;
  v_limit:=(greatest(3,v_comp.seconds_per_question)*1000)::bigint;
  v_timed_out:=v_elapsed>v_limit;
  v_response:=least(v_elapsed,v_limit);

  if v_timed_out then
    v_selected:='X';
    v_correct:=false;
  else
    v_selected:=case when p_selected_index=-1 then 'X' else (array['A','B','C','D'])[p_selected_index+1] end;
    v_correct:=(v_selected=v_q.correct_option);
  end if;

  insert into public.answers(competition_id,participant_id,question_id,selected_option,is_correct,response_ms,answered_at)
  values(v_comp.id,p_participant_id,p_question_id,v_selected,v_correct,v_response,v_now)
  on conflict(participant_id,question_id) do nothing;

  update public.question_sessions set completed_at=v_now where id=v_session.id;

  return jsonb_build_object('accepted',true,'already_answered',false,'timed_out',v_timed_out,'is_correct',v_correct,'selected_option',v_selected,'response_ms',v_response);
end;
$function$;

CREATE OR REPLACE FUNCTION lamh_private.expire_question_session(p_participant_id uuid, p_question_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO 'public'
AS $function$
declare
 v_s public.question_sessions; v_c public.competitions; v_now timestamptz:=clock_timestamp(); v_limit bigint;
begin
 select * into v_s from public.question_sessions where participant_id=p_participant_id and question_id=p_question_id limit 1;
 if v_s.id is null then raise exception 'جلسة السؤال غير موجودة'; end if;
 select * into v_c from public.competitions where id=v_s.competition_id;
 v_limit:=(greatest(3,v_c.seconds_per_question)*1000)::bigint;
 if v_now < v_s.expires_at then
   return jsonb_build_object('expired',false,'remaining_ms',greatest(0,extract(epoch from (v_s.expires_at-v_now))*1000)::bigint);
 end if;
 insert into public.answers(competition_id,participant_id,question_id,selected_option,is_correct,response_ms,answered_at)
 values(v_s.competition_id,p_participant_id,p_question_id,'X',false,v_limit,v_now)
 on conflict(participant_id,question_id) do nothing;
 update public.question_sessions set completed_at=coalesce(completed_at,v_now) where id=v_s.id;
 return jsonb_build_object('expired',true,'timed_out',true,'selected_option','X','is_correct',false,'response_ms',v_limit);
end;
$function$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA lamh_private FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE FUNCTION public.get_final_result(p_participant_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$
DECLARE r jsonb; published boolean;
BEGIN
SELECT c.results_published INTO published FROM public.participants p JOIN public.competitions c ON c.id=p.competition_id WHERE p.id=p_participant_id;
IF NOT FOUND THEN RAISE EXCEPTION 'المشارك غير موجود'; END IF;
r:=lamh_private.get_final_result(p_participant_id);
IF NOT published THEN r:=r - ARRAY['correct','correct_answers','rank','total_response_ms']; END IF;
RETURN r || jsonb_build_object('results_published',published);
END;$fn$;
CREATE OR REPLACE FUNCTION public.get_participant_result(p_participant_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$
DECLARE r jsonb; published boolean;
BEGIN
SELECT c.results_published INTO published FROM public.participants p JOIN public.competitions c ON c.id=p.competition_id WHERE p.id=p_participant_id;
IF NOT FOUND THEN RAISE EXCEPTION 'المشارك غير موجود'; END IF;
r:=lamh_private.get_participant_result(p_participant_id);
IF NOT published THEN r:=r - ARRAY['correct','correct_answers','rank','total_response_ms']; END IF;
RETURN r || jsonb_build_object('results_published',published);
END;$fn$;
CREATE OR REPLACE FUNCTION public.get_participant_progress(p_participant_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$
DECLARE r jsonb; published boolean;
BEGIN
SELECT c.results_published INTO published FROM public.participants p JOIN public.competitions c ON c.id=p.competition_id WHERE p.id=p_participant_id;
IF NOT FOUND THEN RAISE EXCEPTION 'المشارك غير موجود'; END IF;
r:=lamh_private.get_participant_progress(p_participant_id);
IF NOT published THEN r:=r - ARRAY['correct','correct_answers','rank','total_response_ms']; END IF;
RETURN r || jsonb_build_object('results_published',published);
END;$fn$;
CREATE OR REPLACE FUNCTION public.get_competition_leaderboard(p_code text,p_limit integer DEFAULT 10)
RETURNS TABLE(rank bigint,full_name text,school text,correct_answers bigint,total_response_ms numeric)
LANGUAGE sql SECURITY DEFINER SET search_path=public AS $fn$
SELECT l.* FROM lamh_private.get_competition_leaderboard(p_code,p_limit) l
WHERE EXISTS(SELECT 1 FROM public.competitions c WHERE upper(c.slug)=upper(trim(p_code)) AND c.results_published);
$fn$;
CREATE OR REPLACE FUNCTION public.submit_answer(p_participant_id uuid,p_question_id uuid,p_selected_index integer,p_response_ms bigint DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$
DECLARE r jsonb;
BEGIN
r:=lamh_private.submit_answer(p_participant_id,p_question_id,p_selected_index,p_response_ms);
IF NOT EXISTS(SELECT 1 FROM public.participants p JOIN public.competitions c ON c.id=p.competition_id WHERE p.id=p_participant_id AND c.results_published) THEN r:=r - 'is_correct'; END IF;
RETURN r;
END;$fn$;
CREATE OR REPLACE FUNCTION public.expire_question_session(p_participant_id uuid,p_question_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$
DECLARE r jsonb;
BEGIN
r:=lamh_private.expire_question_session(p_participant_id,p_question_id);
IF NOT EXISTS(SELECT 1 FROM public.participants p JOIN public.competitions c ON c.id=p.competition_id WHERE p.id=p_participant_id AND c.results_published) THEN r:=r - 'is_correct'; END IF;
RETURN r;
END;$fn$;
CREATE OR REPLACE FUNCTION public.admin_get_dashboard(p_code text, p_pin text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_comp public.competitions;
  v_questions jsonb;
  v_participants integer;
  v_completed integer;
  v_answers integer;
  v_leaders jsonb;
  v_qcount integer;
begin
  select * into v_comp
  from public.competitions
  where upper(slug)=upper(trim(p_code))
  limit 1;

  if v_comp.id is null then raise exception 'رمز المسابقة غير صحيح'; end if;

  if p_pin is null or v_comp.admin_pin_hash is null
     or extensions.crypt(trim(p_pin),v_comp.admin_pin_hash) <> v_comp.admin_pin_hash then
    raise exception 'رمز إدارة المسابقة غير صحيح';
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id',q.id,'question_order',q.question_order,'question_text',q.question_text,
      'option_a',q.option_a,'option_b',q.option_b,'option_c',q.option_c,
      'option_d',q.option_d,'correct_option',q.correct_option
    ) order by q.question_order
  ), '[]'::jsonb), count(*)::int
  into v_questions,v_qcount
  from public.questions q
  where q.competition_id=v_comp.id;

  select count(*)::int into v_participants
  from public.participants p where p.competition_id=v_comp.id;

  select count(*)::int into v_answers
  from public.answers a where a.competition_id=v_comp.id;

  if v_qcount=0 then
    v_completed:=0;
  else
    select count(*)::int into v_completed
    from (
      select p.id
      from public.participants p
      left join public.answers a on a.participant_id=p.id
      where p.competition_id=v_comp.id
      group by p.id
      having count(a.id) >= v_qcount
    ) x;
  end if;

  select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
  into v_leaders
  from (select * from lamh_private.get_competition_leaderboard(v_comp.slug,10)) t;

  return jsonb_build_object(
    'competition',jsonb_build_object(
      'id',v_comp.id,'title',v_comp.title,'organization_name',v_comp.organization_name,
      'organization_logo_data_uri',v_comp.organization_logo_data_uri,'slug',v_comp.slug,
      'results_published',v_comp.results_published,'start_at',v_comp.start_at,'status',v_comp.status,'seconds_per_question',v_comp.seconds_per_question
    ),
    'questions',v_questions,
    'stats',jsonb_build_object(
      'participants',v_participants,'completed',v_completed,
      'answers',v_answers,'questions',v_qcount
    ),
    'leaderboard',v_leaders
  );
end;
$function$;
CREATE OR REPLACE FUNCTION public.get_competition_report(p_code text, p_pin text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
 v_c public.competitions; v_total integer; v_participants integer; v_completed integer;
 v_answers integer; v_correct integer; v_avg numeric; v_devices integer; v_leaders jsonb;
begin
 select * into v_c from public.competitions where upper(slug)=upper(trim(p_code)) limit 1;
 if v_c.id is null then raise exception 'رمز المسابقة غير صحيح'; end if;
 if p_pin is null or v_c.admin_pin_hash is null or extensions.crypt(trim(p_pin),v_c.admin_pin_hash)<>v_c.admin_pin_hash then raise exception 'رمز إدارة المسابقة غير صحيح'; end if;
 select count(*) into v_total from public.questions where competition_id=v_c.id;
 select count(*) into v_participants from public.participants where competition_id=v_c.id;
 select count(*),coalesce(sum(case when is_correct then 1 else 0 end),0),round(coalesce(avg(response_ms),0),0)
 into v_answers,v_correct,v_avg from public.answers where competition_id=v_c.id;
 select count(*) into v_completed from public.leaderboard where competition_id=v_c.id and answered_count>=v_total and v_total>0;
 select count(*) into v_devices from public.push_subscriptions where competition_id=v_c.id;
 select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into v_leaders from (select * from lamh_private.get_competition_leaderboard(v_c.slug,10)) x;
 return jsonb_build_object('competition',jsonb_build_object('code',v_c.slug,'title',v_c.title,'status',v_c.status),
   'stats',jsonb_build_object('questions',v_total,'participants',v_participants,'completed',v_completed,'answers',v_answers,'correct_answers',v_correct,'average_response_ms',v_avg,'push_devices',v_devices),
   'leaderboard',v_leaders);
end;$function$;
CREATE OR REPLACE FUNCTION public.admin_publish_results(p_code text,p_pin text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$
DECLARE c public.competitions;
BEGIN
SELECT * INTO c FROM public.competitions WHERE upper(slug)=upper(trim(p_code)) LIMIT 1 FOR UPDATE;
IF c.id IS NULL OR p_pin IS NULL OR c.admin_pin_hash IS NULL OR extensions.crypt(trim(p_pin),c.admin_pin_hash) IS DISTINCT FROM c.admin_pin_hash THEN RAISE EXCEPTION 'رمز إدارة المسابقة غير صحيح'; END IF;
IF c.status <> 'finished' THEN RAISE EXCEPTION 'أنهِ المسابقة من الإعدادات قبل إعلان النتائج'; END IF;
UPDATE public.competitions SET results_published=true WHERE id=c.id;
RETURN jsonb_build_object('results_published',true);
END;$fn$;
REVOKE ALL ON FUNCTION public.admin_publish_results(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_publish_results(text,text) TO anon,authenticated;

