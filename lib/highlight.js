'use strict';
/**
 * Zero-dependency syntax highlighter.
 *
 * Replaces the CDN copy of highlight.js so pages work fully offline. Each
 * language is a small grammar: an ordered list of [regexSource, tokenClass]
 * rules compiled into one alternation. At every match position the first
 * rule wins, so grammars list comments and strings before keywords.
 *
 * Output is HTML with <span class="tk-…"> wrappers; everything (matched or
 * not) is HTML-escaped on the way out. Unknown languages fall back to
 * escaped plain text, so highlighting can never break a page.
 *
 * Token classes (styled in assets/app.css for light + dark):
 *   tk-cmt comment · tk-str string · tk-num number · tk-kw keyword
 *   tk-lit literal · tk-fn function call · tk-type Type name · tk-prop key
 *   tk-tag markup tag · tk-attr attribute · tk-var variable · tk-meta meta
 *   tk-ins diff added · tk-del diff removed · tk-sec section
 */

function escHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Rule constructors, regex sources only (no flags), non-capturing groups inside. */
const R = {
  lineComment: marker => [`${marker}[^\\n]*`, 'cmt'],
  blockComment: () => ['\\/\\*[\\s\\S]*?\\*\\/', 'cmt'],
  hashComment: () => ['#[^\\n]*', 'cmt'],
  dqString: () => ['"(?:\\\\.|[^"\\\\\\n])*"', 'str'],
  sqString: () => ["'(?:\\\\.|[^'\\\\\\n])*'", 'str'],
  template: () => ['`(?:\\\\.|[^`\\\\])*`', 'str'],
  tripleString: () => ['(?:"""[\\s\\S]*?"""|\'\'\'[\\s\\S]*?\'\'\')', 'str'],
  number: () => ['\\b(?:0[xXbBoO][\\da-fA-F_]+|\\d[\\d_]*(?:\\.[\\d_]+)?(?:[eE][+-]?\\d+)?[fFdDmMuUlL]*)\\b', 'num'],
  keywords: words => [`\\b(?:${words.trim().split(/\s+/).join('|')})\\b`, 'kw'],
  literals: words => [`\\b(?:${words.trim().split(/\s+/).join('|')})\\b`, 'lit'],
  typeName: () => ['\\b[A-Z][A-Za-z0-9_]*\\b', 'type'],
  fnCall: () => ['\\b[a-zA-Z_$][\\w$]*(?=\\s*\\()', 'fn'],
  variable: () => ['\\$(?:\\{[^}]*\\}|[\\w]+)', 'var'],
};

/** Compile an ordered rule list into a single-alternation grammar. */
function grammar(rules, flags = 'gm') {
  return {
    re: new RegExp(rules.map(r => `(${r[0]})`).join('|'), flags),
    classes: rules.map(r => r[1]),
  };
}

const CLIKE_COMMENTS = [R.blockComment(), R.lineComment('\\/\\/')];

