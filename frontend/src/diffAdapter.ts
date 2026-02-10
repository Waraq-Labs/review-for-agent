import {
  parsePatchFiles,
  type AnnotationSide,
  type DiffLineAnnotation,
  type FileDiffMetadata,
  type SelectedLineRange,
} from "@pierre/diffs";
import type { AnnotationMeta, DraftComment, ReviewComment, Side } from "./types";

export function parsePatchToFileDiffs(patch: string): FileDiffMetadata[] {
  if (!patch.trim()) {
    return [];
  }

  const parsed = parsePatchFiles(patch);
  const files: FileDiffMetadata[] = [];

  for (const patchGroup of parsed) {
    for (const file of patchGroup.files) {
      files.push(file);
    }
  }

  return files;
}

export function annotationSideToCommentSide(side: AnnotationSide): Side {
  return side === "deletions" ? "left" : "right";
}

export function commentSideToAnnotationSide(side: Side): AnnotationSide {
  return side === "left" ? "deletions" : "additions";
}

export function createSelectedRange(draft: DraftComment | null): SelectedLineRange | null {
  if (!draft) {
    return null;
  }

  const selectionSide = commentSideToAnnotationSide(draft.side);
  return {
    start: draft.startLine,
    end: draft.endLine,
    side: selectionSide,
    endSide: selectionSide,
  };
}

export function createLineAnnotations(comments: ReviewComment[], draft: DraftComment | null): DiffLineAnnotation<AnnotationMeta>[] {
  const annotations: DiffLineAnnotation<AnnotationMeta>[] = [];

  for (const comment of comments) {
    if (comment.startLine === null) {
      continue;
    }

    annotations.push({
      side: commentSideToAnnotationSide(comment.side),
      lineNumber: comment.startLine,
      metadata: {
        kind: "comment",
        comment,
      },
    });
  }

  if (draft) {
    annotations.push({
      side: commentSideToAnnotationSide(draft.side),
      lineNumber: draft.startLine,
      metadata: {
        kind: "draft",
        draft,
      },
    });
  }

  return annotations;
}
