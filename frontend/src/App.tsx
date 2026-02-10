import { FileDiff } from "@pierre/diffs/react";
import { type DiffLineAnnotation, type FileDiffMetadata, type FileDiffOptions } from "@pierre/diffs";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchDiff, submitComments } from "./api";
import {
  annotationSideToCommentSide,
  createLineAnnotations,
  createSelectedRange,
  parsePatchToFileDiffs,
} from "./diffAdapter";
import type { AnnotationMeta, DraftComment, ReviewComment, Side, SubmitComment } from "./types";

type DiffView = "unified" | "split";

type RangeAnchor = {
  file: string;
  line: number;
  side: Side;
};

type CommentsByFile = Map<string, { line: ReviewComment[]; file: ReviewComment[] }>;

function isPrimarySubmitHotkey(event: { key: string; metaKey: boolean; ctrlKey: boolean }): boolean {
  return event.key === "Enter" && (event.metaKey || event.ctrlKey);
}

function formatLineRef(startLine: number | null, endLine: number | null): string {
  if (startLine === null) {
    return "(file-level)";
  }

  if (endLine !== null && endLine !== startLine) {
    return `Lines ${startLine}-${endLine}`;
  }

  return `Line ${startLine}`;
}

function getFileName(fileDiff: FileDiffMetadata): string {
  return fileDiff.name || fileDiff.prevName || "(unknown file)";
}

function getFileStats(fileDiff: FileDiffMetadata): { additions: number; deletions: number } {
  let additions = 0;
  let deletions = 0;

  for (const hunk of fileDiff.hunks) {
    additions += hunk.additionLines;
    deletions += hunk.deletionLines;
  }

  return { additions, deletions };
}

function getCommentsForFile(commentsByFile: CommentsByFile, file: string) {
  return commentsByFile.get(file) ?? { line: [], file: [] };
}

function InlineDraftAnnotation({
  draft,
  onSave,
  onCancel,
}: {
  draft: DraftComment;
  onSave: (body: string) => void;
  onCancel: () => void;
}) {
  const [body, setBody] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const handleSave = () => {
    const trimmed = body.trim();
    if (!trimmed) {
      return;
    }
    onSave(trimmed);
  };

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  return (
    <div className="rfa-comment-form">
      <div className="rfa-comment-form-label">
        {draft.file} - {formatLineRef(draft.startLine, draft.endLine)}
      </div>
      <textarea
        className="rfa-comment-textarea"
        placeholder="Leave a comment..."
        rows={3}
        ref={textareaRef}
        value={body}
        onChange={(event) => setBody(event.target.value)}
        onKeyDown={(event) => {
          if (!isPrimarySubmitHotkey(event)) {
            return;
          }
          event.preventDefault();
          handleSave();
        }}
      />
      <div className="rfa-comment-actions">
        <button className="rfa-btn rfa-btn-cancel" onClick={onCancel} type="button">
          Cancel
        </button>
        <button
          className="rfa-btn rfa-btn-save"
          onClick={handleSave}
          type="button"
        >
          Save
        </button>
      </div>
    </div>
  );
}

