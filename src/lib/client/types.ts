/** Tipos compartidos entre el cliente y las rutas de API. */

export type Capabilities = {
  aiEnabled: boolean;
  serverTts: boolean;
  maxUploadMb: number;
  /** Por encima de esto el PDF se queda en el dispositivo. */
  maxServidorMb: number;
  /** Por encima de esto el servidor borra el PDF al terminar: se guarda aquí. */
  conservarServidorMb: number;
  maxPages: number;
};

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  educationLevel: string;
  explanationStyle: string;
  summaryDepth: string;
  preferredVoice: string | null;
  playbackRate: number;
};

export type SubjectRef = {
  id?: string;
  name: string;
  color: string;
  emoji: string;
} | null;

export type DocumentListItem = {
  id: string;
  title: string;
  originalName: string;
  pageCount: number;
  sizeBytes: number;
  status: DocumentStatus;
  statusMessage: string;
  processingProgress: number;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  subject: SubjectRef;
  topic: { id: string; name: string } | null;
  studyPercent: number;
  audioSeconds: number;
  trackCount: number;
  summaryDepth: string;
  educationLevel: string;
  explanationStyle: string;
};

export type DocumentStatus =
  | "UPLOADED"
  | "EXTRACTING"
  | "ANALYZING"
  | "SUMMARIZING"
  | "OUTLINING"
  | "NARRATING"
  | "READY"
  | "FAILED";

export type SummarySectionDto = {
  id: string;
  position: number;
  title: string;
  markdown: string;
  sourcePages: number[];
  keyConcepts: string[];
};

export type OutlineNodeDto = {
  label: string;
  kind?: string;
  page?: number;
  children?: OutlineNodeDto[];
};

export type AudioSegmentDto = {
  id: string;
  position: number;
  text: string;
  startMs: number;
  endMs: number;
  pageNumber: number | null;
  summarySectionId: string | null;
};

export type AudioTrackDto = {
  id: string;
  /** SUMMARY: audiolibro del resumen. DOCUMENT: texto completo del PDF. */
  source: "SUMMARY" | "DOCUMENT";
  position: number;
  title: string;
  chapter: string | null;
  estimatedSeconds: number;
  durationSeconds: number | null;
  audioStatus: "PENDING" | "READY" | "FAILED";
  charCount: number;
  segmentCount: number;
  /** Vacío en el listado: se piden por pista en /api/audio/[trackId]. */
  segments: AudioSegmentDto[];
  script?: string;
};

export type DocumentDetail = {
  document: {
    id: string;
    title: string;
    originalName: string;
    pageCount: number;
    sizeBytes: number;
    status: DocumentStatus;
    statusMessage: string;
    processingProgress: number;
    errorCode: string | null;
    errorMessage: string | null;
    textCoverage: number;
    usedOcr: boolean;
    /** El PDF original está solo en el dispositivo que lo subió. */
    pdfEnDispositivo?: boolean;
    summaryDepth: string;
    educationLevel: string;
    explanationStyle: string;
    createdAt: string;
    subject: { id: string; name: string; color: string; emoji: string } | null;
    topic: { id: string; name: string } | null;
  };
  summary: {
    id: string;
    depth: string;
    provider: string;
    model: string;
    version: number;
    createdAt: string;
    sections: SummarySectionDto[];
  } | null;
  outline: {
    id: string;
    provider: string;
    version: number;
    tree: { title: string; nodes: OutlineNodeDto[] };
  } | null;
  tracks: AudioTrackDto[];
  progress: {
    percent: number;
    readSeconds: number;
    listenSeconds: number;
    completedSections: string[];
    lastTab: string | null;
    lastTrackId: string | null;
    lastPositionSeconds: number;
  } | null;
};

export type Subject = {
  id: string;
  name: string;
  color: string;
  emoji: string;
  position: number;
  topics: {
    id: string;
    name: string;
    documents: { id: string; title: string; status: string; pageCount: number }[];
  }[];
  _count: { documents: number };
};

export type Stats = {
  recent: {
    id: string;
    title: string;
    status: DocumentStatus;
    statusMessage: string;
    processingProgress: number;
    pageCount: number;
    subject: SubjectRef;
    studyPercent: number;
    createdAt: string;
  }[];
  continueStudying: {
    id: string;
    title: string;
    percent: number;
    subject: SubjectRef;
    lastTab: string | null;
    updatedAt: string;
  }[];
  subjects: {
    id: string;
    name: string;
    color: string;
    emoji: string;
    documentCount: number;
  }[];
  week: {
    perDay: { day: string; readSeconds: number; listenSeconds: number }[];
    readSeconds: number;
    listenSeconds: number;
  };
  totals: { documentCount: number; readyCount: number };
};
