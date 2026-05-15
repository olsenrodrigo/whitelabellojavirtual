# Whitelabel Loja Virtual

Manual do usuário e guia de configuração da plataforma de e-commerce.

---

## Visão Geral

O **Whitelabel Loja Virtual** é uma plataforma de e-commerce completa desenvolvida pela Sintetiza AI para seus clientes. A plataforma oferece uma loja virtual com vitrine de produtos, carrinho de compras, checkout com múltiplos meios de pagamento, painel administrativo completo e suporte a múltiplos idiomas (PT, EN, ES).

Construída com React 19, TypeScript, Express 5 e PostgreSQL, a plataforma é totalmente customizável — cores, nome da loja, integrações de pagamento e e-mail são configurados diretamente pelo painel administrativo.

---

## Acesso Rápido

| Destino                 | URL                              |
|-------------------------|----------------------------------|
| Site principal          | http://localhost:5003            |
| Loja virtual            | http://localhost:5003/loja       |
| Painel administrativo   | http://localhost:5003/admin      |
| Login administrativo    | http://localhost:5003/admin/login |

---

## Implantação no Servidor

### Opção 1: VPS Ubuntu 22.04 / 24.04 (recomendado)

Requisitos: Ubuntu 22.04+, 1 GB RAM mínimo, domínio apontando para o servidor.

```bash
# 1. Clone o repositório no servidor
git clone https://github.com/sua-org/whitelabel-loja-virtual.git /var/www/loja
cd /var/www/loja

# 2. Instale as dependências do sistema (Node.js, PostgreSQL, Nginx, PM2, Certbot)
sudo bash setup/install.sh

# 3. Configure a aplicação de forma interativa (banco, .env, build, PM2, Nginx, HTTPS)
bash setup/setup.sh
```

O script `setup.sh` vai:
- Criar o banco de dados PostgreSQL e o usuário
- Gerar o `.env` com JWT_SECRET aleatório
- Instalar dependências, compilar e iniciar com PM2
- Configurar Nginx como proxy reverso
- Opcionalmente obter certificado HTTPS via Let's Encrypt

> Para tornar os scripts executáveis: `chmod +x setup/*.sh`

---

### Opção 2: Docker Compose

Requisitos: Docker 24+ e Docker Compose v2.

```bash
# 1. Clone o repositório
git clone https://github.com/sua-org/whitelabel-loja-virtual.git
cd whitelabel-loja-virtual

# 2. Crie o arquivo de variáveis de ambiente
cp setup/.env.example .env
# Edite o .env com suas configurações reais
nano .env

# 3. Suba os containers (app + PostgreSQL)
cd setup
docker compose up -d

# 4. Acompanhe os logs
docker compose logs -f app
```

O banco de dados é inicializado automaticamente com os arquivos em `migrations/`. Os uploads de produtos ficam persistidos no volume local `./uploads`.

---

### Opção 3: Railway / Render / Heroku (PaaS)

1. Conecte seu repositório à plataforma de sua escolha.
2. Adicione um banco de dados PostgreSQL (add-on ou serviço separado).
3. Configure as variáveis de ambiente listadas na tabela abaixo diretamente no painel da plataforma.
4. O comando de build é `npm run build` e o de start é `node dist/index.cjs`.
5. Certifique-se de que a variável `NODE_ENV=production` está definida.

---

### Variáveis de Ambiente

| Variável | Obrigatório | Descrição |
|---|---|---|
| `DATABASE_URL` | Sim | URL completa do PostgreSQL (`postgresql://user:pass@host:5432/db`) |
| `JWT_SECRET` | Sim | String aleatória longa para assinar tokens JWT (mínimo 32 chars) |
| `PORT` | Não | Porta do servidor HTTP (padrão: `3000`) |
| `NODE_ENV` | Sim | Deve ser `production` em produção |
| `SMTP_HOST` | Sim* | Servidor SMTP (ex.: `smtp.gmail.com`) |
| `SMTP_PORT` | Sim* | Porta SMTP (ex.: `587`) |
| `SMTP_USER` | Sim* | Usuário SMTP (endereço de e-mail) |
| `SMTP_PASS` | Sim* | Senha SMTP ou Senha de App |
| `CONTACT_EMAIL` | Não | E-mail que recebe os formulários de contato |
| `SETUP_SECRET` | Não | Chave extra para proteger a rota de primeiro acesso |
| `MERCADO_PAGO_TOKEN` | Não | Access Token do MercadoPago (pode ser configurado pelo painel) |

