# Rubik's Cube Solver App

A React app that solves a 3x3 Rubik's Cube using the `cubejs` two-phase solver.

## Run locally

1. Open a terminal in this folder.
2. Install packages:

```bash
npm install
```

3. Start development server:

```bash
npm run dev
```

4. Open the local URL shown by Vite.

## Build production files

```bash
npm run build
```

## Cube input format

Enter exactly 54 letters in this order:

`U(9) + R(9) + F(9) + D(9) + L(9) + B(9)`

Allowed letters: `U R F D L B`

Solved cube example:

`UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB`
