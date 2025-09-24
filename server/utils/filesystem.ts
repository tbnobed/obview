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

// ========================================
// COMPREHENSIVE FILE DELETION UTILITIES
// ========================================

const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads');
const PROCESSED_DIR = path.resolve(UPLOADS_DIR, 'processed');

/**
 * Safely remove a file or directory, ensuring it's within the allowed uploads directory
 */
export async function safeRemove(targetPath: string, retryCount = 1): Promise<boolean> {
  try {
    // Resolve the target path to prevent path traversal attacks
    const resolvedTarget = path.resolve(targetPath);
    
    // Ensure the target is within the uploads directory
    if (!resolvedTarget.startsWith(UPLOADS_DIR)) {
      console.error(`[FILESYSTEM] Security violation: path outside uploads directory: ${resolvedTarget}`);
      return false;
    }
    
    // Check if file/directory exists
    try {
      await fsPromises.access(resolvedTarget);
    } catch (error) {
      // File doesn't exist - this is OK (idempotent delete)
      console.log(`[FILESYSTEM] Target already removed or doesn't exist: ${resolvedTarget}`);
      return true;
    }
    
    // Remove the file or directory recursively
    await fsPromises.rm(resolvedTarget, { recursive: true, force: true });
    console.log(`[FILESYSTEM] ✅ Successfully removed: ${resolvedTarget}`);
    return true;
    
  } catch (error: any) {
    // Retry on transient errors
    if (retryCount > 0 && (error.code === 'EBUSY' || error.code === 'EPERM')) {
      console.log(`[FILESYSTEM] Transient error (${error.code}), retrying... ${targetPath}`);
      await new Promise(resolve => setTimeout(resolve, 100)); // Brief delay
      return safeRemove(targetPath, retryCount - 1);
    }
    
    console.error(`[FILESYSTEM] ❌ Failed to remove ${targetPath}:`, error.message);
    return false;
  }
}

/**
 * Remove original uploaded file
 */
export async function removeOriginalFile(filePath: string): Promise<boolean> {
  if (!filePath) {
    console.log('[FILESYSTEM] No file path provided for original file removal');
    return true;
  }
  
  console.log(`[FILESYSTEM] Removing original file: ${filePath}`);
  return safeRemove(filePath);
}

/**
 * Remove processed directory for a file ID (contains qualities, scrub, thumbnails)
 */
export async function removeProcessedDirectory(fileId: number): Promise<boolean> {
  const processedDir = path.join(PROCESSED_DIR, fileId.toString());
  console.log(`[FILESYSTEM] Removing processed directory: ${processedDir}`);
  return safeRemove(processedDir);
}

/**
 * Remove all files and processed versions for a file
 */
export async function removeFileCompletely(fileId: number, filePath: string): Promise<{ original: boolean; processed: boolean }> {
  console.log(`[FILESYSTEM] Complete removal for file ${fileId}`);
  
  const [originalResult, processedResult] = await Promise.allSettled([
    removeOriginalFile(filePath),
    removeProcessedDirectory(fileId)
  ]);
  
  return {
    original: originalResult.status === 'fulfilled' ? originalResult.value : false,
    processed: processedResult.status === 'fulfilled' ? processedResult.value : false
  };
}

/**
 * Remove files for multiple file IDs with concurrency limit
 */
export async function removeMultipleFiles(
  files: Array<{ id: number; filePath: string }>, 
  concurrencyLimit = 3
): Promise<Array<{ fileId: number; success: boolean; errors: string[] }>> {
  const results: Array<{ fileId: number; success: boolean; errors: string[] }> = [];
  
  // Process files in batches to avoid overwhelming the filesystem
  for (let i = 0; i < files.length; i += concurrencyLimit) {
    const batch = files.slice(i, i + concurrencyLimit);
    
    const batchResults = await Promise.allSettled(
      batch.map(async (file) => {
        const result = await removeFileCompletely(file.id, file.filePath);
        const errors: string[] = [];
        
        if (!result.original) errors.push(`Failed to remove original file: ${file.filePath}`);
        if (!result.processed) errors.push(`Failed to remove processed directory for file ${file.id}`);
        
        return {
          fileId: file.id,
          success: result.original && result.processed,
          errors
        };
      })
    );
    
    // Collect results from this batch
    batchResults.forEach((result) => {
      if (result.status === 'fulfilled') {
        results.push(result.value);
      } else {
        results.push({
          fileId: -1,
          success: false,
          errors: [`Batch processing failed: ${result.reason}`]
        });
      }
    });
  }
  
  return results;
}

/**
 * Check if filesystem cleanup was successful
 */
export function summarizeCleanupResults(results: Array<{ fileId: number; success: boolean; errors: string[] }>): {
  successful: number;
  failed: number;
  totalErrors: string[];
} {
  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  const totalErrors = results.flatMap(r => r.errors);
  
  console.log(`[FILESYSTEM] Cleanup summary: ${successful} successful, ${failed} failed`);
  if (totalErrors.length > 0) {
    console.error('[FILESYSTEM] Cleanup errors:', totalErrors);
  }
  
  return { successful, failed, totalErrors };
}