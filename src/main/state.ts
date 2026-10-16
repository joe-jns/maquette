import { dirname } from 'node:path'

let currentPath: string | null = null

export function setCurrentPath(path: string | null): void {
  currentPath = path
}

export function getCurrentDir(): string | null {
  return currentPath ? dirname(currentPath) : null
}
