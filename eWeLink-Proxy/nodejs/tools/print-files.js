#!/usr/bin/env node

// usage ./print-files.js | xclip -selection clipboard

const fs = require('fs');
const path = require('path');

/**
 * Recursively get all files in a directory
 */
function getAllFiles(dirPath, arrayOfFiles = []) {
  const files = fs.readdirSync(dirPath);

  files.forEach(file => {
    const filePath = path.join(dirPath, file);
    
    try {
      if (fs.statSync(filePath).isDirectory()) {
        arrayOfFiles = getAllFiles(filePath, arrayOfFiles);
      } else {
        arrayOfFiles.push(filePath);
      }
    } catch (err) {
      console.error(`Error accessing ${filePath}: ${err.message}`);
    }
  });

  return arrayOfFiles;
}

/**
 * Print file content with header
 */
function printFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    console.log('\n' + '='.repeat(80));
    console.log(`File: ${filePath}`);
    console.log('='.repeat(80));
    console.log(content);
    console.log('='.repeat(80) + '\n');
  } catch (err) {
    console.error(`Error reading ${filePath}: ${err.message}\n`);
  }
}

/**
 * Process a path (file or directory)
 */
function processPath(inputPath) {
  try {
    const stats = fs.statSync(inputPath);
    
    if (stats.isFile()) {
      printFile(inputPath);
    } else if (stats.isDirectory()) {
      const files = getAllFiles(inputPath);
      files.forEach(file => printFile(file));
    }
  } catch (err) {
    console.error(`Error processing ${inputPath}: ${err.message}`);
  }
}

/**
 * Main function
 */
function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log('Usage: node print-files.js <file1> <file2> <folder1> ...');
    console.log('Example: node print-files.js index.js src/ README.md');
    process.exit(1);
  }

  args.forEach(arg => {
    processPath(arg);
  });
}

main();
