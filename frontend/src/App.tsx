import { FileDiff } from "@pierre/diffs/react";
import { type DiffLineAnnotation, type FileDiffMetadata, type FileDiffOptions } from "@pierre/diffs";
import { useEffect, useMemo, useRef, useState } from "react";
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

  return (
    <div className="rfa-comment-form">
      <div className="rfa-comment-form-label">
        {draft.file} - {formatLineRef(draft.startLine, draft.endLine)}
      </div>
      <textarea
        className="rfa-comment-textarea"
        placeholder="Leave a comment..."
        rows={3}
        value={body}
        onChange={(event) => setBody(event.target.value)}
      />
      <div className="rfa-comment-actions">
        <button className="rfa-btn rfa-btn-cancel" onClick={onCancel} type="button">
          Cancel
        </button>
        <button
          className="rfa-btn rfa-btn-save"
          onClick={() => {
            const trimmed = body.trim();
            if (!trimmed) {
              return;
            }
            onSave(trimmed);
          }}
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

  return (
    <div className="rfa-file-comment-form-wrapper">
      <div className="rfa-comment-form">
        <div className="rfa-comment-form-label">{file} - (file-level)</div>
        <textarea
          className="rfa-comment-textarea"
          placeholder="Leave a file-level comment..."
          rows={3}
          value={body}
          onChange={(event) => setBody(event.target.value)}
        />
        <div className="rfa-comment-actions">
          <button className="rfa-btn rfa-btn-cancel" onClick={onCancel} type="button">
            Cancel
          </button>
          <button
            className="rfa-btn rfa-btn-save"
            onClick={() => {
              const trimmed = body.trim();
              if (!trimmed) {
                return;
              }
              onSave(trimmed);
            }}
            type="button"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [diffString, setDiffString] = useState("");
  const [view, setView] = useState<DiffView>("unified");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [comments, setComments] = useState<ReviewComment[]>([]);
  const [nextCommentId, setNextCommentId] = useState(1);

  const [rangeAnchor, setRangeAnchor] = useState<RangeAnchor | null>(null);
  const [activeDraft, setActiveDraft] = useState<DraftComment | null>(null);
  const [fileDraftTarget, setFileDraftTarget] = useState<string | null>(null);

  const [submitted, setSubmitted] = useState(false);
  const [submitText, setSubmitText] = useState("0 comments");
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

  useEffect(() => {
    const count = comments.length;
    if (!submitted) {
      setSubmitText(`${count} ${count === 1 ? "comment" : "comments"}`);
    }
  }, [comments, submitted]);

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

  const saveLineDraft = (body: string) => {
    if (!activeDraft) {
      return;
    }

    const comment: ReviewComment = {
      id: nextCommentId,
      file: activeDraft.file,
      startLine: activeDraft.startLine,
      endLine: activeDraft.endLine,
      side: activeDraft.side,
      body,
    };

    setComments((previous) => [...previous, comment]);
    setNextCommentId((current) => current + 1);
    setActiveDraft(null);
    setRangeAnchor(null);
  };

  const cancelLineDraft = () => {
    setActiveDraft(null);
    setRangeAnchor(null);
  };

  const saveFileComment = (file: string, body: string) => {
    const comment: ReviewComment = {
      id: nextCommentId,
      file,
      startLine: null,
      endLine: null,
      side: "right",
      body,
    };

    setComments((previous) => [...previous, comment]);
    setNextCommentId((current) => current + 1);
    setFileDraftTarget(null);
  };

  const removeComment = (id: number) => {
    setComments((previous) => previous.filter((comment) => comment.id !== id));
  };

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
      setSubmitText(`Review submitted - ${response.mdPath}`);

      if (response.clipboardText && navigator.clipboard) {
        try {
          await navigator.clipboard.writeText(response.clipboardText);
          setSubmitText(`Review submitted - ${response.mdPath} (copied to clipboard)`);
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
              <button
                className="rfa-file-list-item"
                key={summary.key}
                onClick={() => {
                  const section = fileSectionRefs.current[summary.key];
                  if (!section) {
                    return;
                  }
                  section.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
                type="button"
              >
                <span className="rfa-file-list-name">{summary.file}</span>
                <span className="rfa-file-list-stats">
                  <span className="rfa-file-list-additions">+{summary.additions}</span>
                  <span className="rfa-file-list-deletions">-{summary.deletions}</span>
                </span>
              </button>
            ))}
          </div>

          {files.map((fileDiff, index) => {
            const file = getFileName(fileDiff);
            const fileKey = `${file}-${index}`;
            const isDeletedFile = fileDiff.type === "deleted";
            const fileLineComments = comments.filter(
              (comment) => comment.file === file && comment.startLine !== null,
            );
            const fileLevelComments = comments.filter(
              (comment) => comment.file === file && comment.startLine === null,
            );
            const draftForFile = activeDraft && activeDraft.file === file ? activeDraft : null;

            const lineAnnotations = createLineAnnotations(
              fileLineComments,
              draftForFile,
            ) as DiffLineAnnotation<AnnotationMeta>[];

            const options: FileDiffOptions<AnnotationMeta> = {
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

                setFileDraftTarget(null);

                if (props.event.shiftKey && rangeAnchor && rangeAnchor.file === file) {
                  const startLine = Math.min(rangeAnchor.line, clickedLine);
                  const endLine = Math.max(rangeAnchor.line, clickedLine);

                  setActiveDraft({
                    file,
                    startLine,
                    endLine,
                    side: clickedSide,
                  });
                  setRangeAnchor(null);
                  return;
                }

                setRangeAnchor({
                  file,
                  line: clickedLine,
                  side: clickedSide,
                });
                setActiveDraft({
                  file,
                  startLine: clickedLine,
                  endLine: clickedLine,
                  side: clickedSide,
                });
              },
            };

            const renderFileLevelMetadata = () => (
              <div className="rfa-header-metadata">
                <div className="rfa-header-actions">
                  <button
                    className="rfa-btn rfa-file-comment-btn"
                    onClick={() => {
                      if (submitted) {
                        return;
                      }
                      setActiveDraft(null);
                      setRangeAnchor(null);
                      setFileDraftTarget((current) => (current === file ? null : file));
                    }}
                    type="button"
                  >
                    + File comment
                  </button>
                </div>

                {fileDraftTarget === file && !submitted ? (
                  <div className="rfa-header-form-row">
                    <FileLevelCommentForm
                      file={file}
                      onCancel={() => setFileDraftTarget(null)}
                      onSave={(body) => saveFileComment(file, body)}
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
                            onClick={() => removeComment(comment.id)}
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
                  key={fileKey}
                  ref={(node) => {
                    fileSectionRefs.current[fileKey] = node;
                  }}
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
                key={fileKey}
                ref={(node) => {
                  fileSectionRefs.current[fileKey] = node;
                }}
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
                          onCancel={cancelLineDraft}
                          onSave={saveLineDraft}
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
                            onClick={() => removeComment(comment.id)}
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
