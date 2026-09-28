// services/audio.ts — Microphone capture + PCM processing
// Sends 16-bit LE, 16kHz mono PCM to the voice WebSocket

export interface AudioCaptureOptions {
  onPCMChunk: (buffer: ArrayBuffer) => void
  onError: (err: Error) => void
  onVolumeLevel?: (level: number) => void // 0..1
}

export class AudioCaptureService {
  private stream: MediaStream | null = null
  private ctx: AudioContext | null = null
  private sourceNode: MediaStreamAudioSourceNode | null = null
  private processorNode: ScriptProcessorNode | null = null
  private analyzerNode: AnalyserNode | null = null
  private volumeTimer: ReturnType<typeof setInterval> | null = null
  private running = false

  async start(opts: AudioCaptureOptions): Promise<void> {
    if (this.running) return

    // Request microphone
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        sampleRate: 16000,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    })

    this.ctx = new AudioContext({ sampleRate: 16000 })
    this.sourceNode = this.ctx.createMediaStreamSource(this.stream)

    // Analyser for volume level
    this.analyzerNode = this.ctx.createAnalyser()
    this.analyzerNode.fftSize = 256
    this.sourceNode.connect(this.analyzerNode)

    // ScriptProcessor for PCM extraction
    // 4096 samples at 16kHz = 256ms per chunk
    this.processorNode = this.ctx.createScriptProcessor(4096, 1, 1)
    this.processorNode.onaudioprocess = (e) => {
      if (!this.running) return
      const float32 = e.inputBuffer.getChannelData(0)
      const pcm = float32ToPCM16(float32)
      opts.onPCMChunk(pcm.buffer as ArrayBuffer)
    }

    this.analyzerNode.connect(this.processorNode)
    this.processorNode.connect(this.ctx.destination)
    this.running = true

    // Volume monitoring
    if (opts.onVolumeLevel) {
      const data = new Uint8Array(this.analyzerNode.frequencyBinCount)
      this.volumeTimer = setInterval(() => {
        if (!this.analyzerNode) return
        this.analyzerNode.getByteFrequencyData(data)
        const avg = data.reduce((a, b) => a + b, 0) / data.length
        opts.onVolumeLevel!(avg / 255)
      }, 50)
    }
  }

  stop() {
    this.running = false
    if (this.volumeTimer) { clearInterval(this.volumeTimer); this.volumeTimer = null }
    this.processorNode?.disconnect()
    this.analyzerNode?.disconnect()
    this.sourceNode?.disconnect()
    this.stream?.getTracks().forEach(t => t.stop())
    this.ctx?.close().catch(() => {})
    this.processorNode = null
    this.analyzerNode = null
    this.sourceNode = null
    this.stream = null
    this.ctx = null
  }

  isRunning() { return this.running }
}

function float32ToPCM16(float32: Float32Array): Int16Array {
  const pcm = new Int16Array(float32.length)
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]))
    pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff
  }
  return pcm
}

export async function checkMicrophonePermission(): Promise<PermissionState> {
  try {
    const result = await navigator.permissions.query({ name: 'microphone' as PermissionName })
    return result.state
  } catch {
    return 'prompt'
  }
}
