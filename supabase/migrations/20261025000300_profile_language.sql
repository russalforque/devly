-- Language is presentation preference, independent of progress and grading.
alter table public.profiles add column preferred_language text not null default 'en'
  constraint profiles_preferred_language_check check (preferred_language in ('en', 'ceb', 'fil'));
-- Existing owner-only RLS and table grants continue to apply.
