let diffString = '';
let currentView = 'line-by-line';
let comments = [];
let nextCommentId = 1;
let rangeStart = null; // { row, file, line, side }

function updateCommentCount() {
    var countEl = document.getElementById('comment-count');
    var n = comments.length;
    countEl.textContent = n + (n === 1 ? ' comment' : ' comments');
}

function renderDiff() {
    const container = document.getElementById('diff-container');
    if (!diffString.trim()) {
        container.innerHTML =
            '<div class="empty-state">' +
            '<h2>No changes</h2>' +
            '<p>No uncommitted changes found. Make some changes and refresh.</p>' +
            '</div>';
        return;
    }

    container.innerHTML = '';
    const diff2htmlUi = new Diff2HtmlUI(container, diffString, {
        drawFileList: true,
        fileListToggle: true,
        fileListStartVisible: true,
        fileContentToggle: false,
        matching: 'lines',
        outputFormat: currentView,
        synchronisedScroll: true,
        highlight: true,
        renderNothingWhenEmpty: false,
    });
    diff2htmlUi.draw();
    diff2htmlUi.highlightCode();
    attachLineClickHandlers();
    addFileCommentButtons();
    rerenderAllComments();
}

function getFileForElement(el) {
    var fileWrapper = el.closest('.d2h-file-wrapper');
    if (!fileWrapper) return null;
    var nameEl = fileWrapper.querySelector('.d2h-file-name');
    return nameEl ? nameEl.textContent.trim() : null;
}

function getSideForLineNumber(td) {
    if (currentView === 'line-by-line') {
        if (td.classList.contains('d2h-code-linenumber')) {
            var row = td.closest('tr');
            var lineEl = row ? row.querySelector('.d2h-code-side-linenumber') : null;
            if (lineEl) return 'right';
        }
        var codeLine = td.closest('tr').querySelector('.d2h-code-line-ctn');
        if (!codeLine) return 'right';
        var prefix = codeLine.querySelector('.d2h-code-line-prefix');
        if (prefix) {
            var p = prefix.textContent;
            if (p === '-') return 'left';
        }
        return 'right';
    }
    var sideEl = td.closest('.d2h-code-side-line, .d2h-code-line');
    if (!sideEl) return 'right';
    var wrapper = td.closest('.d2h-file-side-diff');
    if (!wrapper) return 'right';
    var allSides = td.closest('.d2h-file-wrapper').querySelectorAll('.d2h-file-side-diff');
    if (allSides.length === 2 && wrapper === allSides[0]) return 'left';
    return 'right';
}

function getLineNumber(td) {
    var text = td.textContent.trim();
    var num = parseInt(text, 10);
    return isNaN(num) ? null : num;
}

function attachLineClickHandlers() {
    var container = document.getElementById('diff-container');
    container.addEventListener('click', function (e) {
        var td = e.target.closest('.d2h-code-linenumber, .d2h-code-side-linenumber');
        if (!td) return;
        var lineNum = getLineNumber(td);
        if (lineNum === null) return;

        var file = getFileForElement(td);
        if (!file) return;

        var side = getSideForLineNumber(td);
        var row = td.closest('tr');
        if (!row) return;

        if (row.nextElementSibling && row.nextElementSibling.classList.contains('rfa-comment-form-row')) {
            return;
        }

        if (e.shiftKey && rangeStart && rangeStart.file === file) {
            var startLine = Math.min(rangeStart.line, lineNum);
            var endLine = Math.max(rangeStart.line, lineNum);
            var startRow = startLine === rangeStart.line ? rangeStart.row : row;
            var endRow = startLine === rangeStart.line ? row : rangeStart.row;
            clearRangeHighlight();
            highlightRange(startRow, endRow);
            openCommentForm(endRow, file, startLine, endLine, side);
            rangeStart = null;
        } else {
            clearRangeHighlight();
            rangeStart = { row: row, file: file, line: lineNum, side: side };
            row.classList.add('rfa-range-highlight');
            openCommentForm(row, file, lineNum, lineNum, side);
        }
    });
}

