let diffString = '';
let currentView = 'line-by-line';
let comments = [];
let nextCommentId = 1;

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

        openCommentForm(row, file, lineNum, lineNum, side);
    });
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
    label.textContent = file + ' — Line ' + startLine;

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
        formRow.remove();
        renderComment(comment, anchorRow);
    });

    var cancelBtn = document.createElement('button');
    cancelBtn.className = 'rfa-btn rfa-btn-cancel';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', function () {
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
    location.textContent = comment.file + ' — Line ' + comment.startLine;

    var deleteBtn = document.createElement('button');
    deleteBtn.className = 'rfa-btn rfa-btn-delete';
    deleteBtn.textContent = 'Delete';
    deleteBtn.addEventListener('click', function () {
        comments = comments.filter(function (c) { return c.id !== comment.id; });
        commentRow.remove();
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
        var anchorRow = findAnchorRow(comment);
        if (anchorRow) {
            renderComment(comment, anchorRow);
        }
    });
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
