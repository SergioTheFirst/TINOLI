# GitHub Publish Bug Fix — Missing base_tree Parameter

**Date:** 2026-05-06
**Status:** Fixed & Deployed
**Component:** Admin Panel UX + GitHub Push API (server.py)

## Problem

GitHub publishing (`/git-push`) silently failed or produced broken repository state. Two distinct issues were identified:

### Issue 1 — UX Ambiguity (admin.html)

The upload form button was labeled **«Опубликовать»** and showed success message **«Работа добавлена на сайт!»**. This misled users into believing the work was published to GitHub, when in fact `/upload` only saves files **locally** (`works/images/` + `works/works.json`). GitHub push requires a separate action via the **«Опубликовать на GitHub»** button in the Publication tab.

**Impact:** User confusion, false sense of completion, works never appearing on the live site.

### Issue 2 — API Bug (server.py)

The GitHub tree creation API call (`POST /repos/{owner}/{repo}/git/trees`) was missing the `base_tree` parameter:

```python
# BEFORE (broken)
new_tree = github_api('POST', '%s/git/trees' % api_base, {
    'tree': tree_items
})
```

Without `base_tree`, GitHub creates a **new empty tree** and only adds the files explicitly listed in `tree_items`. This causes:

1. **Repository data loss** — any files in the repo not included in `tree_items` are effectively orphaned from the new commit
2. **Broken commit history** — the new commit points to an incomplete tree
3. **Silent failure mode** — the API returns HTTP 200, so the bug is invisible unless the repo is inspected

Additionally, error responses from `/git-push` did not include `'success': False`, making client-side error handling unreliable.

## Solution

### Changes Implemented

#### 1. UX Fix — Clear Labeling (admin.html)

```diff
- <button type="submit" class="btn">Опубликовать</button>
+ <button type="submit" class="btn">Сохранить работу</button>

- submitBtn.textContent = 'Загрузка...';
+ submitBtn.textContent = 'Сохранение...';

- showMessage('Работа добавлена на сайт!', 'success');
+ showMessage('Работа сохранена локально! Чтобы появилась на сайте, опубликуйте на GitHub.', 'success');
```

**Why:** Explicitly separates the two-step workflow (local save → GitHub publish) and sets correct user expectations.

#### 2. API Fix — Add base_tree (server.py)

```diff
  new_tree = github_api('POST', '%s/git/trees' % api_base, {
+     'base_tree': base_tree_sha,
      'tree': tree_items
  })
```

**Why:** `base_tree` instructs GitHub to inherit all existing files from the previous commit and overlay only the changes in `tree_items`. This preserves the full repository state across pushes.

#### 3. API Fix — Consistent Error Response (server.py)

```diff
- self.send_json({'error': str(e), 'log': '...'}, 500)
+ self.send_json({'success': False, 'error': str(e), 'log': '...'}, 500)
```

**Why:** Allows the frontend to reliably detect failure via `data.success === false` instead of inferring from HTTP status alone.

## Root Cause Analysis

| Layer | Root Cause | Detection Method |
|-------|-----------|-----------------|
| UX | Ambiguous CTA label | User feedback / workflow confusion |
| API | Omitted `base_tree` parameter | Code review of `server.py` handle_git_push |
| API | Inconsistent response schema | Static analysis of error handler |

## Testing

- ✅ Syntax validation: `python -m py_compile server.py` passes
- ✅ Server responsiveness: `localhost:8000` returns HTTP 200
- ✅ Local upload: image saved to `works/images/`, entry added to `works.json`
- ✅ Frontend message: correctly displays two-step workflow hint
- ✅ GitHub tree creation: `base_tree` parameter now present in API payload
- ✅ Error response: `success: False` included in exception handler

## Deployment

- Client update: `admin.html`
- Server update: `server.py`
- No external dependencies or breaking changes

## Backward Compatibility

✅ Upload flow unchanged (only labels and messages modified)
✅ GitHub push now safer (preserves repo files instead of replacing tree)
✅ Error responses more predictable for frontend consumers
