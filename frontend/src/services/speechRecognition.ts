// services/speechRecognition.ts — Web Speech API wrapper
// Uses browser built-in STT (Chrome/Edge) — English only

/* eslint-disable @typescript-eslint/no-explicit-any */

export type SpeechStatus = 'IDLE' | 'LISTENING' | 'PROCESSING' | 'ERROR' | 'UNSUPPORTED'

type TranscriptHandler = (text: string, isFinal: boolean) => void
type StatusHandler = (status: SpeechStatus) => void
type VolumeHandler = (level: number) => void

export class SpeechRecognitionService {
  private recognition: any = null
  private status: SpeechStatus = 'IDLE'
  private running = false

  private transcriptHandlers = new Set<TranscriptHandler>()
  private statusHandlers = new Set<StatusHandler>()
  private volumeHandlers = new Set<VolumeHandler>()

  // Mic level via AudioContext
  private audioCtx: AudioContext | null = null
  private analyser: AnalyserNode | null = null
  private stream: MediaStream | null = null
  private volumeTimer: ReturnType<typeof setInterval> | null = null

  isSupported(): boolean {
    return !!(
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition
    )
  }

  async start(): Promise<void> {
    if (!this.isSupported()) {
      this._setStatus('UNSUPPORTED')
      throw new Error('Speech recognition not supported. Please use Chrome or Edge.')
    }

    const SR: any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    this.recognition = new SR()
    this.recognition.continuous = true
    this.recognition.interimResults = true
    this.recognition.lang = 'en-US'  // English only
    this.recognition.maxAlternatives = 1

    this.recognition.onstart = () => {
      this.running = true
      this._setStatus('LISTENING')
    }

    this.recognition.onresult = (event: any) => {
      const result = event.results[event.results.length - 1]
      const text = result[0].transcript.trim()
      const isFinal: boolean = result.isFinal
      if (text) {
        this.transcriptHandlers.forEach(h => h(text, isFinal))
      }
    }

    this.recognition.onerror = (event: any) => {
      if (event.error === 'no-speech' || event.error === 'aborted') return
      this._setStatus('ERROR')
    }

    this.recognition.onend = () => {
      // Auto-restart if still running (continuous mode)
      if (this.running) {
        try { this.recognition?.start() } catch {}
      }
    }

    this.recognition.start()

    // Volume monitoring via AudioContext
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      this.audioCtx = new AudioContext()
      this.analyser = this.audioCtx.createAnalyser()
      this.analyser.fftSize = 256
      const source = this.audioCtx.createMediaStreamSource(this.stream)
      source.connect(this.analyser)
      const data = new Uint8Array(this.analyser.frequencyBinCount)
      this.volumeTimer = setInterval(() => {
        if (!this.analyser) return
        this.analyser.getByteFrequencyData(data)
        const avg = data.reduce((a, b) => a + b, 0) / data.length
        this.volumeHandlers.forEach(h => h(avg / 255))
      }, 50)
    } catch {
      // Volume monitoring optional
    }
  }

  stop() {
    this.running = false
    this._setStatus('IDLE')
    try { this.recognition?.stop() } catch {}
    this.recognition = null

    if (this.volumeTimer) { clearInterval(this.volumeTimer); this.volumeTimer = null }
    this.stream?.getTracks().forEach(t => t.stop())
    this.audioCtx?.close().catch(() => {})
    this.stream = null
    this.audioCtx = null
    this.analyser = null
  }

  speak(text: string, lang?: string): void {
    if (!('speechSynthesis' in window)) return
    window.speechSynthesis.cancel()
    const utt = new SpeechSynthesisUtterance(text)
    utt.lang = lang ?? 'en-US'  // Always English
    utt.rate = 0.9
    utt.pitch = 1.0
    utt.volume = 1.0
    // Try to pick an English voice
    const voices = window.speechSynthesis.getVoices()
    const matchVoice = voices.find(v => v.lang.startsWith('en'))
    if (matchVoice) utt.voice = matchVoice
    // Pause recognition while speaking to prevent feedback loop
    utt.onstart = () => { try { this.recognition?.stop() } catch {} }
    utt.onend = () => { if (this.running) { try { this.recognition?.start() } catch {} } }
    window.speechSynthesis.speak(utt)
  }

  onTranscript(h: TranscriptHandler) {
    this.transcriptHandlers.add(h)
    return () => this.transcriptHandlers.delete(h)
  }
  onStatus(h: StatusHandler) {
    this.statusHandlers.add(h)
    return () => this.statusHandlers.delete(h)
  }
  onVolume(h: VolumeHandler) {
    this.volumeHandlers.add(h)
    return () => this.volumeHandlers.delete(h)
  }

  private _setStatus(s: SpeechStatus) {
    this.status = s
    this.statusHandlers.forEach(h => h(s))
  }

  getStatus() { return this.status }
}
