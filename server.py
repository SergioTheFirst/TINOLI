#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Magic Stitch - Local Development Server
Python 3.8+ (compatible with 32-bit Windows 7/10/11)
Only uses Python standard library - no pip install required.
Publishes to GitHub via API - no git installation needed.

Usage: python server.py
"""

import http.server
import json
import os
import sys
import datetime
import shutil
import webbrowser
import threading
import io
import mimetypes
import re
import urllib.parse
import urllib.request
import base64
import hashlib
import time

# ======================== CONFIGURATION ========================

HOST = '0.0.0.0'
PORT = 8000
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
WORKS_DIR = os.path.join(BASE_DIR, 'works')
IMAGES_DIR = os.path.join(WORKS_DIR, 'images')
WORKS_JSON = os.path.join(WORKS_DIR, 'works.json')
CONFIG_JSON = os.path.join(BASE_DIR, 'config.json')
ALLOWED_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.webp'}
MAX_UPLOAD_SIZE = 20 * 1024 * 1024  # 20 MB

# Ensure directories exist
os.makedirs(IMAGES_DIR, exist_ok=True)

# ======================== HELPERS ========================


def read_json(filepath):
    """Read and parse a JSON file."""
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            return json.load(f)
    except (IOError, ValueError):
        return None


def write_json(filepath, data):
    """Write data to a JSON file."""
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def get_timestamp():
    """Get current timestamp string for filenames."""
    return datetime.datetime.now().strftime('%Y%m%d_%H%M%S')


def get_date():
    """Get current date string."""
    return datetime.datetime.now().strftime('%Y-%m-%d')


def safe_filename(name):
    """Create a safe filename."""
    return re.sub(r'[^a-zA-Z0-9_.-]', '', name)


def get_extension(filename):
    """Get file extension in lowercase."""
    _, ext = os.path.splitext(filename)
    return ext.lower()


def generate_sitemap():
    """Generate sitemap.xml from site pages and works."""
    config = read_json(CONFIG_JSON) or {}
    site_url = config.get('site', {}).get('url', 'https://magicstitch.ru')
    today = get_date()

    pages = [
        ('', '1.0', 'weekly'),
        ('gallery.html', '0.9', 'weekly'),
        ('about.html', '0.7', 'monthly'),
        ('contact.html', '0.6', 'monthly'),
    ]

    xml_parts = ['<?xml version="1.0" encoding="UTF-8"?>']
    xml_parts.append('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')

    for path, priority, freq in pages:
        xml_parts.append('  <url>')
        xml_parts.append('    <loc>%s/%s</loc>' % (site_url.rstrip('/'), path))
        xml_parts.append('    <lastmod>%s</lastmod>' % today)
        xml_parts.append('    <changefreq>%s</changefreq>' % freq)
        xml_parts.append('    <priority>%s</priority>' % priority)
        xml_parts.append('  </url>')

    xml_parts.append('</urlset>')
    return '\n'.join(xml_parts)


# ======================== REQUEST HANDLER ========================


class MagicStitchHandler(http.server.SimpleHTTPRequestHandler):
    """Custom HTTP request handler for Magic Stitch."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=BASE_DIR, **kwargs)

    def log_message(self, format, *args):
        """Custom log format."""
        sys.stderr.write("[%s] %s\n" % (
            datetime.datetime.now().strftime('%H:%M:%S'),
            format % args
        ))

    def send_json(self, data, status=200):
        """Send a JSON response."""
        body = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-cache')
        self.end_headers()
        self.wfile.write(body)

    def send_text(self, text, content_type='text/plain', status=200):
        """Send a text response."""
        body = text.encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', content_type + '; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        """Handle GET requests."""
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        # Sitemap
        if path == '/sitemap.xml':
            xml = generate_sitemap()
            self.send_text(xml, 'application/xml')
            return

        # robots.txt
        if path == '/robots.txt':
            config = read_json(CONFIG_JSON) or {}
            site_url = config.get('site', {}).get('url', 'https://magicstitch.ru')
            text = 'User-agent: *\nAllow: /\nDisallow: /admin.html\n\nSitemap: %s/sitemap.xml\n' % site_url.rstrip('/')
            self.send_text(text, 'text/plain')
            return

        # Default page
        if path == '/':
            self.path = '/index.html'

        # Serve static files
        super().do_GET()

    def do_POST(self):
        """Handle POST requests."""
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        if path == '/upload':
            self.handle_upload()
        elif path == '/save-config':
            self.handle_save_config()
        elif path == '/delete-work':
            self.handle_delete_work()
        elif path == '/git-push':
            self.handle_git_push()
        else:
            self.send_json({'error': 'Unknown endpoint'}, 404)

    def handle_upload(self):
        """Handle photo upload."""
        try:
            content_type = self.headers.get('Content-Type', '')
            if 'multipart/form-data' not in content_type:
                self.send_json({'error': 'Invalid content type'}, 400)
                return

            # Parse multipart form data
            content_length = int(self.headers.get('Content-Length', 0))
            if content_length > MAX_UPLOAD_SIZE:
                self.send_json({'error': 'File too large (max 20MB)'}, 400)
                return

            # Read the body
            body = self.rfile.read(content_length)

            # Parse boundary
            boundary = content_type.split('boundary=')[-1].strip()
            if boundary.startswith('"') and boundary.endswith('"'):
                boundary = boundary[1:-1]

            # Parse parts
            parts = parse_multipart(body, boundary.encode('utf-8'))

            # Extract fields
            title = parts.get('title', [b''])[0].decode('utf-8').strip()
            description = parts.get('description', [b''])[0].decode('utf-8').strip()
            category = parts.get('category', [b'brooch'])[0].decode('utf-8').strip()

            if not title:
                self.send_json({'error': 'Title is required'}, 400)
                return

            # Process main photo
            photo_data = parts.get('photo', [None])[0]
            photo_filename = parts.get('photo__filename', [b''])[0]
            if isinstance(photo_filename, bytes):
                photo_filename = photo_filename.decode('utf-8', errors='replace')

            if not photo_data:
                self.send_json({'error': 'Photo is required'}, 400)
                return

            ext = get_extension(photo_filename) or '.jpg'
            if ext not in ALLOWED_EXTENSIONS:
                self.send_json({'error': 'Invalid file type. Allowed: jpg, png, webp'}, 400)
                return

            timestamp = get_timestamp()
            filename = timestamp + ext
            filepath = os.path.join(IMAGES_DIR, filename)

            with open(filepath, 'wb') as f:
                f.write(photo_data)

            # Process hover photo (optional)
            filename_hover = ''
            hover_data = parts.get('photo_hover', [None])[0]
            hover_filename = parts.get('photo_hover__filename', [b''])[0]
            if isinstance(hover_filename, bytes):
                hover_filename = hover_filename.decode('utf-8', errors='replace')

            if hover_data and hover_filename:
                hover_ext = get_extension(hover_filename) or '.jpg'
                if hover_ext in ALLOWED_EXTENSIONS:
                    filename_hover = timestamp + '_hover' + hover_ext
                    hover_path = os.path.join(IMAGES_DIR, filename_hover)
                    with open(hover_path, 'wb') as f:
                        f.write(hover_data)

            # Update works.json
            works_data = read_json(WORKS_JSON) or {'works': []}
            new_work = {
                'id': timestamp,
                'filename': filename,
                'title': title,
                'description': description,
                'category': category,
                'date': get_date()
            }
            if filename_hover:
                new_work['filename_hover'] = filename_hover

            works_data['works'].append(new_work)
            write_json(WORKS_JSON, works_data)

            # Auto-update config.json "updated" date
            config = read_json(CONFIG_JSON)
            if config and 'site' in config:
                config['site']['updated'] = get_date()
                write_json(CONFIG_JSON, config)

            self.log_message('Uploaded: %s (%s)', title, filename)
            self.send_json({'success': True, 'work': new_work})

        except Exception as e:
            self.log_message('Upload error: %s', str(e))
            self.send_json({'error': str(e)}, 500)

    def handle_save_config(self):
        """Handle config.json update."""
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length)
            new_config = json.loads(body.decode('utf-8'))

            # Auto-stamp the update date
            if 'site' in new_config:
                new_config['site']['updated'] = get_date()
            write_json(CONFIG_JSON, new_config)
            self.log_message('Config updated')
            self.send_json({'success': True})

        except Exception as e:
            self.log_message('Config save error: %s', str(e))
            self.send_json({'error': str(e)}, 500)

    def handle_delete_work(self):
        """Handle work deletion."""
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length)
            data = json.loads(body.decode('utf-8'))
            work_id = data.get('id', '')

            if not work_id:
                self.send_json({'error': 'Work ID required'}, 400)
                return

            works_data = read_json(WORKS_JSON) or {'works': []}
            found = None

            for work in works_data['works']:
                if work['id'] == work_id:
                    found = work
                    break

            if not found:
                self.send_json({'error': 'Work not found'}, 404)
                return

            # Remove image files
            img_path = os.path.join(IMAGES_DIR, found['filename'])
            if os.path.exists(img_path):
                os.remove(img_path)

            hover_file = found.get('filename_hover', '')
            if hover_file:
                hover_path = os.path.join(IMAGES_DIR, hover_file)
                if os.path.exists(hover_path):
                    os.remove(hover_path)

            # Remove from list
            works_data['works'] = [w for w in works_data['works'] if w['id'] != work_id]
            write_json(WORKS_JSON, works_data)

            self.log_message('Deleted work: %s', found['title'])
            self.send_json({'success': True})

        except Exception as e:
            self.log_message('Delete error: %s', str(e))
            self.send_json({'error': str(e)}, 500)

    def handle_git_push(self):
        """Publish site to GitHub via API (no git required)."""
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length)
            data = json.loads(body.decode('utf-8'))
            message = data.get('message', 'Update content')

            config = read_json(CONFIG_JSON) or {}
            gh = config.get('github', {})
            token = gh.get('token', '')
            owner = gh.get('owner', '')
            repo = gh.get('repo', '')
            branch = gh.get('branch', 'main')

            if not token:
                self.send_json({
                    'success': False,
                    'error': 'GitHub токен не указан. Откройте вкладку "Настройки" и заполните github.token',
                    'log': 'Ошибка: пустой токен.\n\nКак получить токен:\n'
                           '1. GitHub.com -> Settings -> Developer Settings\n'
                           '2. Personal Access Tokens -> Tokens (classic)\n'
                           '3. Generate New Token\n'
                           '4. Галочка "repo" -> Generate\n'
                           '5. Скопировать токен в настройки сайта (github.token)'
                })
                return

            if not owner or not repo:
                self.send_json({
                    'success': False,
                    'error': 'Не указан github.owner или github.repo в настройках'
                })
                return

            log_lines = []
            log_lines.append('Публикация на GitHub: %s/%s (ветка: %s)' % (owner, repo, branch))

            # Collect all files to upload
            files_to_upload = []
            skip_dirs = {'.git', '__pycache__', '.venv', 'venv'}
            skip_files = {'.gitignore'}

            for root, dirs, files in os.walk(BASE_DIR):
                # Skip hidden and system dirs
                dirs[:] = [d for d in dirs if d not in skip_dirs]
                for fname in files:
                    if fname in skip_files:
                        continue
                    full_path = os.path.join(root, fname)
                    rel_path = os.path.relpath(full_path, BASE_DIR).replace('\\', '/')
                    files_to_upload.append((rel_path, full_path))

            log_lines.append('Найдено файлов: %d' % len(files_to_upload))

            # Get current commit SHA of the branch
            api_base = 'https://api.github.com/repos/%s/%s' % (owner, repo)

            def github_api(method, url, data=None):
                """Make a GitHub API request."""
                req_body = json.dumps(data).encode('utf-8') if data else None
                req = urllib.request.Request(url, data=req_body, method=method)
                req.add_header('Authorization', 'token ' + token)
                req.add_header('Accept', 'application/vnd.github.v3+json')
                req.add_header('User-Agent', 'MagicStitch-Server')
                if req_body:
                    req.add_header('Content-Type', 'application/json')

                for attempt in range(4):
                    try:
                        resp = urllib.request.urlopen(req, timeout=30)
                        return json.loads(resp.read().decode('utf-8'))
                    except urllib.error.HTTPError as e:
                        err_body = e.read().decode('utf-8', errors='replace')
                        if attempt < 3 and e.code in (502, 503, 504):
                            delay = 2 ** (attempt + 1)
                            log_lines.append('GitHub %d, повтор через %dс...' % (e.code, delay))
                            time.sleep(delay)
                            continue
                        raise Exception('GitHub API %d: %s' % (e.code, err_body))
                    except urllib.error.URLError as e:
                        if attempt < 3:
                            delay = 2 ** (attempt + 1)
                            log_lines.append('Сетевая ошибка, повтор через %dс...' % delay)
                            time.sleep(delay)
                            continue
                        raise Exception('Ошибка сети: %s' % str(e.reason))

            # Step 1: Get the latest commit on the branch
            log_lines.append('Получаем текущий коммит...')
            ref_data = github_api('GET', '%s/git/ref/heads/%s' % (api_base, branch))
            latest_sha = ref_data['object']['sha']
            log_lines.append('Текущий коммит: %s' % latest_sha[:7])

            # Step 2: Get the tree of the latest commit
            commit_data = github_api('GET', '%s/git/commits/%s' % (api_base, latest_sha))
            base_tree_sha = commit_data['tree']['sha']

            # Step 3: Create blobs for each file
            log_lines.append('Загружаем файлы...')
            tree_items = []
            uploaded = 0

            for rel_path, full_path in files_to_upload:
                # Read file content
                with open(full_path, 'rb') as f:
                    content_bytes = f.read()

                # Create blob
                b64_content = base64.b64encode(content_bytes).decode('ascii')
                blob = github_api('POST', '%s/git/blobs' % api_base, {
                    'content': b64_content,
                    'encoding': 'base64'
                })

                tree_items.append({
                    'path': rel_path,
                    'mode': '100644',
                    'type': 'blob',
                    'sha': blob['sha']
                })

                uploaded += 1
                if uploaded % 5 == 0:
                    log_lines.append('  загружено: %d / %d' % (uploaded, len(files_to_upload)))

            log_lines.append('Все файлы загружены: %d' % uploaded)

            # Step 4: Create new tree
            log_lines.append('Создаём дерево файлов...')
            new_tree = github_api('POST', '%s/git/trees' % api_base, {
                'tree': tree_items
            })

            # Step 5: Create new commit
            log_lines.append('Создаём коммит...')
            new_commit = github_api('POST', '%s/git/commits' % api_base, {
                'message': message,
                'tree': new_tree['sha'],
                'parents': [latest_sha]
            })
            log_lines.append('Новый коммит: %s' % new_commit['sha'][:7])

            # Step 6: Update branch reference
            log_lines.append('Обновляем ветку...')
            github_api('PATCH', '%s/git/refs/heads/%s' % (api_base, branch), {
                'sha': new_commit['sha']
            })

            log_lines.append('')
            log_lines.append('Опубликовано!')
            log_text = '\n'.join(log_lines)

            self.send_json({'success': True, 'log': log_text})

        except Exception as e:
            self.log_message('GitHub push error: %s', str(e))
            self.send_json({'error': str(e), 'log': '\n'.join(log_lines) if 'log_lines' in dir() else str(e)}, 500)


