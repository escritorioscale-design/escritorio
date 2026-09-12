# WorkAdventure econômico no Render

Este projeto executa o frontend/pusher, back, map-storage, uploader, iconserver e Nginx em um único Web Service. O Redis e o LiveKit continuam externos e são reutilizados por URL, sem banco ou cadastro adicional.

## Recursos

- Render `standard`: 1 CPU e 2 GB de RAM.
- Disco persistente de 1 GB montado em `/data/maps`.
- Custo base estimado: US$ 25,25/mês, antes de excedentes e impostos.
- Mapa inicial: `/maps/scale-office/office.tmj`.

## Primeiro deploy

1. Crie um Blueprint usando o `render.yaml` deste repositório.
2. Informe os quatro segredos já existentes: `REDIS_URL`, `LIVEKIT_URL`, `LIVEKIT_API_KEY` e `LIVEKIT_API_SECRET`.
3. Confirme a criação do serviço e do disco.

O domínio público é detectado automaticamente pelas variáveis nativas do Render. `SECRET_KEY`, rotas internas e URL inicial do mapa são configurados sem intervenção manual.

O chat persistente fica desligado nesta configuração econômica porque ele requer Matrix/Synapse. Voz e vídeo por proximidade continuam ativos via LiveKit. Todo o código do chat permanece no repositório e pode ser habilitado quando houver infraestrutura Matrix.

## Limite desta opção

Todos os processos compartilham uma instância. Ela é econômica e adequada para o início, mas uma reinicialização afeta todos os módulos e o escalonamento é conjunto. Quando o uso justificar, os mesmos serviços podem voltar a ser separados sem trocar o código.

## Origem do código

- WorkAdventure completo: [`workadventure/workadventure`](https://github.com/workadventure/workadventure), commit `61123956756cf935a9dbe2e4706f9d94f6086e00`.
- Mapa oficial avançado: [`workadventure/map-starter-kit`](https://github.com/workadventure/map-starter-kit), commit `7fa5e41701761085fac1e1113d73557d833af5b8`.

As licenças e os avisos de atribuição originais foram preservados no repositório e dentro de `maps/scale-office`.
