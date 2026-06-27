function resolveSort(requested, options, defaultKey) {
  const key = Object.prototype.hasOwnProperty.call(options, requested)
    ? requested
    : defaultKey;
  const opt = options[key];
  return { key, orderBy: opt.orderBy, label: opt.label };
}

// Bentuk daftar { v, l } untuk dropdown di view (urutan sesuai definisi options).
function toSelectOptions(options) {
  return Object.keys(options).map((k) => ({ v: k, l: options[k].label }));
}

module.exports = { resolveSort, toSelectOptions };
