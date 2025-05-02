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
  console.log(`[DEBUG] Checking file existence for path: ${filePath}`);
  try {
    await fsPromises.access(filePath, fs.constants.F_OK);
    console.log(`[DEBUG] File exists check success for: ${filePath}`);
    return true;
  } catch (error) {
    console.log(`[DEBUG] File exists check failed for: ${filePath}`, error);
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

/**
 * Scan all files in the uploads directory and return paths that exist and don't exist
 */
export async function scanUploadsDirectory(uploadsDir: string): Promise<{ 
  existingFiles: string[], 
  missingFiles: string[],
  errors: string[] 
}> {
  const result = {
    existingFiles: [] as string[],
    missingFiles: [] as string[],
    errors: [] as string[]
  };

  console.log(`[SCAN] Starting scan of uploads directory: ${uploadsDir}`);
  
  try {
    // Check if directory exists first
    const dirExists = await fileExists(uploadsDir);
    if (!dirExists) {
      console.error(`[SCAN] Uploads directory does not exist: ${uploadsDir}`);
      result.errors.push(`Uploads directory does not exist: ${uploadsDir}`);
      return result;
    }
    
    // Get all files in the directory recursively
    const allFiles = await getFilesRecursively(uploadsDir);
    console.log(`[SCAN] Found ${allFiles.length} files in uploads directory`);
    
    // Check each file's existence
    for (const filePath of allFiles) {
      try {
        if (await fileExists(filePath)) {
          result.existingFiles.push(filePath);
        } else {
          result.missingFiles.push(filePath);
        }
      } catch (error) {
        console.error(`[SCAN] Error checking file: ${filePath}`, error);
        result.errors.push(`Error checking file: ${filePath} - ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    
    console.log(`[SCAN] Scan complete. Found ${result.existingFiles.length} existing files and ${result.missingFiles.length} missing files`);
    return result;
  } catch (error) {
    console.error(`[SCAN] Error scanning uploads directory:`, error);
    result.errors.push(`Error scanning directory: ${error instanceof Error ? error.message : String(error)}`);
    return result;
  }
}

/**
 * Get all files in directory recursively
 */
async function getFilesRecursively(dir: string): Promise<string[]> {
  const files: string[] = [];
  
  try {
    const entries = await fsPromises.readdir(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory()) {
        // Recursive call for subdirectories
        const subFiles = await getFilesRecursively(fullPath);
        files.push(...subFiles);
      } else {
        files.push(fullPath);
      }
    }
  } catch (error) {
    console.error(`Error reading directory ${dir}:`, error);
  }
  
  return files;
}