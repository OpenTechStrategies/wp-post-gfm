**NOTE: This repo was created with assistance from Claude AI.** 

# WordPress Publishing GitHub Action

This GitHub Action automatically publishes Markdown files from your repository to WordPress using the WordPress REST API. Posts are automatically categorized based on their directory structure.

## Features

- Preserves Markdown formatting using Gutenberg Markdown blocks
- Automatically uploads and embeds images from local files
- Creates WordPress categories based on file path
- Updates existing posts or creates new ones
- Supports frontmatter for metadata (title, status, featured images, etc.)
- Only processes changed files (unless forced)
- Manual trigger option to republish all posts

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

## Usage

### Directory-Based Categorization

The action automatically creates categories based on your file path:

- `posts/climate/adaptation/article.md` → Categories: `climate`, `adaptation`
- `posts/policy/emissions.md` → Category: `policy`
- `posts/tutorial.md` → No automatic category (root level)

### Image Handling

The action automatically handles images in your Markdown posts:

**Inline Images in Markdown:**

```markdown
![Alt text](./images/diagram.png)
![Screenshot](../screenshots/demo.jpg)
```

The script will:
1. Find all image references in your Markdown
2. Upload them to your WordPress media library
3. Update the Markdown to use the WordPress-hosted URLs
4. Cache uploaded images to avoid duplicates

**Image Path Options:**
- Relative paths: `./images/photo.jpg` or `../images/photo.jpg`
- Absolute paths: `/images/photo.jpg`
- URLs are left unchanged: `https://example.com/image.jpg`

**Featured Images:**

Set a featured image in frontmatter:

```markdown
---
title: "My Post"
featured_image: "./images/header.jpg"
---
```

The image will be uploaded and set as the post's featured image in WordPress.

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
- `featured_image`: Path to featured image file (relative or absolute)

### Triggering the Action

The action runs automatically when:

1. **Push to main branch**: When `.md` files in `posts/` directory are modified
2. **Manual trigger**: Go to Actions → Publish to WordPress → Run workflow

To force republish all posts, use the manual trigger with `force_publish` set to `true`.

## Example Markdown File

```markdown
---
title: "Understanding Climate Adaptation Strategies"
slug: "climate-adaptation-strategies"
status: "publish"
excerpt: "Learn about effective climate adaptation strategies for communities"
featured_image: "./images/climate-header.jpg"
categories:
  - "guides"
---

# Understanding Climate Adaptation Strategies

Welcome to this comprehensive guide on climate adaptation...

![Climate Impact Diagram](./images/climate-impacts.png)

## What is Climate Adaptation?

Climate adaptation involves adjusting to actual or expected climate change effects...

## Key Strategies

Before we begin, communities need:

- Climate risk assessments
- Local stakeholder engagement
- Long-term planning frameworks

## Step 1: Assessing Vulnerability

First, let's identify vulnerable systems...

![Vulnerability Assessment](./images/vulnerability-map.png)
```

This file at `posts/climate/adaptation/getting-started.md` would be:
- Published with title "Understanding Climate Adaptation Strategies"
- Assigned to categories: `climate`, `adaptation`, `guides`
- Featured image uploaded from `./images/climate-header.jpg`
- All inline images uploaded and URLs updated
- Published immediately (status: `publish`)

## Workflow Customization

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

## License

GAPL License - feel free to use and modify as needed.
