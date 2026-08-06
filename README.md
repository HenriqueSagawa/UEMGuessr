<div align="center">

# 🗺️ UEMGuessr

### O GeoGuessr do campus da UEM

Adivinhe onde a foto foi tirada dentro do campus, acumule pontos com base na sua precisão e dispute o ranking com outros estudantes.

<br/>

[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express_5-000000?style=for-the-badge&logo=express&logoColor=white)](https://expressjs.com/)
[![Prisma](https://img.shields.io/badge/Prisma-2D3748?style=for-the-badge&logo=prisma&logoColor=white)](https://www.prisma.io/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Jest](https://img.shields.io/badge/Jest-C21325?style=for-the-badge&logo=jest&logoColor=white)](https://jestjs.io/)

<br/>

[![Repo size](https://img.shields.io/github/repo-size/HenriqueSagawa/UEMGuessr?style=flat-square&color=blueviolet)](https://github.com/HenriqueSagawa/UEMGuessr)
[![Last commit](https://img.shields.io/github/last-commit/HenriqueSagawa/UEMGuessr?style=flat-square&color=success)](https://github.com/HenriqueSagawa/UEMGuessr/commits/main)
[![Issues](https://img.shields.io/github/issues/HenriqueSagawa/UEMGuessr?style=flat-square&color=orange)](https://github.com/HenriqueSagawa/UEMGuessr/issues)
[![License](https://img.shields.io/badge/license-Unlicensed-lightgrey?style=flat-square)](#-licença)

<br/>

[Sobre](#-sobre-o-projeto) •
[Funcionalidades](#-funcionalidades) •
[Stack](#%EF%B8%8F-tecnologias) •
[Arquitetura](#-arquitetura) •
[API](#-referência-da-api) •
[Instalação](#-como-rodar-o-projeto) •
[Testes](#-testes) •
[Roadmap](#%EF%B8%8F-roadmap)

</div>

<br/>

>
> 
> <p align="center">
>   <img src="https://i.imgur.com/kS88anq.gif" alt="Demonstração do UEMGuessr" width="800"/>
> </p>
>

<br/>

## 📖 Sobre o projeto

**UEMGuessr** é uma API REST que dá vida a um jogo no estilo **GeoGuessr**, só que ambientado inteiramente dentro do campus da **Universidade Estadual de Maringá (UEM))**. O jogador recebe a foto de um local do campus, precisa "chutar" onde aquilo fica em um mapa e ganha pontos proporcionais à precisão do palpite.

O projeto nasceu como um estudo aprofundado de **arquitetura de APIs em Node.js/TypeScript**, e hoje já conta com autenticação completa, upload de imagens, um sistema de pontuação geoespacial e uma suíte de testes automatizados cobrindo as regras de negócio mais sensíveis.

<div align="center">

```mermaid
flowchart LR
    A["Foto do local"] --> B["Jogador arrasca<br/>o pin no mapa"]
    B --> C["Cálculo da distância<br/>(Haversine)"]
    C --> D["Pontuação<br/>(decaimento exponencial)"]
    D --> E["Placar da partida"]
```

</div>

<br/>

## ✨ Funcionalidades

<table>
<tr>
<td width="50%" valign="top">

### 🔐 Autenticação & Contas
- Registro com **verificação de e-mail** por código
- Login com **e-mail/senha** (hash com `bcryptjs`)
- **Login social com Google (OAuth 2.0)**
- **JWT** de acesso + **refresh token** rotativo, revogável
- Fluxo de **"esqueci minha senha"** com código de recuperação
- Cookies `httpOnly` para armazenamento seguro de sessão

</td>
<td width="50%" valign="top">

### 🎮 Motor do jogo
- Criação de partidas com **5 rodadas** cada
- Sorteio de locais sem repetição dentro da mesma partida
- Pontuação por rodada calculada via **fórmula de Haversine**
- **Decaimento exponencial** de pontos conforme a distância do chute
- Proteção contra **condição de corrida** (respostas duplicadas) via constraints únicas no banco
- Histórico de partidas paginado por usuário

</td>
</tr>
<tr>
<td width="50%" valign="top">

### 🗺️ Gestão de locais (admin)
- CRUD completo de locais do campus
- Upload de imagens via **Cloudinary**
- Coordenadas geográficas com precisão decimal
- Acesso restrito por **role-based access control** (`ADMIN`)

</td>
<td width="50%" valign="top">

### 👤 Perfis de usuário
- Edição de perfil (nome de exibição, bio, cor de tema)
- Upload e remoção de **avatar**
- Dados públicos separados dos dados sensíveis da conta

</td>
</tr>
</table>

### 🛡️ Segurança e confiabilidade

| | |
|---|---|
| 🧱 **Helmet** | Cabeçalhos HTTP seguros por padrão |
| 🚦 **Rate limiting** | Limites dedicados para rotas de autenticação e reset de senha |
| ✅ **Validação com Zod** | Todo payload de entrada é validado antes de chegar ao service |
| 📝 **Logging estruturado** | `pino` com logs HTTP e de aplicação, formatados com `pino-pretty` em dev |
| 🧩 **Tratamento de erros centralizado** | `AppError` + middleware único de erro para respostas consistentes |
| 🔌 **Graceful shutdown** | Encerramento limpo do servidor e da conexão com o Prisma em `SIGTERM`/`SIGINT` |

<br/>

## 🛠️ Tecnologias

<div align="center">

| Camada | Tecnologias |
|---|---|
| **Linguagem** | ![TypeScript](https://img.shields.io/badge/-TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white) |
| **Runtime & Framework** | ![Node.js](https://img.shields.io/badge/-Node.js-339933?style=flat-square&logo=node.js&logoColor=white) ![Express](https://img.shields.io/badge/-Express_5-000000?style=flat-square&logo=express&logoColor=white) |
| **Banco de dados** | ![PostgreSQL](https://img.shields.io/badge/-PostgreSQL-4169E1?style=flat-square&logo=postgresql&logoColor=white) ![Prisma](https://img.shields.io/badge/-Prisma_ORM-2D3748?style=flat-square&logo=prisma&logoColor=white) |
| **Autenticação** | JWT (`jsonwebtoken`) · `bcryptjs` · Google OAuth 2.0 |
| **Upload de mídia** | ![Cloudinary](https://img.shields.io/badge/-Cloudinary-3448C5?style=flat-square&logo=cloudinary&logoColor=white) + `multer` |
| **Validação** | ![Zod](https://img.shields.io/badge/-Zod-3E67B1?style=flat-square&logo=zod&logoColor=white) |
| **E-mail** | `nodemailer` (SMTP) |
| **Observabilidade** | `pino` + `pino-pretty` |
| **Testes** | ![Jest](https://img.shields.io/badge/-Jest-C21325?style=flat-square&logo=jest&logoColor=white) + `@swc/jest` |
| **Build & DX** | `tsx` · `tsup` · `prettier` |

</div>

<br/>

## 🏗️ Arquitetura

O backend segue uma arquitetura em **camadas por módulo de domínio** (`routes → controller → service → prisma`), o que mantém as regras de negócio isoladas da camada HTTP e facilita os testes unitários.

```mermaid
flowchart TD
    subgraph Client["🌐 Cliente"]
        FE["Frontend / App"]
    end

    subgraph API["🚀 UEMGuessr API — Express 5"]
        MW["Middlewares<br/>Helmet · CORS · Rate Limit · Auth · Validate"]

        subgraph Modules["Módulos de domínio"]
            Auth["auth<br/>login · registro · OAuth"]
            Users["users<br/>perfil · avatar"]
            Locations["locations<br/>CRUD (admin)"]
            Games["games<br/>partidas · rodadas · score"]
        end

        Lib["lib<br/>geo · jwt · hash · cloudinary"]
    end

    subgraph Infra["🗄️ Infraestrutura"]
        DB[("PostgreSQL<br/>via Prisma")]
        Cloud["Cloudinary<br/>(imagens)"]
        SMTP["SMTP<br/>(e-mails)"]
        Google["Google OAuth"]
    end

    FE -->|HTTPS / REST| MW
    MW --> Auth & Users & Locations & Games
    Auth --> Lib
    Games --> Lib
    Auth <--> Google
    Auth <--> SMTP
    Users --> Cloud
    Locations --> Cloud
    Auth --> DB
    Users --> DB
    Locations --> DB
    Games --> DB
```

### 📂 Estrutura de pastas

```
UEMGuessr/
├── prisma/
│   ├── schema.prisma        # Modelagem do banco de dados
│   └── migrations/          # Histórico de migrações
├── src/
│   ├── config/               # env, prisma client, cloudinary
│   ├── lib/                  # geo (Haversine/score), jwt, hash, Google OAuth
│   ├── middlewares/           # auth, validate, rate limit, upload, error handler
│   ├── modules/
│   │   ├── auth/              # registro, login, verificação, refresh, OAuth
│   │   ├── users/              # perfil e avatar
│   │   ├── locations/          # CRUD de locais (admin)
│   │   └── games/              # partidas, rodadas, pontuação
│   ├── routes/                # agregador central de rotas
│   ├── services/               # serviços transversais (e-mail)
│   ├── utils/                  # AppError, logger, gerador de código
│   └── server.ts               # bootstrap da aplicação Express
└── jest.config.mjs
```

<br/>

## 🗃️ Modelagem do banco de dados

<div align="center">

```mermaid
erDiagram
    User ||--o{ Game : "joga"
    User ||--o{ Location : "cadastra"
    User ||--o{ RefreshToken : "possui"
    User ||--o{ EmailVerificationCode : "possui"
    User ||--o{ PasswordResetCode : "possui"
    Game ||--o{ Round : "contém"
    Location ||--o{ Round : "é alvo de"

    User {
        string id PK
        string username
        string email
        string password
        enum role
        enum provider
        string displayName
        string bio
        boolean emailVerified
    }

    Location {
        string id PK
        string name
        string description
        decimal latitude
        decimal longitude
        string imageUrl
        string createdById FK
    }

    Game {
        string id PK
        string userId FK
        int score
        datetime startedAt
        datetime finishedAt
    }

    Round {
        string id PK
        string gameId FK
        string locationId FK
        int roundNumber
        decimal guessLatitude
        decimal guessLongitude
        decimal distanceMeters
        int score
    }
```

</div>

<br/>

## 🎯 Sistema de pontuação

A pontuação de cada rodada é calculada em duas etapas, implementadas em [`src/lib/geo.ts`](./src/lib/geo.ts):

**1. Distância real entre o chute e o local correto**, usando a **fórmula de Haversine** (considera a curvatura da Terra):

```
a = sin²(Δlat/2) + cos(lat1) · cos(lat2) · sin²(Δlon/2)
c = 2 · atan2(√a, √(1−a))
distância = raio_da_terra × c
```

**2. Conversão da distância em pontos**, com decaimento exponencial — quanto mais perto, mais pontos, e a curva penaliza rapidamente erros grandes:

```
score = 1000 × e^(−distância / 300)
```

| Distância do chute | Pontuação aproximada |
|---|---|
| 0 m (na mosca) | 1000 |
| 50 m | ~846 |
| 150 m | ~597 |
| 300 m | ~368 |
| 600 m | ~135 |
| 1000 m+ | ~36 |

Cada partida (`Game`) tem **5 rodadas** (`TOTAL_ROUNDS_PER_GAME`), e o score final é a soma das pontuações de cada rodada — com proteção via transação e *unique constraints* no banco para impedir envio duplicado de respostas.

<br/>

## 📡 Referência da API

> Todas as rotas (exceto `/health`, `/auth/*` e leitura pública) exigem o header `Authorization` via cookie de sessão, populado após o login.

<details>
<summary><b>🔐 <code>/auth</code> — Autenticação</b></summary>
<br/>

| Método | Rota | Descrição | Proteção |
|---|---|---|---|
| `POST` | `/auth/register` | Cria uma nova conta | Rate limit |
| `POST` | `/auth/verify-email` | Confirma o e-mail com o código recebido | Rate limit |
| `POST` | `/auth/resend-code` | Reenvia o código de verificação | Rate limit |
| `POST` | `/auth/login` | Autentica e retorna tokens | Rate limit |
| `POST` | `/auth/forgot-password` | Inicia o fluxo de recuperação de senha | Rate limit |
| `POST` | `/auth/reset-password` | Define uma nova senha com o código | Rate limit |
| `POST` | `/auth/refresh` | Gera um novo par de tokens | — |
| `POST` | `/auth/logout` | Revoga o refresh token atual | — |
| `GET` | `/auth/me` | Retorna o usuário autenticado | 🔒 JWT |
| `GET` | `/auth/google` | Inicia o login social com Google | — |
| `GET` | `/auth/google/callback` | Callback do OAuth do Google | — |

</details>

<details>
<summary><b>👤 <code>/users</code> — Perfil do jogador</b></summary>
<br/>

| Método | Rota | Descrição | Proteção |
|---|---|---|---|
| `GET` | `/users/profile` | Retorna o perfil do usuário logado | 🔒 JWT |
| `PATCH` | `/users/profile` | Atualiza nome, bio e cor do tema | 🔒 JWT |
| `PUT` | `/users/profile/avatar` | Envia/atualiza o avatar | 🔒 JWT |
| `DELETE` | `/users/profile/avatar` | Remove o avatar atual | 🔒 JWT |

</details>

<details>
<summary><b>🗺️ <code>/locations</code> — Locais do campus (admin)</b></summary>
<br/>

| Método | Rota | Descrição | Proteção |
|---|---|---|---|
| `GET` | `/locations` | Lista todos os locais cadastrados | 🔒 Admin |
| `GET` | `/locations/:id` | Detalha um local específico | 🔒 Admin |
| `POST` | `/locations` | Cadastra um novo local (com imagem) | 🔒 Admin |
| `PATCH` | `/locations/:id` | Atualiza um local existente | 🔒 Admin |
| `DELETE` | `/locations/:id` | Remove um local | 🔒 Admin |

</details>

<details>
<summary><b>🎮 <code>/games</code> — Partidas</b></summary>
<br/>

| Método | Rota | Descrição | Proteção |
|---|---|---|---|
| `POST` | `/games` | Cria uma nova partida | 🔒 JWT |
| `GET` | `/games` | Lista o histórico de partidas (paginado) | 🔒 JWT |
| `GET` | `/games/:id` | Detalha uma partida e suas rodadas | 🔒 JWT |
| `GET` | `/games/:id/next-round` | Sorteia o próximo local da partida | 🔒 JWT |
| `POST` | `/games/:id/rounds` | Envia um palpite (lat/lng) e recebe o score | 🔒 JWT |
| `POST` | `/games/:id/finish` | Encerra a partida manualmente | 🔒 JWT |

</details>

<details>
<summary><b>❤️ <code>/health</code> — Healthcheck</b></summary>
<br/>

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/health` | Retorna `{ status, timestamp }` para monitoramento |

</details>

<br/>

## 🚀 Como rodar o projeto

### Pré-requisitos

- **Node.js** ≥ 18
- **PostgreSQL** (local ou hospedado)
- Conta no **Cloudinary** (para upload de imagens)
- Credenciais **OAuth 2.0 do Google** (para login social)
- Um servidor **SMTP** (para envio de e-mails de verificação)

### 1. Clone o repositório

```bash
git clone https://github.com/HenriqueSagawa/UEMGuessr.git
cd UEMGuessr
```

### 2. Instale as dependências

```bash
npm install
```

### 3. Configure as variáveis de ambiente

Crie um arquivo `.env` na raiz do projeto com as chaves abaixo:

```env
# Servidor
NODE_ENV=development
PORT=3000
CORS_ORIGIN=http://localhost:5173
FRONTEND_URL=http://localhost:5173

# Banco de dados
DATABASE_URL=postgresql://usuario:senha@localhost:5432/uemguessr

# JWT (mínimo de 32 caracteres cada)
JWT_ACCESS_SECRET=troque_por_um_segredo_forte_de_32_chars
JWT_REFRESH_SECRET=troque_por_outro_segredo_forte_de_32_chars
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# Google OAuth
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:3000/auth/google/callback

# SMTP (envio de e-mails)
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM="UEMGuessr <no-reply@uemguessr.com>"

# Cloudinary
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
```

> [!IMPORTANT]
> Em produção, `CORS_ORIGIN` é **obrigatória** e não pode ser `*` — o app usa cookies com `credentials: true`, então o navegador exige uma origem explícita.

### 4. Rode as migrações do Prisma

```bash
npm run prisma:migrate
```

### 5. Suba o servidor em modo desenvolvimento

```bash
npm run dev
```

O servidor sobe por padrão em `http://localhost:3000`, com hot-reload via `tsx watch`.

### 📜 Scripts disponíveis

| Comando | Descrição |
|---|---|
| `npm run dev` | Sobe o servidor em modo desenvolvimento com hot-reload |
| `npm run build` | Gera o client do Prisma e compila o projeto com `tsup` |
| `npm start` | Roda a build de produção (`dist/server.js`) |
| `npm run prisma:generate` | Gera o Prisma Client |
| `npm run prisma:migrate` | Aplica migrações no banco de dados |
| `npm run prisma:studio` | Abre o Prisma Studio (GUI do banco) |
| `npm test` | Executa a suíte de testes com Jest |
| `npm run test:watch` | Executa os testes em modo watch |

<br/>

## 🧪 Testes

O projeto conta com testes automatizados (Jest + `@swc/jest`) cobrindo, entre outros pontos:

- 📐 Cálculo de distância (Haversine) e de pontuação
- 🔐 Middlewares de autenticação e autorização por role
- 🧩 Regras de negócio dos serviços de `auth`, `users`, `locations` e `games`
- 🛡️ Geração e verificação de tokens/hash

```bash
npm test
```

<br/>

## 🗺️ Roadmap

- [x] Autenticação local + Google OAuth
- [x] Verificação de e-mail e recuperação de senha
- [x] CRUD de locais com upload de imagem
- [x] Motor de partidas com pontuação geoespacial
- [x] Suíte de testes automatizados
- [ ] Modo multiplayer em tempo real (duelo 1x1)
- [ ] Sistema de ranking/Elo entre jogadores
- [ ] Desafio diário
- [ ] Frontend web definitivo (Next.js)
- [ ] Documentação interativa da API (Swagger/OpenAPI)

<br/>

## 🤝 Contribuindo

Contribuições são bem-vindas! Para propor uma mudança:

1. Faça um **fork** do projeto
2. Crie uma branch para a sua feature (`git checkout -b feature/minha-feature`)
3. Faça commit das suas alterações (`git commit -m 'feat: adiciona minha feature'`)
4. Envie para o seu fork (`git push origin feature/minha-feature`)
5. Abra um **Pull Request**

<br/>

## 👨‍💻 Autor

<div align="center">

**Henrique Sagawa**

Engenheiro de Software em formação · UEM

[![GitHub](https://img.shields.io/badge/GitHub-100000?style=for-the-badge&logo=github&logoColor=white)](https://github.com/HenriqueSagawa)

</div>

<br/>

## 📄 Licença

Este projeto ainda não possui uma licença definida.

<br/>

<div align="center">

⭐ Se esse projeto te ajudou ou te inspirou, considere deixar uma estrela!

</div>