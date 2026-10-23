# Lea Rifas

Aplicativo web estático para campanhas de rifas. Os dados compartilhados, as contas e as reservas são armazenados no Supabase; os participantes enviam o comprovante Pix pelo WhatsApp e a Lea confirma o pagamento no painel.

## Preparar o Supabase

1. Crie um projeto no [Supabase](https://supabase.com/).
2. No **SQL Editor**, execute todo o conteúdo de [`supabase-schema.sql`](./supabase-schema.sql). Ao atualizar um projeto existente, execute o arquivo novamente para instalar as funções novas do painel; o script pode ser reaplicado.
3. Em **Project Settings → API**, copie a URL do projeto e a chave pública (`anon`/publishable).
4. Preencha `url` e `anonKey` em [`supabase-config.js`](./supabase-config.js).
   - A chave pública pode ser usada no navegador; as políticas RLS do schema protegem os dados.
   - **Nunca** coloque a `service_role` key neste site.
5. Em **Authentication → URL Configuration**, configure a URL pública do site como **Site URL** e adicione-a às **Redirect URLs**. Para GitHub Pages de projeto, a URL terá o formato `https://SEU-USUARIO.github.io/lea-rifas/`.
6. Em **Authentication → Settings**, permita novos cadastros. Em **Authentication → Sign In / Providers → Email**, habilite o provedor de e-mail e desative a confirmação de e-mail. O site usa o celular como nome de usuário e cria internamente um endereço fictício `@login.lea-rifas.invalid` para autenticar com senha; nenhum e-mail é solicitado ou enviado. O provedor Phone e um serviço de SMS não são usados.
7. Crie a conta da Lea no próprio site usando o celular com DDD. Depois, no SQL Editor, promova somente esse número a administradora, substituindo pelo telefone no formato internacional (`+55` seguido de DDD e número):

   ```sql
   update public.profiles
   set role = 'admin'
   where id = (select id from public.profiles where phone = '+5573998216141');
   ```

   Confirme que a consulta alterou exatamente uma linha. Não permita que participantes comuns se tornem administradores.

## Publicar no GitHub Pages

1. Envie os arquivos do projeto para a branch `main`, incluindo as páginas HTML, scripts JavaScript, `styles.css`, `manifest.webmanifest`, `service-worker.js`, `pwa.js`, a pasta `icons/`, `logo-transparent.png`, `avatar.png` e `icon.ico`.
2. No repositório, abra **Settings → Pages** e selecione **Deploy from a branch**, branch `main` e pasta `/(root)`.
3. Depois que o GitHub Pages publicar o site, configure a URL final no Supabase (passo 5 acima).
4. Copie o link criado no painel gerencial para divulgar cada campanha.

## Instalar como aplicativo (PWA)

Depois de publicar o site em HTTPS, abra-o no navegador do dispositivo e use **Instalar app** no cabeçalho. Navegadores que não oferecem o aviso de instalação mostram instruções para usar o menu do navegador; no iPhone/iPad, use **Compartilhar → Adicionar à Tela de Início**.

O manifest e os ícones definem a aparência do aplicativo instalado. O service worker mantém os arquivos da interface em cache e permite abrir o shell do site sem conexão; login, campanhas e reservas continuam dependendo da conexão com o Supabase.

O site foi separado em páginas independentes para facilitar a manutenção:

- `index.html`: lista de campanhas públicas.
- `campanha.html`: detalhes da campanha e seleção de dezenas.
- `entrar.html`: login e cadastro de participantes.
- `minhas-dezenas.html`: reservas do participante e contato pelo WhatsApp.
- `painel.html`: gestão de campanhas, pagamentos, arquivamento e exportação do card.

Os estilos compartilhados ficam em `styles.css`; cada página carrega seu próprio script (`campaigns-page.js`, `campaign-page.js`, `auth-page.js`, `reservations-page.js` ou `manager-page.js`) junto com `app.js`. `logo-transparent.png` e `avatar.png` são as imagens transparentes da marca e do avatar. A logo original continua preservada em `logo.png`.

Os dados da versão anterior ficam no armazenamento local do navegador e não são transferidos automaticamente para o Supabase. Preserve a instalação e o navegador antigos até decidir se precisa migrar as rifas existentes.

## Fluxo de uso

- A Lea cria campanhas ilimitadas no painel e compartilha o link público individual de cada uma.
- A pessoa cria uma conta com celular e senha e já pode escolher dezenas para reservar. O celular é o nome de usuário e também fica salvo como contato, mas não é verificado; qualquer pessoa pode cadastrar um número que não lhe pertence. Para entrar novamente, usa celular e senha. Não há verificação por SMS nem recuperação automática de senha; cada pessoa deve guardar sua senha com segurança. Crie e promova a conta administradora antes de divulgar o cadastro público.
- A Lea pode registrar vendas no painel buscando um cliente cadastrado ou fazendo uma venda avulsa com apenas o nome; telefone é opcional. Pode registrar a venda como paga, pendente ou fiado. As dezenas fiadas ficam imediatamente confirmadas/indisponíveis sem registrar pagamento, e podem ser marcadas como pagas depois. As dezenas são gravadas na mesma cartela das reservas pelo link, evitando venda duplicada. O CRM agrupa clientes cadastrados pelo cadastro e vendas avulsas pelo telefone quando houver, mostra o débito pendente e calcula as dezenas mais recorrentes a partir do histórico não cancelado.
- A reserva mantém as dezenas indisponíveis enquanto aguarda o comprovante; o link de WhatsApp abre uma mensagem pronta para a Lea.
- No painel, reservas e pagamentos ficam separados por campanha. A Lea confirma o Pix, marca uma reserva como fiado ou libera a dezena. Fiados continuam ocupando a dezena e entram no débito; podem ser marcados como pagos mais tarde.
- Para arquivar, a Lea informa a dezena oficial sorteada e escolhe se publica o resultado. No painel, campanhas arquivadas mantêm visíveis somente os fiados que ainda aguardam pagamento. A cartela de divulgação é baixada como imagem PNG vertical 9:16.

O número de WhatsApp/chave Pix usado nas mensagens e nos cards está definido em `PIX_WHATSAPP` em `app.js`. Atualize-o se a cliente quiser usar outro número. O card exportado pelo painel segue o formato vertical 9:16 do modelo enviado e mostra dezenas disponíveis e vendidas/reservadas.
