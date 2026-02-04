const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
const matter = require('gray-matter');

// Configuration
const WORDPRESS_URL = process.env.WORDPRESS_URL;
const USERNAME = process.env.WORDPRESS_USERNAME;
const APP_PASSWORD = process.env.WORDPRESS_APP_PASSWORD;
const POSTS_DIR = 'docs';
const FORCE_PUBLISH = process.env.FORCE_PUBLISH === 'true';

// WordPress API client
const wpClient = axios.create({
  baseURL: `${WORDPRESS_URL}/wp-json/wp/v2`,
  auth: {
    username: USERNAME,
    password: APP_PASSWORD
  },
  headers: {
    'Content-Type': 'application/json'
  }
});

// Cache for category mapping
let categoryCache = {};

/**
 * Get or create a WordPress category by slug
 */
async function getOrCreateCategory(categoryName) {
  const slug = categoryName.toLowerCase().replace(/\s+/g, '-');
  
  if (categoryCache[slug]) {
    return categoryCache[slug];
  }

  try {
    // Try to find existing category
    const response = await wpClient.get('/categories', {
      params: { slug }
    });

    if (response.data.length > 0) {
      categoryCache[slug] = response.data[0].id;
      return response.data[0].id;
    }

    // Create new category if not found
    const createResponse = await wpClient.post('/categories', {
      name: categoryName,
      slug: slug
    });

    categoryCache[slug] = createResponse.data.id;
    return createResponse.data.id;
  } catch (error) {
    console.error(`Error with category "${categoryName}":`, error.response?.data || error.message);
    throw error;
  }
}

/**
 * Extract categories from file path
 * Example: posts/tech/ai/article.md -> ['tech', 'ai']
 */
function getCategoriesFromPath(filePath) {
  const relativePath = path.relative(POSTS_DIR, filePath);
  const parts = relativePath.split(path.sep);
  
  // Remove the filename and return directory names as categories
  return parts.slice(0, -1).filter(part => part !== '');
}

/**
 * Find existing post by slug
 */
async function findPostBySlug(slug) {
  try {
    const response = await wpClient.get('/posts', {
      params: { slug, status: 'any' }
    });
    return response.data.length > 0 ? response.data[0] : null;
  } catch (error) {
    console.error(`Error finding post by slug "${slug}":`, error.message);
    return null;
  }
}

/**
 * Process a single Markdown file
 */
async function processMarkdownFile(filePath) {
  try {
    console.log(`\nProcessing: ${filePath}`);
    
    const fileContent = await fs.readFile(filePath, 'utf-8');
    const { data: frontmatter, content } = matter(fileContent);
    
    // Wrap Markdown in Gutenberg GFM block instead of converting to HTML
    const gutenbergContent = `<!-- wp:markdown -->
${content.trim()}
<!-- /wp:markdown -->`;
    
    // Get post slug from frontmatter or filename
    const filename = path.basename(filePath, '.md');
    const slug = frontmatter.slug || filename.toLowerCase().replace(/\s+/g, '-');
    
    // Get categories from path and frontmatter
    const pathCategories = getCategoriesFromPath(filePath);
    const frontmatterCategories = frontmatter.categories || [];
    const allCategories = [...new Set([...pathCategories, ...frontmatterCategories])];
    
    // Get or create category IDs
    const categoryIds = await Promise.all(
      allCategories.map(cat => getOrCreateCategory(cat))
    );
    
    // Prepare post data
    const postData = {
      title: frontmatter.title || filename,
      content: gutenbergContent,
      slug: slug,
      status: frontmatter.status || 'draft',
      categories: categoryIds,
      excerpt: frontmatter.excerpt || '',
      date: frontmatter.date || new Date().toISOString()
    };
    
    // Check if post already exists
    const existingPost = await findPostBySlug(slug);
    
    if (existingPost) {
      // Update existing post
      console.log(`Updating post: ${postData.title} (ID: ${existingPost.id})`);
      const response = await wpClient.put(`/posts/${existingPost.id}`, postData);
      console.log(`✓ Updated: ${response.data.link}`);
    } else {
      // Create new post
      console.log(`Creating post: ${postData.title}`);
      const response = await wpClient.post('/posts', postData);
      console.log(`✓ Created: ${response.data.link}`);
    }
    
    return { success: true, slug };
  } catch (error) {
    console.error(`✗ Error processing ${filePath}:`, error.response?.data || error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Get all Markdown files from a directory recursively
 */
async function getMarkdownFiles(dir) {
  const files = [];
  
  async function traverse(currentDir) {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      
      if (entry.isDirectory()) {
        await traverse(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        files.push(fullPath);
      }
    }
  }
  
  await traverse(dir);
  return files;
}

/**
 * Get changed Markdown files from git diff
 */
async function getChangedMarkdownFiles() {
  const { exec } = require('child_process');
  const { promisify } = require('util');
  const execAsync = promisify(exec);
  
  try {
    const { stdout } = await execAsync('git diff --name-only HEAD~1 HEAD');
    const changedFiles = stdout.split('\n')
      .filter(file => file.startsWith(POSTS_DIR) && file.endsWith('.md'))
      .filter(file => file.trim() !== '');
    
    return changedFiles;
  } catch (error) {
    console.log('Could not detect changed files, processing all files');
    return null;
  }
}

/**
 * Main function
 */
async function main() {
  console.log('Starting WordPress publishing process...\n');
  
  // Validate environment variables
  if (!WORDPRESS_URL || !USERNAME || !APP_PASSWORD) {
    throw new Error('Missing required environment variables: WORDPRESS_URL, WORDPRESS_USERNAME, WORDPRESS_APP_PASSWORD');
  }
  
  console.log(`WordPress URL: ${WORDPRESS_URL}`);
  console.log(`Posts directory: ${POSTS_DIR}\n`);
  
  // Determine which files to process
  let filesToProcess;
  
  if (FORCE_PUBLISH) {
    console.log('Force publish enabled - processing all Markdown files');
    filesToProcess = await getMarkdownFiles(POSTS_DIR);
  } else {
    const changedFiles = await getChangedMarkdownFiles();
    
    if (changedFiles && changedFiles.length > 0) {
      console.log('Processing changed files only:');
      changedFiles.forEach(file => console.log(`  - ${file}`));
      filesToProcess = changedFiles;
    } else {
      console.log('No changed files detected or git diff unavailable - processing all files');
      filesToProcess = await getMarkdownFiles(POSTS_DIR);
    }
  }
  
  if (filesToProcess.length === 0) {
    console.log('No Markdown files found to process');
    return;
  }
  
  console.log(`\nFound ${filesToProcess.length} file(s) to process\n`);
  
  // Process all files
  const results = await Promise.all(
    filesToProcess.map(file => processMarkdownFile(file))
  );
  
  // Summary
  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  
  console.log('\n' + '='.repeat(50));
  console.log('Publishing Summary');
  console.log('='.repeat(50));
  console.log(`Total files: ${results.length}`);
  console.log(`Successful: ${successful}`);
  console.log(`Failed: ${failed}`);
  
  if (failed > 0) {
    process.exit(1);
  }
}

// Run the script
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
