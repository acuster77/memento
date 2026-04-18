export type FieldValue = string | boolean | string[];

export type FormIdentity = {
  origin: string;
  pathname: string;
  formId?: string;
  formName?: string;
  action?: string;
  domPath: string;
  fingerprint: string;
};

export type FieldOption = { value: string; text: string };

export type SnapshotField = {
  key: string;
  type: string;
  value: FieldValue;
  labelText?: string;
  /** For select-one / select-multiple / radio: the choices available. */
  options?: FieldOption[];
  /** The source field was marked readonly on the page. */
  readonly?: boolean;
};

export type SnapshotFlags = {
  containsSecrets: boolean;
  containsHidden: boolean;
  hasUnrestorableFiles: boolean;
};

export type Snapshot = {
  id: string;
  label: string;
  category?: string;
  createdAt: number;
  updatedAt: number;
  form: FormIdentity;
  fields: SnapshotField[];
  flags: SnapshotFlags;
};

export type DetectedForm = {
  index: number;
  identity: FormIdentity;
  fieldCount: number;
  hasPassword: boolean;
  hasFile: boolean;
  hasHidden: boolean;
  hasReadonly: boolean;
};

export type SaveOptions = {
  label: string;
  category?: string;
  includePasswords: boolean;
};

export type MatchedSnapshot = {
  snapshot: Snapshot;
  score: number;
};