def parse_multipart(body, boundary):
    """
    Parse multipart form data manually.
    Returns dict: field_name -> [value], field_name__filename -> [filename]
    """
    result = {}
    delimiter = b'--' + boundary
    parts = body.split(delimiter)

    for part in parts:
        if not part or part == b'--\r\n' or part == b'--':
            continue

        # Split headers from body
        if b'\r\n\r\n' in part:
            header_section, part_body = part.split(b'\r\n\r\n', 1)
        elif b'\n\n' in part:
            header_section, part_body = part.split(b'\n\n', 1)
        else:
            continue

        # Remove trailing \r\n
        if part_body.endswith(b'\r\n'):
            part_body = part_body[:-2]

        # Parse Content-Disposition
        header_text = header_section.decode('utf-8', errors='replace')
        name_match = re.search(r'name="([^"]*)"', header_text)
        filename_match = re.search(r'filename="([^"]*)"', header_text)

        if not name_match:
            continue

        field_name = name_match.group(1)
        result.setdefault(field_name, []).append(part_body)

        if filename_match:
            fname = filename_match.group(1)
            result.setdefault(field_name + '__filename', []).append(fname.encode('utf-8'))

    return result


# ======================== MAIN ========================


def main():
    """Start the server."""
    # Ensure works.json exists
    if not os.path.exists(WORKS_JSON):
        write_json(WORKS_JSON, {'works': []})

    # Ensure config.json exists
    if not os.path.exists(CONFIG_JSON):
        print('Warning: config.json not found!')

    server = http.server.HTTPServer((HOST, PORT), MagicStitchHandler)
    url = 'http://localhost:%d' % PORT

    print('')
    print('  ====================================')
    print('       Magic Stitch Server')
    print('  ====================================')
    print('')
    print('  Site:    %s' % url)
    print('  Admin:   %s/admin.html' % url)
    print('  Dir:     %s' % BASE_DIR)
    print('')
    print('  Press Ctrl+C to stop')
    print('')

    # Open browser after a short delay
    def open_browser():
        import time
        time.sleep(1)
        webbrowser.open(url)

    threading.Thread(target=open_browser, daemon=True).start()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\n  Server stopped.')
        server.server_close()


if __name__ == '__main__':
    main()
