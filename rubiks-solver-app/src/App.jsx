import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'

const SOLVED = 'WWWWWWWWWRRRRRRRRRGGGGGGGGGYYYYYYYYYOOOOOOOOOBBBBBBBBB'
const ORDER = ['U', 'R', 'F', 'D', 'L', 'B']
const COLOR_ORDER = ['W', 'R', 'G', 'Y', 'O', 'B']
const FACE_NAMES = {
  U: 'Up',
  R: 'Right',
  F: 'Front',
  D: 'Down',
  L: 'Left',
  B: 'Back',
}

const FACE_TO_COLOR = {
  U: 'W',
  R: 'R',
  F: 'G',
  D: 'Y',
  L: 'O',
  B: 'B',
}

const COLOR_TO_FACE = Object.fromEntries(
  Object.entries(FACE_TO_COLOR).map(([face, color]) => [color, face]),
)

const FACE_OFFSETS = ORDER.reduce((offsets, face, index) => {
  offsets[face] = index * 9
  return offsets
}, {})

const FACE_ROTATIONS = {
  F: { x: -20, y: 25 },
  R: { x: -20, y: -65 },
  B: { x: -20, y: 115 },
  L: { x: -20, y: 65 },
  U: { x: -65, y: 25 },
  D: { x: 60, y: 25 },
}

let solverReady = false
let cubeLib = null
let solverInitPromise = null

async function getCubeLib() {
  if (!cubeLib) {
    const module = await import('cubejs')
    cubeLib = module.default ?? module
  }
  return cubeLib
}

async function ensureSolver(Cube) {
  if (solverReady) {
    return
  }

  if (!solverInitPromise) {
    const initResult = Cube.initSolver()
    solverInitPromise =
      initResult && typeof initResult.then === 'function' ? initResult : Promise.resolve(initResult)
  }

  await solverInitPromise
  solverReady = true
}

function normalizeCubeState(value) {
  return value.toUpperCase().replace(/\s+/g, '')
}

function toEditableState(state) {
  const base = normalizeCubeState(state)
  const next = []
  for (let index = 0; index < 54; index += 1) {
    const char = base[index]
    next.push(COLOR_ORDER.includes(char) ? char : SOLVED[index])
  }
  return next.join('')
}

function validateCubeState(state) {
  if (state.length !== 54) {
    return `State must contain exactly 54 characters. Found ${state.length}.`
  }

  if (/[^WRGYOB]/.test(state)) {
    return 'Only color letters are allowed: W, R, G, Y, O, B.'
  }

  for (const color of COLOR_ORDER) {
    const count = state.split(color).length - 1
    if (count !== 9) {
      return `Color ${color} must appear exactly 9 times. Found ${count}.`
    }
  }

  return null
}

function deriveColorToFaceMap(colorState) {
  const mapping = {}

  for (const face of ORDER) {
    const centerColor = colorState[FACE_OFFSETS[face] + 4]
    if (!COLOR_ORDER.includes(centerColor)) {
      return { error: `Invalid center color on ${FACE_NAMES[face]} face.` }
    }

    if (mapping[centerColor]) {
      return { error: `Center colors must be unique. Color ${centerColor} appears on multiple centers.` }
    }

    mapping[centerColor] = face
  }

  return { mapping }
}

function invertMap(mapping) {
  return Object.fromEntries(Object.entries(mapping).map(([color, face]) => [face, color]))
}

function toSolverState(colorState, colorToFaceMap) {
  return colorState
    .split('')
    .map((color) => colorToFaceMap[color] ?? color)
    .join('')
}

function fromSolverState(solverState, faceToColorMap) {
  return solverState
    .split('')
    .map((face) => faceToColorMap[face] ?? face)
    .join('')
}

