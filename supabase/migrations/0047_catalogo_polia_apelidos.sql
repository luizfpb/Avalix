-- 0047 — catálogo com o vocabulário da academia.
-- Aplicar depois da 0046. Não apaga exercício, não troca id e não mexe em
-- plano, sessão ou exercício personalizado: os treinos já salvos passam a
-- mostrar o nome novo sozinhos, porque guardam o id.
--
-- 1. POLIA, NÃO CABO. Ninguém na academia fala "remada baixa no cabo". Os 26
--    nomes do catálogo global com "cabo" passam a dizer "polia".
--
-- 2. NOMES EM PORTUGUÊS. Os que tinham nome usual em português ganham esse
--    nome na frente e o inglês entre parênteses, no padrão que o catálogo já
--    usava ("Elevação pélvica com barra (hip thrust)"). Termo que a academia
--    fala em inglês mesmo (leg press, crossover, stiff, burpee) fica.
--    "Voador" é o nome do peck deck em qualquer academia do país.
--
-- 3. APELIDOS. Coluna `aliases`: nomes alternativos que a busca também
--    consulta e que não aparecem na tela. "Pulley" acha a puxada, "graviton"
--    acha a barra assistida. Todo nome trocado aqui vira apelido do próprio
--    exercício, então quem já buscava pelo nome antigo continua achando.
--
-- 4. CANELEIRA. Equipamento novo ('ankle_weight'). Coice, abdução e flexora
--    com caneleira são o dia a dia de muita academia e não cabiam em nenhum
--    equipamento existente.
--
-- 5. EXERCÍCIOS QUE FALTAVAM. Máquinas articuladas, abdominal infra e remador,
--    stiff com halteres, tríceps testa na polia, panturrilha no hack, a linha
--    de caneleira e outros. Entram só se ainda não existir exercício global com
--    o mesmo nome; rodar de novo não duplica nada.
--
-- A busca sem acento é do app (src/lib/search.ts); o banco só guarda os nomes.
--
-- Sem tabela temporária: o SQL Editor do Supabase pode rodar cada comando na
-- sua própria transação, e uma tabela "on commit drop" sumia antes do comando
-- seguinte. Os valores vão direto em cada UPDATE/INSERT. Cada passo é
-- idempotente sozinho, então rodar de novo depois de uma execução parcial
-- termina o que faltou sem duplicar nada.
begin;

-- =====================================================================
-- 4. CANELEIRA (antes dos inserts, que dependem dela)
-- =====================================================================
alter table public.exercises drop constraint if exists exercises_equipment_check;
alter table public.exercises add constraint exercises_equipment_check check (equipment in (
  'barbell','ez_bar','trap_bar','dumbbell','kettlebell',
  'machine','smith_machine','cable','bodyweight',
  'resistance_band','suspension','plate','medicine_ball',
  'ankle_weight','other'));

-- =====================================================================
-- 3. APELIDOS
-- =====================================================================
alter table public.exercises
  add column if not exists aliases text[] not null default '{}';

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'exercises_aliases_chk') then
    alter table public.exercises add constraint exercises_aliases_chk check (
      cardinality(aliases) <= 20
      and app.text_array_sem_repeticao(aliases)
      and array_position(aliases, null) is null
    );
  end if;
end $$;

