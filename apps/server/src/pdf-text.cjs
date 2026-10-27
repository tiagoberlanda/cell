// Extracts PDF text in a separate plain-Node process: tsx (which runs the server, and whose hooks also reach worker
// threads) transforms the pdf.js bundled in pdf-parse and breaks it ("bad XRef entry"). Reads the PDF from stdin and
// writes {text} or {error} as JSON. Usage: node pdf-text.cjs <maxPages> < file.pdf
const pdf = require('pdf-parse/lib/pdf-parse.js');
const chunks = [];
process.stdin.on('data', c => chunks.push(c));
process.stdin.on('end', () => {
  pdf(Buffer.concat(chunks), { max: Number(process.argv[2]) || 0 })
    .then(r => process.stdout.write(JSON.stringify({ text: r.text })))
    .catch(e => process.stdout.write(JSON.stringify({ error: String((e && e.message) || e) })));
});
