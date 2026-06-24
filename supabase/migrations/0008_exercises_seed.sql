-- Avalix - migration 0008: seed do catalogo global de exercicios (org_id NULL)
-- Depende de 0006/0007. Roda como migration (service role), entao passa por
-- cima da RLS e cria as linhas globais (org_id null), legiveis por todo
-- usuario autenticado e imutaveis pra usuario.
--
-- Tagueamento: primary_muscle = motor principal; secondary_muscles = sinergistas
-- relevantes (entram no volume com peso 0.5). equipment e movement_pattern pelo
-- vocabulario da 0006. Nomes em pt-BR (conteudo exibido, igual nome de avaliado).
-- Catalogo amplo de proposito: o fluxo custom existe ("esta faltando, adiciona"),
-- mas a meta e cobrir o repertorio comum sem o usuario precisar recorrer a ele.
--
-- idempotente: nao recria se ja houver catalogo global (evita duplicar em re-run).

do $$
begin
  if exists (select 1 from public.exercises where org_id is null) then
    raise notice 'catalogo global ja populado; pulando seed';
    return;
  end if;

  insert into public.exercises
    (org_id, name, primary_muscle, secondary_muscles, equipment, movement_pattern, is_unilateral)
  values
  -- =====================================================================
  -- PEITO (chest)
  -- =====================================================================
  (null, 'Supino reto com barra',              'chest', array['front_delts','triceps'], 'barbell',       'horizontal_push', false),
  (null, 'Supino inclinado com barra',         'chest', array['front_delts','triceps'], 'barbell',       'horizontal_push', false),
  (null, 'Supino declinado com barra',         'chest', array['front_delts','triceps'], 'barbell',       'horizontal_push', false),
  (null, 'Supino guilhotina (pegada aberta)',  'chest', array['front_delts','triceps'], 'barbell',       'horizontal_push', false),
  (null, 'Supino reto com halteres',           'chest', array['front_delts','triceps'], 'dumbbell',      'horizontal_push', false),
  (null, 'Supino inclinado com halteres',      'chest', array['front_delts','triceps'], 'dumbbell',      'horizontal_push', false),
  (null, 'Supino declinado com halteres',      'chest', array['front_delts','triceps'], 'dumbbell',      'horizontal_push', false),
  (null, 'Supino reto no Smith',               'chest', array['front_delts','triceps'], 'smith_machine', 'horizontal_push', false),
  (null, 'Supino inclinado no Smith',          'chest', array['front_delts','triceps'], 'smith_machine', 'horizontal_push', false),
  (null, 'Supino reto na maquina',             'chest', array['front_delts','triceps'], 'machine',       'horizontal_push', false),
  (null, 'Supino inclinado na maquina',        'chest', array['front_delts','triceps'], 'machine',       'horizontal_push', false),
  (null, 'Chest press na maquina',             'chest', array['front_delts','triceps'], 'machine',       'horizontal_push', false),
  (null, 'Crucifixo reto com halteres',        'chest', array['front_delts'],           'dumbbell',      'isolation',       false),
  (null, 'Crucifixo inclinado com halteres',   'chest', array['front_delts'],           'dumbbell',      'isolation',       false),
  (null, 'Crucifixo na maquina (peck deck)',   'chest', array['front_delts'],           'machine',       'isolation',       false),
  (null, 'Crossover na polia alta',            'chest', array['front_delts'],           'cable',         'isolation',       false),
  (null, 'Crossover na polia baixa',           'chest', array['front_delts'],           'cable',         'isolation',       false),
  (null, 'Crucifixo no cabo (altura media)',   'chest', array['front_delts'],           'cable',         'isolation',       false),
  (null, 'Crucifixo inclinado no cabo',        'chest', array['front_delts'],           'cable',         'isolation',       false),
  (null, 'Flexao de bracos',                   'chest', array['front_delts','triceps','abs'], 'bodyweight', 'horizontal_push', false),
  (null, 'Flexao de bracos inclinada',         'chest', array['front_delts','triceps'], 'bodyweight',    'horizontal_push', false),
  (null, 'Flexao de bracos declinada',         'chest', array['front_delts','triceps'], 'bodyweight',    'horizontal_push', false),
  (null, 'Flexao na suspensao (TRX)',          'chest', array['front_delts','triceps','abs'], 'suspension', 'horizontal_push', false),
  (null, 'Mergulho nas paralelas (peito)',     'chest', array['triceps','front_delts'], 'bodyweight',    'horizontal_push', false),
  (null, 'Supino com faixa',                   'chest', array['front_delts','triceps'], 'resistance_band','horizontal_push', false),
  (null, 'Crucifixo com faixa',                'chest', array['front_delts'],           'resistance_band','isolation',       false),
  (null, 'Squeeze press com halteres',         'chest', array['front_delts','triceps'], 'dumbbell',      'horizontal_push', false),
  (null, 'Supino reto com kettlebells',        'chest', array['front_delts','triceps'], 'kettlebell',    'horizontal_push', false),

  -- =====================================================================
  -- DORSAL (lats) e remadas de costas
  -- =====================================================================
  (null, 'Barra fixa pronada',                 'lats', array['biceps','upper_back','rear_delts'], 'bodyweight', 'vertical_pull',   false),
  (null, 'Barra fixa supinada',                'lats', array['biceps','upper_back'],              'bodyweight', 'vertical_pull',   false),
  (null, 'Barra fixa pegada neutra',           'lats', array['biceps','upper_back'],              'bodyweight', 'vertical_pull',   false),
  (null, 'Barra fixa com peso',                'lats', array['biceps','upper_back'],              'bodyweight', 'vertical_pull',   false),
  (null, 'Barra fixa assistida na maquina',    'lats', array['biceps','upper_back'],              'machine',    'vertical_pull',   false),
  (null, 'Puxada frontal pronada',             'lats', array['biceps','upper_back','rear_delts'], 'cable',      'vertical_pull',   false),
  (null, 'Puxada supinada',                    'lats', array['biceps','upper_back'],              'cable',      'vertical_pull',   false),
  (null, 'Puxada pegada neutra (triangulo)',   'lats', array['biceps','upper_back'],              'cable',      'vertical_pull',   false),
  (null, 'Puxada pegada aberta',               'lats', array['biceps','upper_back','rear_delts'], 'cable',      'vertical_pull',   false),
  (null, 'Pulldown na maquina',                'lats', array['biceps','upper_back'],              'machine',    'vertical_pull',   false),
  (null, 'Pulldown unilateral no cabo',        'lats', array['biceps','upper_back'],              'cable',      'vertical_pull',   true),
  (null, 'Pullover na polia alta',             'lats', array['triceps','upper_back'],             'cable',      'isolation',       false),
  (null, 'Pullover com halter',                'lats', array['chest','triceps'],                  'dumbbell',   'isolation',       false),
  (null, 'Pullover na maquina',                'lats', array['triceps'],                          'machine',    'isolation',       false),
  (null, 'Remada curvada com barra (pronada)', 'lats', array['upper_back','rear_delts','biceps','lower_back'], 'barbell', 'horizontal_pull', false),
  (null, 'Remada curvada supinada (Yates)',    'lats', array['upper_back','biceps','rear_delts'], 'barbell',    'horizontal_pull', false),
  (null, 'Remada Pendlay',                     'lats', array['upper_back','rear_delts','biceps','lower_back'], 'barbell', 'horizontal_pull', false),
  (null, 'Remada cavalinho (T-bar)',           'lats', array['upper_back','biceps','rear_delts'], 'barbell',    'horizontal_pull', false),
  (null, 'Remada Meadows',                     'lats', array['upper_back','rear_delts','biceps'], 'barbell',    'horizontal_pull', true),
  (null, 'Remada unilateral com halter (serrote)', 'lats', array['upper_back','biceps','rear_delts'], 'dumbbell', 'horizontal_pull', true),
  (null, 'Remada com kettlebell unilateral',   'lats', array['upper_back','biceps'],              'kettlebell', 'horizontal_pull', true),
  (null, 'Remada baixa no cabo (triangulo)',   'lats', array['upper_back','biceps','rear_delts'], 'cable',      'horizontal_pull', false),
  (null, 'Remada pronada no cabo',             'lats', array['upper_back','rear_delts','biceps'], 'cable',      'horizontal_pull', false),
  (null, 'Remada na maquina (apoio no peito)', 'lats', array['upper_back','biceps','rear_delts'], 'machine',    'horizontal_pull', false),
  (null, 'Remada no Smith',                    'lats', array['upper_back','biceps','rear_delts'], 'smith_machine','horizontal_pull', false),
  (null, 'Remada invertida (australiana)',     'lats', array['upper_back','biceps','rear_delts'], 'bodyweight', 'horizontal_pull', false),
  (null, 'Remada na suspensao (TRX)',          'lats', array['upper_back','biceps','rear_delts'], 'suspension', 'horizontal_pull', false),
  (null, 'Puxada com braco estendido (straight-arm)', 'lats', array['upper_back','triceps'],      'cable',      'isolation',       false),

  -- =====================================================================
  -- MEIO DAS COSTAS (upper_back: romboides / trapezio medio)
  -- =====================================================================
  (null, 'Remada T com apoio no peito',        'upper_back', array['lats','rear_delts','biceps'], 'machine',   'horizontal_pull', false),
  (null, 'Remada alta na maquina (high row)',  'upper_back', array['rear_delts','traps','biceps'],'machine',   'horizontal_pull', false),
  (null, 'Seal row com barra',                 'upper_back', array['lats','rear_delts','biceps'], 'barbell',   'horizontal_pull', false),
  (null, 'Seal row com halteres',              'upper_back', array['lats','rear_delts','biceps'], 'dumbbell',  'horizontal_pull', false),
  (null, 'Remada invertida pegada aberta',     'upper_back', array['rear_delts','biceps'],        'bodyweight','horizontal_pull', false),
  (null, 'Remada alta no cabo para o pescoco', 'upper_back', array['rear_delts','traps'],         'cable',     'horizontal_pull', false),

  -- =====================================================================
  -- TRAPEZIO (traps)
  -- =====================================================================
  (null, 'Encolhimento com barra',             'traps', array['forearms'], 'barbell',       'isolation', false),
  (null, 'Encolhimento com halteres',          'traps', array['forearms'], 'dumbbell',      'isolation', false),
  (null, 'Encolhimento no Smith',              'traps', array['forearms'], 'smith_machine', 'isolation', false),
  (null, 'Encolhimento na maquina',            'traps', array['forearms'], 'machine',       'isolation', false),
  (null, 'Encolhimento no cabo',               'traps', array['forearms'], 'cable',         'isolation', false),
  (null, 'Encolhimento com trap bar',          'traps', array['forearms'], 'trap_bar',      'isolation', false),
  (null, 'Encolhimento com kettlebells',       'traps', array['forearms'], 'kettlebell',    'isolation', false),
  (null, 'Power shrug',                        'traps', array['forearms'], 'barbell',       'isolation', false),
  (null, 'Caminhada do fazendeiro (halteres)', 'traps', array['forearms','abs','glutes'], 'dumbbell',  'carry', false),
  (null, 'Caminhada do fazendeiro (trap bar)', 'traps', array['forearms','abs'],          'trap_bar', 'carry', false),

  -- =====================================================================
  -- DELTOIDE ANTERIOR (front_delts)
  -- =====================================================================
  (null, 'Desenvolvimento militar com barra (em pe)', 'front_delts', array['side_delts','triceps'], 'barbell','vertical_push', false),
  (null, 'Desenvolvimento militar sentado com barra', 'front_delts', array['side_delts','triceps'], 'barbell','vertical_push', false),
  (null, 'Desenvolvimento com halteres sentado',      'front_delts', array['side_delts','triceps'], 'dumbbell','vertical_push', false),
  (null, 'Desenvolvimento Arnold',                    'front_delts', array['side_delts','triceps'], 'dumbbell','vertical_push', false),
  (null, 'Desenvolvimento na maquina',                'front_delts', array['side_delts','triceps'], 'machine','vertical_push', false),
  (null, 'Desenvolvimento no Smith',                  'front_delts', array['side_delts','triceps'], 'smith_machine','vertical_push', false),
  (null, 'Desenvolvimento com kettlebells',           'front_delts', array['side_delts','triceps'], 'kettlebell','vertical_push', false),
  (null, 'Push press',                                'front_delts', array['side_delts','triceps','quads'], 'barbell','vertical_push', false),
  (null, 'Z press',                                   'front_delts', array['side_delts','triceps','abs'], 'barbell','vertical_push', false),
  (null, 'Landmine press',                            'front_delts', array['side_delts','triceps'], 'barbell','vertical_push', true),
  (null, 'Elevacao frontal com halteres',             'front_delts', array['side_delts'], 'dumbbell','isolation', false),
  (null, 'Elevacao frontal com barra',                'front_delts', array['side_delts'], 'barbell','isolation', false),
  (null, 'Elevacao frontal no cabo',                  'front_delts', array['side_delts'], 'cable','isolation', false),
  (null, 'Elevacao frontal com anilha',               'front_delts', array['side_delts'], 'plate','isolation', false),

  -- =====================================================================
  -- DELTOIDE LATERAL (side_delts)
  -- =====================================================================
  (null, 'Elevacao lateral com halteres',      'side_delts', array['traps'], 'dumbbell','isolation', false),
  (null, 'Elevacao lateral no cabo',           'side_delts', array['traps'], 'cable','isolation', true),
  (null, 'Elevacao lateral na maquina',        'side_delts', array['traps'], 'machine','isolation', false),
  (null, 'Elevacao lateral deitado de lado',   'side_delts', array[]::text[], 'dumbbell','isolation', true),
  (null, 'Elevacao lateral com faixa',         'side_delts', array['traps'], 'resistance_band','isolation', false),
  (null, 'Remada alta com barra (upright row)','side_delts', array['traps','biceps'], 'barbell','vertical_pull', false),
  (null, 'Remada alta com halteres',           'side_delts', array['traps','biceps'], 'dumbbell','vertical_pull', false),
  (null, 'Remada alta no cabo',                'side_delts', array['traps','biceps'], 'cable','vertical_pull', false),
  (null, 'Remada alta com kettlebell',         'side_delts', array['traps','biceps'], 'kettlebell','vertical_pull', false),

  -- =====================================================================
  -- DELTOIDE POSTERIOR (rear_delts)
  -- =====================================================================
  (null, 'Crucifixo invertido com halteres (apoiado)', 'rear_delts', array['upper_back','traps'], 'dumbbell','isolation', false),
  (null, 'Crucifixo invertido curvado (em pe)',        'rear_delts', array['upper_back','traps'], 'dumbbell','isolation', false),
  (null, 'Crucifixo invertido na maquina (reverse peck)', 'rear_delts', array['upper_back','traps'], 'machine','isolation', false),
  (null, 'Crucifixo invertido no cabo',                'rear_delts', array['upper_back'], 'cable','isolation', false),
  (null, 'Crucifixo invertido inclinado no banco',     'rear_delts', array['upper_back'], 'dumbbell','isolation', false),
  (null, 'Crucifixo invertido na faixa',               'rear_delts', array['upper_back'], 'resistance_band','isolation', false),
  (null, 'Face pull (puxada para o rosto)',            'rear_delts', array['upper_back','traps'], 'cable','horizontal_pull', false),
  (null, 'Remada para deltoide posterior',             'rear_delts', array['upper_back','traps'], 'dumbbell','horizontal_pull', false),

  -- =====================================================================
  -- BICEPS
  -- =====================================================================
  (null, 'Rosca direta com barra',             'biceps', array['forearms'], 'barbell','isolation', false),
  (null, 'Rosca direta com barra W',           'biceps', array['forearms'], 'ez_bar','isolation', false),
  (null, 'Rosca alternada com halteres',       'biceps', array['forearms'], 'dumbbell','isolation', false),
  (null, 'Rosca simultanea com halteres',      'biceps', array['forearms'], 'dumbbell','isolation', false),
  (null, 'Rosca inclinada com halteres',       'biceps', array['forearms'], 'dumbbell','isolation', false),
  (null, 'Rosca martelo',                      'biceps', array['forearms'], 'dumbbell','isolation', false),
  (null, 'Rosca martelo na corda (cabo)',      'biceps', array['forearms'], 'cable','isolation', false),
  (null, 'Rosca concentrada',                  'biceps', array['forearms'], 'dumbbell','isolation', true),
  (null, 'Rosca Scott com barra W',            'biceps', array['forearms'], 'ez_bar','isolation', false),
  (null, 'Rosca Scott na maquina',             'biceps', array['forearms'], 'machine','isolation', false),
  (null, 'Rosca no cabo (barra reta)',         'biceps', array['forearms'], 'cable','isolation', false),
  (null, 'Rosca Bayesian no cabo',             'biceps', array['forearms'], 'cable','isolation', true),
  (null, 'Rosca Spider',                       'biceps', array['forearms'], 'dumbbell','isolation', false),
  (null, 'Rosca 21',                           'biceps', array['forearms'], 'barbell','isolation', false),
  (null, 'Rosca Zottman',                      'biceps', array['forearms'], 'dumbbell','isolation', false),
  (null, 'Drag curl',                          'biceps', array['forearms'], 'barbell','isolation', false),
  (null, 'Rosca com kettlebell',               'biceps', array['forearms'], 'kettlebell','isolation', false),
  (null, 'Rosca com faixa',                    'biceps', array['forearms'], 'resistance_band','isolation', false),

  -- =====================================================================
  -- TRICEPS
  -- =====================================================================
  (null, 'Triceps na polia (barra reta)',      'triceps', array[]::text[], 'cable','isolation', false),
  (null, 'Triceps na polia (corda)',           'triceps', array[]::text[], 'cable','isolation', false),
  (null, 'Triceps na polia (barra V)',         'triceps', array[]::text[], 'cable','isolation', false),
  (null, 'Triceps testa com barra W',          'triceps', array[]::text[], 'ez_bar','isolation', false),
  (null, 'Triceps testa na barra reta',        'triceps', array[]::text[], 'barbell','isolation', false),
  (null, 'Triceps testa com halteres',         'triceps', array[]::text[], 'dumbbell','isolation', false),
  (null, 'Triceps frances com halter',         'triceps', array[]::text[], 'dumbbell','isolation', false),
  (null, 'Triceps frances na corda (cabo)',    'triceps', array[]::text[], 'cable','isolation', false),
  (null, 'Extensao de triceps acima da cabeca na maquina', 'triceps', array[]::text[], 'machine','isolation', false),
  (null, 'Triceps coice com halter',           'triceps', array[]::text[], 'dumbbell','isolation', true),
  (null, 'Triceps coice no cabo',              'triceps', array[]::text[], 'cable','isolation', true),
  (null, 'Extensao de triceps unilateral no cabo', 'triceps', array[]::text[], 'cable','isolation', true),
  (null, 'Triceps na maquina',                 'triceps', array[]::text[], 'machine','isolation', false),
  (null, 'Triceps com faixa',                  'triceps', array[]::text[], 'resistance_band','isolation', false),
  (null, 'Tate press',                         'triceps', array[]::text[], 'dumbbell','isolation', false),
  (null, 'Supino fechado (close grip)',        'triceps', array['chest','front_delts'], 'barbell','horizontal_push', false),
  (null, 'JM press',                           'triceps', array['chest'], 'barbell','horizontal_push', false),
  (null, 'Mergulho nas paralelas (triceps)',   'triceps', array['chest','front_delts'], 'bodyweight','horizontal_push', false),
  (null, 'Mergulho no banco (bench dip)',      'triceps', array['chest','front_delts'], 'bodyweight','horizontal_push', false),
  (null, 'Flexao diamante',                    'triceps', array['chest','front_delts'], 'bodyweight','horizontal_push', false),

  -- =====================================================================
  -- ANTEBRACOS (forearms)
  -- =====================================================================
  (null, 'Rosca de punho com barra',           'forearms', array[]::text[], 'barbell','isolation', false),
  (null, 'Rosca de punho invertida com barra', 'forearms', array[]::text[], 'barbell','isolation', false),
  (null, 'Rosca de punho com halteres',        'forearms', array[]::text[], 'dumbbell','isolation', false),
  (null, 'Rosca de punho no cabo',             'forearms', array[]::text[], 'cable','isolation', false),
  (null, 'Rosca inversa com barra',            'forearms', array['biceps'], 'barbell','isolation', false),
  (null, 'Rosca inversa com barra W',          'forearms', array['biceps'], 'ez_bar','isolation', false),
  (null, 'Wrist roller (enrolador de pulso)',  'forearms', array[]::text[], 'other','isolation', false),
  (null, 'Pegada (gripper)',                   'forearms', array[]::text[], 'other','isolation', false),
  (null, 'Sustentacao com halteres (hold)',    'forearms', array['traps'], 'dumbbell','carry', false),
  (null, 'Plate pinch (pegada na anilha)',     'forearms', array[]::text[], 'plate','carry', false),

  -- =====================================================================
  -- ABDOMEN (abs)
  -- =====================================================================
  (null, 'Abdominal supra (crunch)',           'abs', array[]::text[], 'bodyweight','core', false),
  (null, 'Abdominal na maquina',               'abs', array[]::text[], 'machine','core', false),
  (null, 'Abdominal no cabo (ajoelhado)',      'abs', array['obliques'], 'cable','core', false),
  (null, 'Elevacao de pernas suspenso',        'abs', array['obliques','lower_back'], 'bodyweight','core', false),
  (null, 'Elevacao de joelhos na cadeira romana', 'abs', array['obliques'], 'bodyweight','core', false),
  (null, 'Elevacao de pernas no solo',         'abs', array[]::text[], 'bodyweight','core', false),
  (null, 'Prancha frontal',                    'abs', array['obliques'], 'bodyweight','core', false),
  (null, 'Prancha na suspensao (TRX)',         'abs', array['obliques'], 'suspension','core', false),
  (null, 'Ab wheel (roda abdominal)',          'abs', array['lower_back'], 'other','core', false),
  (null, 'Crunch na bola',                     'abs', array[]::text[], 'medicine_ball','core', false),
  (null, 'Sit-up',                             'abs', array[]::text[], 'bodyweight','core', false),
  (null, 'V-up',                               'abs', array['obliques'], 'bodyweight','core', false),
  (null, 'Dead bug',                           'abs', array[]::text[], 'bodyweight','core', false),
  (null, 'Hollow hold',                        'abs', array[]::text[], 'bodyweight','core', false),
  (null, 'Crunch declinado',                   'abs', array[]::text[], 'bodyweight','core', false),
  (null, 'Toes to bar',                        'abs', array['obliques','lats'], 'bodyweight','core', false),
  (null, 'Dragon flag',                        'abs', array['lower_back'], 'bodyweight','core', false),
  (null, 'Canivete (jackknife)',               'abs', array['obliques'], 'bodyweight','core', false),

  -- =====================================================================
  -- OBLIQUOS (obliques)
  -- =====================================================================
  (null, 'Prancha lateral',                    'obliques', array['abs'], 'bodyweight','core', true),
  (null, 'Prancha lateral com elevacao de quadril', 'obliques', array['abs'], 'bodyweight','core', true),
  (null, 'Rotacao russa (russian twist)',      'obliques', array['abs'], 'medicine_ball','rotation', false),
  (null, 'Pallof press (anti-rotacao)',        'obliques', array['abs'], 'cable','core', false),
  (null, 'Lenhador no cabo (alto-baixo)',      'obliques', array['abs'], 'cable','rotation', false),
  (null, 'Lenhador no cabo (baixo-alto)',      'obliques', array['abs'], 'cable','rotation', false),
  (null, 'Flexao lateral com halter',          'obliques', array[]::text[], 'dumbbell','core', true),
  (null, 'Flexao lateral no cabo',             'obliques', array['abs'], 'cable','core', true),
  (null, 'Bicicleta (abdominal)',              'obliques', array['abs'], 'bodyweight','core', false),
  (null, 'Arremesso rotacional com medicine ball', 'obliques', array['abs'], 'medicine_ball','rotation', false),
  (null, 'Windmill com kettlebell',            'obliques', array['abs','glutes'], 'kettlebell','rotation', true),

  -- =====================================================================
  -- LOMBAR / ERETORES (lower_back)
  -- =====================================================================
  (null, 'Hiperextensao lombar (banco romano)','lower_back', array['glutes','hamstrings'], 'bodyweight','hinge', false),
  (null, 'Hiperextensao com anilha',           'lower_back', array['glutes','hamstrings'], 'plate','hinge', false),
  (null, 'Extensao lombar na maquina',         'lower_back', array['glutes'], 'machine','isolation', false),
  (null, 'Reverse hyper',                      'lower_back', array['glutes','hamstrings'], 'machine','hinge', false),
  (null, 'Good morning com barra',             'lower_back', array['hamstrings','glutes'], 'barbell','hinge', false),
  (null, 'Good morning no Smith',              'lower_back', array['hamstrings','glutes'], 'smith_machine','hinge', false),
  (null, 'Superman (solo)',                    'lower_back', array['glutes'], 'bodyweight','isolation', false),
  (null, 'Bird dog',                           'lower_back', array['glutes','abs'], 'bodyweight','core', false),

  -- =====================================================================
  -- QUADRICEPS (quads)
  -- =====================================================================
  (null, 'Agachamento livre com barra',        'quads', array['glutes','adductors','lower_back','hamstrings'], 'barbell','squat', false),
  (null, 'Agachamento frontal com barra',      'quads', array['glutes','adductors','abs'], 'barbell','squat', false),
  (null, 'Agachamento Zercher',                'quads', array['glutes','adductors','abs','upper_back'], 'barbell','squat', false),
  (null, 'Agachamento sumo com barra',         'quads', array['glutes','adductors','hamstrings'], 'barbell','squat', false),
  (null, 'Agachamento no Smith',               'quads', array['glutes','adductors'], 'smith_machine','squat', false),
  (null, 'Agachamento Hack',                   'quads', array['glutes','adductors'], 'machine','squat', false),
  (null, 'Leg press 45 graus',                 'quads', array['glutes','adductors','hamstrings'], 'machine','squat', false),
  (null, 'Leg press horizontal',               'quads', array['glutes','adductors'], 'machine','squat', false),
  (null, 'Leg press unilateral',               'quads', array['glutes'], 'machine','squat', true),
  (null, 'Cadeira extensora',                  'quads', array[]::text[], 'machine','isolation', false),
  (null, 'Cadeira extensora unilateral',       'quads', array[]::text[], 'machine','isolation', true),
  (null, 'Agachamento goblet com halter',      'quads', array['glutes','adductors'], 'dumbbell','squat', false),
  (null, 'Agachamento goblet com kettlebell',  'quads', array['glutes','adductors'], 'kettlebell','squat', false),
  (null, 'Agachamento livre (peso corporal)',  'quads', array['glutes'], 'bodyweight','squat', false),
  (null, 'Pistol squat',                       'quads', array['glutes','adductors'], 'bodyweight','squat', true),
  (null, 'Sissy squat',                        'quads', array[]::text[], 'bodyweight','squat', false),
  (null, 'Wall sit (agachamento na parede)',   'quads', array['glutes'], 'bodyweight','squat', false),
  (null, 'Afundo (lunge) com halteres',        'quads', array['glutes','hamstrings','adductors'], 'dumbbell','lunge', true),
  (null, 'Afundo caminhando com barra',        'quads', array['glutes','hamstrings'], 'barbell','lunge', true),
  (null, 'Agachamento bulgaro com halteres',   'quads', array['glutes','adductors','hamstrings'], 'dumbbell','lunge', true),
  (null, 'Agachamento bulgaro no Smith',       'quads', array['glutes','hamstrings'], 'smith_machine','lunge', true),
  (null, 'Passada / step-up com halteres',     'quads', array['glutes','hamstrings'], 'dumbbell','lunge', true),
  (null, 'Avanco no Smith',                    'quads', array['glutes','hamstrings'], 'smith_machine','lunge', true),

  -- =====================================================================
  -- POSTERIORES DA COXA (hamstrings)
  -- =====================================================================
  (null, 'Levantamento terra romeno (RDL) com barra', 'hamstrings', array['glutes','lower_back'], 'barbell','hinge', false),
  (null, 'Levantamento terra romeno com halteres',    'hamstrings', array['glutes','lower_back'], 'dumbbell','hinge', false),
  (null, 'RDL unilateral com halter',          'hamstrings', array['glutes','lower_back'], 'dumbbell','hinge', true),
  (null, 'RDL no cabo',                        'hamstrings', array['glutes','lower_back'], 'cable','hinge', false),
  (null, 'Stiff com barra',                    'hamstrings', array['glutes','lower_back'], 'barbell','hinge', false),
  (null, 'Levantamento terra convencional',    'hamstrings', array['glutes','lower_back','quads','traps','forearms'], 'barbell','hinge', false),
  (null, 'Levantamento terra sumo',            'hamstrings', array['glutes','quads','adductors','lower_back'], 'barbell','hinge', false),
  (null, 'Levantamento terra com trap bar',    'hamstrings', array['glutes','quads','traps'], 'trap_bar','hinge', false),
  (null, 'Good morning (enfase posterior)',    'hamstrings', array['glutes','lower_back'], 'barbell','hinge', false),
  (null, 'Mesa flexora (deitado)',             'hamstrings', array['calves'], 'machine','isolation', false),
  (null, 'Cadeira flexora (sentado)',          'hamstrings', array['calves'], 'machine','isolation', false),
  (null, 'Flexora em pe unilateral',           'hamstrings', array[]::text[], 'machine','isolation', true),
  (null, 'Flexao nordica (Nordic curl)',       'hamstrings', array['glutes'], 'bodyweight','isolation', false),
  (null, 'Glute-ham raise (GHR)',              'hamstrings', array['glutes','lower_back'], 'bodyweight','hinge', false),
  (null, 'Flexora deslizante (slider)',        'hamstrings', array['glutes'], 'bodyweight','isolation', false),

  -- =====================================================================
  -- GLUTEOS (glutes)
  -- =====================================================================
  (null, 'Elevacao pelvica com barra (hip thrust)', 'glutes', array['hamstrings'], 'barbell','hinge', false),
  (null, 'Hip thrust unilateral com barra',    'glutes', array['hamstrings'], 'barbell','hinge', true),
  (null, 'Hip thrust na maquina',              'glutes', array['hamstrings'], 'machine','hinge', false),
  (null, 'Hip thrust no Smith',                'glutes', array['hamstrings'], 'smith_machine','hinge', false),
  (null, 'Ponte de gluteo (glute bridge)',     'glutes', array['hamstrings'], 'barbell','hinge', false),
  (null, 'Elevacao pelvica (peso corporal)',   'glutes', array['hamstrings'], 'bodyweight','hinge', false),
  (null, 'Frog pump',                          'glutes', array['hamstrings'], 'bodyweight','hinge', false),
  (null, 'Coice de gluteo no cabo',            'glutes', array['hamstrings'], 'cable','isolation', true),
  (null, 'Coice de gluteo na maquina',         'glutes', array['hamstrings'], 'machine','isolation', true),
  (null, 'Coice de gluteo com faixa',          'glutes', array['hamstrings'], 'resistance_band','isolation', true),
  (null, 'Step-up alto (enfase gluteo)',       'glutes', array['hamstrings','quads'], 'dumbbell','lunge', true),
  (null, 'Kettlebell swing',                   'glutes', array['hamstrings','lower_back','abs'], 'kettlebell','hinge', false),

  -- =====================================================================
  -- ADUTORES (adductors)
  -- =====================================================================
  (null, 'Cadeira adutora',                    'adductors', array[]::text[], 'machine','isolation', false),
  (null, 'Aducao de quadril no cabo',          'adductors', array[]::text[], 'cable','isolation', true),
  (null, 'Aducao com faixa',                   'adductors', array[]::text[], 'resistance_band','isolation', false),
  (null, 'Afundo lateral (lateral lunge)',     'adductors', array['glutes','quads'], 'dumbbell','lunge', true),
  (null, 'Cossack squat',                      'adductors', array['glutes','quads'], 'bodyweight','lunge', true),
  (null, 'Copenhagen plank',                   'adductors', array['obliques'], 'bodyweight','core', true),

  -- =====================================================================
  -- ABDUTORES (abductors: gluteo medio/minimo)
  -- =====================================================================
  (null, 'Cadeira abdutora',                   'abductors', array['glutes'], 'machine','isolation', false),
  (null, 'Abducao de quadril no cabo',         'abductors', array['glutes'], 'cable','isolation', true),
  (null, 'Abducao em pe com faixa',            'abductors', array['glutes'], 'resistance_band','isolation', true),
  (null, 'Abducao deitado de lado',            'abductors', array['glutes'], 'bodyweight','isolation', true),
  (null, 'Caminhada lateral com faixa (monster walk)', 'abductors', array['glutes'], 'resistance_band','isolation', false),
  (null, 'Fire hydrant',                       'abductors', array['glutes'], 'bodyweight','isolation', true),

  -- =====================================================================
  -- PANTURRILHAS (calves)
  -- =====================================================================
  (null, 'Panturrilha em pe na maquina',       'calves', array[]::text[], 'machine','isolation', false),
  (null, 'Panturrilha sentado na maquina',     'calves', array[]::text[], 'machine','isolation', false),
  (null, 'Panturrilha no leg press',           'calves', array[]::text[], 'machine','isolation', false),
  (null, 'Donkey calf raise',                  'calves', array[]::text[], 'machine','isolation', false),
  (null, 'Panturrilha em pe com halteres',     'calves', array[]::text[], 'dumbbell','isolation', false),
  (null, 'Panturrilha unilateral com halter',  'calves', array[]::text[], 'dumbbell','isolation', true),
  (null, 'Panturrilha em pe com barra',        'calves', array[]::text[], 'barbell','isolation', false),
  (null, 'Panturrilha no Smith',               'calves', array[]::text[], 'smith_machine','isolation', false),
  (null, 'Panturrilha sentado com anilha',     'calves', array[]::text[], 'plate','isolation', false),
  (null, 'Panturrilha no degrau (peso corporal)', 'calves', array[]::text[], 'bodyweight','isolation', false),

  -- =====================================================================
  -- PESCOCO (neck)
  -- =====================================================================
  (null, 'Flexao de pescoco com anilha',       'neck', array[]::text[], 'plate','isolation', false),
  (null, 'Extensao de pescoco com anilha',     'neck', array[]::text[], 'plate','isolation', false),
  (null, 'Neck curl na maquina',               'neck', array[]::text[], 'machine','isolation', false),
  (null, 'Neck harness (extensao)',            'neck', array[]::text[], 'other','isolation', false),
  (null, 'Flexao lateral de pescoco com faixa','neck', array[]::text[], 'resistance_band','isolation', true),

  -- =====================================================================
  -- CORPO INTEIRO / CONDICIONAMENTO (primario = motor dominante)
  -- =====================================================================
  (null, 'Power clean',                        'hamstrings', array['glutes','traps','quads','lower_back'], 'barbell','hinge', false),
  (null, 'Hang clean',                         'hamstrings', array['glutes','traps','quads'], 'barbell','hinge', false),
  (null, 'Clean com kettlebell',               'hamstrings', array['glutes','traps','front_delts'], 'kettlebell','hinge', false),
  (null, 'Snatch com kettlebell',              'hamstrings', array['glutes','side_delts','traps'], 'kettlebell','hinge', false),
  (null, 'Thruster com halteres',              'quads', array['front_delts','glutes','triceps'], 'dumbbell','squat', false),
  (null, 'Wall ball',                          'quads', array['front_delts','glutes'], 'medicine_ball','squat', false),
  (null, 'Burpee',                             'quads', array['chest','abs','front_delts'], 'bodyweight','squat', false),
  (null, 'Turkish get-up',                     'abs', array['front_delts','glutes','obliques'], 'kettlebell','core', true),
  (null, 'Empurrar treno (prowler)',           'quads', array['glutes','calves'], 'other','carry', false),
  (null, 'Puxar treno (sled pull)',            'hamstrings', array['glutes','upper_back'], 'other','carry', false);

  raise notice 'catalogo global de exercicios populado';
end;
$$;