function highlightRange(startRow, endRow) {
    var current = startRow;
    while (current) {
        if (current.tagName === 'TR' && !current.classList.contains('rfa-comment-form-row') && !current.classList.contains('rfa-comment-row')) {
            current.classList.add('rfa-range-highlight');
        }
        if (current === endRow) break;
        current = current.nextElementSibling;
    }
}

function clearRangeHighlight() {
    var highlighted = document.querySelectorAll('.rfa-range-highlight');
    highlighted.forEach(function (el) { el.classList.remove('rfa-range-highlight'); });
}

function addFileCommentButtons() {
    var fileHeaders = document.querySelectorAll('.d2h-file-header');
    fileHeaders.forEach(function (header) {
        if (header.querySelector('.rfa-file-comment-btn')) return;
        var btn = document.createElement('button');
        btn.className = 'rfa-btn rfa-file-comment-btn';
        btn.textContent = '+ File comment';
        btn.addEventListener('click', function (e) {
            e.stopPropagation();
            var fileWrapper = header.closest('.d2h-file-wrapper');
            if (!fileWrapper) return;
            var nameEl = fileWrapper.querySelector('.d2h-file-name');
            var file = nameEl ? nameEl.textContent.trim() : null;
            if (!file) return;
            openFileCommentForm(fileWrapper, file);
        });
        header.appendChild(btn);
    });
}

function openFileCommentForm(fileWrapper, file) {
    closeAllFileCommentForms();

    var formDiv = document.createElement('div');
    formDiv.className = 'rfa-file-comment-form-wrapper';

    var form = document.createElement('div');
    form.className = 'rfa-comment-form';

    var label = document.createElement('div');
    label.className = 'rfa-comment-form-label';
    label.textContent = file + ' — (file-level)';

    var textarea = document.createElement('textarea');
    textarea.className = 'rfa-comment-textarea';
    textarea.placeholder = 'Leave a file-level comment...';
    textarea.rows = 3;

    var actions = document.createElement('div');
    actions.className = 'rfa-comment-actions';

    var saveBtn = document.createElement('button');
    saveBtn.className = 'rfa-btn rfa-btn-save';
    saveBtn.textContent = 'Save';
    saveBtn.addEventListener('click', function () {
        var body = textarea.value.trim();
        if (!body) return;
        var comment = {
            id: nextCommentId++,
            file: file,
            startLine: null,
            endLine: null,
            side: 'right',
            body: body,
        };
        comments.push(comment);
        formDiv.remove();
        renderFileComment(comment, fileWrapper);
        updateCommentCount();
    });

    var cancelBtn = document.createElement('button');
    cancelBtn.className = 'rfa-btn rfa-btn-cancel';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', function () {
        formDiv.remove();
    });

    actions.appendChild(cancelBtn);
    actions.appendChild(saveBtn);
    form.appendChild(label);
    form.appendChild(textarea);
    form.appendChild(actions);
    formDiv.appendChild(form);

    var header = fileWrapper.querySelector('.d2h-file-header');
    header.parentNode.insertBefore(formDiv, header.nextSibling);
    textarea.focus();
}

function closeAllFileCommentForms() {
    var forms = document.querySelectorAll('.rfa-file-comment-form-wrapper');
    forms.forEach(function (f) { f.remove(); });
}

function renderFileComment(comment, fileWrapper) {
    var card = document.createElement('div');
    card.className = 'rfa-file-comment-card';
    card.setAttribute('data-comment-id', comment.id);

    var header = document.createElement('div');
    header.className = 'rfa-comment-header';

    var location = document.createElement('span');
    location.className = 'rfa-comment-location';
    location.textContent = comment.file + ' — (file-level)';

    var deleteBtn = document.createElement('button');
    deleteBtn.className = 'rfa-btn rfa-btn-delete';
    deleteBtn.textContent = 'Delete';
    deleteBtn.addEventListener('click', function () {
        comments = comments.filter(function (c) { return c.id !== comment.id; });
        card.remove();
        updateCommentCount();
    });

    header.appendChild(location);
    header.appendChild(deleteBtn);

    var body = document.createElement('div');
    body.className = 'rfa-comment-body';
    body.textContent = comment.body;

    card.appendChild(header);
    card.appendChild(body);

    var fileHeader = fileWrapper.querySelector('.d2h-file-header');
    var insertAfter = fileHeader;
    var next = fileHeader.nextElementSibling;
    while (next && next.classList.contains('rfa-file-comment-card')) {
        insertAfter = next;
        next = next.nextElementSibling;
    }
    insertAfter.parentNode.insertBefore(card, insertAfter.nextSibling);
}

