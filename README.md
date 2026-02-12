# Publish Markdown documents to WordPress

## Description

Publish Markdown documents as WordPress posts on push.

* Adds categories based on file spath, including the base directory
* Uploads images and creates correct image links, replacing images if
  same filename exists
* Processes relative links to other Markdown files into post URLs,
  e.g. `wordpressurl.com/title_of_post`)
* Assumes `FILENAME_is_TiTLE_OF_post.md`
  - Preserves common initialisms when creating titles, e.g., URL 
  - Special cases can be added for mixed-case or other substitutions
  - Can be overridden by frontmatter

## Setup

1. You will need to have the [GFM Markdown
   Renderer](https://wordpress.org/plugins/markdown-renderer-for-github/)
   plug-in installed on your WordPress site so that you have access to
   `gfm-renderer/markdown` blocks. ([Backup
   link](https://code.librehq.com/ots/gfm-renderer-for-wordpress)
   
2. Generate a WordPress application password

3. Add your WordPress URL, username, and app password as secrets to
   your repo
   
4. Add a workflow to your repo in `repo/.github/workflows`

   ```
   
    name: Publish to WordPress
    on:
    push:
        branches:
        - main
        paths:
        - 'docs/**/*.md'

    jobs:
    publish:
        runs-on: ubuntu-latest
        steps:
        - uses: actions/checkout@v6
            with:
            fetch-depth: 2

        - name: Publish to WordPress
            uses: OpenTechStrategies/wp-post-gfm@main
            with:
              directory: 'docs'
              default_status: 'publish'
            env:
              WP_URL: ${{ secrets.WORDPRESS_URL }}
              WP_USERNAME: ${{ secrets.WORDPRESS_USERNAME }}
              WP_APP_PASSWORD: ${{ secrets.WORDPRESS_APP_PASSWORD }}

  ```
  
  Inputs: 

  * `directory` (required) - where you would like to look for .md files
  * `default_status` - Set to 'draft' by default. Change to 'publish' if
    you want to publish immediately, etc.
