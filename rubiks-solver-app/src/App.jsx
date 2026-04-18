import { useEffect, useMemo, useState } from 'react'
import './App.css'

const SOLVED = 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB'
const ORDER = ['U', 'R', 'F', 'D', 'L', 'B']
const FACE_NAMES = {
  U: 'Up',
  R: 'Right',
  F: 'Front',
  D: 'Down',
  L: 'Left',
  B: 'Back',
}

const NET_POSITION = {
  U: 'pos-u',
  L: 'pos-l',
  F: 'pos-f',
  R: 'pos-r',
  B: 'pos-b',
  D: 'pos-d',
}

let solverReady = false
let cubeLib = null

async function getCubeLib() {
  if (!cubeLib) {
    const module = await import('cubejs')
    cubeLib = module.default ?? module
  }
  return cubeLib
}

function ensureSolver(Cube) {
  if (!solverReady) {
    Cube.initSolver()
    solverReady = true
  }
}

function normalizeCubeState(value) {
  return value.toUpperCase().replace(/\s+/g, '')
}

function toEditableState(state) {
  const base = normalizeCubeState(state)
  const next = []
  for (let index = 0; index < 54; index += 1) {
    const char = base[index]
    next.push(ORDER.includes(char) ? char : SOLVED[index])
  }
  return next.join('')
}

function validateCubeState(state) {
  if (state.length !== 54) {
    return `State must contain exactly 54 characters. Found ${state.length}.`
  }

  if (/[^URFDLB]/.test(state)) {
    return 'Only these letters are allowed: U, R, F, D, L, B.'
  }

  for (const face of ORDER) {
    const count = state.split(face).length - 1
    if (count !== 9) {
      return `Face ${face} must appear exactly 9 times. Found ${count}.`
    }
  }

  return null
}

function App() {
  const [introExiting, setIntroExiting] = useState(false)
  const [introDone, setIntroDone] = useState(false)
  const [input, setInput] = useState(SOLVED)
  const [activeFace, setActiveFace] = useState('U')
  const [solution, setSolution] = useState('')
  const [status, setStatus] = useState('')
  const [isError, setIsError] = useState(false)

  useEffect(() => {
    const exitTimer = setTimeout(() => {
      setIntroExiting(true)
    }, 1700)

    const doneTimer = setTimeout(() => {
      setIntroDone(true)
    }, 2450)

    return () => {
      clearTimeout(exitTimer)
      clearTimeout(doneTimer)
    }
  }, [])

  const cubeState = useMemo(() => normalizeCubeState(input), [input])
  const editableState = useMemo(() => toEditableState(input), [input])
  const faces = useMemo(
    () =>
      ORDER.map((face, faceIndex) => ({
        face,
        stickers: editableState.slice(faceIndex * 9, faceIndex * 9 + 9).split(''),
      })),
    [editableState],
  )

  function handleStickerClick(stickerIndex) {
    const next = editableState.split('')
    next[stickerIndex] = activeFace
    setInput(next.join(''))
  }

  async function handleSolve() {
    const validationError = validateCubeState(cubeState)
    if (validationError) {
      setIsError(true)
      setStatus(validationError)
      setSolution('')
      return
    }

    try {
      setIsError(false)
      setStatus('Preparing solver...')

      const Cube = await getCubeLib()
      ensureSolver(Cube)

      const cube = Cube.fromString(cubeState)
      const nextSolution = cube.solve()
      const moveCount = nextSolution.trim() ? nextSolution.split(/\s+/).length : 0

      setSolution(nextSolution)
      setStatus(`Solved in ${moveCount} moves.`)
    } catch (error) {
      setIsError(true)
      setSolution('')
      setStatus(`This cube state is not solvable. ${error.message || ''}`.trim())
    }
  }

  function handleReset() {
    setInput(SOLVED)
    setSolution('')
    setStatus('')
    setIsError(false)
  }

  return (
    <>
      {!introDone ? (
        <section className={`arrival ${introExiting ? 'arrival-out' : 'arrival-in'}`}>
          <p className="arrival-label">Crafted with precision</p>
          <h2>Created by Rochishna</h2>
          <p className="arrival-sub">Loading your Rubik&apos;s Cube solver experience...</p>
        </section>
      ) : null}

      <main className={`page ${introDone ? 'page-visible' : 'page-hidden'}`}>
        <header className="hero">
          <p className="eyebrow">3x3 Rubik's Cube</p>
          <h1>Cube Solver</h1>
          <p className="lead">
            Paste your 54 facelets in this order:
            <span className="order"> U R F D L B </span>
            then generate the shortest-style solving sequence.
          </p>
        </header>

        <section className="panel">
          <div className="editor-header">
            <h2>Color-grid editor</h2>
            <p>Pick a color then click stickers to paint your cube.</p>
          </div>

          <div className="palette" role="group" aria-label="Choose sticker color">
            {ORDER.map((face) => (
              <button
                key={face}
                type="button"
                className={`chip chip-${face}${activeFace === face ? ' active' : ''}`}
                onClick={() => setActiveFace(face)}
              >
                <span className="chip-dot" />
                {face}
              </button>
            ))}
          </div>

          <div className="cube-net" aria-label="Unfolded cube net editor">
            {faces.map(({ face, stickers }, faceIndex) => (
              <article key={face} className={`face-card ${NET_POSITION[face]}`}>
                <p className="face-title">
                  {face} <span>{FACE_NAMES[face]}</span>
                </p>
                <div className="stickers" role="group" aria-label={`${FACE_NAMES[face]} face`}>
                  {stickers.map((sticker, stickerIndex) => (
                    <button
                      key={`${face}-${stickerIndex}`}
                      type="button"
                      aria-label={`Set ${FACE_NAMES[face]} sticker ${stickerIndex + 1}`}
                      className={`sticker sticker-${sticker}${stickerIndex === 4 ? ' center' : ''}`}
                      onClick={() => handleStickerClick(faceIndex * 9 + stickerIndex)}
                    >
                      {sticker}
                    </button>
                  ))}
                </div>
              </article>
            ))}
          </div>

          <label className="label" htmlFor="cube-state">
            Cube state (54 letters)
          </label>
          <textarea
            id="cube-state"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            spellCheck={false}
            className="state-input"
            placeholder={SOLVED}
          />

          <div className="actions">
            <button type="button" className="primary" onClick={handleSolve}>
              Solve cube
            </button>
            <button type="button" className="ghost" onClick={handleReset}>
              Reset
            </button>
          </div>

          {status ? (
            <p className={isError ? 'status error' : 'status success'}>{status}</p>
          ) : null}

          {solution ? (
            <div className="solution-box">
              <p className="solution-title">Solution</p>
              <code>{solution}</code>
            </div>
          ) : null}
        </section>

        <section className="notes">
          <h2>Input guide</h2>
          <p>Use only U, R, F, D, L, B and ensure each appears exactly 9 times.</p>
          <p>
            Solved example:
            <code>{SOLVED}</code>
          </p>
          <p className="small">
            Move notation: apostrophe means counterclockwise, 2 means double turn.
          </p>
        </section>
      </main>
    </>
  )
}

export default App
