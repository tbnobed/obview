import fs from 'fs/promises';
import * as fsSync from 'fs';
import path from 'path';

// Interface for file details
export interface FileDetails {
  filename: string;
  path: string;
  size: number;
  createdAt: Date;
  modifiedAt: Date;
  isDirectory: boolean;
  metadata?: {
    id: number;
    projectId: number;
    projectName: string;
    uploadedById: number;
    uploadedByName: string;
  } | null;
}

/**
 * List all files in a directory with detailed information
 */
export async function listFiles(directoryPath: string): Promise<string[]> {
  try {
    return await fs.readdir(directoryPath);
  } catch (error) {
    console.error(`Error reading directory ${directoryPath}:`, error);
    throw new Error(`Cannot read directory: ${error.message}`);
  }
}

/**
 * Get detailed stats for a specific file
 */
export async function getFileStats(filePath: string): Promise<fs.Stats> {
  try {
    return await fs.stat(filePath);
  } catch (error) {
    console.error(`Error getting stats for ${filePath}:`, error);
    throw new Error(`Cannot get file stats: ${error.message}`);
  }
}

/**
 * Check if a file exists
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath, fsSync.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Delete a file
 */
export async function deleteFile(filePath: string): Promise<void> {
  try {
    await fs.unlink(filePath);
  } catch (error) {
    console.error(`Error deleting file ${filePath}:`, error);
    throw new Error(`Cannot delete file: ${error.message}`);
  }
}

/**
 * Sanitize a filename to prevent path traversal attacks
 */
export function sanitizeFilename(filename: string): string {
  return path.basename(filename);
}

/**
 * Join path segments safely
 */
export function joinPaths(...segments: string[]): string {
  return path.join(...segments);
}