-- =====================================================================
-- 1 e 2. RENOMEAR (o nome antigo vira apelido)
-- =====================================================================
update public.exercises x
   set name = r.novo,
       aliases = case
         when r.apelido and not (x.aliases @> array[r.antigo]) then x.aliases || r.antigo
         else x.aliases
       end
  from (values
  -- polia
  ('Crucifixo no cabo (altura media)',        'Crucifixo na polia (altura média)', true),
  ('Crucifixo inclinado no cabo',             'Crucifixo inclinado na polia', true),
  ('Pulldown unilateral no cabo',             'Puxada unilateral na polia', true),
  ('Remada baixa no cabo (triângulo)',        'Remada baixa na polia (triângulo)', true),
  ('Remada pronada no cabo',                  'Remada baixa pronada na polia', true),
  ('Remada alta no cabo para o pescoço',      'Remada alta na polia para o pescoço', true),
  ('Encolhimento no cabo',                    'Encolhimento na polia', true),
  ('Elevação frontal no cabo',                'Elevação frontal na polia', true),
  ('Elevação lateral no cabo',                'Elevação lateral na polia', true),
  ('Remada alta no cabo',                     'Remada alta na polia', true),
  ('Crucifixo invertido no cabo',             'Crucifixo invertido na polia', true),
  ('Rosca martelo na corda (cabo)',           'Rosca martelo na polia (corda)', true),
  ('Rosca no cabo (barra reta)',              'Rosca direta na polia (barra reta)', true),
  ('Rosca Bayesian no cabo',                  'Rosca Bayesian na polia', true),
  ('Tríceps francês na corda (cabo)',         'Tríceps francês na polia (corda)', true),
  ('Tríceps coice no cabo',                   'Tríceps coice na polia', true),
  ('Extensão de tríceps unilateral no cabo',  'Tríceps unilateral na polia', true),
  ('Rosca de punho no cabo',                  'Rosca de punho na polia', true),
  ('Abdominal no cabo (ajoelhado)',           'Abdominal na polia (ajoelhado)', true),
  ('Lenhador no cabo (alto-baixo)',           'Lenhador na polia (alto-baixo)', true),
  ('Lenhador no cabo (baixo-alto)',           'Lenhador na polia (baixo-alto)', true),
  ('Flexão lateral no cabo',                  'Flexão lateral na polia', true),
  ('RDL no cabo',                             'Stiff na polia (RDL)', true),
  ('Coice de glúteo no cabo',                 'Coice de glúteo na polia', true),
  ('Adução de quadril no cabo',               'Adução de quadril na polia', true),
  ('Abdução de quadril no cabo',              'Abdução de quadril na polia', true),
  -- nome da academia
  ('Crucifixo na máquina (peck deck)',        'Voador (peck deck)', true),
  ('Crucifixo invertido na máquina (reverse peck)', 'Voador invertido (crucifixo invertido na máquina)', true),
  ('Pulldown na máquina',                     'Puxada na máquina', true),
  ('Puxada com braco estendido (straight-arm)', 'Pulldown na polia (braços estendidos)', true),
  -- português na frente
  ('Squeeze press com halteres',              'Supino com halteres unidos (squeeze press)', true),
  ('Seal row com barra',                      'Remada deitada no banco com barra (seal row)', true),
  ('Seal row com halteres',                   'Remada deitada no banco com halteres (seal row)', true),
  ('Power shrug',                             'Encolhimento explosivo (power shrug)', true),
  ('Drag curl',                               'Rosca arrastada (drag curl)', true),
  ('Wrist roller (enrolador de pulso)',       'Enrolador de punho (wrist roller)', true),
  ('Pegada (gripper)',                        'Hand grip (pegador de mão)', true),
  ('Plate pinch (pegada na anilha)',          'Pinça na anilha (plate pinch)', true),
  ('Ab wheel (roda abdominal)',               'Roda abdominal (ab wheel)', true),
  ('Crunch na bola',                          'Abdominal na bola suíça', true),
  ('Sit-up',                                  'Abdominal completo (sit-up)', true),
  ('V-up',                                    'Abdominal em V (V-up)', true),
  ('Hollow hold',                             'Canoinha (hollow hold)', true),
  ('Crunch declinado',                        'Abdominal declinado', true),
  ('Toes to bar',                             'Pés na barra (toes to bar)', true),
  ('Windmill com kettlebell',                 'Moinho com kettlebell (windmill)', true),
  ('Reverse hyper',                           'Hiperextensão reversa (reverse hyper)', true),
  ('Bird dog',                                'Perdigueiro (bird dog)', true),
  ('Pistol squat',                            'Agachamento pistola (pistol squat)', true),
  ('Sissy squat',                             'Agachamento sissy', true),
  ('Wall sit (agachamento na parede)',        'Agachamento isométrico na parede (wall sit)', true),
  ('Frog pump',                               'Elevação pélvica sapinho (frog pump)', true),
  ('Kettlebell swing',                        'Swing com kettlebell', true),
  ('Cossack squat',                           'Agachamento cossaco', true),
  ('Copenhagen plank',                        'Prancha copenhague', true),
  ('Fire hydrant',                            'Abdução em quatro apoios (fire hydrant)', true),
  ('Donkey calf raise',                       'Panturrilha burrinho (donkey)', true),
  ('Neck curl na máquina',                    'Flexão de pescoço na máquina', true),
  ('Neck harness (extensao)',                 'Extensão de pescoço com capacete (neck harness)', true),
  ('Turkish get-up',                          'Levantamento turco (turkish get-up)', true),
  ('Snatch com kettlebell',                   'Arranco com kettlebell (snatch)', true),
  ('Thruster com halteres',                   'Thruster com halteres (agachamento e desenvolvimento)', true),
  -- só acento (o nome antigo não acrescenta nada à busca, que já ignora acento)
  ('Pallof press (anti-rotacao)',             'Pallof press (antirrotação)', false),
  ('Prancha lateral com elevacao de quadril', 'Prancha lateral com elevação de quadril', false)
  ) as r(antigo, novo, apelido)
 where x.org_id is null
   and x.name = r.antigo
   -- se o nome novo já existir (rodada anterior), não cria duplicado
   and not exists (select 1 from public.exercises y where y.org_id is null and y.name = r.novo);

