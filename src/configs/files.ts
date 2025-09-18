// File Management Configuration
export const filesConfig = {
  // Excluded file patterns (files to ignore)
  excludePatterns: [
    'node_modules/**',
    '.git/**',
    '.next/**',
    'dist/**',
    'build/**',
    '*.log',
    '.DS_Store',
  ],

  // Maximum file size to read (bytes)
  maxFileSize: 1024 * 1024, // 1MB

  // File extensions to treat as text
  textFileExtensions: [
    '.js',
    '.jsx',
    '.ts',
    '.tsx',
    '.css',
    '.scss',
    '.sass',
    '.html',
    '.xml',
    '.svg',
    '.json',
    '.yml',
    '.yaml',
    '.md',
    '.txt',
    '.env',
    '.gitignore',
    '.dockerignore',
  ],
}

export default filesConfig
