"use client";

/**
 * Reproductor global.
 *
 * Vive en el layout de la aplicación, así que sigue sonando mientras el
 * usuario navega entre pantallas. Tiene dos motores:
 *
 *  - "server": el servidor sintetiza el audio (OpenAI / ElevenLabs) y se
 *    reproduce con un <audio>. Permite buscar dentro del audio, controles
 *    desde la pantalla de bloqueo y reproducción en segundo plano.
 *  - "speech": voz del propio dispositivo (Web Speech API). No necesita
 *    ninguna clave, pero el navegador no permite buscar dentro de una frase,
 *    así que se salta de frase en frase.
 *
 * En ambos casos se conoce en todo momento qué frase se está narrando, que es
 * lo que permite resaltar el texto y pulsar un párrafo para empezar ahí.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { AudioTrackDto } from "@/lib/client/types";
import { useToast } from "./ToastProvider";

export type PlayerQueue = {
  documentId: string;
  documentTitle: string;
  tracks: AudioTrackDto[];
};

type PlayerState = {
  queue: PlayerQueue | null;
  trackIndex: number;
  track: AudioTrackDto | null;
  isPlaying: boolean;
  isLoading: boolean;
  currentTime: number;
  duration: number;
  rate: number;
  segmentIndex: number;
  engine: "server" | "speech";
  expanded: boolean;
  error: string | null;
};

type PlayerApi = PlayerState & {
  playQueue: (queue: PlayerQueue, trackIndex?: number, startSeconds?: number) => void;
  toggle: () => void;
  play: () => void;
  pause: () => void;
  stop: () => void;
  next: () => void;
  previous: () => void;
  seek: (seconds: number) => void;
  skip: (delta: number) => void;
  seekToSegment: (index: number) => void;
  setRate: (rate: number) => void;
  setExpanded: (expanded: boolean) => void;
};

const PlayerContext = createContext<PlayerApi | null>(null);

export const SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2] as const;

const RATE_KEY = "estudia-rate";

export function PlayerProvider({
  serverTts,
  children,
}: {
  serverTts: boolean;
  children: React.ReactNode;
}) {
  const { toast } = useToast();
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [queue, setQueue] = useState<PlayerQueue | null>(null);
  const [trackIndex, setTrackIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [rate, setRateState] = useState(1);
  const [engine, setEngine] = useState<"server" | "speech">(
    serverTts ? "server" : "speech",
  );
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const track = queue?.tracks[trackIndex] ?? null;

  // Referencias para el motor de voz del dispositivo.
  const speechSegment = useRef(0);
  const speechStartedAt = useRef(0);
  const speechBase = useRef(0);
  const speechTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const cancelledBySystem = useRef(false);

  useEffect(() => {
    try {
      const stored = Number.parseFloat(localStorage.getItem(RATE_KEY) ?? "1");
      if (SPEEDS.includes(stored as (typeof SPEEDS)[number])) setRateState(stored);
    } catch {
      /* sin persistencia */
    }
  }, []);

  /** Duración de referencia de la pista (real si existe, estimada si no). */
  const trackDuration = useCallback(
    (candidate: AudioTrackDto | null) =>
      candidate ? candidate.durationSeconds || candidate.estimatedSeconds || 1 : 0,
    [],
  );

  // ── Motor de voz del dispositivo ──────────────────────────────────────
  const stopSpeech = useCallback(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    cancelledBySystem.current = true;
    window.speechSynthesis.cancel();
    if (speechTimer.current) {
      clearInterval(speechTimer.current);
      speechTimer.current = null;
    }
  }, []);

  const pickVoice = useCallback(() => {
    const voices = window.speechSynthesis.getVoices();
    return (
      voices.find((voice) => /^es[-_]ES/i.test(voice.lang)) ??
      voices.find((voice) => /^es/i.test(voice.lang)) ??
      null
    );
  }, []);

  const speakFrom = useCallback(
    (segmentIndexToPlay: number, currentTrack: AudioTrackDto) => {
      if (typeof window === "undefined" || !("speechSynthesis" in window)) {
        setError(
          "Tu navegador no permite leer en voz alta. Prueba con Chrome, Edge o Safari.",
        );
        return;
      }

      const segments = currentTrack.segments;
      if (!segments.length) return;

      stopSpeech();
      cancelledBySystem.current = false;
      speechSegment.current = Math.max(0, Math.min(segmentIndexToPlay, segments.length - 1));
      speechBase.current = segments[speechSegment.current].startMs / 1000;
      speechStartedAt.current = performance.now();

      const speakNext = () => {
        const index = speechSegment.current;
        if (index >= segments.length) {
          setIsPlaying(false);
          nextRef.current?.();
          return;
        }

        const utterance = new SpeechSynthesisUtterance(segments[index].text);
        utterance.lang = "es-ES";
        utterance.rate = rate;
        const voice = pickVoice();
        if (voice) utterance.voice = voice;

        utterance.onstart = () => {
          speechBase.current = segments[index].startMs / 1000;
          speechStartedAt.current = performance.now();
        };
        utterance.onend = () => {
          if (cancelledBySystem.current) return;
          speechSegment.current = index + 1;
          speakNext();
        };
        utterance.onerror = () => {
          if (cancelledBySystem.current) return;
          speechSegment.current = index + 1;
          speakNext();
        };

        window.speechSynthesis.speak(utterance);
      };

      speakNext();
      setIsPlaying(true);
      setIsLoading(false);

      // Reloj virtual: avanza el tiempo mientras habla el sintetizador.
      speechTimer.current = setInterval(() => {
        const elapsed = (performance.now() - speechStartedAt.current) / 1000;
        setCurrentTime(Math.min(speechBase.current + elapsed, trackDuration(currentTrack)));
        // Chrome suspende la locución tras unos segundos en segundo plano.
        if (window.speechSynthesis.paused) window.speechSynthesis.resume();
      }, 220);
    },
    [pickVoice, rate, stopSpeech, trackDuration],
  );

  // ── Control principal ─────────────────────────────────────────────────
  const nextRef = useRef<(() => void) | null>(null);

  const startTrack = useCallback(
    async (
      nextQueue: PlayerQueue,
      index: number,
      startSeconds = 0,
      autoplay = true,
    ) => {
      const nextTrack = nextQueue.tracks[index];
      if (!nextTrack) return;

      setError(null);
      setDuration(trackDuration(nextTrack));
      setCurrentTime(startSeconds);

      if (engine === "server" && audioRef.current) {
        const audio = audioRef.current;
        setIsLoading(true);
        audio.src = `/api/audio/${nextTrack.id}/stream`;
        audio.playbackRate = rate;
        audio.currentTime = 0;

        try {
          if (autoplay) await audio.play();
          if (startSeconds > 0) audio.currentTime = startSeconds;
          setIsPlaying(autoplay);
        } catch {
          // El servidor no pudo sintetizar: usamos la voz del dispositivo.
          setEngine("speech");
          setIsLoading(false);
          if (autoplay) {
            const segmentIndex = nextTrack.segments.findIndex(
              (segment) => segment.endMs / 1000 > startSeconds,
            );
            speakFrom(Math.max(0, segmentIndex), nextTrack);
          }
        }
        return;
      }

      if (autoplay) {
        const segmentIndex = nextTrack.segments.findIndex(
          (segment) => segment.endMs / 1000 > startSeconds,
        );
        speakFrom(Math.max(0, segmentIndex), nextTrack);
      }
    },
    [engine, rate, speakFrom, trackDuration],
  );

  const playQueue = useCallback(
    (nextQueue: PlayerQueue, index = 0, startSeconds = 0) => {
      stopSpeech();
      setQueue(nextQueue);
      setTrackIndex(index);
      void startTrack(nextQueue, index, startSeconds, true);
    },
    [startTrack, stopSpeech],
  );

  const pause = useCallback(() => {
    if (engine === "server" && audioRef.current) {
      audioRef.current.pause();
    } else if (typeof window !== "undefined" && "speechSynthesis" in window) {
      // `pause()` es poco fiable en móvil: cancelamos y recordamos la frase.
      stopSpeech();
    }
    setIsPlaying(false);
  }, [engine, stopSpeech]);

  const play = useCallback(() => {
    if (!track) return;
    if (engine === "server" && audioRef.current) {
      void audioRef.current.play().catch(() => {
        setEngine("speech");
        speakFrom(speechSegment.current, track);
      });
      setIsPlaying(true);
    } else {
      speakFrom(speechSegment.current, track);
    }
  }, [engine, speakFrom, track]);

  const toggle = useCallback(() => {
    if (isPlaying) pause();
    else play();
  }, [isPlaying, pause, play]);

  const stop = useCallback(() => {
    stopSpeech();
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.removeAttribute("src");
    }
    setIsPlaying(false);
    setQueue(null);
    setCurrentTime(0);
    setExpanded(false);
  }, [stopSpeech]);

  const goTo = useCallback(
    (index: number, startSeconds = 0) => {
      if (!queue) return;
      const clamped = Math.max(0, Math.min(index, queue.tracks.length - 1));
      stopSpeech();
      speechSegment.current = 0;
      setTrackIndex(clamped);
      void startTrack(queue, clamped, startSeconds, true);
    },
    [queue, startTrack, stopSpeech],
  );

  const next = useCallback(() => {
    if (!queue) return;
    if (trackIndex + 1 >= queue.tracks.length) {
      setIsPlaying(false);
      stopSpeech();
      return;
    }
    goTo(trackIndex + 1);
  }, [goTo, queue, stopSpeech, trackIndex]);

  nextRef.current = next;

  const previous = useCallback(() => {
    // Igual que en Spotify: si ya ha avanzado, vuelve al principio del capítulo.
    if (currentTime > 4) {
      goTo(trackIndex, 0);
      return;
    }
    goTo(trackIndex - 1);
  }, [currentTime, goTo, trackIndex]);

  const seek = useCallback(
    (seconds: number) => {
      if (!track) return;
      const clamped = Math.max(0, Math.min(seconds, trackDuration(track)));
      if (engine === "server" && audioRef.current) {
        audioRef.current.currentTime = clamped;
        setCurrentTime(clamped);
        return;
      }
      const index = track.segments.findIndex(
        (segment) => segment.endMs / 1000 > clamped,
      );
      const target = index >= 0 ? index : track.segments.length - 1;
      setCurrentTime(clamped);
      if (isPlaying) speakFrom(target, track);
      else {
        speechSegment.current = target;
        speechBase.current = clamped;
      }
    },
    [engine, isPlaying, speakFrom, track, trackDuration],
  );

  const skip = useCallback((delta: number) => seek(currentTime + delta), [currentTime, seek]);

  const seekToSegment = useCallback(
    (index: number) => {
      if (!track) return;
      const segment = track.segments[index];
      if (!segment) return;
      if (engine === "server" && audioRef.current) {
        audioRef.current.currentTime = segment.startMs / 1000;
        setCurrentTime(segment.startMs / 1000);
        if (!isPlaying) void audioRef.current.play().then(() => setIsPlaying(true));
        return;
      }
      speechSegment.current = index;
      setCurrentTime(segment.startMs / 1000);
      speakFrom(index, track);
    },
    [engine, isPlaying, speakFrom, track],
  );

  const setRate = useCallback(
    (nextRate: number) => {
      setRateState(nextRate);
      try {
        localStorage.setItem(RATE_KEY, String(nextRate));
      } catch {
        /* sin persistencia */
      }
      if (audioRef.current) audioRef.current.playbackRate = nextRate;
      if (engine === "speech" && isPlaying && track) {
        // La velocidad de la voz del dispositivo solo se aplica al hablar.
        speakFrom(speechSegment.current, track);
      }
    },
    [engine, isPlaying, speakFrom, track],
  );

  // ── Eventos del elemento <audio> ──────────────────────────────────────
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTime = () => setCurrentTime(audio.currentTime);
    const onLoaded = () => {
      setIsLoading(false);
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        setDuration(audio.duration);
      }
    };
    const onEnded = () => nextRef.current?.();
    const onError = () => {
      setIsLoading(false);
      if (!audio.src) return;
      setEngine("speech");
      setError(
        "No hemos podido cargar el audio del servidor. Usaremos la voz de tu dispositivo.",
      );
    };
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);

    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onLoaded);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("error", onError);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onLoaded);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onError);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
    };
  }, []);

  useEffect(() => () => stopSpeech(), [stopSpeech]);

  // ── Controles del sistema (pantalla de bloqueo, auriculares) ──────────
  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    if (!track || !queue) return;

    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: queue.documentTitle,
      album: "EstudIA",
    });
    navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused";

    const actions: [MediaSessionAction, () => void][] = [
      ["play", play],
      ["pause", pause],
      ["previoustrack", previous],
      ["nexttrack", next],
      ["seekbackward", () => skip(-10)],
      ["seekforward", () => skip(10)],
    ];
    for (const [action, handler] of actions) {
      try {
        navigator.mediaSession.setActionHandler(action, handler);
      } catch {
        /* acción no soportada por el navegador */
      }
    }
  }, [isPlaying, next, pause, play, previous, queue, skip, track]);

  // Aviso único si la síntesis del servidor no está disponible.
  const warnedRef = useRef(false);
  useEffect(() => {
    if (error && !warnedRef.current) {
      warnedRef.current = true;
      toast({ title: "Audio", description: error, variant: "info" });
    }
  }, [error, toast]);

  /** Frase que se está narrando ahora mismo (para resaltarla en pantalla). */
  const segmentIndex = useMemo(() => {
    if (!track || track.segments.length === 0) return -1;
    const ms = currentTime * 1000;
    let found = -1;
    for (let i = 0; i < track.segments.length; i++) {
      if (track.segments[i].startMs <= ms) found = i;
      else break;
    }
    return found;
  }, [currentTime, track]);

  const value: PlayerApi = {
    queue,
    trackIndex,
    track,
    isPlaying,
    isLoading,
    currentTime,
    duration: duration || trackDuration(track),
    rate,
    segmentIndex,
    engine,
    expanded,
    error,
    playQueue,
    toggle,
    play,
    pause,
    stop,
    next,
    previous,
    seek,
    skip,
    seekToSegment,
    setRate,
    setExpanded,
  };

  return (
    <PlayerContext.Provider value={value}>
      {children}
      {/* Nunca se desmonta: el audio sobrevive a los cambios de pantalla. */}
      <audio ref={audioRef} preload="none" hidden />
    </PlayerContext.Provider>
  );
}

export function usePlayer() {
  const context = useContext(PlayerContext);
  if (!context) {
    throw new Error("usePlayer debe usarse dentro de <PlayerProvider>");
  }
  return context;
}