-- =====================================================================
-- 3. APELIDOS DO VOCABULÁRIO DA ACADEMIA
-- =====================================================================
update public.exercises x
   set aliases = (
     select array_agg(a order by ord)
       from (
         select a, min(ord) as ord
           from unnest(x.aliases || ap.extra) with ordinality as t(a, ord)
          group by a
       ) d
   )
  from (values
  ('Voador (peck deck)',                       array['crucifixo máquina', 'fly máquina']),
  ('Voador invertido (crucifixo invertido na máquina)', array['peck deck invertido', 'reverse fly']),
  ('Crossover na polia alta',                  array['cross over', 'crucifixo polia alta']),
  ('Crossover na polia baixa',                 array['cross over', 'crucifixo polia baixa']),
  ('Puxada frontal pronada',                   array['pulley', 'puxada alta', 'puxada pela frente', 'lat pulldown']),
  ('Puxada pegada aberta',                     array['pulley aberto', 'puxada alta aberta']),
  ('Puxada supinada',                          array['pulley supinado', 'puxada alta supinada']),
  ('Puxada pegada neutra (triângulo)',         array['pulley triângulo', 'puxada alta triângulo']),
  ('Barra fixa assistida na máquina',          array['graviton', 'gravitron']),
  ('Barra fixa pronada',                       array['pull-up', 'barra']),
  ('Barra fixa supinada',                      array['chin-up']),
  ('Remada baixa na polia (triângulo)',        array['remada sentada', 'remada baixa']),
  ('Remada cavalinho (T-bar)',                 array['remada T', 'cavalinho']),
  ('Remada unilateral com halter (serrote)',   array['remada serrote']),
  ('Tríceps na polia (barra reta)',            array['tríceps pulley', 'pulley barra', 'tríceps barra']),
  ('Tríceps na polia (corda)',                 array['tríceps corda', 'pulley corda']),
  ('Tríceps na polia (barra V)',               array['tríceps pulley V', 'pulley V']),
  ('Tríceps francês com halter',               array['tríceps nuca']),
  ('Mergulho nas paralelas (tríceps)',         array['paralelas', 'dips']),
  ('Mergulho nas paralelas (peito)',           array['paralelas', 'dips']),
  ('Rosca Scott com barra W',                  array['banco Scott']),
  ('Rosca Scott na máquina',                   array['banco Scott máquina']),
  ('Pullover com halter',                      array['pull over']),
  ('Agachamento Hack',                         array['hack machine', 'hack squat']),
  ('Leg press 45 graus',                       array['leg 45']),
  ('Mesa flexora (deitado)',                   array['flexora deitada', 'flexora']),
  ('Cadeira flexora (sentado)',                array['flexora sentada', 'flexora']),
  ('Cadeira extensora',                        array['extensora']),
  ('Levantamento terra romeno (RDL) com barra', array['stiff romeno', 'terra romeno']),
  ('Afundo (lunge) com halteres',              array['avanço com halteres']),
  ('Passada / step-up com halteres',           array['subida no banco', 'subida no step']),
  ('Hip thrust na máquina',                    array['elevação pélvica na máquina', 'glúteo máquina']),
  ('Hiperextensão lombar (banco romano)',      array['extensão lombar', 'lombar no banco']),
  ('Panturrilha em pé na máquina',             array['gêmeos em pé']),
  ('Panturrilha sentado na máquina',           array['sóleo', 'gêmeos sentado']),
  ('Encolhimento com halteres',                array['trapézio com halteres']),
  ('Encolhimento com barra',                   array['trapézio com barra']),
  ('Abdominal supra (crunch)',                 array['abdominal reto']),
  ('Elevação de pernas no solo',               array['elevação de pernas deitado']),
  ('Dead bug',                                 array['inseto morto']),
  ('Superman (solo)',                          array['super-homem']),
  ('Swing com kettlebell',                     array['kb swing']),
  ('Desenvolvimento com halteres sentado',     array['desenvolvimento halter']),
  ('Coice de glúteo na polia',                 array['glúteo na polia', 'glúteo coice polia']),
  ('Coice de glúteo na máquina',               array['glúteo máquina']),
  ('Cadeira adutora',                          array['adutora']),
  ('Cadeira abdutora',                         array['abdutora'])
  ) as ap(nome, extra)
 where x.org_id is null
   and x.name = ap.nome;

