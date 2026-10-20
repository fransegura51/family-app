-- Deshacer 0292: quita las funciones nuevas de cuentas y seguridad. No toca ningún dato ni las funciones de siempre (set_own_pin, clear_own_pin, verify_own_pin, admin_reset_profile_pin).
drop function if exists public.list_family_account_emails();
drop function if exists public.reset_own_pin_after_recent_auth();
drop function if exists public.clear_own_pin_with_pin(text);
drop function if exists public.change_own_pin(text, text);
drop function if exists private.has_recent_strong_auth(int);
