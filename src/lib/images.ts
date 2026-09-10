import type { StoredImage } from '../types'
import { newId } from './id'

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024 // 8 MB je Originaldatei
export const MAX_IMAGES_PER_PROMPT = 8
const MAX_EDGE = 1600 // längste Kante nach der Optimierung
const JPEG_QUALITY = 0.82

export class ImageError extends Error {}

/** Verkleinert große Bilder vor dem Speichern; Ergebnis ist immer ein Blob. */
export async function prepareImage(file: File, promptId: string): Promise<StoredImage> {
  if (!file.type.startsWith('image/')) {
    throw new ImageError(`„${file.name}“ ist keine Bilddatei.`)
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new ImageError(
      `„${file.name}“ ist mit ${formatBytes(file.size)} zu groß. Erlaubt sind ${formatBytes(
        MAX_IMAGE_BYTES,
      )}.`,
    )
  }

  let blob: Blob = file
  let type = file.type
  // SVG und GIF unverändert übernehmen (Animation bzw. Vektor bleiben erhalten).
  if (!/svg|gif/.test(file.type)) {
    try {
      const resized = await downscale(file)
      if (resized && resized.size < file.size) {
        blob = resized
        type = 'image/jpeg'
      }
    } catch {
      /* Original behalten */
    }
  }

  return {
    id: newId(),
    promptId,
    name: file.name,
    type,
    size: blob.size,
    blob,
    createdAt: Date.now(),
    remotePath: null,
  }
}

async function downscale(file: File): Promise<Blob | null> {
  const bitmap = await loadBitmap(file)
  if (!bitmap) return null
  const { width, height } = bitmap
  const scale = Math.min(1, MAX_EDGE / Math.max(width, height))
  const w = Math.round(width * scale)
  const h = Math.round(height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, w, h)
  ctx.drawImage(bitmap as CanvasImageSource, 0, 0, w, h)
  if ('close' in bitmap && typeof bitmap.close === 'function') bitmap.close()
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/jpeg', JPEG_QUALITY))
}

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement | null> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file)
    } catch {
      /* Ersatzweg unten */
    }
  }
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(null)
    }
    img.src = url
  })
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < buf.length; i += chunk) {
    binary += String.fromCharCode(...buf.subarray(i, i + chunk))
  }
  return btoa(binary)
}

export function base64ToBlob(base64: string, type: string): Blob {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type })
}
