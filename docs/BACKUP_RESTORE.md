# Backup e restauração do Avalix

O workflow semanal `.github/workflows/backup.yml` gera um único arquivo
criptografado contendo:

- `db.dump`: schema e dados do Postgres no formato custom do `pg_dump`;
- `db.restore-list.txt`: índice validado do dump;
- `storage/photos/`: fotos posturais e miniaturas;
- `storage/logos/`: logos das organizações;
- `storage/manifest.json`: path, tamanho e SHA-256 de cada objeto.

## Secrets obrigatórios

Configure em **GitHub > Settings > Secrets and variables > Actions**:

- `SUPABASE_DB_URL`: URI do Session Pooler;
- `SUPABASE_URL`: Project URL;
- `SUPABASE_SERVICE_ROLE_KEY`: chave exclusiva para o job de backup;
- `BACKUP_PASSPHRASE`: senha longa, aleatória e guardada fora do GitHub.

A service role nunca entra no frontend. Restrinja quem pode editar/executar o
workflow e faça rotação da chave se houver suspeita de exposição.

## Validar o artifact

No terminal integrado do VSCode usando Command Prompt/CMD:

```cmd
gpg --output backup.tar.gz --decrypt backup-AAAAmmdd-HHMMSS.tar.gz.gpg
tar -tzf backup.tar.gz
tar -xzf backup.tar.gz
```

O diretório extraído deve conter `db.dump`, `db.restore-list.txt`, os dois
buckets e o manifesto. Valide o formato antes de qualquer restauração:

```cmd
pg_restore --list backup-AAAAmmdd-HHMMSS\db.dump
```

## Teste de restauração

Faça o teste em um ambiente descartável compatível, nunca diretamente em produção.
Não execute o dump integral com `psql` sobre um projeto Supabase novo: ele já
possui schemas e papéis gerenciados (`auth`, `storage` etc.) e haveria colisões.

Para um Postgres realmente vazio e compatível, a validação base é:

```cmd
pg_restore --exit-on-error --no-owner --no-privileges --dbname "%RESTORE_URL%" backup-AAAAmmdd-HHMMSS\db.dump
```

Para um projeto Supabase gerenciado, restaure pelo procedimento de disaster
recovery vigente do Supabase: aplique as migrations do app, restaure os dados
permitidos de forma seletiva e trate usuários de Auth e objetos do Storage nas
APIs próprias. Nunca sobrescreva schemas gerenciados às cegas.

Checklist do ensaio:

1. valide o índice e restaure o banco com parada no primeiro erro;
2. recrie/confirme os buckets privados `photos` e `logos`;
3. envie os objetos preservando exatamente os paths do manifesto;
4. compare quantidade, tamanho e SHA-256;
5. entre com um usuário de teste e abra uma avaliação, uma foto e um PDF;
6. confirme logins/Auth, FKs, RLS e contagens por tabela;
7. registre a data, ambiente, comandos e resultado do teste.

Um artifact apenas descriptografável não basta: o teste conjunto de banco e
Storage deve ser repetido antes do beta e depois de mudanças no schema de fotos.
O workflow valida criptografia, integridade estrutural do dump e presença dos
arquivos; ele não substitui o ensaio real de restauração em outro ambiente.