function FileLevelCommentForm({
  file,
  onSave,
  onCancel,
}: {
  file: string;
  onSave: (body: string) => void;
  onCancel: () => void;
}) {
  const [body, setBody] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const handleSave = () => {
    const trimmed = body.trim();
    if (!trimmed) {
      return;
    }
    onSave(trimmed);
  };

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  return (
    <div className="rfa-file-comment-form-wrapper">
      <div className="rfa-comment-form">
        <div className="rfa-comment-form-label">{file} - (file-level)</div>
        <textarea
          className="rfa-comment-textarea"
          placeholder="Leave a file-level comment..."
          rows={3}
          ref={textareaRef}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          onKeyDown={(event) => {
            if (!isPrimarySubmitHotkey(event)) {
              return;
            }
            event.preventDefault();
            handleSave();
          }}
        />
        <div className="rfa-comment-actions">
          <button className="rfa-btn rfa-btn-cancel" onClick={onCancel} type="button">
            Cancel
          </button>
          <button
            className="rfa-btn rfa-btn-save"
            onClick={handleSave}
            type="button"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

const FileListItem = memo(function FileListItem({
  fileKey,
  file,
  additions,
  deletions,
  onScrollTo,
}: {
  fileKey: string;
  file: string;
  additions: number;
  deletions: number;
  onScrollTo: (key: string) => void;
}) {
  const handleClick = useCallback(() => onScrollTo(fileKey), [fileKey, onScrollTo]);

  return (
    <button
      className="rfa-file-list-item"
      onClick={handleClick}
      type="button"
    >
      <span className="rfa-file-list-name">{file}</span>
      <span className="rfa-file-list-stats">
        <span className="rfa-file-list-additions">+{additions}</span>
        <span className="rfa-file-list-deletions">-{deletions}</span>
      </span>
    </button>
  );
});

const FileSection = memo(function FileSection({
  fileDiff,
  fileKey,
  file,
  view,
  submitted,
  commentsByFile,
  activeDraft,
  fileDraftTarget,
  rangeAnchor,
  onLineClick,
  onSaveLineDraft,
  onCancelLineDraft,
  onSaveFileComment,
  onRemoveComment,
  onToggleFileDraft,
  sectionRef,
}: {
  fileDiff: FileDiffMetadata;
  fileKey: string;
  file: string;
  view: DiffView;
  submitted: boolean;
  commentsByFile: CommentsByFile;
  activeDraft: DraftComment | null;
  fileDraftTarget: string | null;
  rangeAnchor: RangeAnchor | null;
  onLineClick: (file: string, lineNumber: number, side: Side, shiftKey: boolean, rangeAnchor: RangeAnchor | null) => void;
  onSaveLineDraft: (body: string) => void;
  onCancelLineDraft: () => void;
  onSaveFileComment: (file: string, body: string) => void;
  onRemoveComment: (id: number) => void;
  onToggleFileDraft: (file: string) => void;
  sectionRef: (key: string, node: HTMLDivElement | null) => void;
}) {
  const isDeletedFile = fileDiff.type === "deleted";
  const { line: fileLineComments, file: fileLevelComments } = getCommentsForFile(commentsByFile, file);
  const draftForFile = activeDraft && activeDraft.file === file ? activeDraft : null;

  const lineAnnotations = createLineAnnotations(
    fileLineComments,
    draftForFile,
  ) as DiffLineAnnotation<AnnotationMeta>[];

  const options: FileDiffOptions<AnnotationMeta> = useMemo(() => ({
    diffStyle: view,
    theme: "github-dark",
    themeType: "dark",
    enableLineSelection: true,
    onLineNumberClick: (props) => {
      if (submitted) {
        return;
      }

      const clickedLine = props.lineNumber;
      const clickedSide = annotationSideToCommentSide(props.annotationSide);
      onLineClick(file, clickedLine, clickedSide, props.event.shiftKey, rangeAnchor);
    },
  }), [view, submitted, file, onLineClick, rangeAnchor]);

  const handleToggleFileDraft = useCallback(() => onToggleFileDraft(file), [file, onToggleFileDraft]);
  const handleCancelFileDraft = useCallback(() => onToggleFileDraft(file), [file, onToggleFileDraft]);
  const handleSaveFileComment = useCallback((body: string) => onSaveFileComment(file, body), [file, onSaveFileComment]);

  const renderFileLevelMetadata = () => (
    <div className="rfa-header-metadata">
      <div className="rfa-header-actions">
        <button
          className="rfa-btn rfa-file-comment-btn"
          onClick={handleToggleFileDraft}
          type="button"
        >
          + File comment
        </button>
      </div>

      {fileDraftTarget === file && !submitted ? (
        <div className="rfa-header-form-row">
          <FileLevelCommentForm
            file={file}
            onCancel={handleCancelFileDraft}
            onSave={handleSaveFileComment}
          />
        </div>
      ) : null}

      {fileLevelComments.length > 0 ? (
        <div className="rfa-header-comments">
          {fileLevelComments.map((comment) => (
            <div className="rfa-file-comment-card" data-comment-id={comment.id} key={comment.id}>
              <div className="rfa-comment-header">
                <span className="rfa-comment-location">{comment.file} - (file-level)</span>
                <button
                  className="rfa-btn rfa-btn-delete"
                  onClick={() => onRemoveComment(comment.id)}
                  type="button"
                >
                  Delete
                </button>
              </div>
              <div className="rfa-comment-body">{comment.body}</div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );

  if (isDeletedFile) {
    return (
      <div
        className="rfa-file-diff"
        ref={(node) => sectionRef(fileKey, node)}
      >
        <div className="rfa-removed-file-card">
          <div className="rfa-removed-file-header">
            <span className="rfa-removed-file-name">{file}</span>
            <span className="rfa-removed-file-badge">Removed</span>
          </div>
          <p className="rfa-removed-file-note">This file was removed.</p>
          {renderFileLevelMetadata()}
        </div>
      </div>
    );
  }

  return (
    <div
      className="rfa-file-diff"
      ref={(node) => sectionRef(fileKey, node)}
    >
      <div className="rfa-file-level-panel">{renderFileLevelMetadata()}</div>
      <FileDiff<AnnotationMeta>
        fileDiff={fileDiff}
        options={options}
        lineAnnotations={lineAnnotations}
        selectedLines={createSelectedRange(draftForFile)}
        renderAnnotation={(annotation) => {
          const metadata = annotation.metadata;
          if (!metadata) {
            return null;
          }

          if (metadata.kind === "draft") {
            return (
              <InlineDraftAnnotation
                draft={metadata.draft}
                onCancel={onCancelLineDraft}
                onSave={onSaveLineDraft}
              />
            );
          }

          const comment = metadata.comment;
          return (
            <div className="rfa-comment-card" data-comment-id={comment.id}>
              <div className="rfa-comment-header">
                <span className="rfa-comment-location">
                  {comment.file} - {formatLineRef(comment.startLine, comment.endLine)}
                </span>
                <button
                  className="rfa-btn rfa-btn-delete"
                  onClick={() => onRemoveComment(comment.id)}
                  type="button"
                >
                  Delete
                </button>
              </div>
              <div className="rfa-comment-body">{comment.body}</div>
            </div>
          );
        }}
      />
    </div>
  );
});

export default function App() {
  const [diffString, setDiffString] = useState("");
  const [view, setView] = useState<DiffView>("unified");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [comments, setComments] = useState<ReviewComment[]>([]);
  const nextCommentIdRef = useRef(1);

  const [rangeAnchor, setRangeAnchor] = useState<RangeAnchor | null>(null);
  const [activeDraft, setActiveDraft] = useState<DraftComment | null>(null);
  const activeDraftRef = useRef<DraftComment | null>(null);
  activeDraftRef.current = activeDraft;
  const [fileDraftTarget, setFileDraftTarget] = useState<string | null>(null);

  const [submitted, setSubmitted] = useState(false);
  const [submittedText, setSubmittedText] = useState<string | null>(null);
  const fileSectionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const globalCommentRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetchDiff()
      .then((diff) => {
        if (cancelled) {
          return;
        }

        setDiffString(diff);
        setLoading(false);
      })
      .catch((fetchError: unknown) => {
        if (cancelled) {
          return;
        }

        const message = fetchError instanceof Error ? fetchError.message : "Failed to fetch diff";
        setError(message);
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const submitText = useMemo(() => {
    if (submittedText !== null) {
      return submittedText;
    }
    const count = comments.length;
    return `${count} ${count === 1 ? "comment" : "comments"}`;
  }, [comments.length, submittedText]);

  const files = useMemo(() => parsePatchToFileDiffs(diffString), [diffString]);
  const fileSummaries = useMemo(
    () =>
      files.map((fileDiff, index) => {
        const file = getFileName(fileDiff);
        const stats = getFileStats(fileDiff);
        return {
          key: `${file}-${index}`,
          file,
          additions: stats.additions,
          deletions: stats.deletions,
        };
      }),
    [files],
  );

  const commentsByFile = useMemo(() => {
    const map: CommentsByFile = new Map();
    for (const comment of comments) {
      let entry = map.get(comment.file);
      if (!entry) {
        entry = { line: [], file: [] };
        map.set(comment.file, entry);
      }
      if (comment.startLine !== null) {
        entry.line.push(comment);
      } else {
        entry.file.push(comment);
      }
    }
    return map;
  }, [comments]);

  const saveLineDraft = useCallback((body: string) => {
    const draft = activeDraftRef.current;
    if (!draft) {
      return;
    }

    const id = nextCommentIdRef.current++;
    setComments((previous) => [...previous, {
      id,
      file: draft.file,
      startLine: draft.startLine,
      endLine: draft.endLine,
      side: draft.side,
      body,
    }]);
    setActiveDraft(null);
    setRangeAnchor(null);
  }, []);

  const cancelLineDraft = useCallback(() => {
    setActiveDraft(null);
    setRangeAnchor(null);
  }, []);

  const saveFileComment = useCallback((file: string, body: string) => {
    const id = nextCommentIdRef.current++;
    const comment: ReviewComment = {
      id,
      file,
      startLine: null,
      endLine: null,
      side: "right",
      body,
    };
    setComments((previous) => [...previous, comment]);
    setFileDraftTarget(null);
  }, []);

  const removeComment = useCallback((id: number) => {
    setComments((previous) => previous.filter((comment) => comment.id !== id));
  }, []);

  const onLineClick = useCallback((file: string, lineNumber: number, side: Side, shiftKey: boolean, currentRangeAnchor: RangeAnchor | null) => {
    setFileDraftTarget(null);

    if (shiftKey && currentRangeAnchor && currentRangeAnchor.file === file) {
      const startLine = Math.min(currentRangeAnchor.line, lineNumber);
      const endLine = Math.max(currentRangeAnchor.line, lineNumber);

      setActiveDraft({
        file,
        startLine,
        endLine,
        side,
      });
      setRangeAnchor(null);
      return;
    }

    setRangeAnchor({
      file,
      line: lineNumber,
      side,
    });
    setActiveDraft({
      file,
      startLine: lineNumber,
      endLine: lineNumber,
      side,
    });
  }, []);

  const onToggleFileDraft = useCallback((file: string) => {
    setActiveDraft(null);
    setRangeAnchor(null);
    setFileDraftTarget((current) => (current === file ? null : file));
  }, []);

  const onScrollTo = useCallback((key: string) => {
    const section = fileSectionRefs.current[key];
    if (!section) {
      return;
    }
    section.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const sectionRef = useCallback((key: string, node: HTMLDivElement | null) => {
    fileSectionRefs.current[key] = node;
  }, []);

  const handleSubmit = async () => {
    const trimmedGlobal = globalCommentRef.current?.value.trim() ?? "";
    if (comments.length === 0 && trimmedGlobal.length === 0) {
      window.alert("No comments to submit");
      return;
    }

    const payloadComments: SubmitComment[] = comments.map((comment) => ({
      file: comment.file,
      startLine: comment.startLine,
      endLine: comment.endLine,
      side: comment.side,
      body: comment.body,
    }));

    try {
      const response = await submitComments({
        diff: diffString,
        globalComment: trimmedGlobal,
        comments: payloadComments,
      });

      setSubmitted(true);
      setSubmittedText(`Review submitted - ${response.mdPath}`);

      if (response.clipboardText && navigator.clipboard) {
        try {
          await navigator.clipboard.writeText(response.clipboardText);
          setSubmittedText(`Review submitted - ${response.mdPath} (copied to clipboard)`);
        } catch {
          // Ignore clipboard failures.
        }
      }
    } catch (submitError: unknown) {
      const message = submitError instanceof Error ? submitError.message : "Failed to submit comments";
      window.alert(message);
    }
  };

  if (loading) {
    return (
      <div className="page-shell">
        <div className="empty-state">
          <h2>Loading diff...</h2>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page-shell">
        <div className="empty-state">
          <h2>Error</h2>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-shell">
      <div className="header">
        <h1>Code Review</h1>
        <div className="view-toggle">
          <button
            className={view === "unified" ? "active" : ""}
            onClick={() => setView("unified")}
            type="button"
          >
            Unified
          </button>
          <button
            className={view === "split" ? "active" : ""}
            onClick={() => setView("split")}
            type="button"
          >
            Split
          </button>
        </div>
      </div>

      {files.length === 0 ? (
        <div className="empty-state">
          <h2>No changes</h2>
          <p>No uncommitted changes found. Make some changes and refresh.</p>
        </div>
      ) : (
        <div className="diff-container">
          <div className="rfa-file-list" aria-label="Changed files">
            {fileSummaries.map((summary) => (
              <FileListItem
                key={summary.key}
                fileKey={summary.key}
                file={summary.file}
                additions={summary.additions}
                deletions={summary.deletions}
                onScrollTo={onScrollTo}
              />
            ))}
          </div>

          {files.map((fileDiff, index) => {
            const file = getFileName(fileDiff);
            const fileKey = `${file}-${index}`;

            return (
              <FileSection
                key={fileKey}
                fileDiff={fileDiff}
                fileKey={fileKey}
                file={file}
                view={view}
                submitted={submitted}
                commentsByFile={commentsByFile}
                activeDraft={activeDraft}
                fileDraftTarget={fileDraftTarget}
                rangeAnchor={rangeAnchor}
                onLineClick={onLineClick}
                onSaveLineDraft={saveLineDraft}
                onCancelLineDraft={cancelLineDraft}
                onSaveFileComment={saveFileComment}
                onRemoveComment={removeComment}
                onToggleFileDraft={onToggleFileDraft}
                sectionRef={sectionRef}
              />
            );
          })}
        </div>
      )}

      <div className={`submit-bar ${submitted ? "submitted" : ""}`}>
        {!submitted ? (
          <textarea
            className="rfa-comment-textarea submit-bar-textarea"
            id="global-comment"
            ref={globalCommentRef}
            placeholder="Overall review comment (optional)..."
            rows={2}
            onKeyDown={(event) => {
              if (!isPrimarySubmitHotkey(event)) {
                return;
              }
              event.preventDefault();
              void handleSubmit();
            }}
          />
        ) : null}
        <div className="submit-bar-actions">
          <span className="comment-count">{submitText}</span>
          <button
            className="rfa-btn rfa-btn-save submit-btn"
            disabled={submitted}
            onClick={handleSubmit}
            type="button"
          >
            Submit Review
          </button>
        </div>
      </div>
    </div>
  );
}