> *Obrigatório para que MFA e notificações de pedido funcionem.

---

### Segurança

- **MFA por e-mail**: habilitado por padrão. Exige SMTP configurado. Administradores recebem código OTP a cada login.
- **SETUP_SECRET**: defina esta variável para proteger a rota `/admin/setup` contra acesso não autorizado. Após criar o primeiro admin, a rota é desativada automaticamente.
- **Rate limiting**: a API aplica limitação de requisições por IP nas rotas de autenticação.
- **HTTPS**: use `certbot` (incluso no `install.sh`) ou configure o certificado SSL na plataforma PaaS.

---

### Atualizar versão

Em servidores VPS, use o script de atualização:

```bash
bash /var/www/loja/setup/update.sh
```

O script executa `git pull`, reinstala dependências, roda migrações pendentes, recompila e reinicia o PM2 automaticamente.

---

## Primeiro Acesso (Setup)

Na primeira vez que a plataforma é iniciada, nenhum administrador existe no banco de dados. Siga os passos abaixo:

1. Acesse http://localhost:5003/admin
2. Você será redirecionado para a tela de login
3. Clique no link **"Primeiro Acesso"** (exibido abaixo do formulário de login)
4. Preencha o e-mail e a senha desejados para o administrador
5. Clique em **"Criar conta de administrador"**
6. Após a criação, faça login normalmente com as credenciais cadastradas

> Após o primeiro administrador ser criado, o link "Primeiro Acesso" deixa de funcionar por segurança.

---

## Guia do Administrador

### Produtos

A seção de produtos permite gerenciar todo o catálogo da loja.

**Para adicionar um produto:**
1. Acesse **Admin → Produtos**
2. Clique em **"Novo Produto"**
3. Preencha: nome, slug (URL amigável), descrição, preço e preço promocional (opcional)
4. Defina o estoque inicial e a categoria do produto
5. Faça upload de uma ou mais fotos (a primeira será a foto de capa)
6. Se necessário, crie **variantes** (ex.: tamanho, cor) na aba de variantes — cada variante pode ter seu próprio estoque e preço
7. Marque **"Publicado"** para exibir na loja
8. Clique em **"Salvar"**

**Para editar ou excluir:** clique no produto na listagem e edite os campos desejados.

---

### Categorias

As categorias organizam os produtos na loja e permitem filtragem pelos clientes.

**Para criar uma categoria:**
1. Acesse **Admin → Categorias**
2. Clique em **"Nova Categoria"**
3. Informe o nome e o slug da categoria
4. Salve

**Para gerenciar:** edite ou exclua categorias pela listagem. Produtos vinculados à categoria não são excluídos — apenas perdem a associação.

---

### Pedidos

A seção de pedidos exibe todos os pedidos realizados pelos clientes.

**Para visualizar e atualizar um pedido:**
1. Acesse **Admin → Pedidos**
2. Clique no número do pedido para abrir o detalhe
3. Atualize o **status** (Pendente, Confirmado, Em separação, Enviado, Entregue, Cancelado)
4. Para pedidos enviados, informe o **código de rastreio** e a transportadora
5. Salve as alterações — o cliente receberá e-mail de atualização automaticamente (se SMTP configurado)

---

### Clientes

A seção de clientes exibe todos os usuários que realizaram pedidos na loja.

1. Acesse **Admin → Clientes**
2. Visualize nome, e-mail, telefone e total de pedidos de cada cliente
3. Clique em um cliente para ver o histórico completo de pedidos

> No momento, o cadastro de clientes é somente leitura no painel administrativo.

---

### Cupons

Os cupons de desconto permitem oferecer promoções aos clientes.

**Tipos de cupom disponíveis:**
- **Percentual**: desconto em porcentagem sobre o total do pedido
- **Valor fixo**: desconto de um valor em reais sobre o total
- **Frete grátis**: zera o valor do frete

**Para criar um cupom:**
1. Acesse **Admin → Cupons**
2. Clique em **"Novo Cupom"**
3. Defina o código (ex.: `PROMO10`), o tipo, o valor e a data de validade (opcional)
4. Defina um limite de usos (opcional — deixe em branco para ilimitado)
5. Marque como **"Ativo"** e salve

---

### Importação em Massa (CSV/XLSX)

Para importar vários produtos de uma vez via planilha:

