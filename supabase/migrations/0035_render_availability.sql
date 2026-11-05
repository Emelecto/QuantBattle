-- Independent of GitHub's best-effort scheduled workflows. Public health only;
-- no API keys, user records or prediction data enter the cron command.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
select cron.schedule('quantbattle-render-health', '2,12,22,32,42,52 * * * *',
  $$select net.http_get(url := 'https://quantlab2.onrender.com/health', timeout_milliseconds := 60000);$$);
