/** Cliente HTTP del navegador con errores tipados y mensajes en castellano. */

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: {
        ...(init?.body && !(init.body instanceof FormData)
          ? { "Content-Type": "application/json" }
          : {}),
        ...init?.headers,
      },
    });
  } catch {
    throw new ApiError(
      "No hay conexión con el servidor. Comprueba tu red e inténtalo de nuevo.",
      0,
      "NETWORK",
    );
  }

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  const data = text ? JSON.parse(text) : {};

  if (!response.ok) {
    throw new ApiError(
      data?.error?.message ?? "Ha ocurrido un error inesperado.",
      response.status,
      data?.error?.code ?? "UNKNOWN",
    );
  }
  return data as T;
}

export const api = {
  get: <T>(url: string) => request<T>(url),
  post: <T>(url: string, body?: unknown) =>
    request<T>(url, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(url: string, body: unknown) =>
    request<T>(url, { method: "PATCH", body: JSON.stringify(body) }),
  delete: <T>(url: string) => request<T>(url, { method: "DELETE" }),
};

export type UploadHandle = {
  promise: Promise<{ document: { id: string; title: string } }>;
  cancel: () => void;
};

/** Lee la respuesta de una peticion XHR sin reventar si no es JSON. */
function leerRespuesta(xhr: XMLHttpRequest): { error?: { message?: string; code?: string } } & Record<string, unknown> {
  try {
    return JSON.parse(xhr.responseText || "{}");
  } catch {
    return {};
  }
}

/** Mensaje claro para una respuesta que no es la esperada. */
function errorDeRespuesta(xhr: XMLHttpRequest, porDefecto: string): ApiError {
  const data = leerRespuesta(xhr);
  if (data?.error?.message) {
    return new ApiError(data.error.message, xhr.status, data.error.code ?? "UPLOAD_FAILED");
  }
  if (xhr.status === 413) {
    return new ApiError(
      "El servidor ha rechazado el archivo por su tamaño.",
      413,
      "TOO_LARGE_FOR_SERVER",
    );
  }
  if (xhr.status === 401) {
    return new ApiError("Tu sesión ha caducado. Vuelve a entrar.", 401, "UNAUTHORIZED");
  }
  if (xhr.status >= 500 || xhr.status === 0) {
    return new ApiError(
      "El servidor no ha respondido bien. Vuelve a intentarlo en un momento.",
      xhr.status,
      "SERVER_ERROR",
    );
  }
  return new ApiError(porDefecto, xhr.status, "UPLOAD_FAILED");
}

/** Una peticion con XHR, para poder medir el progreso y cancelarla. */
function enviar(
  metodo: string,
  url: string,
  cuerpo: Blob | string | null,
  alAvanzar: ((bytes: number) => void) | null,
  registrar: (xhr: XMLHttpRequest) => void,
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    registrar(xhr);
    xhr.open(metodo, url);
    if (typeof cuerpo === "string") xhr.setRequestHeader("Content-Type", "application/json");
    else if (cuerpo) xhr.setRequestHeader("Content-Type", "application/octet-stream");
    if (alAvanzar) {
      xhr.upload.addEventListener("progress", (event) => alAvanzar(event.loaded));
    }
    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve(leerRespuesta(xhr));
      else reject(errorDeRespuesta(xhr, "No hemos podido subir el archivo."));
    });
    xhr.addEventListener("error", () =>
      reject(new ApiError("Se ha perdido la conexión durante la subida.", 0, "NETWORK")),
    );
    xhr.addEventListener("abort", () => reject(new ApiError("Subida cancelada.", 0, "ABORTED")));
    xhr.send(cuerpo);
  });
}

const REINTENTOS_POR_TROZO = 3;

/**
 * Sube un PDF por trozos pequeños.
 *
 * Vercel corta cualquier peticion de mas de 4,5 MB antes de que llegue a la
 * aplicacion, y un PDF escaneado pesa bastante mas. Partido en trozos pasa en
 * cualquier alojamiento; si se corta la conexion, se repite solo el trozo.
 */
export function uploadDocument(
  file: File,
  fields: Record<string, string>,
  onProgress: (percent: number) => void,
): UploadHandle {
  let actual: XMLHttpRequest | null = null;
  let cancelada = false;
  let subida: { id: string; partes: number } | null = null;
  const registrar = (xhr: XMLHttpRequest) => {
    actual = xhr;
  };

  const promise = (async () => {
    const inicio = await enviar(
      "POST",
      "/api/uploads",
      JSON.stringify({ name: file.name, size: file.size }),
      null,
      registrar,
    );
    const uploadId = String(inicio.uploadId);
    const porTrozo = Number(inicio.chunkBytes);
    const partes = Number(inicio.parts);
    subida = { id: uploadId, partes };

    let enviados = 0;
    for (let parte = 0; parte < partes; parte++) {
      const trozo = file.slice(parte * porTrozo, Math.min(file.size, (parte + 1) * porTrozo));
      for (let intento = 1; ; intento++) {
        if (cancelada) throw new ApiError("Subida cancelada.", 0, "ABORTED");
        try {
          await enviar(
            "PUT",
            `/api/uploads/${uploadId}/${parte}`,
            trozo,
            (bytes) => onProgress(Math.min(99, Math.round(((enviados + bytes) / file.size) * 100))),
            registrar,
          );
          break;
        } catch (error) {
          const reintentable =
            error instanceof ApiError &&
            (error.code === "NETWORK" || error.code === "SERVER_ERROR");
          if (!reintentable || intento >= REINTENTOS_POR_TROZO) throw error;
          await new Promise((listo) => setTimeout(listo, 1000 * intento));
        }
      }
      enviados += trozo.size;
    }

    const campos = Object.fromEntries(Object.entries(fields).filter(([, valor]) => valor));
    const resultado = await enviar(
      "POST",
      `/api/uploads/${uploadId}`,
      JSON.stringify({ name: file.name, parts: partes, ...campos }),
      null,
      registrar,
    );
    onProgress(100);
    return resultado as { document: { id: string; title: string } };
  })().catch((error) => {
    // Lo que hubiera llegado no sirve de nada: se borra.
    if (subida) {
      void fetch(`/api/uploads/${subida.id}?parts=${subida.partes}`, { method: "DELETE" }).catch(
        () => undefined,
      );
    }
    throw error instanceof ApiError
      ? error
      : new ApiError("No hemos podido subir el archivo.", 0, "UPLOAD_FAILED");
  });

  return {
    promise,
    cancel: () => {
      cancelada = true;
      (actual as XMLHttpRequest | null)?.abort();
    },
  };
}
