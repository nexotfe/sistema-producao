-- NEXOTFE 1.0 — Baseline SQL
-- Módulo 001: schemas técnicos e extensões mínimas
-- Alvo: PostgreSQL/Supabase em banco vazio

begin;

create schema if not exists extensions;

create extension if not exists pgcrypto
  with schema extensions;

comment on schema extensions is
  'Extensões PostgreSQL utilizadas pelo NEXOTFE; não contém entidades de negócio.';

commit;

