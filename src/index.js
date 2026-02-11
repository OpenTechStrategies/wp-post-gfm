import * as core from "@actions/core";
import * as github from "@actions/github";
import fs from 'fs/promises';
import path from 'path';
import axios from 'axios';
import matter from 'gray-matter';
import FormData from 'form-data';
import MarkdownIt from 'markdown-it';

const POSTS_DIR = core.getInput('directory');
const FORCE_PUBLISH = core.getInput('force_publish');
const WORDPRESS_URL = process.env.WP_URL;
const USERNAME = process.env.WP_USERNAME;
const APP_PASSWORD = process.env.WP_APP_PASSWORD;

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
// Cache for uploaded images (to avoid re-uploading the same image)
let imageCache = {};
// Cache for media IDs
let imageCacheIds = {};

/**
 * Upload an image to WordPress media library
 * If a file with the same name exists, it will be replaced
 */
async function uploadImage(imagePath, baseDir) {
  const resolvedPath = path.isAbsolute(imagePath) 
    ? imagePath 
    : path.resolve(path.dirname(baseDir), imagePath);
  
  // Check cache first
  if (imageCache[resolvedPath]) {
    console.log(`  Using cached image: ${imagePath}`);
    return imageCache[resolvedPath];
  }

  try {
    const imageBuffer = await fs.readFile(resolvedPath);
    const fileName = path.basename(resolvedPath);
    
    // Check if a media file with the same name already exists
    let existingMedia = null;
    try {
      const searchResponse = await wpClient.get('/media', {
        params: {
          search: fileName,
          per_page: 100
        }
      });
      
      // Find exact filename match
      existingMedia = searchResponse.data.find(media => {
        const mediaFileName = media.source_url.split('/').pop();
        return mediaFileName === fileName;
      });
      
      if (existingMedia) {
        console.log(`  Found existing media: ${fileName} (ID: ${existingMedia.id})`);
      }
    } catch (searchError) {
      console.log(`  Could not search for existing media: ${searchError.message}`);
    }
    
    const formData = new FormData();
    formData.append('file', imageBuffer, fileName);
    
    let response;
    
    if (existingMedia) {
      // Replace existing media
      console.log(`  Replacing existing media: ${fileName}`);
      response = await axios.post(
        `${WORDPRESS_URL}/wp-json/wp/v2/media/${existingMedia.id}`,
        formData,
        {
          auth: {
            username: USERNAME,
            password: APP_PASSWORD
          },
          headers: {
            ...formData.getHeaders()
          }
        }
      );
      console.log(`  Replaced image: ${fileName} -> ${response.data.source_url}`);
    } else {
      // Upload new media
      response = await axios.post(
        `${WORDPRESS_URL}/wp-json/wp/v2/media`,
        formData,
        {
          auth: {
            username: USERNAME,
            password: APP_PASSWORD
          },
          headers: {
            ...formData.getHeaders()
          }
        }
      );
      console.log(`  Uploaded new image: ${fileName} -> ${response.data.source_url}`);
    }
    
    const imageUrl = response.data.source_url;
    const mediaId = response.data.id;
    
    imageCache[resolvedPath] = imageUrl;
    imageCacheIds[resolvedPath] = mediaId;
    
    return imageUrl;
  } catch (error) {
    console.error(`  Error uploading image ${imagePath}:`, error.response?.data || error.message);
    // Return original path if upload fails
    return imagePath;
  }
}

/**
 * Process images in Markdown content
 * Finds image references, uploads them to WordPress, and updates the URLs
 */
async function processImages(content, markdownFilePath) {
  const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
  let match;
  const replacements = [];
  
  while ((match = imageRegex.exec(content)) !== null) {
    const [fullMatch, altText, imagePath] = match;
    
    // Skip if it's already a full URL
    if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
      continue;
    }
    
    replacements.push({
      original: fullMatch,
      altText,
      imagePath
    });
  }
  
  // Upload images and build replacements
  let updatedContent = content;
  for (const replacement of replacements) {
    const uploadedUrl = await uploadImage(replacement.imagePath, markdownFilePath);
    const newMarkdown = `![${replacement.altText}](${uploadedUrl})`;
    updatedContent = updatedContent.replace(replacement.original, newMarkdown);
  }
  
  return updatedContent;
}

