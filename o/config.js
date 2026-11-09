/* Public order page (/o/) configuration (TICKET-047, ADR-0036 sections 9 and 10). Nothing secret here.
   FUNCTION_URL: the Edge Function `online-order` (deployed with JWT verification off; the page sends no
   Supabase key). TURNSTILE_SITE_KEY: the Cloudflare Turnstile widget's SITE key (public). The product
   owner replaces the placeholder before the website is pushed; while it is the placeholder the page loads
   no widget and a send shows the bot-check failure. tools/build.py reads FUNCTION_URL for the page's
   Content-Security-Policy, so rebuild after changing it. */
window.ORDER_CONFIG = {
  FUNCTION_URL: "https://xfdrusgoqxohdxjzmucf.supabase.co/functions/v1/online-order",
  TURNSTILE_SITE_KEY: "__TURNSTILE_SITE_KEY__"
};