1. Acesse **Admin → Importar**
2. Clique em **"Baixar template"** para obter a planilha modelo
3. Preencha os dados dos produtos seguindo as colunas do template:
   - `nome`, `slug`, `descricao`, `preco`, `preco_promocional`, `estoque`, `categoria`, `publicado`
4. Salve o arquivo como `.csv` ou `.xlsx`
5. Arraste o arquivo para a área de upload ou clique para selecionar
6. Revise os dados na pré-visualização e clique em **"Importar"**

> Produtos já existentes (mesmo slug) serão atualizados; novos produtos serão criados.

---

### Destaques

A seção de destaques permite selecionar os produtos que aparecem em carrosséis e seções especiais na página inicial e na loja.

1. Acesse **Admin → Destaques**
2. Veja a listagem de todos os produtos publicados
3. Ative o botão de **"Destaque"** nos produtos que deseja promover
4. Os produtos destacados passam a aparecer nas seções de destaque da loja automaticamente

---

### Configurações

A seção de configurações centraliza todas as personalizações da plataforma.

#### Informações da Loja
- Nome da loja, descrição, CNPJ, endereço, telefone e e-mail de contato

#### Aparência
- Escolha uma paleta de cores predefinida ou defina cores personalizadas (primária, secundária, acento)
- As cores são aplicadas em tempo real na loja virtual

#### E-mail (SMTP)
- Configure o servidor SMTP para envio de e-mails transacionais (confirmação de pedido, atualização de status)
- Campos: host, porta, usuário, senha, e-mail remetente

#### Pagamento (MercadoPago)
- Informe o **Access Token** do MercadoPago para habilitar PIX, Boleto e Cartão de Crédito
- Obtenha as credenciais em: https://www.mercadopago.com.br/developers

#### Frete
- Configure as opções de frete: frete grátis acima de um valor mínimo, valor fixo por região ou integração com Correios

---

## Configuração Inicial do .env

Crie um arquivo `.env` na raiz do projeto com as seguintes variáveis:

```env
# Banco de dados PostgreSQL
DATABASE_URL=postgresql://usuario:senha@localhost:5432/whitelabel

# Segurança
JWT_SECRET=sua_chave_secreta_muito_longa_e_aleatoria

# Servidor
PORT=5003

# E-mail (SMTP) — opcional, mas necessário para e-mails transacionais
SMTP_HOST=smtp.seuprovedor.com
SMTP_PORT=587
SMTP_USER=seu@email.com
SMTP_PASS=sua_senha_smtp
CONTACT_EMAIL=contato@sualoja.com

# MercadoPago — opcional, necessário para pagamentos online
MERCADO_PAGO_TOKEN=APP_USR-xxxxxxxxxxxxxxxxxxxx
```

> Após criar o `.env`, execute `npm run db:push` para criar as tabelas no banco de dados.

---

## Idiomas

A plataforma suporta três idiomas:

| Idioma     | URL               |
|------------|-------------------|
| Português  | http://localhost:5003 (padrão) |
| Inglês     | http://localhost:5003/en       |
| Espanhol   | http://localhost:5003/es       |

O idioma também pode ser alterado pelo seletor de idioma na barra de navegação da loja.

---

## Meios de Pagamento

| Meio de Pagamento    | Detalhes                                  |
|----------------------|-------------------------------------------|
| PIX                  | Desconto de 5% aplicado automaticamente   |
| Boleto Bancário      | Prazo de compensação: 3 dias úteis        |
| Cartão de Crédito    | Parcelamento em até 12x                   |

> Todos os meios de pagamento são processados via **MercadoPago**. É necessário configurar o Access Token nas Configurações do painel.

---

## Tecnologias

| Camada       | Tecnologia                          |
|--------------|-------------------------------------|
| Frontend     | React 19, TypeScript, Tailwind CSS 4 |
| Roteamento   | Wouter                              |
| Estado       | TanStack Query (React Query)        |
| Backend      | Express 5, Node.js                  |
| Banco de dados | PostgreSQL + Drizzle ORM          |
| Autenticação | JWT                                 |
| Pagamentos   | MercadoPago SDK                     |
| E-mail       | Nodemailer (SMTP)                   |

---

## Suporte

Desenvolvido por **Sintetiza AI**

- Site: https://sintetiza.ai
- E-mail: contato@sintetiza.ai

Para reportar bugs ou solicitar novas funcionalidades, entre em contato com a equipe da Sintetiza AI.
