-- =====================================================================
-- Run this ONCE if you already ran the old schema.sql (the one with
-- ticket_seq). It switches ticket numbering from "Postgres assigns it"
-- to "the browser assigns it" — required for offline support.
-- Your existing tickets and their numbers are untouched.
--
-- Supabase dashboard > SQL Editor > New query > paste this > Run
-- =====================================================================

alter table tickets alter column no drop default;
drop sequence if exists ticket_seq;
