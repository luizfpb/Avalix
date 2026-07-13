-- Avalix - migration 0021: valida retroativamente as constraints deixadas
-- NOT VALID na 0020 (jul/2026). Depende de 0001-0020.
--
-- A 0020 criou tres constraints NOT VALID: elas ja protegem toda linha nova ou
-- alterada, mas o Postgres nao escaneou as linhas historicas ao adiciona-las.
-- O preflight da 0020 conferiu zero violacoes no historico, entao VALIDATE e um
-- unico scan barato que:
--   1. garante a integridade tambem das linhas antigas;
--   2. permite ao planner confiar na constraint.
--
-- VALIDATE CONSTRAINT toma apenas SHARE UPDATE EXCLUSIVE (nao bloqueia leitura
-- nem escrita concorrente). Se alguma linha violar, a migration falha e nada e
-- comitado — investigar a linha apontada antes de reexecutar.

begin;

alter table public.consent_records
  validate constraint consent_records_v11_snapshot_chk;

alter table public.audit_logs
  validate constraint audit_logs_action_chk;

alter table public.audit_logs
  validate constraint audit_logs_table_name_chk;

commit;
