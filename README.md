# Hackathon Video Management API

![Node.js](https://img.shields.io/badge/node.js-20%2B-339933?style=for-the-badge&logo=node.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/typescript-%23007ACC.svg?style=for-the-badge&logo=typescript&logoColor=white)
![NestJS](https://img.shields.io/badge/nestjs-%23E0234E.svg?style=for-the-badge&logo=nestjs&logoColor=white)
![Jest](https://img.shields.io/badge/-jest-%23C21325?style=for-the-badge&logo=jest&logoColor=white)
![Docker](https://img.shields.io/badge/docker-%230db7ed.svg?style=for-the-badge&logo=docker&logoColor=white)
![LocalStack](https://img.shields.io/badge/localstack-FFFFFF?style=for-the-badge&logo=localstack&logoColor=black)
![Amazon S3](https://img.shields.io/badge/Amazon%20S3-569A31?style=for-the-badge&logo=amazons3&logoColor=white)
![Amazon SNS](https://img.shields.io/badge/Amazon%20SNS-FF9900?style=for-the-badge&logo=amazonaws&logoColor=white)
![Amazon SQS](https://img.shields.io/badge/Amazon%20SQS-FF9900?style=for-the-badge&logo=amazonaws&logoColor=white)
![MongoDB](https://img.shields.io/badge/mongodb-4EA94B?style=for-the-badge&logo=mongodb&logoColor=white)

Projeto do Hackathon (Postech / FIAP) para **upload e gerenciamento de vídeos**.

A API recebe **1 ou mais vídeos**, faz **upload multipart no S3**, salva **metadados no MongoDB** com status `PENDING` e publica um evento no **SNS** para outro serviço processar.

Depois, um consumidor de **SQS** recebe o evento de status (`SUCCEEDED` / `ERROR`) e atualiza o registro. Quando o status estiver `SUCCEEDED`, a API gera uma **presigned URL** para baixar o ZIP processado (armazenado em um bucket de saída).

---

## Fluxos suportados

1) **Upload (1..N)**

- valida tipo/extensão/tamanho
- cria registro `PENDING`
- faz upload multipart no S3 (bucket de entrada)
- publica evento no SNS para processamento

1) **Listagem do usuário**

- lista metadados do usuário (por `userId`)

1) **Atualização de status (SQS)**

- consome mensagens com `{ videoId, status, errorMessage? }`

1) **Download do ZIP processado**

- apenas quando `status = SUCCEEDED`
- gera presigned URL do bucket de saída

---

## Estrutura (Hexagonal / Ports & Adapters)

Visão rápida das pastas principais:

```
.
├── docker/                  # scripts de entrypoint/wait
├── localstack/              # init scripts do LocalStack
├── mongo/                   # init do Mongo (collection + indexes)
├── k8s/                     # manifests/templates (opcional)
├── src/
│   ├── domain/              # entidades, enums, regras
│   ├── application/         # use cases + portas
│   ├── interfaces/          # contratos (datasource/token)
│   ├── adapters/            # controller (core) + presenters + gateway impl
│   └── infra/               # Nest modules, AWS adapters, Mongo adapter, HTTP
└── test/                    # testes de integração (*.int-spec.ts)
```

---

## Subir local com Docker + LocalStack

### 1) Criar o arquivo de ambiente

O `docker-compose.yml` espera um arquivo `.env.docker`.

```bash
cp .env.example .env.docker
```

### 2) Subir Mongo + LocalStack + API

```bash
docker compose up --build
```

### Serviços

- API: `http://localhost:3000`
- Swagger: `http://localhost:3000/docs`
- LocalStack: `http://localhost:4566`
- Mongo: `mongodb://localhost:27017`

---

## Variáveis de ambiente

O projeto usa `@nestjs/config` e valida variáveis essenciais na inicialização.

Arquivo recomendado: `.env.docker` (copiado de `.env.example`).

| Variável | Obrigatória | Exemplo | Observação |
|---|---|---|---|
| `PORT` | não | `3000` | porta da API |
| `MONGO_URI` | sim | `mongodb://mongo:27017` | para dev sem Docker: `mongodb://localhost:27017` |
| `MONGO_DB_COLLECTION` | sim | `videosdb` | apesar do nome, aqui é o **dbName** do Mongo |
| `AWS_REGION` | não | `us-east-1` | padrão `us-east-1` |
| `AWS_ENDPOINT_URL` | não | `http://localstack:4566` | para AWS real, deixe vazio |
| `S3_INPUT_BUCKET_NAME` | sim | `videos-input` | bucket de entrada |
| `S3_OUTPUT_BUCKET_NAME` | sim | `videos-processed` | bucket de saída |
| `SNS_PROCESSING_TOPIC_ARN` | sim | `arn:aws:sns:us-east-1:000000000000:video-processing-topic` | tópico de processamento |
| `SQS_STATUS_QUEUE_URL` | sim | `http://localstack:4566/000000000000/video-status-queue` | fila consumida pela API |
| `MAX_FILES_PER_REQUEST` | não | `3` | limite do upload multipart |
| `MAX_VIDEO_BYTES` | não | `2147483648` | default 2GB |

---

## API

### Headers (obrigatórios)

- `x-user-id`: identifica o usuário
- `x-user-email`: opcional (fica disponível no evento/publicação)

### Endpoints

- `POST /videos/upload` (multipart: `videos[]`)
- `GET /users/me/videos`
- `GET /videos/:videoId/processed-zip`

### Exemplos (cURL)

Upload de 1 vídeo:

```bash
curl -X POST "http://localhost:3000/videos/upload" \
  -H "x-user-id: user-123" \
  -H "x-user-email: user123@email.com" \
  -F "videos=@./sample.mp4"
```

Listar vídeos do usuário:

```bash
curl "http://localhost:3000/users/me/videos" \
  -H "x-user-id: user-123" \
  -H "x-user-email: user123@email.com"
```

Gerar presigned URL do ZIP (somente quando `SUCCEEDED`):

```bash
curl "http://localhost:3000/videos/<videoId>/processed-zip" \
  -H "x-user-id: user-123" \
  -H "x-user-email: user123@email.com"
```

---

## Contratos de evento

### SNS (publicado após upload)

O adapter publica no tópico configurado em `SNS_PROCESSING_TOPIC_ARN`.

- `Message`: JSON do evento
- `MessageAttributes.eventType`: `VideoUploaded` (string)

Exemplo de payload:

```json
{
  "videoId": "<uuid>",
  "user": { "id": "user-123", "email": "user123@email.com", "attributes": {} },
  "inputBucket": "videos-input",
  "inputKey": "user-123-<uuid>-source.mp4",
  "outputBucket": "videos-processed",
  "outputZipKey": "user-123-<uuid>-processed.zip",
  "contentType": "video/mp4",
  "size": 123456,
  "event": "VIDEO_PENDING",
  "originalFileName": "sample.mp4"
}
```

### SQS (consumido para atualizar status)

Fila configurada em `SQS_STATUS_QUEUE_URL`.

```json
{
  "videoId": "<uuid>",
  "status": "SUCCEEDED",
  "errorMessage": "(opcional)"
}
```

---

## Debug do LocalStack (opcional)

Listar recursos:

```bash
docker exec -it hackathon-video-management_localstack awslocal s3 ls
docker exec -it hackathon-video-management_localstack awslocal sns list-topics
docker exec -it hackathon-video-management_localstack awslocal sqs list-queues
docker exec -it hackathon-video-management_localstack awslocal sns list-subscriptions
```

Ler 1 mensagem da fila de status:

```bash
docker exec -it hackathon-video-management_localstack \
  awslocal sqs receive-message \
  --queue-url "http://localhost:4566/000000000000/video-status-queue" \
  --max-number-of-messages 1
```

---

## Testes

Unitários:

```bash
npm test
```

Integração:

```bash
npm run test:integration
```

---

## Qualidade

Lint:

```bash
npm run lint
```

Format:

```bash
npm run format
```

---

## 👨‍💻 Autores

- Douglas Vinicius Caldas Bonin (github.com/dviniciusbonin)
- Layssa Hillary (github.com/layssahillary)
- Thiago Savin (github.com/Thiagosavin)
- Shayna Bauer (github.com/Shaysilvares)
- Paulo Gomes (github.com/cavalcante001)