const GRAMMARS = {
  javascript: grammar([
    ...CLIKE_COMMENTS, R.template(), R.dqString(), R.sqString(), R.number(),
    R.keywords(`break case catch class const continue debugger default delete do else export extends finally for
      function if import in instanceof let new of return static super switch throw try typeof var void while with
      yield async await get set interface type enum namespace declare readonly implements abstract public private
      protected as is keyof infer satisfies`),
    R.literals('true false null undefined NaN Infinity this arguments'),
    R.typeName(), R.fnCall(),
  ]),
  python: grammar([
    R.tripleString(), R.hashComment(), R.dqString(), R.sqString(), R.number(),
    ['@[\\w.]+', 'meta'],
    R.keywords(`and as assert async await break class continue def del elif else except finally for from global if
      import in is lambda nonlocal not or pass raise return try while with yield match case`),
    R.literals('True False None self cls'),
    R.typeName(), R.fnCall(),
  ]),
  csharp: grammar([
    ...CLIKE_COMMENTS, ['@"(?:[^"]|"")*"', 'str'], R.dqString(), R.sqString(), R.number(),
    R.keywords(`abstract as base bool break byte case catch char checked class const continue decimal default delegate
      do double else enum event explicit extern finally fixed float for foreach goto if implicit in int interface
      internal is lock long namespace new object operator out override params private protected public readonly record
      ref return sbyte sealed short sizeof stackalloc static string struct switch throw try typeof uint ulong
      unchecked unsafe ushort using var virtual void volatile while async await when where partial get set init
      value nameof required scoped`),
    R.literals('true false null this base'),
    R.typeName(), R.fnCall(),
  ]),
  java: grammar([
    ...CLIKE_COMMENTS, R.dqString(), R.sqString(), R.number(),
    R.keywords(`abstract assert boolean break byte case catch char class const continue default do double else enum
      extends final finally float for goto if implements import instanceof int interface long native new package
      private protected public return short static strictfp super switch synchronized throw throws transient try
      void volatile while var record sealed permits yield`),
    R.literals('true false null this'),
    R.typeName(), R.fnCall(),
  ]),
  c: grammar([
    ...CLIKE_COMMENTS, R.dqString(), R.sqString(), R.number(),
    ['#\\s*\\w+', 'meta'],
    R.keywords(`auto break case char const continue default do double else enum extern float for goto if inline int
      long register restrict return short signed sizeof static struct switch typedef union unsigned void volatile while`),
    R.literals('true false NULL'),
    R.typeName(), R.fnCall(),
  ]),
  cpp: grammar([
    ...CLIKE_COMMENTS, R.dqString(), R.sqString(), R.number(),
    ['#\\s*\\w+', 'meta'],
    R.keywords(`alignas alignof auto bool break case catch char class concept const consteval constexpr constinit
      continue co_await co_return co_yield decltype default delete do double dynamic_cast else enum explicit export
      extern final float for friend goto if inline int long mutable namespace new noexcept operator override private
      protected public register reinterpret_cast requires return short signed sizeof static static_cast struct switch
      template this thread_local throw try typedef typeid typename union unsigned using virtual void volatile while`),
    R.literals('true false nullptr NULL'),
    R.typeName(), R.fnCall(),
  ]),
  go: grammar([
    ...CLIKE_COMMENTS, R.template(), R.dqString(), R.sqString(), R.number(),
    R.keywords(`break case chan const continue default defer else fallthrough for func go goto if import interface
      map package range return select struct switch type var`),
    R.literals('true false nil iota'),
    R.typeName(), R.fnCall(),
  ]),
  rust: grammar([
    ...CLIKE_COMMENTS, R.dqString(), R.number(),
    ['#!?\\[[^\\]]*\\]', 'meta'],
    R.keywords(`as async await break const continue crate dyn else enum extern fn for if impl in let loop match mod
      move mut pub ref return static struct super trait type unsafe use where while`),
    R.literals('true false None Some Ok Err self Self'),
    R.typeName(), R.fnCall(),
  ]),
  json: grammar([
    ['"(?:\\\\.|[^"\\\\])*"(?=\\s*:)', 'prop'],
    ['"(?:\\\\.|[^"\\\\])*"', 'str'],
    R.number(), R.literals('true false null'),
  ]),
  yaml: grammar([
    R.hashComment(),
    ['^[ \\t]*[\\w.\\/-]+(?=\\s*:)', 'prop'],
    ['&\\w+|\\*\\w+', 'meta'],
    R.dqString(), R.sqString(), R.number(),
    R.literals('true false null yes no on off'),
  ]),
  toml: grammar([
    R.hashComment(),
    ['^\\[[^\\]\\n]*\\]', 'sec'],
    ['^[\\w.-]+(?=\\s*=)', 'prop'],
    R.dqString(), R.sqString(), R.number(), R.literals('true false'),
  ]),
  ini: grammar([
    [';[^\\n]*', 'cmt'], R.hashComment(),
    ['^\\[[^\\]\\n]*\\]', 'sec'],
    ['^[\\w.-]+(?=\\s*=)', 'prop'],
    R.dqString(), R.sqString(), R.number(),
  ]),
  bash: grammar([
    R.hashComment(), R.dqString(), R.sqString(), R.variable(),
    R.keywords(`if then else elif fi for while until do done case esac function in select return exit export local
      readonly declare set unset shift source alias echo cd sudo`),
    R.number(), R.fnCall(),
  ]),
  powershell: grammar([
    ['<#[\\s\\S]*?#>', 'cmt'], R.hashComment(), R.dqString(), R.sqString(), R.variable(),
    ['\\b[A-Z][a-z]+(?:-[A-Z]\\w+)+\\b', 'fn'],
    R.keywords(`function param if else elseif foreach for while do switch return try catch finally throw begin
      process end filter workflow class enum using in`),
    ['-\\w+', 'attr'],
    R.number(),
  ]),
  sql: grammar([
    ['--[^\\n]*', 'cmt'], R.blockComment(), R.sqString(), R.number(),
    R.keywords(`select from where insert into update delete create table drop alter index view join inner left right
      outer full cross on as and or not null primary key foreign references group by order having limit offset
      distinct union all values set between like in exists case when then else end begin commit rollback transaction
      constraint unique check default cascade if`),
    R.fnCall(),
  ], 'gmi'),
  html: grammar([
    ['<!--[\\s\\S]*?-->', 'cmt'],
    ['<!\\w[^>]*>', 'meta'],
    ['<\\/?[a-zA-Z][\\w-]*', 'tag'],
    ['\\/?>', 'tag'],
    ['\\b[a-zA-Z-]+(?=\\s*=)', 'attr'],
    R.dqString(), R.sqString(),
  ]),
  css: grammar([
    R.blockComment(),
    ['@[\\w-]+', 'kw'],
    ['#[0-9a-fA-F]{3,8}\\b', 'num'],
    ['[\\w-]+(?=\\s*:)', 'prop'],
    R.dqString(), R.sqString(),
    ['\\b\\d[\\d.]*(?:px|r?em|vh|vw|s|ms|%|fr|deg|ch)?\\b', 'num'],
    ['!important', 'kw'],
  ]),
  diff: grammar([
    ['^@@[^\\n]*', 'meta'],
    ['^\\+[^\\n]*', 'ins'],
    ['^-[^\\n]*', 'del'],
    ['^(?:diff|index|---|\\+\\+\\+)[^\\n]*', 'cmt'],
  ]),
  markdown: grammar([
    ['^#{1,6}[^\\n]*', 'kw'],
    ['```[\\s\\S]*?```', 'str'],
    ['`[^`\\n]+`', 'str'],
    ['\\*\\*[^*\\n]+\\*\\*', 'lit'],
    ['\\[[^\\]\\n]*\\]\\([^)\\n]*\\)', 'fn'],
    ['^>[^\\n]*', 'cmt'],
  ]),
  plaintext: null,
};

