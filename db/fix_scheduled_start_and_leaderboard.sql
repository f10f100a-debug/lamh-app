-- leaderboard is an aggregate view; it already reflects answers without writes.
DROP TRIGGER IF EXISTS trg_answers_refresh_leaderboard ON public.answers;

CREATE OR REPLACE FUNCTION public.get_public_competition(p_code text)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
select jsonb_build_object(
  'title',c.title,
  'organization_name',c.organization_name,
  'organization_logo_data_uri',c.organization_logo_data_uri,
  'slug',c.slug,
  'start_at',c.start_at,
  'status',case when c.status='waiting' and c.start_at <= clock_timestamp() then 'live' else c.status end,
  'server_now',clock_timestamp(),
  'seconds_per_question',c.seconds_per_question
)
from public.competitions c
where upper(c.slug)=upper(trim(p_code))
limit 1;
$function$;

CREATE OR REPLACE FUNCTION public.start_question_session(p_participant_id uuid, p_question_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_comp public.competitions;
  v_q public.questions;
  v_existing public.question_sessions;
  v_now timestamptz:=clock_timestamp();
  v_exp timestamptz;
  v_id uuid;
begin
  select q.* into v_q from public.questions q where q.id=p_question_id;
  if v_q.id is null then raise exception 'السؤال غير موجود'; end if;
  select c.* into v_comp from public.competitions c where c.id=v_q.competition_id;
  if v_comp.id is null then raise exception 'المسابقة غير موجودة'; end if;
  if not exists(select 1 from public.participants p where p.id=p_participant_id and p.competition_id=v_comp.id)
    then raise exception 'المشارك غير مرتبط بالمسابقة'; end if;
  if not coalesce(((v_comp.status = 'live' and (v_comp.start_at is null or v_comp.start_at <= v_now))
    or (v_comp.status = 'waiting' and v_comp.start_at <= v_now)), false) then raise exception 'المسابقة ليست مباشرة الآن'; end if;

  select * into v_existing from public.question_sessions
  where participant_id=p_participant_id and question_id=p_question_id limit 1;

  if v_existing.id is not null then
    return jsonb_build_object('session_id',v_existing.id,'started_at',v_existing.started_at,'expires_at',v_existing.expires_at,'already_started',true,'remaining_ms',greatest(0,extract(epoch from (v_existing.expires_at-v_now))*1000)::bigint);
  end if;

  v_exp:=v_now+(greatest(3,v_comp.seconds_per_question)||' seconds')::interval;
  insert into public.question_sessions(competition_id,participant_id,question_id,started_at,expires_at)
  values(v_comp.id,p_participant_id,p_question_id,v_now,v_exp)
  returning id into v_id;

  return jsonb_build_object('session_id',v_id,'started_at',v_now,'expires_at',v_exp,'already_started',false,'remaining_ms',(greatest(3,v_comp.seconds_per_question)*1000)::bigint);
end;
$function$;

CREATE OR REPLACE FUNCTION public.submit_answer(p_participant_id uuid, p_question_id uuid, p_selected_index integer, p_response_ms bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
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


