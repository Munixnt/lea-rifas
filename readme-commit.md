# Instruções para commit

Execute os comandos no PowerShell, a partir da pasta do projeto. Confira o que será incluído antes de criar o commit.

## Commit apenas dos arquivos desta alteração

```powershell
git status --short
git add -- manager-page.js painel.html styles.css
git status --short
git commit -m "Atualiza painel financeiro e reservas"
git push origin HEAD
```

## Commit de todas as alterações locais

Use esta opção somente se quiser incluir **todas** as mudanças rastreadas e arquivos novos do diretório de trabalho. Ela pode incluir alterações não relacionadas a esta tarefa.

```powershell
git status --short
git add -A
git status --short
git commit -m "Atualiza painel financeiro e reservas"
git push origin HEAD
```

Se o `git status` mostrar arquivos que não devem fazer parte do commit, não execute `git commit` ainda. Remova esses arquivos da área de stage com `git restore --staged -- caminho/do/arquivo` e confira novamente com `git status --short`.
