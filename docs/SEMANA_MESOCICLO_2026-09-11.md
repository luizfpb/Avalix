# Semana do mesociclo pelo histórico

## O problema

A semana da sessão era calculada pela data: início do plano (ou, na falta dele,
a data em que o plano foi criado) dividido por sete. Isso só acerta para o aluno
que começa no mesmo dia em que o plano é montado e nunca falta.

Na prática ele recebe o plano e começa duas semanas depois; falta uma semana
inteira e volta; ou repete a semana 2 porque não foi bem. Em todos esses casos a
tela oferecia uma semana que não existia na vida dele — e o número ia calado para
`workout_logs.week_number`, que é o mesmo que escolhe a prescrição da semana
aplicada na tela e que aparece no histórico e no PDF.

## O que passa a valer

A semana vem do que foi **registrado**, não do relógio: continue na semana do
último treino e só avance quando ela fechar. A contagem é da passada atual, então
quem voltou da semana 3 para a 2 recomeça a semana 2 do zero. Plano sem nenhuma
sessão começa na semana 1.

"Fechou a semana" e "vou repetir a semana" são a mesma coisa para qualquer
cálculo automático — essa escolha é humana. Por isso as duas telas passam a
explicar de onde saiu o número e oferecem **Repetir a semana N** (ou voltar para
a sugerida) em um clique, com o campo continuando editável.

Também muda o início efetivo do plano para fins de adesão: a data informada pelo
profissional continua valendo, mas a primeira sessão registrada vence quando é
anterior a ela e é o que vale quando não há data informada. O plano montado em
janeiro e começado em março deixa de ser cobrado desde janeiro.

Na Execução aparece a defasagem entre o papel e a vida real —
`Semana do mesociclo: 3 de 8 · 5ª semana desde 02/03` —, que é o sinal de que o
mesociclo precisa ser prorrogado.

## A migration

A [0037](../supabase/migrations/0037_semana_do_mesociclo.sql) não cria tabela nem
altera RLS, policies ou permissões. Ela faz duas coisas:

- `workout_log_summary` ganha a coluna `first_date` (primeira sessão do plano);
- `get_workout_for_link` passa a devolver `plan_week_log`, com as últimas 40
  sessões do plano ativo (data e semana), para a página do aluno chegar ao mesmo
  número que a tela do profissional sem baixar o histórico inteiro.

Nenhum dado existente é reescrito. O aplicativo funciona sem ela: os dois campos
são opcionais no cliente, e enquanto faltarem a tela do aluno volta ao palpite
antigo pelo calendário.

## Validação feita aqui

`npm run lint`, `npm run test` (**922 testes em 116 arquivos**) e `npm run build`
verdes. Os testes cobrem a regra pura (começo tardio, falta, retrocesso, fim do
mesociclo, plano encolhido, sessão sem semana anotada) e as duas telas (sugestão
exibida, repetição em um clique, semana enviada no registro, defasagem e pacote
antigo sem sugestão).

A suíte pgTAP da 0037 (`supabase/tests/0037_semana_do_mesociclo.test.sql`, 13
verificações) **não foi executada**: depende de um PostgreSQL descartável.

## Como aplicar

No **CMD do Windows**, um comando de cada vez.

1. Aplicar a `0037` pelo SQL Editor do dashboard do Supabase (copiar e colar o
   conteúdo do arquivo — ele tem acentos, então usar copiar/colar, nunca
   `type | clip`).

2. Regenerar os tipos:

```cmd
npx supabase gen types typescript --linked > src\lib\database.types.ts
```

3. Conferir o carimbo do schema:

```cmd
npm run check:remote-schema
```

O resultado esperado é `schema gate ok: 0037`. O gate deste frontend já exige a
0037, então ele reprova enquanto a migration não estiver aplicada.

4. Rodar a validação completa:

```cmd
npm run check
```

5. Publicar (o push é sempre seu):

```cmd
git add docs/DECISIONS.md docs/SEMANA_MESOCICLO_2026-09-11.md scripts/check-schema-version.mjs src/features/workout/api.ts src/features/workout/carteira.ts src/features/workout/carteira.test.ts src/features/workout/progress.ts src/features/workout/progress.test.ts src/features/workout/studentApi.ts src/lib/database.types.ts src/pages/Dashboard.test.tsx src/pages/Execucao.tsx src/pages/Execucao.test.tsx src/pages/TreinoAluno.tsx src/pages/TreinoAluno.test.tsx supabase/migrations/0037_semana_do_mesociclo.sql supabase/tests/0037_semana_do_mesociclo.test.sql
```

```cmd
git commit -m "Deriva a semana do mesociclo do historico de treinos"
```

```cmd
git push
```