function createGutenbergMarkdownBlock(markdownContent) {

  // Initialize markdown-it with GFM-like options
  const md = new MarkdownIt({
    html: true,        // Enable HTML tags in source
    linkify: true,     // Autoconvert URL-like text to links
    typographer: true, // Enable smartquotes and other typographic replacements
    breaks: true       // Convert \n in paragraphs into <br> (GFM-style)
  });
  
  // Render markdown to HTML
  const htmlContent = md.render(markdownContent);
  
  // Create the block attributes object
  const attributes = {
    content: markdownContent,
    html: htmlContent,
    shikiTheme: "github-dark"
  };
  
  // Convert attributes to JSON string for block comment
  const attributesJson = JSON.stringify(attributes);
  
  // Create the Gutenberg block comment format
  const gutenbergBlock = `<!-- wp:gfm-renderer/markdown ${attributesJson} /-->`;
  
  return gutenbergBlock;
}

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
    
    // Process images in the Markdown content
    console.log(`  Processing images...`);
    const processedContent = await processImages(content, filePath);
    
    // Wrap Markdown in Gutenberg GFM block instead of converting to HTML
    const gutenbergContent = createGutenbergMarkdownBlock(processedContent);
    
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
    
    // Handle featured image if specified in frontmatter
    if (frontmatter.featured_image) {
      console.log(`  Processing featured image...`);
      try {
        let featuredImageUrl;
        
        // If it's a URL, use it directly to get the media ID
        if (frontmatter.featured_image.startsWith('http://') || frontmatter.featured_image.startsWith('https://')) {
          featuredImageUrl = frontmatter.featured_image;
        } else {
          // Upload the local image
          featuredImageUrl = await uploadImage(frontmatter.featured_image, filePath);
        }
        
        // Get the media ID from the URL (if we uploaded it, it's in the cache response)
        if (imageCache[path.resolve(path.dirname(filePath), frontmatter.featured_image)]) {
          // We need to get the media ID - upload function should return full response
          const imagePath = path.isAbsolute(frontmatter.featured_image)
            ? frontmatter.featured_image
            : path.resolve(path.dirname(filePath), frontmatter.featured_image);
          
          if (imageCacheIds[imagePath]) {
            postData.featured_media = imageCacheIds[imagePath];
          }
        }
      } catch (error) {
        console.error(`  Error setting featured image:`, error.message);
      }
    }
    
    // Check if post already exists
    const existingPost = await findPostBySlug(slug);
    
    let postId;
    if (existingPost) {
      // Update existing post
      console.log(`Updating post: ${postData.title} (ID: ${existingPost.id})`);
      const response = await wpClient.put(`/posts/${existingPost.id}`, postData);
      console.log(`✓ Updated: ${response.data.link}`);
      postId = response.data.id;
    } else {
      // Create new post
      console.log(`Creating post: ${postData.title}`);
      const response = await wpClient.post('/posts', postData);
      console.log(`✓ Created: ${response.data.link}`);
      postId = response.data.id;
    }
    
    return { success: true, slug, postId };
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
 * Publish specific draft posts by their IDs
 */
async function publishDraftsByIds(postIds) {
  console.log('\n' + '='.repeat(50));
  console.log('Publishing Draft Posts from This Run');
  console.log('='.repeat(50));
  
  if (!postIds || postIds.length === 0) {
    console.log('No posts to publish');
    return { published: 0, failed: 0 };
  }
  
  try {
    console.log(`Publishing ${postIds.length} post(s)\n`);
    
    // Publish each post by ID
    const results = [];
    for (const postId of postIds) {
      try {
        // First fetch the post to get its details
        const postResponse = await wpClient.get(`/posts/${postId}`);
        const post = postResponse.data;
        
        // Only publish if it's currently a draft
        if (post.status === 'draft') {
          console.log(`Publishing: ${post.title.rendered} (ID: ${postId})`);
          await wpClient.put(`/posts/${postId}`, {
            status: 'publish'
          });
          console.log(`✓ Published: ${post.link}`);
          results.push({ success: true, id: postId, title: post.title.rendered });
        } else {
          console.log(`Skipping: ${post.title.rendered} (ID: ${postId}) - already ${post.status}`);
          results.push({ success: true, id: postId, title: post.title.rendered, skipped: true });
        }
      } catch (error) {
        console.error(`✗ Failed to publish post ID ${postId}:`, error.response?.data || error.message);
        results.push({ success: false, id: postId, error: error.message });
      }
    }
    
    const published = results.filter(r => r.success && !r.skipped).length;
    const skipped = results.filter(r => r.skipped).length;
    const failed = results.filter(r => !r.success).length;
    
    console.log('\n' + '-'.repeat(50));
    console.log(`Published: ${published}`);
    if (skipped > 0) {
      console.log(`Skipped (already published): ${skipped}`);
    }
    console.log(`Failed: ${failed}`);
    console.log('-'.repeat(50));
    
    return { published, failed, skipped };
  } catch (error) {
    console.error('Error publishing posts:', error.response?.data || error.message);
    return { published: 0, failed: 0, error: error.message };
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
  
  // Collect post IDs from successfully processed files
  const postIdsToPublish = results
    .filter(r => r.success && r.postId)
    .map(r => r.postId);
  
  // Publish only the posts that were created/updated in this run
  const publishResults = await publishDraftsByIds(postIdsToPublish);
  
  if (failed > 0 || publishResults.failed > 0) {
    process.exit(1);
  }
}

// Run the script
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
