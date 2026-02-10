export type Side = "left" | "right";

export type ReviewComment = {
  id: number;
  file: string;
  startLine: number | null;
  endLine: number | null;
  side: Side;
  body: string;
};

export type SubmitComment = Omit<ReviewComment, "id">;

export type SubmitRequest = {
  diff: string;
  globalComment: string;
  comments: SubmitComment[];
};

export type SubmitResponse = {
  jsonPath: string;
  mdPath: string;
  clipboardText: string;
};

export type DraftComment = {
  file: string;
  startLine: number;
  endLine: number;
  side: Side;
};

export type AnnotationMeta =
  | {
      kind: "comment";
      comment: ReviewComment;
    }
  | {
      kind: "draft";
      draft: DraftComment;
    };
