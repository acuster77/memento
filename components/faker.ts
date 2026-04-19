/** Synthetic-data generators for the snapshot preview UI.
 * Backed by @faker-js/faker so users get realistic, varied test data. */
import { faker } from '@faker-js/faker/locale/en';

export type FakerKey =
  | 'firstName'
  | 'lastName'
  | 'fullName'
  | 'username'
  | 'email'
  | 'phone'
  | 'url'
  | 'uuid'
  | 'street'
  | 'city'
  | 'state'
  | 'zip'
  | 'country'
  | 'company'
  | 'jobTitle'
  | 'creditCard'
  | 'iban'
  | 'date'
  | 'datetime'
  | 'time'
  | 'loremWords'
  | 'loremSentence'
  | 'loremParagraph'
  | 'number'
  | 'boolean';

export const FAKER_OPTIONS: { key: FakerKey; label: string }[] = [
  { key: 'fullName', label: 'Full name' },
  { key: 'firstName', label: 'First name' },
  { key: 'lastName', label: 'Last name' },
  { key: 'username', label: 'Username' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Phone' },
  { key: 'url', label: 'URL' },
  { key: 'uuid', label: 'UUID' },
  { key: 'street', label: 'Street address' },
  { key: 'city', label: 'City' },
  { key: 'state', label: 'State' },
  { key: 'zip', label: 'ZIP code' },
  { key: 'country', label: 'Country' },
  { key: 'company', label: 'Company' },
  { key: 'jobTitle', label: 'Job title' },
  { key: 'creditCard', label: 'Credit card number' },
  { key: 'iban', label: 'IBAN' },
  { key: 'date', label: 'Date (YYYY-MM-DD)' },
  { key: 'datetime', label: 'Datetime (local)' },
  { key: 'time', label: 'Time (HH:mm)' },
  { key: 'number', label: 'Number' },
  { key: 'loremWords', label: 'Lorem (3 words)' },
  { key: 'loremSentence', label: 'Lorem sentence' },
  { key: 'loremParagraph', label: 'Lorem paragraph' },
];

function pad(n: number, width = 2): string {
  return String(n).padStart(width, '0');
}

const KEYWORDS: Record<FakerKey, string[]> = {
  firstName: ['first', 'given', 'fname', 'forename'],
  lastName: ['last', 'surname', 'family', 'lname'],
  fullName: ['name', 'fullname'],
  username: ['user', 'username', 'handle', 'login', 'account', 'nick'],
  email: ['email', 'mail'],
  phone: ['phone', 'tel', 'telephone', 'mobile', 'cell', 'fax'],
  url: ['url', 'website', 'site', 'link', 'homepage', 'web'],
  uuid: ['uuid', 'guid', 'id', 'identifier', 'token'],
  street: ['street', 'address', 'addr', 'line1', 'address1'],
  city: ['city', 'town', 'locality'],
  state: ['state', 'province', 'region'],
  zip: ['zip', 'postal', 'postcode'],
  country: ['country', 'nation'],
  company: ['company', 'organization', 'organisation', 'employer', 'business', 'firm'],
  jobTitle: ['job', 'title', 'position', 'role', 'occupation'],
  creditCard: ['credit', 'card', 'cc', 'payment', 'pan'],
  iban: ['iban', 'bank', 'account', 'routing'],
  date: ['date', 'dob', 'birthday', 'birthdate', 'day'],
  datetime: ['datetime', 'timestamp', 'when'],
  time: ['time', 'hour'],
  number: ['number', 'num', 'amount', 'quantity', 'count', 'age', 'qty'],
  boolean: ['bool', 'boolean', 'flag', 'enabled', 'active'],
  loremWords: ['tag', 'keyword', 'label'],
  loremSentence: ['sentence', 'headline', 'subject', 'summary'],
  loremParagraph: [
    'paragraph',
    'description',
    'body',
    'comment',
    'notes',
    'note',
    'bio',
    'about',
    'message',
    'content',
  ],
};

/** HTML input type -> preferred generator key. Strong signal when present. */
const TYPE_HINTS: Record<string, FakerKey> = {
  email: 'email',
  tel: 'phone',
  url: 'url',
  date: 'date',
  'datetime-local': 'datetime',
  time: 'time',
  number: 'number',
  textarea: 'loremParagraph',
  contenteditable: 'loremParagraph',
};

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 0);
}

export type RankedFakerOption = {
  key: FakerKey;
  label: string;
  score: number;
};

/** Threshold at which a generator counts as a strong match for the field. */
export const BEST_MATCH_SCORE = 10;

export function rankedFakerOptions(hint: {
  type?: string;
  label?: string;
  fieldKey?: string;
}): RankedFakerOption[] {
  const tokens = [
    ...tokenize(hint.label ?? ''),
    ...(hint.fieldKey ? tokenize(hint.fieldKey.replace(/^[a-z]+:/, '')) : []),
  ];
  const typeHint = hint.type ? TYPE_HINTS[hint.type] : undefined;

  return FAKER_OPTIONS.map((opt, i) => ({
    opt,
    i,
    score: scoreKey(opt.key, tokens, typeHint),
  }))
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .map(({ opt, score }) => ({ ...opt, score }));
}

function scoreKey(key: FakerKey, tokens: string[], typeHint?: FakerKey): number {
  let score = 0;
  if (typeHint === key) score += 20;
  const kws = KEYWORDS[key] ?? [];
  for (const kw of kws) {
    for (const t of tokens) {
      if (t === kw) score += 10;
      else if (t.startsWith(kw) || kw.startsWith(t)) score += 4;
      else if (t.includes(kw) || (kw.length >= 4 && kw.includes(t))) score += 2;
    }
  }
  return score;
}

export function generate(key: FakerKey): string {
  switch (key) {
    case 'firstName':
      return faker.person.firstName();
    case 'lastName':
      return faker.person.lastName();
    case 'fullName':
      return faker.person.fullName();
    case 'username':
      return faker.internet.username().toLowerCase();
    case 'email':
      return faker.internet.email().toLowerCase();
    case 'phone':
      return faker.phone.number();
    case 'url':
      return faker.internet.url();
    case 'uuid':
      return faker.string.uuid();
    case 'street':
      return faker.location.streetAddress();
    case 'city':
      return faker.location.city();
    case 'state':
      return faker.location.state();
    case 'zip':
      return faker.location.zipCode();
    case 'country':
      return faker.location.country();
    case 'company':
      return faker.company.name();
    case 'jobTitle':
      return faker.person.jobTitle();
    case 'creditCard':
      return faker.finance.creditCardNumber();
    case 'iban':
      return faker.finance.iban();
    case 'date': {
      const d = faker.date.soon({ days: 60 });
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    }
    case 'datetime': {
      const d = faker.date.soon({ days: 60 });
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }
    case 'time':
      return `${pad(faker.number.int({ min: 0, max: 23 }))}:${pad(faker.number.int({ min: 0, max: 59 }))}`;
    case 'number':
      return String(faker.number.int({ min: 0, max: 99999 }));
    case 'boolean':
      return faker.datatype.boolean() ? 'true' : 'false';
    case 'loremWords':
      return faker.lorem.words(3);
    case 'loremSentence':
      return faker.lorem.sentence();
    case 'loremParagraph':
      return faker.lorem.paragraph();
  }
}
