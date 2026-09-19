'use strict';
/**
 * Site location and configuration.
 *
 * A "site" is any folder that contains:
 *   content/           one sub-folder per version (v1, v2, …) of Markdown pages
 *   docs.config.json   title, theme, nav, versions, GitHub edit links
 *   static/            images and other assets served under /static/
 *
 * The engine never reads from its own folder for content, everything comes
 * from the site root, so one shared engine can serve any number of sites.
 */

const fs = require('fs');
const path = require('path');

/** Baseline configuration merged under whatever docs.config.json provides. */
const DEFAULT_CONFIG = {
  title: 'My Docs',
  description: '',
  logo: '',
  versions: [],
  defaultVersion: '',
  github: { repo: '', branch: 'main', contentDir: 'content' },
  nav: [],
  theme: {},
};

/**
 * Resolve the site root, in order: DOCS_ROOT env var, first CLI argument,
 * current working directory.
 */
function resolveRoot() {
  return path.resolve(process.env.DOCS_ROOT || process.argv[2] || process.cwd());
}

/** Read + parse a JSON file; null when missing or malformed. */
function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

/** Read a text file; null when missing. */
function readText(file) {
  try { return fs.readFileSync(file, 'utf8'); } catch { return null; }
}

/**
 * Create a site handle for a root folder. All path/config access flows
 * through this object so the rest of the engine never touches process state.
 */
function createSite(root) {
  const resolved = path.resolve(root || resolveRoot());
  const site = {
    root: resolved,
    contentDir: path.join(resolved, 'content'),
    configPath: path.join(resolved, 'docs.config.json'),
    staticDir: path.join(resolved, 'static'),

    /** Site config: docs.config.json merged over defaults (github/theme deep-merged). */
    loadConfig() {
      const raw = readJson(site.configPath) || {};
      return {
        ...DEFAULT_CONFIG,
        ...raw,
        github: { ...DEFAULT_CONFIG.github, ...(typeof raw.github === 'object' && raw.github !== null ? raw.github : {}) },
        theme: { ...(raw.theme || {}) },
      };
    },

    /**
     * Version folders that exist on disk, ordered by config.versions first
     * (for sites that care about ordering), then any remaining folders.
     */
    versions(config) {
      let onDisk = [];
      try {
        onDisk = fs.readdirSync(site.contentDir)
          .filter(d => { try { return fs.statSync(path.join(site.contentDir, d)).isDirectory(); } catch { return false; } });
      } catch { /* no content dir yet */ }
      if (!onDisk.length) return ['v1'];
      const configured = ((config || site.loadConfig()).versions || []).filter(v => onDisk.includes(v));
      const rest = onDisk.filter(v => !configured.includes(v)).sort();
      return [...configured, ...rest];
    },

    /** The version the root URL redirects to. */
    defaultVersion(config) {
      const cfg = config || site.loadConfig();
      const versions = site.versions(cfg);
      return versions.includes(cfg.defaultVersion) ? cfg.defaultVersion : versions[0];
    },
  };
  return site;
}

module.exports = { createSite, resolveRoot, readJson, readText, DEFAULT_CONFIG };