function describeMove(move) {
  const face = move[0]
  const turn = move.slice(1)

  if (!FACE_NAMES[face]) {
    return `Apply ${move}.`
  }

  if (turn === "'") {
    return `Turn ${FACE_NAMES[face]} face counterclockwise by 90 degrees.`
  }

  if (turn === '2') {
    return `Turn ${FACE_NAMES[face]} face by 180 degrees.`
  }

  return `Turn ${FACE_NAMES[face]} face clockwise by 90 degrees.`
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

function App() {
  const [introExiting, setIntroExiting] = useState(false)
  const [introDone, setIntroDone] = useState(false)
  const [input, setInput] = useState(SOLVED)
  const [activeFace, setActiveFace] = useState('W')
  const [focusFace, setFocusFace] = useState('F')
  const [cubeRotation, setCubeRotation] = useState(FACE_ROTATIONS.F)
  const [isDraggingCube, setIsDraggingCube] = useState(false)
  const [solution, setSolution] = useState('')
  const [solutionMoves, setSolutionMoves] = useState([])
  const [replayStates, setReplayStates] = useState([])
  const [currentStep, setCurrentStep] = useState(0)
  const [isAutoPlaying, setIsAutoPlaying] = useState(false)
  const [status, setStatus] = useState('')
  const [isError, setIsError] = useState(false)
  const dragStateRef = useRef(null)
  const cubeRef = useRef(null)
  const frameRef = useRef(null)
  const pendingRotationRef = useRef(FACE_ROTATIONS.F)
  const rotationRef = useRef(FACE_ROTATIONS.F)

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

  useEffect(() => {
    if (!cubeRef.current) {
      return
    }

    cubeRef.current.style.setProperty('--cube-rot-x', `${cubeRotation.x}deg`)
    cubeRef.current.style.setProperty('--cube-rot-y', `${cubeRotation.y}deg`)
    rotationRef.current = cubeRotation
  }, [cubeRotation])

  useEffect(
    () => () => {
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current)
      }
    },
    [],
  )

  useEffect(() => {
    if (!isAutoPlaying || replayStates.length < 2) {
      return undefined
    }

    if (currentStep >= replayStates.length - 1) {
      setIsAutoPlaying(false)
      return undefined
    }

    const timer = setTimeout(() => {
      const nextStep = currentStep + 1
      setCurrentStep(nextStep)
      setInput(replayStates[nextStep])
    }, 650)

    return () => clearTimeout(timer)
  }, [isAutoPlaying, currentStep, replayStates])

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

  const faceStickerMap = useMemo(
    () =>
      faces.reduce((result, current) => {
        result[current.face] = current.stickers
        return result
      }, {}),
    [faces],
  )

  function handleStickerClick(stickerIndex) {
    const next = editableState.split('')
    next[stickerIndex] = activeFace
    setIsAutoPlaying(false)
    setSolution('')
    setSolutionMoves([])
    setReplayStates([])
    setCurrentStep(0)
    setStatus('')
    setIsError(false)
    setInput(next.join(''))
  }

  function handleFaceStickerClick(face, stickerIndex) {
    handleStickerClick(FACE_OFFSETS[face] + stickerIndex)
  }

  function handleFocusFace(face) {
    setFocusFace(face)
    setCubeRotation(FACE_ROTATIONS[face])
  }

  function flushRotationFrame() {
    if (!cubeRef.current) {
      frameRef.current = null
      return
    }

    cubeRef.current.style.setProperty('--cube-rot-x', `${pendingRotationRef.current.x}deg`)
    cubeRef.current.style.setProperty('--cube-rot-y', `${pendingRotationRef.current.y}deg`)
    rotationRef.current = pendingRotationRef.current
    frameRef.current = null
  }

  function handleCubePointerDown(event) {
    if (event.target.closest('.cube-sticker')) {
      return
    }

    if (event.pointerType === 'mouse' && event.button !== 0) {
      return
    }

    event.currentTarget.setPointerCapture(event.pointerId)
    dragStateRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      originX: rotationRef.current.x,
      originY: rotationRef.current.y,
    }
    setFocusFace('')
    setIsDraggingCube(true)
  }

  function handleCubePointerMove(event) {
    if (!dragStateRef.current) {
      return
    }

    const dx = event.clientX - dragStateRef.current.startX
    const dy = event.clientY - dragStateRef.current.startY

    pendingRotationRef.current = {
      x: clamp(dragStateRef.current.originX - dy * 0.35, -78, 78),
      y: dragStateRef.current.originY + dx * 0.35,
    }

    if (!frameRef.current) {
      frameRef.current = requestAnimationFrame(flushRotationFrame)
    }
  }

  function handleCubePointerUp(event) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }

    if (frameRef.current) {
      cancelAnimationFrame(frameRef.current)
      frameRef.current = null
      flushRotationFrame()
    }

    setCubeRotation(rotationRef.current)
    dragStateRef.current = null
    setIsDraggingCube(false)
  }

  async function handleSolve() {
    const validationError = validateCubeState(cubeState)
    if (validationError) {
      setIsError(true)
      setStatus(validationError)
      setSolution('')
      setSolutionMoves([])
      setReplayStates([])
      setCurrentStep(0)
      setIsAutoPlaying(false)
      return
    }

    try {
      setIsError(false)
      setStatus('Preparing solver...')

      const mappingResult = deriveColorToFaceMap(cubeState)
      if (mappingResult.error) {
        setIsError(true)
        setStatus(mappingResult.error)
        setSolution('')
        setSolutionMoves([])
        setReplayStates([])
        setCurrentStep(0)
        setIsAutoPlaying(false)
        return
      }

      const colorToFaceMap = mappingResult.mapping
      const faceToColorMap = invertMap(colorToFaceMap)

      const Cube = await getCubeLib()
      if (!Cube || typeof Cube.fromString !== 'function') {
        throw new Error('Solver failed to initialize.')
      }
      await ensureSolver(Cube)

      const cube = Cube.fromString(toSolverState(cubeState, colorToFaceMap))
      const nextSolution = cube.solve()
      const moves = nextSolution.trim() ? nextSolution.split(/\s+/) : []
      const replayCube = Cube.fromString(toSolverState(cubeState, colorToFaceMap))
      const nextReplayStates = [cubeState]

      for (const move of moves) {
        replayCube.move(move)
        nextReplayStates.push(fromSolverState(replayCube.asString(), faceToColorMap))
      }

      const moveCount = moves.length

      setSolution(nextSolution)
      setSolutionMoves(moves)
      setReplayStates(nextReplayStates)
      setCurrentStep(0)
      setInput(nextReplayStates[0])
      setIsAutoPlaying(false)
      setStatus(`Solved in ${moveCount} moves.`)
    } catch (error) {
      setIsError(true)
      setSolution('')
      setSolutionMoves([])
      setReplayStates([])
      setCurrentStep(0)
      setIsAutoPlaying(false)
      const errorMessage = String(error?.message || '').trim()

      if (errorMessage.includes("reading 'Cube'") || errorMessage.includes('Solver failed to initialize')) {
        setStatus('This cube state appears invalid or unsolvable. Recheck all stickers and try again.')
      } else {
        setStatus(`This cube state is not solvable. ${errorMessage}`.trim())
      }
    }
  }

  function jumpToStep(step) {
    if (!replayStates.length) {
      return
    }

    const boundedStep = clamp(step, 0, replayStates.length - 1)
    setCurrentStep(boundedStep)
    setInput(replayStates[boundedStep])
  }

  function handleReset() {
    setInput(SOLVED)
    setSolution('')
    setSolutionMoves([])
    setReplayStates([])
    setCurrentStep(0)
    setIsAutoPlaying(false)
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
        <div className="main-column">
          <header className="hero">
            <div className="hero-glassbar" aria-label="Main navigation">
              <p className="hero-brand">AURACUBE.</p>
              <nav className="hero-nav" aria-label="Sections">
                <span>Solver</span>
                <span>Algorithms</span>
                <span>Speedcubing</span>
                <span>Support</span>
              </nav>
              <div className="hero-icons" aria-hidden="true">
                <span>◉</span>
                <span>◎</span>
              </div>
            </div>

            <div className="hero-content">
              <p className="eyebrow">Engineering precision for the cube world</p>
              <h1>Luxury Grade Rubik&apos;s Cube Solver</h1>
              <p className="lead">
                Insert your 54 stickers side by side using color letters:
                <span className="order"> W R G Y O B </span>
                and generate a clean, shortest-style solving sequence with high-performance interaction.
              </p>
              <p className="hero-kicker">Performance beyond trial-and-error.</p>
              <div className="hero-actions">
                <button type="button" className="primary" onClick={handleSolve}>
                  Solve Now
                </button>
                <button type="button" className="hero-outline" onClick={handleReset}>
                  Reset Cube
                </button>
              </div>
            </div>
          </header>

          <section className="panel">
            <div className="editor-header">
              <h2>Color-grid editor</h2>
              <p>Pick a color then click stickers to paint your cube.</p>
            </div>

            <div className="palette" role="group" aria-label="Choose sticker color">
              {COLOR_ORDER.map((face) => (
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

            <div className="cube3d-wrap">
              <div className="cube3d-header">
                <h3>3D cube painter</h3>
                <p>Drag to rotate, paint stickers with W/R/G/Y/O/B, then run step-by-step solve playback.</p>
              </div>

              <div className="focus-row" role="group" aria-label="Focus 3D cube face">
                {ORDER.map((face) => (
                  <button
                    key={`focus-${face}`}
                    type="button"
                    className={`focus-chip${focusFace === face ? ' active' : ''}`}
                    onClick={() => handleFocusFace(face)}
                  >
                    {face}
                  </button>
                ))}
              </div>

              <div
                className={`cube-scene${isDraggingCube ? ' dragging' : ''}`}
                onPointerDown={handleCubePointerDown}
                onPointerMove={handleCubePointerMove}
                onPointerUp={handleCubePointerUp}
                onPointerCancel={handleCubePointerUp}
                aria-label="3D cube editor"
              >
                <div
                  ref={cubeRef}
                  className="cube3d"
                >
                  {ORDER.map((face) => (
                    <section
                      key={`cube-face-${face}`}
                      className={`cube-face cube-face-${face}${focusFace === face ? ' is-focus' : ''}`}
                      aria-label={`${FACE_NAMES[face]} face in 3D editor`}
                    >
                      {faceStickerMap[face].map((sticker, stickerIndex) => (
                        <button
                          key={`cube-${face}-${stickerIndex}`}
                          type="button"
                          aria-label={`Set ${FACE_NAMES[face]} sticker ${stickerIndex + 1}`}
                          className={`cube-sticker sticker-${sticker}${stickerIndex === 4 ? ' center' : ''}`}
                          onClick={() => handleFaceStickerClick(face, stickerIndex)}
                        >
                          {sticker}
                        </button>
                      ))}
                    </section>
                  ))}
                </div>
              </div>
            </div>

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

            {solutionMoves.length ? (
              <div className="solution-box">
                <div className="stepper-head">
                  <p className="solution-title">Step-by-step 3D solution</p>
                  <p className="step-meta">
                    Step {currentStep} of {solutionMoves.length}
                  </p>
                </div>

                <p className="step-detail">
                  {currentStep === 0
                    ? 'Initial cube state. Start playback to watch every step in 3D.'
                    : `${solutionMoves[currentStep - 1]}: ${describeMove(solutionMoves[currentStep - 1])}`}
                </p>

                <div className="step-actions">
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => jumpToStep(currentStep - 1)}
                    disabled={currentStep === 0}
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    className="primary"
                    onClick={() => setIsAutoPlaying((value) => !value)}
                    disabled={currentStep >= solutionMoves.length}
                  >
                    {isAutoPlaying ? 'Pause playback' : 'Play steps'}
                  </button>
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => jumpToStep(currentStep + 1)}
                    disabled={currentStep >= solutionMoves.length}
                  >
                    Next
                  </button>
                </div>

                <ol className="step-list" aria-label="Detailed solve steps">
                  {solutionMoves.map((move, index) => (
                    <li key={`${move}-${index}`}>
                      <button
                        type="button"
                        className={`step-item${currentStep === index + 1 ? ' active' : ''}`}
                        onClick={() => jumpToStep(index + 1)}
                      >
                        {index + 1}. {move} - {describeMove(move)}
                      </button>
                    </li>
                  ))}
                </ol>

                <code>{solution}</code>
              </div>
            ) : null}
          </section>

          <section className="notes">
            <h2>Input guide</h2>
            <p>Use only W, R, G, Y, O, B and paint stickers directly on the 3D cube.</p>
            <p>
              Solved example:
              <code>{SOLVED}</code>
            </p>
            <p className="small">
              Playback controls show each move in order and update the 3D model until solved.
            </p>
          </section>
        </div>
      </main>
    </>
  )
}

export default App
