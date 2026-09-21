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

/**
 * Subida con XMLHttpRequest: es la única forma de conocer el progreso real
 * de carga y de poder cancelarla a mitad.
 */
export function uploadDocument(
  file: File,
  fields: Record<string, string>,
  onProgress: (percent: number) => void,
): UploadHandle {
  const xhr = new XMLHttpRequest();
  const form = new FormData();
  form.append("file", file);
  for (const [key, value] of Object.entries(fields)) {
    if (value) form.append(key, value);
  }

  const promise = new Promise<{ document: { id: string; title: string } }>(
    (resolve, reject) => {
      xhr.open("POST", "/api/documents");
      xhr.upload.addEventListener("progress", (event) => {
        if (event.lengthComputable) {
          onProgress(Math.round((event.loaded / event.total) * 100));
        }
      });
      xhr.addEventListener("load", () => {
        try {
          const data = JSON.parse(xhr.responseText || "{}");
          if (xhr.status >= 200 && xhr.status < 300) resolve(data);
          else
            reject(
              new ApiError(
                data?.error?.message ?? "No hemos podido subir el archivo.",
                xhr.status,
                data?.error?.code ?? "UPLOAD_FAILED",
              ),
            );
        } catch {
          reject(new ApiError("Respuesta inesperada del servidor.", xhr.status, "PARSE"));
        }
      });
      xhr.addEventListener("error", () =>
        reject(new ApiError("Se ha perdido la conexión durante la subida.", 0, "NETWORK")),
      );
      xhr.addEventListener("abort", () =>
        reject(new ApiError("Subida cancelada.", 0, "ABORTED")),
      );
      xhr.send(form);
    },
  );

  return { promise, cancel: () => xhr.abort() };
}