-- =====================================================================
-- 5. EXERCÍCIOS QUE FALTAVAM
-- =====================================================================
insert into public.exercises
  (org_id, name, primary_muscle, secondary_muscles, equipment, movement_pattern, is_unilateral, aliases)
select null, n.name, n.primary_muscle, n.secondary_muscles, n.equipment, n.movement_pattern, n.is_unilateral, n.aliases
  from (values
  -- peito
  ('Supino reto articulado',                 'chest', array['front_delts','triceps'], 'machine', 'horizontal_push', false, array['supino máquina articulada']),
  ('Supino inclinado articulado',            'chest', array['front_delts','triceps'], 'machine', 'horizontal_push', false, array['supino inclinado máquina articulada']),
  ('Supino declinado articulado',            'chest', array['front_delts','triceps'], 'machine', 'horizontal_push', false, '{}'),
  ('Crucifixo reto na polia (deitado no banco)', 'chest', array['front_delts'], 'cable', 'isolation', false, array['crucifixo polia banco']),
  -- costas
  ('Puxada articulada',                      'lats', array['biceps','upper_back'], 'machine', 'vertical_pull', false, array['pulley articulado']),
  ('Remada articulada',                      'lats', array['upper_back','biceps','rear_delts'], 'machine', 'horizontal_pull', false, array['remada máquina articulada']),
  ('Remada articulada unilateral',           'lats', array['upper_back','biceps','rear_delts'], 'machine', 'horizontal_pull', true, '{}'),
  ('Remada baixa unilateral na polia',       'lats', array['upper_back','biceps','rear_delts'], 'cable', 'horizontal_pull', true, array['remada sentada unilateral']),
  ('Remada baixa pegada aberta na polia',    'upper_back', array['lats','rear_delts','biceps'], 'cable', 'horizontal_pull', false, array['remada sentada aberta']),
  ('Pulldown na polia (corda)',           'lats', array['upper_back','triceps'], 'cable', 'isolation', false, array['pulldown corda']),
  -- ombros
  ('Desenvolvimento articulado',             'front_delts', array['side_delts','triceps'], 'machine', 'vertical_push', false, array['desenvolvimento máquina articulada']),
  ('Elevação lateral sentado com halteres',  'side_delts', array['traps'], 'dumbbell', 'isolation', false, '{}'),
  ('Elevação lateral unilateral com halter', 'side_delts', array['traps'], 'dumbbell', 'isolation', true, '{}'),
  ('Elevação frontal na polia (corda)',      'front_delts', array['side_delts'], 'cable', 'isolation', false, '{}'),
  -- bíceps
  ('Rosca Scott unilateral com halter',      'biceps', array['forearms'], 'dumbbell', 'isolation', true, array['banco Scott halter']),
  ('Rosca direta na polia (corda)',          'biceps', array['forearms'], 'cable', 'isolation', false, '{}'),
  ('Rosca concentrada na polia',             'biceps', array['forearms'], 'cable', 'isolation', true, '{}'),
  -- tríceps
  ('Tríceps testa na polia',                 'triceps', array[]::text[], 'cable', 'isolation', false, array['tríceps testa polia']),
  ('Tríceps na polia pegada invertida',      'triceps', array[]::text[], 'cable', 'isolation', false, array['tríceps pulley invertido', 'tríceps supinado']),
  ('Tríceps francês unilateral com halter',  'triceps', array[]::text[], 'dumbbell', 'isolation', true, array['tríceps nuca unilateral']),
  ('Tríceps francês com barra W',            'triceps', array[]::text[], 'ez_bar', 'isolation', false, array['tríceps nuca barra']),
  ('Mergulho na máquina (tríceps)',          'triceps', array['chest','front_delts'], 'machine', 'horizontal_push', false, array['paralelas máquina', 'dips máquina']),
  -- abdômen
  ('Abdominal infra (crunch invertido)',     'abs', array['obliques'], 'bodyweight', 'core', false, array['infra', 'abdominal inferior']),
  ('Abdominal remador',                      'abs', array[]::text[], 'bodyweight', 'core', false, array['remador']),
  ('Abdominal supra com anilha',             'abs', array[]::text[], 'plate', 'core', false, array['abdominal com peso']),
  ('Abdominal oblíquo (supra cruzado)',      'obliques', array['abs'], 'bodyweight', 'core', false, array['abdominal cruzado']),
  ('Abdominal infra no banco declinado',     'abs', array['obliques'], 'bodyweight', 'core', false, '{}'),
  ('Prancha com toque no ombro',             'abs', array['obliques','front_delts'], 'bodyweight', 'core', false, '{}'),
  ('Escalador (mountain climber)',           'abs', array['obliques','quads'], 'bodyweight', 'core', false, array['mountain climber']),
  -- pernas
  ('Stiff com halteres',                     'hamstrings', array['glutes','lower_back'], 'dumbbell', 'hinge', false, '{}'),
  ('Stiff no Smith',                         'hamstrings', array['glutes','lower_back'], 'smith_machine', 'hinge', false, '{}'),
  ('Agachamento sumô com halter',            'quads', array['glutes','adductors','hamstrings'], 'dumbbell', 'squat', false, array['agachamento sumô']),
  ('Agachamento sumô com kettlebell',        'quads', array['glutes','adductors','hamstrings'], 'kettlebell', 'squat', false, '{}'),
  ('Agachamento pêndulo',                    'quads', array['glutes','adductors'], 'machine', 'squat', false, array['pendulum squat']),
  ('Agachamento na máquina (V-squat)',       'quads', array['glutes','adductors'], 'machine', 'squat', false, array['v squat']),
  ('Afundo caminhando com halteres (passada)', 'quads', array['glutes','hamstrings','adductors'], 'dumbbell', 'lunge', true, array['passada', 'avanço caminhando']),
  ('Afundo reverso com halteres (recuo)',    'quads', array['glutes','hamstrings'], 'dumbbell', 'lunge', true, array['recuo']),
  ('Cadeira flexora unilateral',             'hamstrings', array['calves'], 'machine', 'isolation', true, '{}'),
  ('Mesa flexora unilateral',                'hamstrings', array['calves'], 'machine', 'isolation', true, '{}'),
  ('Elevação pélvica unilateral (peso corporal)', 'glutes', array['hamstrings'], 'bodyweight', 'hinge', true, '{}'),
  ('Glúteo no Smith (coice em pé)',          'glutes', array['hamstrings'], 'smith_machine', 'isolation', true, '{}'),
  ('Panturrilha no hack',                    'calves', array[]::text[], 'machine', 'isolation', false, array['gêmeos no hack']),
  ('Panturrilha unilateral na máquina',      'calves', array[]::text[], 'machine', 'isolation', true, '{}'),
  -- caneleira
  ('Coice de glúteo com caneleira (quatro apoios)', 'glutes', array['hamstrings'], 'ankle_weight', 'isolation', true, array['glúteo quatro apoios', 'glúteo caneleira']),
  ('Abdução deitado de lado com caneleira',  'abductors', array['glutes'], 'ankle_weight', 'isolation', true, array['abdução caneleira']),
  ('Abdução em pé com caneleira',            'abductors', array['glutes'], 'ankle_weight', 'isolation', true, '{}'),
  ('Adução deitado de lado com caneleira',   'adductors', array[]::text[], 'ankle_weight', 'isolation', true, array['adução caneleira']),
  ('Flexora em pé com caneleira',            'hamstrings', array[]::text[], 'ankle_weight', 'isolation', true, array['flexão de joelho em pé']),
  ('Extensão de joelho sentado com caneleira', 'quads', array[]::text[], 'ankle_weight', 'isolation', true, array['extensora caneleira']),
  ('Elevação de perna estendida com caneleira', 'quads', array['abs'], 'ankle_weight', 'isolation', true, '{}')
  ) as n(name, primary_muscle, secondary_muscles, equipment, movement_pattern, is_unilateral, aliases)
 where not exists (select 1 from public.exercises x where x.org_id is null and x.name = n.name);

-- =====================================================================
-- versão do schema
-- =====================================================================
create or replace function public.app_schema_version()
returns text language sql immutable set search_path = ''
as $$ select '0047'::text $$;
revoke execute on function public.app_schema_version() from public;
grant execute on function public.app_schema_version() to anon, authenticated;
commit;
