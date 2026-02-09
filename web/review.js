let diffString = '';
let currentView = 'line-by-line';

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
