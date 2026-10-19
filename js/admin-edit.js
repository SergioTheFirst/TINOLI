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

/* Photo rows of the edit modal: slot for /update-work-photo, works.json key,
   label, max width for compression (the detail photo feeds the zoom loupe) */
var EDIT_PHOTO_SLOTS = [
  { slot: 'main', key: 'filename', label: 'Украшение', width: 1500, removable: false },
  { slot: 'hover', key: 'filename_hover', label: 'Как носится', width: 1500, removable: true },
  { slot: 'detail', key: 'filename_detail', label: 'Деталь', width: 2200, removable: true }
];

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
      document.getElementById('edit-materials').value = work.materials || '';
      document.getElementById('edit-size').value = work.size || '';
      var yearInput = document.getElementById('edit-year');
      yearInput.value = work.year || '';
      yearInput.placeholder = String(new Date().getFullYear());
      renderEditPhotos(work);
      el.classList.add('active');
    })
    .catch(function(err) {
      showMessage('Ошибка: ' + err.message, 'error');
    });
};

/* Photo block: thumbnail or «нет», replace (file input) and remove buttons */
function renderEditPhotos(work) {
  var box = document.getElementById('edit-photos');
  if (!box) return;
  box.innerHTML = '';

  EDIT_PHOTO_SLOTS.forEach(function(cfg) {
    var file = work[cfg.key];
    var row = document.createElement('div');
    row.className = 'edit-photo-row';

    var label = document.createElement('span');
    label.className = 'edit-photo-label';
    label.textContent = cfg.label;
    row.appendChild(label);

    if (file) {
      var img = document.createElement('img');
      img.src = '/works/images/' + encodeURIComponent(file);
      img.alt = cfg.label;
      row.appendChild(img);
    } else {
      var none = document.createElement('span');
      none.className = 'edit-photo-none';
      none.textContent = 'нет';
      row.appendChild(none);
    }

    var pick = document.createElement('label');
    pick.className = 'btn file-btn';
    pick.appendChild(document.createTextNode(file ? 'Заменить' : 'Добавить'));
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/png,image/webp';
    input.addEventListener('change', function() {
      var chosen = input.files && input.files[0];
      if (chosen) replaceWorkPhoto(work.id, cfg, chosen);
    });
    pick.appendChild(input);
    row.appendChild(pick);

    if (cfg.removable && file) {
      var removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'btn btn-danger';
      removeBtn.textContent = 'Убрать';
      removeBtn.addEventListener('click', function() { removeWorkPhoto(work.id, cfg); });
      row.appendChild(removeBtn);
    }

    box.appendChild(row);
  });
}

/* Compress like the upload form, then send to /update-work-photo */
function replaceWorkPhoto(id, cfg, file) {
  showMessage('Загружаем фото «' + cfg.label + '»...', 'success');
  compressImage(file, cfg.width, 0.85, function(blob) {
    if (!blob) return;
    var formData = new FormData();
    formData.append('id', id);
    formData.append('slot', cfg.slot);
    formData.append('photo', new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' }));
    sendPhotoChange(formData, 'Фото «' + cfg.label + '» заменено');
  });
}

function removeWorkPhoto(id, cfg) {
  if (!confirm('Убрать фото «' + cfg.label + '»?')) return;
  var formData = new FormData();
  formData.append('id', id);
  formData.append('slot', cfg.slot);
  formData.append('remove', '1');
  sendPhotoChange(formData, 'Фото «' + cfg.label + '» убрано');
}

function sendPhotoChange(formData, okText) {
  fetch('/update-work-photo', { method: 'POST', headers: { 'X-TINOLI': 'admin' }, body: formData })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data.success) {
        showMessage(okText + (data.warning ? '. Внимание: ' + data.warning : ''), 'success');
        renderEditPhotos(data.work);
        loadWorksList();
      } else {
        showMessage('Ошибка: ' + (data.error || 'Неизвестная ошибка'), 'error');
      }
    })
    .catch(function(err) {
      showMessage('Ошибка: ' + err.message, 'error');
    });
}

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
  var materials = document.getElementById('edit-materials').value.trim();
  var size = document.getElementById('edit-size').value.trim();
  var year = document.getElementById('edit-year').value.trim();

  if (!title) { showMessage('Введите название', 'error'); return; }
  if (year && !isValidYear(year)) { showMessage('Год: четыре цифры от 1900 до 2100', 'error'); return; }

  fetch('/update-work', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-TINOLI': 'admin' },
    body: JSON.stringify({
      id: id,
      title: title,
      description: description,
      category: category,
      materials: materials,
      size: size,
      year: year
    })
  })
  .then(function(r) { return r.json(); })
  .then(function(data) {
    if (data.success) {
      showMessage('Работа обновлена' + (data.warning ? '. Внимание: ' + data.warning : ''), 'success');
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
