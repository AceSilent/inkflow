/**
 * Enhanced Path normalization utilities for cross-platform path handling
 * Specialized for Windows/Chinese path compatibility
 */

/**
 * Normalizes a file path by:
 * 1. Trimming whitespace
 * 2. Converting all backslashes to forward slashes
 * 3. Removing duplicate slashes
 * 4. Ensuring single slash after drive letter (d:/ not d://)
 * 5. Removing trailing slashes (except for root paths)
 * 6. Converting to lowercase for case-insensitive comparison
 *
 * @example
 * normalizePath('C:\\Users\\\\Documents//file.txt') // 'c:/users/documents/file.txt'
 * normalizePath('D:\\文件\\小说/恶魔寄生\\\\outline.md') // 'd:/文件/小说/恶魔寄生/outline.md'
 * normalizePath('d:///文件///小说') // 'd:/文件/小说'
 *
 * @param path - The path to normalize
 * @returns Normalized path with forward slashes and lowercase
 */
export function normalizePath(path: string): string {
  if (!path) return '';

  return path
    // 1. Trim whitespace
    .trim()
    // 2. Replace all backslashes with forward slashes
    .replace(/\\/g, '/')
    // 3. Remove duplicate slashes globally first
    .replace(/\/+/g, '/')
    // 4. Fix drive letter: ensure d:/ not d:// (after removing dups we have d:/)
    //    This handles cases like d:///file → d:/file
    // 5. Remove trailing slash (except for root paths like 'C:/')
    .replace(/([^/:])\/$/, '$1')
    // 6. Convert to lowercase for case-insensitive comparison (Windows is case-insensitive)
    .toLowerCase();
}

/**
 * Strong path matching using deep normalization
 * - Normalizes both paths
 * - Compares case-insensitively (important for Windows)
 * - Handles mixed separators (/ and \)
 * - Handles duplicate slashes
 *
 * This is the preferred method for path comparison
 *
 * @example
 * isPathMatch('D:\\文件\\小说\\outline.md', 'd:/文件/小说/outline.md') // true
 * isPathMatch('C:\\Users\\\\File.TXT', 'c:/users/file.txt') // true
 * isPathMatch('d:///小说///file.md', 'D:/小说/file.md') // true
 *
 * @param pathA - First path
 * @param pathB - Second path
 * @returns True if paths refer to the same file
 */
export function isPathMatch(pathA: string, pathB: string): boolean {
  if (!pathA && !pathB) return true;
  if (!pathA || !pathB) return false;

  const normalizedA = normalizePath(pathA);
  const normalizedB = normalizePath(pathB);

  return normalizedA === normalizedB;
}

/**
 * Checks if two paths are equivalent using deep normalization
 * - Alias for isPathMatch for backward compatibility
 * - Normalizes both paths
 * - Compares case-insensitively (important for Windows)
 * - Handles mixed separators (/ and \)
 *
 * @example
 * isSamePath('D:\\文件\\小说\\outline.md', 'd:/文件/小说/outline.md') // true
 * isSamePath('C:\\Users\\\\File.TXT', 'c:/users/file.txt') // true
 *
 * @param pathA - First path
 * @param pathB - Second path
 * @returns True if paths refer to the same file
 * @deprecated Use isPathMatch instead for clarity
 */
export function isSamePath(pathA: string, pathB: string): boolean {
  return isPathMatch(pathA, pathB);
}

/**
 * Joins path segments and normalizes the result
 *
 * @example
 * joinPaths('D:\\文件', '小说', '恶魔寄生', 'outline.md')
 * // 'd:/文件/小说/恶魔寄生/outline.md'
 *
 * @param segments - Path segments to join
 * @returns Normalized joined path
 */
export function joinPaths(...segments: string[]): string {
  return normalizePath(segments.filter(Boolean).join('/'));
}

/**
 * Legacy alias for isSamePath for backward compatibility
 * @deprecated Use isPathMatch instead
 */
export function pathsEqual(path1: string, path2: string): boolean {
  return isPathMatch(path1, path2);
}

/**
 * Extracts the relative path from a base path
 * Returns normalized relative path
 *
 * @example
 * getRelativePath('D:/文件/小说/恶魔寄生/outline.md', 'D:/文件/小说/恶魔寄生')
 * // 'outline.md'
 *
 * @param fullPath - Full path to extract from
 * @param basePath - Base path to extract relative to
 * @returns Normalized relative path
 */
export function getRelativePath(fullPath: string, basePath: string): string {
  if (!fullPath || !basePath) return fullPath;

  const normalizedFullPath = normalizePath(fullPath);
  const normalizedBasePath = normalizePath(basePath);

  // Ensure base path ends with / for proper matching
  const baseWithSlash = normalizedBasePath.endsWith('/')
    ? normalizedBasePath
    : normalizedBasePath + '/';

  if (normalizedFullPath.startsWith(baseWithSlash)) {
    return normalizedFullPath.substring(baseWithSlash.length);
  }

  return normalizedFullPath;
}

/**
 * Extracts the directory path from a file path
 *
 * @example
 * getDirectoryPath('d:/文件/小说/恶魔寄生/outline.md')
 * // 'd:/文件/小说/恶魔寄生'
 *
 * @param filePath - The file path
 * @returns Normalized directory path
 */
export function getDirectoryPath(filePath: string): string {
  if (!filePath) return '';

  const normalized = normalizePath(filePath);
  const lastSlashIndex = normalized.lastIndexOf('/');

  if (lastSlashIndex <= 0) {
    // Root path or no directory
    return normalized.substring(0, 2); // Return drive letter (e.g., 'd:/')
  }

  return normalized.substring(0, lastSlashIndex);
}

/**
 * Gets the filename from a file path
 *
 * @example
 * getFileName('d:/文件/小说/恶魔寄生/outline.md')
 * // 'outline.md'
 *
 * @param filePath - The file path
 * @returns Filename with extension
 */
export function getFileName(filePath: string): string {
  if (!filePath) return '';

  const normalized = normalizePath(filePath);
  const lastSlashIndex = normalized.lastIndexOf('/');

  if (lastSlashIndex === -1) {
    return normalized;
  }

  return normalized.substring(lastSlashIndex + 1);
}

/**
 * Checks if a path refers to an outline file (outline.md)
 *
 * @param path - The path to check
 * @returns True if the path is an outline file
 */
export function isOutlineFile(path: string): boolean {
  if (!path) return false;
  const fileName = getFileName(path);
  return fileName === 'outline.md';
}