function formatLineRef(startLine, endLine) {
    if (startLine === null) return '(file-level)';
    if (endLine !== null && endLine !== startLine) return 'Lines ' + startLine + '–' + endLine;
    return 'Line ' + startLine;
}

function openCommentForm(anchorRow, file, startLine, endLine, side) {
    closeAllCommentForms();

    var formRow = document.createElement('tr');
    formRow.className = 'rfa-comment-form-row';

    var td = document.createElement('td');
    td.colSpan = 20;
    td.className = 'rfa-comment-form-cell';

    var form = document.createElement('div');
    form.className = 'rfa-comment-form';

    var label = document.createElement('div');
    label.className = 'rfa-comment-form-label';
    label.textContent = file + ' — ' + formatLineRef(startLine, endLine);

    var textarea = document.createElement('textarea');
    textarea.className = 'rfa-comment-textarea';
    textarea.placeholder = 'Leave a comment...';
    textarea.rows = 3;

    var actions = document.createElement('div');
    actions.className = 'rfa-comment-actions';

    var saveBtn = document.createElement('button');
    saveBtn.className = 'rfa-btn rfa-btn-save';
    saveBtn.textContent = 'Save';
    saveBtn.addEventListener('click', function () {
        var body = textarea.value.trim();
        if (!body) return;
        var comment = {
            id: nextCommentId++,
            file: file,
            startLine: startLine,
            endLine: endLine,
            side: side,
            body: body,
        };
        comments.push(comment);
        clearRangeHighlight();
        formRow.remove();
        renderComment(comment, anchorRow);
        updateCommentCount();
    });

    var cancelBtn = document.createElement('button');
    cancelBtn.className = 'rfa-btn rfa-btn-cancel';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', function () {
        clearRangeHighlight();
        rangeStart = null;
        formRow.remove();
    });

    actions.appendChild(cancelBtn);
    actions.appendChild(saveBtn);
    form.appendChild(label);
    form.appendChild(textarea);
    form.appendChild(actions);
    td.appendChild(form);
    formRow.appendChild(td);

    anchorRow.parentNode.insertBefore(formRow, anchorRow.nextSibling);
    textarea.focus();
}

function closeAllCommentForms() {
    var forms = document.querySelectorAll('.rfa-comment-form-row');
    forms.forEach(function (f) { f.remove(); });
}

function renderComment(comment, anchorRow) {
    var commentRow = document.createElement('tr');
    commentRow.className = 'rfa-comment-row';
    commentRow.setAttribute('data-comment-id', comment.id);

    var td = document.createElement('td');
    td.colSpan = 20;
    td.className = 'rfa-comment-cell';

    var card = document.createElement('div');
    card.className = 'rfa-comment-card';

    var header = document.createElement('div');
    header.className = 'rfa-comment-header';

    var location = document.createElement('span');
    location.className = 'rfa-comment-location';
    location.textContent = comment.file + ' — ' + formatLineRef(comment.startLine, comment.endLine);

    var deleteBtn = document.createElement('button');
    deleteBtn.className = 'rfa-btn rfa-btn-delete';
    deleteBtn.textContent = 'Delete';
    deleteBtn.addEventListener('click', function () {
        comments = comments.filter(function (c) { return c.id !== comment.id; });
        commentRow.remove();
        updateCommentCount();
    });

    header.appendChild(location);
    header.appendChild(deleteBtn);

    var body = document.createElement('div');
    body.className = 'rfa-comment-body';
    body.textContent = comment.body;

    card.appendChild(header);
    card.appendChild(body);
    td.appendChild(card);
    commentRow.appendChild(td);

    var insertAfter = anchorRow;
    var next = anchorRow.nextElementSibling;
    while (next && next.classList.contains('rfa-comment-row')) {
        insertAfter = next;
        next = next.nextElementSibling;
    }
    insertAfter.parentNode.insertBefore(commentRow, insertAfter.nextSibling);
}

