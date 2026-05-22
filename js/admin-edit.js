/* ============================================================
   TINOLI — Admin Panel: Publish Button + Edit Work Modal
   ============================================================ */

/* Switch to deploy tab from header button */
window.switchToDeploy = function() {
  document.querySelectorAll('.admin-tab').forEach(function(t) { t.classList.remove('active'); });
  document.querySelectorAll('.tab-content').forEach(function(t) { t.classList.remove('active'); });
  var deployTab = document.querySelector('.admin-tab[data-tab="deploy"]');
  if (deployTab) deployTab.classList.add('active');
  var deployContent = document.getElementById('tab-deploy');
  if (deployContent) {
    deployContent.classList.add('active');
    deployContent.scrollIntoView({ behavior: 'smooth' });
  }
};

/* Open edit modal for a work */
window.editWork = function(id) {
  var el = document.getElementById('edit-modal');
  if (!el) return;
  fetch('/works/works.json?t=' + Date.now())
    .then(function(r) { return r.json(); })
    .then(function(data) {
      var works = data.works || [];
      var work = null;
      for (var i = 0; i < works.length; i++) {
        if (works[i].id === id) { work = works[i]; break; }
      }
      if (!work) { showMessage('Работа не найдена', 'error'); return; }
      document.getElementById('edit-work-id').value = work.id;
      document.getElementById('edit-title').value = work.title || '';
      document.getElementById('edit-description').value = work.description || '';
      document.getElementById('edit-category').value = work.category || 'other';
      el.classList.add('active');
    });
};

/* Close edit modal */
window.closeEditModal = function() {
  var el = document.getElementById('edit-modal');
  if (el) el.classList.remove('active');
};

/* Save edited work */
window.saveEdit = function() {
  var id = document.getElementById('edit-work-id').value;
  var title = document.getElementById('edit-title').value.trim();
  var description = document.getElementById('edit-description').value.trim();
  var category = document.getElementById('edit-category').value;

  if (!title) { showMessage('Введите название', 'error'); return; }

  fetch('/update-work', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: id, title: title, description: description, category: category })
  })
  .then(function(r) { return r.json(); })
  .then(function(data) {
    if (data.success) {
      showMessage('Работа обновлена', 'success');
      closeEditModal();
      loadWorksList();
    } else {
      showMessage('Ошибка: ' + (data.error || 'Неизвестная ошибка'), 'error');
    }
  })
  .catch(function(err) {
    showMessage('Ошибка: ' + err.message, 'error');
  });
};