/** Language aliases → grammar names. */
const ALIASES = {
  js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
  ts: 'javascript', tsx: 'javascript', typescript: 'javascript',
  py: 'python', python3: 'python',
  cs: 'csharp', 'c#': 'csharp', dotnet: 'csharp',
  'c++': 'cpp', cc: 'cpp', h: 'c', hpp: 'cpp',
  golang: 'go', rs: 'rust',
  yml: 'yaml',
  sh: 'bash', shell: 'bash', zsh: 'bash', console: 'bash',
  ps: 'powershell', ps1: 'powershell', pwsh: 'powershell',
  xml: 'html', svg: 'html', vue: 'html',
  scss: 'css', less: 'css',
  md: 'markdown',
  txt: 'plaintext', text: 'plaintext', plain: 'plaintext', raw: 'plaintext',
  patch: 'diff',
};

/** Resolve a fence language tag to a grammar name (null → plain text). */
function resolveLang(lang) {
  const name = (lang || '').toLowerCase();
  const resolved = ALIASES[name] || name;
  return Object.prototype.hasOwnProperty.call(GRAMMARS, resolved) ? resolved : null;
}

/**
 * Highlight source code. Returns escaped HTML with token spans; falls back
 * to plain escaped text for unknown languages.
 */
function highlight(code, lang) {
  const name = resolveLang(lang);
  const g = name ? GRAMMARS[name] : null;
  if (!g) return escHtml(code);

  let out = '';
  let last = 0;
  g.re.lastIndex = 0;
  let m;
  while ((m = g.re.exec(code)) !== null) {
    if (m.index > last) out += escHtml(code.slice(last, m.index));
    let cls = null;
    for (let i = 1; i < m.length; i++) {
      if (m[i] !== undefined) { cls = g.classes[i - 1]; break; }
    }
    out += cls ? `<span class="tk-${cls}">${escHtml(m[0])}</span>` : escHtml(m[0]);
    last = m.index + m[0].length;
    if (m[0].length === 0) g.re.lastIndex++;      // safety against zero-width matches
  }
  return out + escHtml(code.slice(last));
}

module.exports = { highlight, resolveLang };
