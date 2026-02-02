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

Projeto desenvolvido referente ao Hackathon da quinta fase da Postech em Software Architecture - FIAP.

A API recebe **1 ou mais vídeos**, faz **upload multipart no S3**, salva **metadados no MongoDB** (simulando DocumentDB) com status `PENDING` e publica um evento no **SNS** para outro microserviço processar.  
Também lista vídeos do usuário, atualiza status via evento (fila SQS) e gera **URL assinada** para download do ZIP processado em **outro bucket**.

---

## Estrutura (Arquitetura Hexagonal / Ports & Adapters)

```
docker-compose.yml
docker-compose.debug.yml
Dockerfile

├── .env.docker
├── docker/
│ ├── entrypoint.sh
│ └── entrypoint.dev.sh
├── localstack/
│ ├── init-aws.sh
│ └── sns-debug.sh
└── src/
├── main.ts
├── app.module.ts
├── interfaces/
│ └── video-data-source.ts
├── infra/
│ ├── api/
│ │ ├── api.module.ts
│ │ ├── controllers/
│ │ │ └── videos.http.controller.ts
│ │ └── common/
│ │ └── logger/
│ │ └── app-logger.service.ts
│ ├── aws/
│ │ ├── aws.module.ts
│ │ ├── s3/
│ │ │ └── s3-storage.adapter.ts
│ │ ├── sns/
│ │ │ └── sns-video-processing.adapter.ts
│ │ └── sqs/
│ │ └── (status consumer / handler)
│ └── database/
│ ├── database.module.ts
│ └── mongoose/
│ ├── schemas/
│ │ └── video.schema.ts
│ └── repositories/
│ └── video-repository.adapter.ts
└── contexts/
└── video/
├── video.module.ts
├── domain/
│ ├── video-metadata.ts
│ └── entities/enums/
│ └── video-status.ts
├── application/
│ ├── errors/
│ │ └── app-error.ts
│ ├── gateways/
│ │ ├── video-gateway.ts
│ │ └── video-gateway.token.ts
│ └── usecases/
│ ├── upload-videos.ts
│ ├── list-user-videos.ts
│ ├── get-processed-video.ts
│ └── update-video-status.ts
└── adapters/
├── controllers/
│ └── video-controller.ts
├── gateway/
│ └── video-gateway-impl.ts
└── presenters/
├── upload-videos.presenter.ts
├── list-videos.presenter.ts
└── download-processed-zip.presenter.ts
```

---

## Features

### 1) Upload de 1 ou mais vídeos (multipart)

- Recebe upload via API (`multipart/form-data`) com **1..N arquivos**
- Validações básicas de vídeo (content-type / tamanho)
- Cria metadado no MongoDB com status `PENDING`
- Faz upload **multipart** para o bucket de **input**
- Publica evento no **SNS** (`video-processing-topic`) para outro MS processar
- Remove arquivo temporário sempre (sucesso ou erro)

### 2) Listar vídeos do usuário

- Retorna metadados por `email`, ordenados por criação

### 3) Atualizar status via evento (SQS)

- Consome evento de status em uma fila SQS (ex.: `video-status-queue`)
- Atualiza metadado para `SUCCEEDED` ou `ERROR` (`errorMessage` opcional)

### 4) Download do ZIP processado (outro bucket)

- Gera **presigned URL** para download do ZIP no bucket de **output**
- Padrão de key do zip: `<email>-<videoId>-processed.zip`
- Valida ownership (email)

---

## Pré-requisitos (Local)

- **Docker**
- **Docker Compose**

---

## Rodar localmente com Docker + LocalStack

### 1) Subir tudo (Mongo + LocalStack + API)

```bash
docker compose up --build
```

## Serviços

- API: <http://localhost:3000>
- Swagger: <http://localhost:3000/docs>
- LocalStack: <http://localhost:4566>
- Mongo: mongodb://localhost:27017

## Como verificar se o evento foi publicado no SNS (LocalStack)

1. Ver recursos criados

```bash
docker exec -it hackaton-video-management_localstack awslocal s3 ls
docker exec -it hackaton-video-management_localstack awslocal sns list-topics
docker exec -it hackaton-video-management_localstack awslocal sqs list-queues
docker exec -it hackaton-video-management_localstack awslocal sns list-subscriptions
```

1. Publicar manualmente um teste e consumir na debug queue

```bash
TOPIC_ARN=$(docker exec -it hackaton-video-management_localstack \
  awslocal sns list-topics --query 'Topics[0].TopicArn' --output text)

docker exec -it hackaton-video-management_localstack \
  awslocal sns publish --topic-arn "$TOPIC_ARN" --message '{"ping":"pong"}'

DEBUG_URL=$(docker exec -it hackaton-video-management_localstack \
  awslocal sqs get-queue-url --queue-name video-processing-debug-queue --query 'QueueUrl' --output text)

docker exec -it hackaton-video-management_localstack \
  awslocal sqs receive-message --queue-url "$DEBUG_URL" --max-number-of-messages 1
```

**Se aparecer mensagem, o tópico e a assinatura estão funcionando.**

## Variáveis de ambiente (.env.docker)

```text

Exemplo (ajuste conforme seus nomes reais):

AWS_REGION=us-east-1
AWS_ENDPOINT_URL=http://localstack:4566

AWS_ACCESS_KEY_ID=test
AWS_SECRET_ACCESS_KEY=test

S3_INPUT_BUCKET_NAME=videos-input
S3_OUTPUT_BUCKET_NAME=videos-processed

SNS_PROCESSING_TOPIC_ARN=arn:aws:sns:us-east-1:000000000000:video-processing-topic

# fila que sua aplicação consome para status (não é a debug)
SQS_STATUS_QUEUE_URL=http://localstack:4566/000000000000/video-status-queue

MONGO_URI=mongodb://mongo:27017
MONGO_DB=hackaton
```

## Rotas principais (API)

O path exato depende do seu videos.http.controller.ts. Exemplo típico:

> POST /videos/upload (multipart: 1..N arquivos)

> GET /videos (lista vídeos do usuário autenticado)

> GET /videos/:videoId/processed-zip (gera presign do ZIP no bucket de output)

## Eventos

> Consumer SQS para status (fila video-status-queue) → atualiza metadados

## Swagger

> GET /docs

## Testes Unitários

```bash
cd app
npm test
```

## Integração (Mongo in-memory + mocks de AWS)

```bash
cd app
npm run test:int
```

## Autores

- Douglas Vinicius Caldas Bonin (<https://github.com/dviniciusbonin>)
- Layssa Hillary (<https://github.com/layssahillary>)
- Thiago Savin (<https://github.com/Thiagosavin>)
- Shayna Bauer (<https://github.com/Shaysilvares>)
- Paulo Gomes (<https://github.com/cavalcante001>)
