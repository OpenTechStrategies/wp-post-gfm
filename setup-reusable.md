# Using wp-post-gfm from another repository

## Architecture Overview

```
wp-post-gfm/          # Publisher repository (reusable)
├── .github/
│   ├── workflows/
│   │   └── wp-post-gfm.yml
│   └── scripts/
│       └── publish-to-wordpress.js
└── README.md

my-climate-blog/              # Your content repository
├── .github/
│   └── workflows/
│       └── publish.yml       # Calls the reusable workflow
├── posts/
│   └── my-article.md
└── images/
```

## Setup Instructions

### Step 1: Set Up Your Content Repository

1. In your content repository, create `.github/workflows/publish.yml`
2. Use the workflow template provided, change your posts directory as needed.

### Step 2: Add Secrets to Content Repository

Add these secrets to your content repository (Settings → Secrets and variables → Actions):

- `WORDPRESS_URL`: Your WordPress site URL (e.g., `https://yourblog.com`)
- `WORDPRESS_USERNAME`: Your WordPress username
- `WORDPRESS_APP_PASSWORD`: Your WordPress application password

### Step 3: Create Your First Post

In your content repository:

```
my-climate-blog/
├── posts/
│   ├── climate/
│   │   └── my-first-post.md
│   └── images/
│       └── header.jpg
```

Example post (`posts/climate/my-first-post.md`):

```markdown
---
title: "Understanding Climate Solutions"
status: "publish"
featured_image: "../images/header.jpg"
---

# Hello World

This is my first post about climate action!

![Example](../images/header.jpg)
```

Commit and push - the workflow will automatically publish to WordPress!

## Configuration Options

### Multiple Triggers

Add more triggers to your workflow:

```yaml
on:
  push:
    branches:
      - main
      - staging
    paths:
      - 'posts/**/*.md'
      - 'content/**/*.md'
  schedule:
    - cron: '0 9 * * *'  # Daily at 9 AM UTC
  workflow_dispatch:
```

### Branch-Specific Publishing

Use different publisher versions for different branches:

```yaml
jobs:
  publish:
    uses: YOUR_USERNAME/wp-post-gfm/.github/workflows/wp-post-gfm.yml@v1.0
    # or @main for latest
    # or @develop for testing
```

## Using Multiple Content Repositories

You can use the same publisher repository from multiple content repositories:

```
wp-post-gfm/       # Single publisher repo
    ↓
    ├── climate-science-blog/    # Content repo 1
    ├── policy-updates-blog/     # Content repo 2
    └── sustainability-blog/     # Content repo 3
```

Each content repository:
1. References the same reusable workflow
2. Has its own secrets (can publish to different WordPress sites)
3. Can use different posts directories
4. Works independently

## Advanced: GitHub Action (Composite Action Alternative)

If you prefer, you can also create a composite action instead of a reusable workflow.

Create `action.yml` in your publisher repository:

```yaml
name: 'wp-post-gfm'
description: 'Publish Markdown posts to WordPress'
inputs:
  wordpress_url:
    description: 'WordPress site URL'
    required: true
  wordpress_username:
    description: 'WordPress username'
    required: true
  wordpress_app_password:
    description: 'WordPress application password'
    required: true
  posts_directory:
    description: 'Directory containing posts'
    required: false
    default: 'posts'
  force_publish:
    description: 'Force republish all posts'
    required: false
    default: 'false'

runs:
  using: 'composite'
  steps:
    - name: Set up Node.js
      uses: actions/setup-node@v4
      with:
        node-version: '20'
    
    - name: Install dependencies
      shell: bash
      run: npm install axios form-data gray-matter
    
    - name: Publish to WordPress
      shell: bash
      env:
        WORDPRESS_URL: ${{ inputs.wordpress_url }}
        WORDPRESS_USERNAME: ${{ inputs.wordpress_username }}
        WORDPRESS_APP_PASSWORD: ${{ inputs.wordpress_app_password }}
        POSTS_DIR: ${{ inputs.posts_directory }}
        FORCE_PUBLISH: ${{ inputs.force_publish }}
      run: node ${{ github.action_path }}/.github/scripts/publish-to-wordpress.js
```

Then use it in your content repository:

```yaml
name: Publish to WordPress

on:
  push:
    branches: [main]

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 2
      
      - name: Publish to WordPress
        uses: OpenTechStrategies/wp-post-gfm@main
        with:
          wordpress_url: ${{ secrets.WORDPRESS_URL }}
          wordpress_username: ${{ secrets.WORDPRESS_USERNAME }}
          wordpress_app_password: ${{ secrets.WORDPRESS_APP_PASSWORD }}
          posts_directory: 'posts'
```

## Troubleshooting

### Images Not Uploading

Make sure image paths are relative to the Markdown file:
```markdown
![Image](./images/photo.jpg)       # Correct
![Image](images/photo.jpg)         # Correct
![Image](/absolute/path.jpg)       # May not work
```

