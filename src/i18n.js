// Languages: English (built into the code) and German.
//
//   t('Roll the dice first!')            -> "Erst würfeln!" in German
//   t('Turn {n}', { n: 7 })              -> placeholders in {curly braces}
//
// The English text itself is the key, so the code stays readable and anything
// not yet translated simply shows in English. German strings live in DE below
// (and in src/i18n.de.js for the long help-page texts).
// The language is kept in localStorage ('sotw-lang'); switching reloads the page.

import { DE } from './i18n.de.js';

const KEY = 'sotw-lang';
export const LANGS = { en: 'English', de: 'Deutsch' };

function detect() {
  try { const l = localStorage.getItem(KEY); if (LANGS[l]) return l; } catch { /* ignore */ }
  return (navigator.language || 'en').toLowerCase().startsWith('de') ? 'de' : 'en';
}

export const lang = detect();
document.documentElement.lang = lang;

/** Translate an English UI text (with optional {placeholders}). */
export function t(en, params) {
  let s = lang === 'de' ? (DE[en] ?? en) : en;
  if (params) s = s.replace(/\{(\w+)\}/g, (m, k) => (params[k] ?? m));
  return s;
}

/** Pick per language: tr({ en: '…', de: '…' }). */
export const tr = (o) => o[lang] ?? o.en;

/** Switch language (stored) and reload so every text is redrawn. */
export function setLang(l) {
  if (!LANGS[l] || l === lang) return;
  try { localStorage.setItem(KEY, l); } catch { /* ignore */ }
  location.reload();
}

/**
 * Translate static HTML: elements with data-i18n get their text replaced,
 * data-i18n-title / data-i18n-aria their title / aria-label (the English
 * original is taken from the element itself).
 */
export function translatePage(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((el) => {
    const en = el.dataset.i18n || el.textContent.trim();
    el.dataset.i18n = en;
    // keep child elements (icons) — replace only the text node(s)
    const text = [...el.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim());
    if (text) text.textContent = t(en); else el.append(t(en));
  });
  root.querySelectorAll('[data-i18n-title]').forEach((el) => { el.title = t(el.dataset.i18nTitle || el.title); });
  root.querySelectorAll('[data-i18n-aria]').forEach((el) => { el.setAttribute('aria-label', t(el.dataset.i18nAria || el.getAttribute('aria-label'))); });
}
