# Установка

## Требования

- Node.js `>=18.0.0`
- npm `>=9.0.0`
- CMake `>=3.16` (для сборки бинарника / hex)
- Компилятор C: gcc, clang, или avr-gcc (для embedded таргетов)

### Windows

- MinGW (gcc): [MSYS2](https://www.msys2.org/) — `C:/msys64/mingw64/bin` должен быть в PATH
- Или Visual Studio 2022 с компонентом "Desktop development with C++"

### Embedded таргеты

- AVR: `avr-gcc` (Arduino IDE или отдельно)
- ARM: `arm-none-eabi-gcc`
- NES: `cc65`
- Spectrum: `sjasmplus`
- Genesis: `m68k-elf-gcc`

## Установка из репозитория

```bash
git clone <repo-url> tsclang
cd tsclang
npm install
npx tsx src/index.ts --version
```

## Установка через npm (roadmap)

```bash
npm install -g tsclang
```

## Проверка установки

```bash
tsclang --version
```

Из dist:

```bash
npm run build
node dist/index.js --version
```

Из исходников:

```bash
npx tsx src/index.ts --version
```
