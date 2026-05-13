# Início Rápido

[Acima](./index.md) | [Próximo →](./cli.md) | [Anterior ←](./design-philosophy.md)

---

## Requisitos

- **Node.js** >= 18.0.0
- **npm** >= 9.0.0
- **CMake** >= 3.16 (para compilação binária)
- **Compilador C** — gcc, clang, ou avr-gcc (para AVR)

## Instalação

```bash
npm install -g tsclang

tsclang --version
```

Executando sem instalação:

```bash
npx tsclang build
```

## Criando um Projeto

```bash
tsclang init myapp
cd myapp
```

Cria a estrutura:

```
myapp/
  tsc.package.json
  src/
    main.tsc
```

`tsc.package.json`:

```json
{
  "name": "myapp",
  "version": "1.0.0",
  "main": "src/main.tsc"
}
```

## Hello world

`src/main.tsc`:

```typescript
console.log("Hello world")
```

## Compilar e Executar

```bash
tsclang build                  # gerar C + compilar para binário
tsclang build --emit c         # geração de C apenas (sem compilação)
tsclang run                    # compilar e executar
```

Resultado do build:

```
dist/
  main.c              # código C gerado
  CMakeLists.txt      # para build manual
  myapp               # binário (se --emit binary)
```

## Build de Arquivo Único

Sem `tsc.package.json` — apenas passe o arquivo:

```bash
tsclang build hello.tsc
```

## O Que Vem Depois

- [Sintaxe](../02-syntax/index.md) — construtos da linguagem
- [Modelo de Memória](../05-memory/index.md) — propriedade, empréstimo, `Ref<T>`
- [CLI](./cli.md) — todos os comandos

## Veja também

- [CLI](./cli.md) — descrição completa dos comandos
- [Sistema de Build](../09-build/index.md) — configuração, plataformas, perfis
