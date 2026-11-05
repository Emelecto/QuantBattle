begin;
create table if not exists public.render_health_requests (
  id bigint primary key, requested_at timestamptz not null default clock_timestamp()
);
alter table public.render_health_requests enable row level security;
revoke all on public.render_health_requests from public,anon,authenticated;
grant select on public.render_health_requests to service_role;
create or replace function public.request_render_health()
returns bigint language plpgsql security definer set search_path=pg_catalog,public as $$
declare request_id bigint;
begin
  select net.http_get(url := 'https://quantlab2.onrender.com/health', timeout_milliseconds := 60000) into request_id;
  insert into public.render_health_requests(id) values(request_id);
  delete from public.render_health_requests where requested_at < clock_timestamp()-interval '2 days';
  return request_id;
end;
$$;
create or replace function public.render_health_report()
returns jsonb language sql security definer set search_path=pg_catalog,public as $$
  select jsonb_build_object('requested_at',q.requested_at,'status_code',r.status_code,
    'timed_out',r.timed_out,'passed',coalesce(r.status_code=200 and not r.timed_out
      and q.requested_at >= clock_timestamp()-interval '20 minutes',false))
  from public.render_health_requests q left join net._http_response r on q.id=r.id
  where q.requested_at < clock_timestamp()-interval '90 seconds'
  order by q.requested_at desc limit 1;
$$;
revoke all on function public.request_render_health(),public.render_health_report() from public,anon,authenticated;
grant execute on function public.render_health_report() to service_role;
select cron.schedule('quantbattle-render-health','2,12,22,32,42,52 * * * *','select public.request_render_health();');
commit;