function findAnchorRow(comment) {
    var container = document.getElementById('diff-container');
    var fileWrappers = container.querySelectorAll('.d2h-file-wrapper');
    for (var i = 0; i < fileWrappers.length; i++) {
        var nameEl = fileWrappers[i].querySelector('.d2h-file-name');
        if (!nameEl || nameEl.textContent.trim() !== comment.file) continue;

        var lineNumberCells = fileWrappers[i].querySelectorAll(
            '.d2h-code-linenumber, .d2h-code-side-linenumber'
        );
        for (var j = 0; j < lineNumberCells.length; j++) {
            if (getLineNumber(lineNumberCells[j]) === comment.startLine) {
                return lineNumberCells[j].closest('tr');
            }
        }
    }
    return null;
}

function rerenderAllComments() {
    comments.forEach(function (comment) {
        if (comment.startLine === null) {
            var fileWrapper = findFileWrapper(comment.file);
            if (fileWrapper) renderFileComment(comment, fileWrapper);
        } else {
            var anchorRow = findAnchorRow(comment);
            if (anchorRow) renderComment(comment, anchorRow);
        }
    });
}

function findFileWrapper(fileName) {
    var container = document.getElementById('diff-container');
    var fileWrappers = container.querySelectorAll('.d2h-file-wrapper');
    for (var i = 0; i < fileWrappers.length; i++) {
        var nameEl = fileWrappers[i].querySelector('.d2h-file-name');
        if (nameEl && nameEl.textContent.trim() === fileName) return fileWrappers[i];
    }
    return null;
}

document.getElementById('unified-btn').addEventListener('click', function () {
    currentView = 'line-by-line';
    this.classList.add('active');
    document.getElementById('split-btn').classList.remove('active');
    renderDiff();
});

document.getElementById('split-btn').addEventListener('click', function () {
    currentView = 'side-by-side';
    this.classList.add('active');
    document.getElementById('unified-btn').classList.remove('active');
    renderDiff();
});

fetch('/api/diff')
    .then(function (res) {
        if (!res.ok) throw new Error('Failed to fetch diff');
        return res.text();
    })
    .then(function (diff) {
        diffString = diff;
        renderDiff();
    })
    .catch(function (err) {
        document.getElementById('diff-container').innerHTML =
            '<div class="empty-state">' +
            '<h2>Error</h2>' +
            '<p>' + err.message + '</p>' +
            '</div>';
    });

document.getElementById('submit-btn').addEventListener('click', function () {
    var globalComment = document.getElementById('global-comment').value.trim();
    if (comments.length === 0 && !globalComment) {
        alert('No comments to submit');
        return;
    }
    var payload = {
        diff: diffString,
        globalComment: globalComment || '',
        comments: comments.map(function (c) {
            return {
                file: c.file,
                startLine: c.startLine,
                endLine: c.endLine,
                side: c.side,
                body: c.body,
            };
        }),
    };
    fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    })
        .then(function (res) {
            if (!res.ok) return res.text().then(function (t) { throw new Error(t); });
            return res.json();
        })
        .then(function (data) {
            var submitBar = document.getElementById('submit-bar');
            var submitBtn = document.getElementById('submit-btn');
            submitBtn.disabled = true;
            submitBar.classList.add('submitted');
            submitBar.innerHTML =
                '<span class="comment-count">Review submitted — ' + data.mdPath + '</span>' +
                '<button class="rfa-btn rfa-btn-save submit-btn" disabled>Submit Review</button>';
        })
        .catch(function (err) {
            alert(err.message);
        });
});
