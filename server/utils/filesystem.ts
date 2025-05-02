import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
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
    return await fsPromises.readdir(directoryPath, { encoding: 'utf8' });
  } catch (error) {
    console.error(`Error reading directory ${directoryPath}:`, error instanceof Error ? error.message : String(error));
    throw new Error(`Cannot read directory: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Get detailed stats for a specific file
 */
export async function getFileStats(filePath: string): Promise<any> {
  try {
    return await fsPromises.stat(filePath);
  } catch (error) {
    console.error(`Error getting stats for ${filePath}:`, error instanceof Error ? error.message : String(error));
    throw new Error(`Cannot get file stats: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Check if a file exists
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fsPromises.access(filePath, fs.constants.F_OK);
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
    await fsPromises.unlink(filePath);
  } catch (error) {
    console.error(`Error deleting file ${filePath}:`, error instanceof Error ? error.message : String(error));
    throw new Error(`Cannot delete file: ${error instanceof Error ? error.message : String(error)}`);
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