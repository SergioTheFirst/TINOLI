# Real-Time Console Logging Fix

**Date:** 2026-05-06
**Status:** Fixed & Deployed
**Component:** Local Dev Server (`server.py`)

## Problem

Server console window (`python server.py`) displayed the startup banner but showed **no request logs** when users accessed pages, uploaded files, or triggered GitHub publish. The window appeared "frozen" after the banner.

### Root Cause

`server.py` implemented a custom `log_message()` method using `sys.stderr.write()` without calling `.flush()`:

```python
# BEFORE (broken — buffered output)
def log_message(self, format, *args):
    sys.stderr.write("[%s] %s\n" % (
        datetime.datetime.now().strftime('%H:%M:%S'),
        format % args
    ))
```

On Windows, `sys.stderr` is **fully buffered** when redirected or running inside certain console environments. Log lines accumulated in the buffer and were never rendered until the process terminated.

Additionally, `do_GET()` and `do_POST()` had **no explicit request logging** at their entry points. Only internal event logs (e.g., "Uploaded:", "Config updated") existed, but those were also trapped in the buffer.

### Secondary Issue — Banner Prints

Startup banner and shutdown message used plain `print()` without `flush=True`, which also suffered from default stdout buffering in Windows cmd:

```python
# BEFORE
print('  ====================================')
print('       Magic Stitch Server')
```

## Solution

### 1. Replace `sys.stderr.write` with `print(..., flush=True)`

```python
# AFTER (immediate output)
def log_message(self, format, *args):
    msg = "[%s] %s" % (
        datetime.datetime.now().strftime('%H:%M:%S'),
        format % args
    )
    print(msg, flush=True)
```

`flush=True` forces the Python stdout buffer to empty immediately, bypassing OS-level buffering.

### 2. Add Explicit Request Entry Logging

```python
def do_GET(self):
    self.log_message('GET %s', self.path)
    ...

def do_POST(self):
    self.log_message('POST %s', self.path)
    ...
```

Every HTTP request now shows a timestamped line the moment it arrives:

```
[14:35:36] GET /admin.html
[14:35:36] GET /admin.css
[14:35:37] POST /upload
[14:35:37] Uploaded: Test work (20260506_143315.jpg)
[14:35:40] POST /git-push
[14:35:42] Все файлы загружены: 12
[14:35:43] Новый коммит: a1b2c3d
[14:35:43] GitHub push OK
```

### 3. Flush All Banner Prints

```python
print('', flush=True)
print('  ====================================', flush=True)
print('       Magic Stitch Server', flush=True)
```

## Testing

- ✅ `python -m py_compile server.py` — syntax valid
- ✅ `localhost:8000` responsive — banner prints instantly
- ✅ `GET /index.html` — request log appears immediately
- ✅ `POST /upload` — request + event logs appear in real time
- ✅ `POST /git-push` — full step-by-step GitHub push log visible live

## Files Changed

- `server.py` — `log_message()` override, `do_GET`/`do_POST` entry logs, banner `flush=True`

## Backward Compatibility

✅ No API changes
✅ No dependency changes
✅ No behavior changes except log visibility

## Deployment Notes

Existing local copies (e.g., `C:\SITE\TINOLI-main`) must be synced with GitHub main to receive the fix. Use the provided `hard-pull-tinoli.bat` or `git pull` + `git reset --hard origin/main`.

## Related

- `docs/superpowers/specs/2026-05-06-github-publish-base-tree-fix.md` — related GitHub push fix
- `docs/superpowers/specs/2026-05-06-image-compression-memory-safety.md` — related admin panel fix
