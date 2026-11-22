// Overlap the end of the field recording with its beginning. The first second
// is the recorder fading in and is omitted from the repeating rain bed.
function joinRainLoop(context: AudioContext, recording: AudioBuffer) {
  const start = recording.sampleRate
  const overlap = Math.round(recording.sampleRate * 0.65)
  const length = recording.length - start - overlap
  const loop = context.createBuffer(recording.numberOfChannels, length, recording.sampleRate)
  for (let channel = 0; channel < recording.numberOfChannels; channel++) {
    const source = recording.getChannelData(channel)
    const samples = loop.getChannelData(channel)
    samples.set(source.subarray(start, start + length))
    for (let i = 0; i < overlap; i++) {
      const angle = i / overlap * Math.PI / 2
      samples[i] = source[start + length + i] * Math.cos(angle) + samples[i] * Math.sin(angle)
    }
  }
  return loop
}

export function createStormAudio(context: AudioContext, onError: () => void) {
  const load = new AbortController()
  const rain = context.createBufferSource()
  rain.loop = true
  const color = context.createBiquadFilter()
  color.type = 'lowpass'
  color.Q.value = 0.5
  const rainLevel = context.createGain()
  rainLevel.gain.value = 0
  rain.connect(color).connect(rainLevel).connect(context.destination)

  const thunderLevel = context.createGain()
  thunderLevel.connect(context.destination)
  let roll: AudioBuffer | undefined
  let strike: AudioBufferSourceNode | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  let rate = 0

  function schedule(delay: number) {
    if (!roll || rate < 55 || timer !== undefined || load.signal.aborted) return
    timer = setTimeout(() => {
      timer = undefined
      if (context.state === 'running' && !document.hidden) {
        const source = context.createBufferSource()
        source.buffer = roll!
        source.playbackRate.value = 0.96 + Math.random() * 0.08
        source.connect(thunderLevel)
        const now = context.currentTime
        thunderLevel.gain.cancelScheduledValues(now)
        thunderLevel.gain.setValueAtTime(0, now)
        thunderLevel.gain.linearRampToValueAtTime(0.95, now + 0.24)
        thunderLevel.gain.setTargetAtTime(0, now + 8, 0.5)
        source.onended = () => source.disconnect()
        source.start(now, 1.8, 11)
        strike = source
      }
      schedule(14500 + Math.random() * 8500 + Math.max(0, 150 - rate) * 50)
    }, delay)
  }

  async function recording(name: string) {
    const response = await fetch(`${import.meta.env.BASE_URL}audio/${name}.ogg`, { signal: load.signal })
    if (!response.ok) throw new Error('Storm recording unavailable')
    return context.decodeAudioData(await response.arrayBuffer())
  }
  void Promise.all([recording('rain'), recording('thunder')]).then(([bed, thunder]) => {
    if (load.signal.aborted) return
    rain.buffer = joinRainLoop(context, bed)
    rain.start()
    roll = thunder
    schedule(700)
  }).catch(() => { if (!load.signal.aborted) onError() })

  return {
    update(rainfall: number) {
      rate = rainfall
      const strength = Math.sqrt(Math.min(1, rate / 200))
      const now = context.currentTime
      rainLevel.gain.setTargetAtTime(strength * 0.85, now, 0.3)
      color.frequency.setTargetAtTime(1700 + strength * 9800, now, 0.35)
      if (rate >= 55) schedule(700)
      else {
        clearTimeout(timer)
        timer = undefined
        if (strike) {
          thunderLevel.gain.cancelScheduledValues(now)
          thunderLevel.gain.setTargetAtTime(0, now, 0.12)
          strike.stop(now + 0.6)
          strike = undefined
        }
      }
    },
    dispose() {
      load.abort()
      clearTimeout(timer)
      if (rain.buffer) rain.stop()
      strike?.stop()
      rain.disconnect()
      rainLevel.disconnect()
      thunderLevel.disconnect()
    },
  }
}
