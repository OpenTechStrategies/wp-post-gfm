# WordPress Publishing GitHub Action

This GitHub Action automatically publishes Markdown files from your repository to WordPress using the WordPress REST API. Posts are automatically categorized based on their directory structure.

## Features

- 📝 Preserves Markdown formatting using Gutenberg Markdown blocks
- 📁 Creates WordPress categories based on file path
- 🔄 Updates existing posts or creates new ones
- 🏷️ Supports frontmatter for metadata (title, status, etc.)
- ⚡ Only processes changed files (unless forced)
- 🎯 Manual trigger option to republish all posts

## Setup

### 1. WordPress Configuration

First, you need to enable the WordPress REST API and create an Application Password:

1. Log in to your WordPress admin dashboard
2. Go to **Users** → **Profile**
3. Scroll to **Application Passwords**
4. Enter a name (e.g., "GitHub Actions")
5. Click **Add New Application Password**
6. Copy the generated password (you won't see it again!)

### 2. GitHub Repository Secrets

Add these secrets to your GitHub repository:

1. Go to **Settings** → **Secrets and variables** → **Actions**
2. Add the following secrets:
   - `WORDPRESS_URL`: Your WordPress site URL (e.g., `https://yourblog.com`)
   - `WORDPRESS_USERNAME`: Your WordPress username
   - `WORDPRESS_APP_PASSWORD`: The application password from step 1

### 3. Repository Structure

Create a `posts` directory in your repository:

```
your-repo/
├── .github/
│   ├── workflows/
│   │   └── publish-to-wordpress.yml
│   └── scripts/
│       └── publish-to-wordpress.js
├── posts/
│   ├── tech/
│   │   ├── ai/
│   │   │   └── my-ai-article.md
│   │   └── web-development.md
│   └── lifestyle/
│       └── productivity-tips.md
└── package.json
```

### 4. Install Dependencies

Add a `package.json` to your repository root:

```json
{
  "name": "wordpress-publisher",
  "version": "1.0.0",
  "dependencies": {
    "axios": "^1.6.0",
    "form-data": "^4.0.0",
    "gray-matter": "^4.0.3"
  }
}
```

## Usage

### Directory-Based Categorization

The action automatically creates categories based on your file path:

- `posts/tech/ai/article.md` → Categories: `tech`, `ai`
- `posts/lifestyle/fitness.md` → Category: `lifestyle`
- `posts/tutorial.md` → No automatic category (root level)

### Markdown Frontmatter

Add YAML frontmatter to your Markdown files for additional metadata:

```markdown
---
title: "My Awesome Blog Post"
slug: "my-awesome-post"
status: "publish"
excerpt: "A brief description of the post"
date: "2024-02-04T10:00:00"
categories:
  - "additional-category"
---

# Your Content Here

This is the body of your blog post...
```

**Frontmatter Options:**

- `title`: Post title (default: filename)
- `slug`: URL-friendly slug (default: filename)
- `status`: `draft`, `publish`, `private`, or `pending` (default: `draft`)
- `excerpt`: Short description
- `date`: Publication date (ISO 8601 format)
- `categories`: Additional categories (array)

### Triggering the Action

The action runs automatically when:

1. **Push to main branch**: When `.md` files in `posts/` directory are modified
2. **Manual trigger**: Go to Actions → Publish to WordPress → Run workflow

To force republish all posts, use the manual trigger with `force_publish` set to `true`.

## Example Markdown File

```markdown
---
title: "Getting Started with AI Development"
slug: "getting-started-ai-development"
status: "publish"
excerpt: "Learn the basics of AI development in this comprehensive guide"
categories:
  - "tutorials"
---

# Getting Started with AI Development

Welcome to this comprehensive guide on AI development...

## Prerequisites

Before we begin, you'll need:

- Python 3.8 or higher
- Basic programming knowledge
- A curious mind!

## Step 1: Setting Up Your Environment

First, let's install the necessary packages...
```

This file at `posts/tech/ai/getting-started.md` would be:
- Published with title "Getting Started with AI Development"
- Assigned to categories: `tech`, `ai`, `tutorials`
- Published immediately (status: `publish`)

## Workflow Customization

### Change the Posts Directory

Edit `.github/workflows/publish-to-wordpress.yml`:

```yaml
- name: Publish to WordPress
  env:
    POSTS_DIR: 'content/articles'  # Change this
```

And update `publish-to-wordpress.js`:

```javascript
const POSTS_DIR = process.env.POSTS_DIR || 'content/articles';
```

### Trigger on Different Branches

```yaml
on:
  push:
    branches:
      - main
      - production  # Add more branches
```

### Run on a Schedule

```yaml
on:
  schedule:
    - cron: '0 9 * * *'  # Daily at 9 AM UTC
```

## Troubleshooting

### Posts Not Publishing

1. Check that your WordPress REST API is enabled (it's enabled by default)
2. Verify your Application Password is correct
3. Ensure your WordPress user has permission to publish posts
4. Check the GitHub Actions logs for specific errors

### Categories Not Creating

- WordPress may have restrictions on category creation
- Check your user permissions in WordPress
- Verify the category names don't contain invalid characters

### Authentication Errors

- Double-check your `WORDPRESS_APP_PASSWORD` secret
- Make sure you're using an Application Password, not your regular WordPress password
- Verify the `WORDPRESS_URL` doesn't have a trailing slash

### Changed Files Not Detected

The action uses `git diff` to detect changes. If this fails, it will process all files. You can force this behavior by:
- Using the manual trigger with `force_publish: true`
- Or modifying the script to always process all files

## Advanced Features

### Draft All Posts

Set default status in frontmatter or modify the script's default:

```javascript
status: frontmatter.status || 'draft',  // Change 'draft' to 'publish'
```

### Add Featured Images

Extend the script to handle featured images from frontmatter:

```markdown
---
featured_image: "https://example.com/image.jpg"
---
```

### Custom Post Types

Modify the API endpoint to post to custom post types:

```javascript
const response = await wpClient.post('/custom-post-type', postData);
```

## Contributing

Feel free to modify and extend this action for your needs!

## License

MIT License - feel free to use and modify as needed.
