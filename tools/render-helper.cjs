function renderTs(v, indent) {
  const pad = ' '.repeat(indent);
  const padIn = ' '.repeat(indent + 2);
  if (typeof v === 'string') return "'" + v.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
  const entries = Object.entries(v);
  if (entries.length === 0) return '{}';
  const lines = entries.map(function (e) {
    const k = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(e[0]) ? e[0] : "'" + e[0] + "'";
    return padIn + k + ': ' + renderTs(e[1], indent + 2) + ',';
  });
  return '{\n' + lines.join('\n') + '\n' + pad + '}';
}
module.exports = { renderTs };
