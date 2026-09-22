const SOUND_FILES = {
  moveSelf: 'move-self',
  moveOpponent: 'move-opponent',
  moveCheck: 'move-check',
  capture: 'capture',
  castle: 'castle',
  promote: 'promote',
  gameEnd: 'game-end',
  notify: 'notify',
  illegal: 'illegal',
  click: 'click',
} as const

export type SoundName = keyof typeof SOUND_FILES

const cache = new Map<SoundName, HTMLAudioElement>()

function getAudio(name: SoundName): HTMLAudioElement {
  let audio = cache.get(name)
  if (!audio) {
    audio = new Audio(`/sounds/${SOUND_FILES[name]}.mp3`)
    cache.set(name, audio)
  }
  return audio
}

export function playSound(name: SoundName, enabled: boolean): void {
  if (!enabled) return
  const audio = getAudio(name)
  audio.currentTime = 0
  void audio.play().catch(() => {
    // Autoplay can be blocked before the user has interacted with the page; ignore.
  })
}
