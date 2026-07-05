var fs = require('fs');
var path = require('path');

var marked;
try {
  marked = require('marked');
} catch (e) {
  console.error('Error: "marked" package not found. Run: npm install');
  process.exit(1);
}

var articlesDir = path.join(__dirname, 'articles');
var pagesDir = path.join(__dirname, 'p');
var templateFile = path.join(__dirname, 'index.template.html');
var indexPath = path.join(__dirname, 'index.html');
var sitemapFile = path.join(__dirname, 'sitemap.xml');
var cssPath = path.join(__dirname, 'style.css');
var baseUrl = 'https://ajmd.dev/blog';

function parseFrontmatter(content) {
  content = content.replace(/\r\n/g, '\n');
  var match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { data: {}, content: content.trim() };

  var data = {};
  match[1].split('\n').forEach(function (line) {
    var idx = line.indexOf(':');
    if (idx > 0) {
      var key = line.slice(0, idx).trim();
      var val = line.slice(idx + 1).trim();
      data[key] = val;
    }
  });

  return { data: data, content: match[2].trim() };
}

function getPreview(html) {
  var p = html.match(/<p>[\s\S]*?<\/p>/g) || [];
  return p.slice(0, 2).join('');
}

function formatDate(str) {
  if (!str) return '';
  var parts = str.split('-');
  if (parts.length === 3) {
    var d = new Date(+parts[0], +parts[1] - 1, +parts[2]);
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  }
  return str;
}

function esc(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function stripHtml(html) {
  return html.replace(/<[^>]+>/g, '');
}

function slugHref(slug) {
  return 'p/' + encodeURIComponent(slug) + '.html';
}

function generateArticleHtml(a) {
  var href = slugHref(a.slug);
  return '<article>' +
    '<h2><a href="' + href + '">' + esc(a.title) + '</a></h2>' +
    (a.date ? '<time>' + formatDate(a.date) + '</time>' : '') +
    '<div class="preview">' + a.preview + '</div>' +
    '<a href="' + href + '" class="read-more">Read more</a>' +
    '</article>';
}

function generateStaticPage(a, css) {
  var desc = a.description || stripHtml(a.preview).slice(0, 160);
  var href = slugHref(a.slug);
  var url = baseUrl + '/' + href;
  return '<!doctype html>\n<html lang="en">\n<head>\n' +
    '  <meta charset="utf-8">\n' +
    '  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
    '  <title>' + esc(a.title) + ' - Andrew MacDonald</title>\n' +
    '  <meta name="description" content="' + esc(desc) + '">\n' +
    '  <meta property="og:title" content="' + esc(a.title) + '">\n' +
    '  <meta property="og:description" content="' + esc(desc) + '">\n' +
    '  <meta property="og:url" content="' + url + '">\n' +
    '  <meta property="og:type" content="article">\n' +
    '  <link rel="canonical" href="' + url + '">\n' +
    '  <style>' + css + '</style>\n' +
    '</head>\n<body>\n' +
    '  <nav>\n' +
    '    <div class="title-group">\n' +
    '      <h1>Andrew MacDonald\'s Devlog</h1>\n' +
    '      <h4>Where dreams go to die</h4>\n' +
    '    </div>\n' +
    '    <a href="/blog/" class="nav-link">Back to blog</a>\n' +
    '  </nav>\n' +
    '  <main class="full-article">\n' +
    '    <article>\n' +
    '      <h1>' + esc(a.title) + '</h1>\n' +
    (a.date ? '      <time>' + formatDate(a.date) + '</time>\n' : '') +
    '      <div class="content">' + a.content + '</div>\n' +
    '    </article>\n' +
    '  </main>\n</body>\n</html>';
}

function generateSitemap(articles) {
  var xml = '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    '  <url>\n    <loc>' + baseUrl + '/</loc>\n    <changefreq>weekly</changefreq>\n    <priority>0.8</priority>\n  </url>\n';
  articles.forEach(function (a) {
    xml += '  <url>\n    <loc>' + baseUrl + '/' + slugHref(a.slug) + '</loc>\n';
    if (a.date) xml += '    <lastmod>' + a.date + '</lastmod>\n';
    xml += '    <changefreq>monthly</changefreq>\n    <priority>0.6</priority>\n  </url>\n';
  });
  xml += '</urlset>\n';
  return xml;
}

// --- setup ---
if (!fs.existsSync(articlesDir)) {
  fs.mkdirSync(articlesDir, { recursive: true });
  console.log('Created articles/ directory. Add .md files there and run build again.');
  process.exit(0);
}

var files = fs.readdirSync(articlesDir).filter(function (f) { return f.endsWith('.md'); });

if (files.length === 0) {
  console.log('No .md files found in articles/. Add some and run build again.');
  process.exit(0);
}

// --- parse ---
var articles = [];
files.forEach(function (file) {
  var raw = fs.readFileSync(path.join(articlesDir, file), 'utf-8');
  var p = parseFrontmatter(raw);
  var html = marked.parse(p.content);
  articles.push({
    slug: p.data.slug || file.replace(/\.md$/, ''),
    title: p.data.title || 'Untitled',
    date: p.data.date || '',
    description: p.data.description || '',
    content: html,
    preview: getPreview(html)
  });
});

articles.sort(function (a, b) {
  if (!a.date) return 1;
  if (!b.date) return -1;
  return new Date(b.date) - new Date(a.date);
});

// --- generate index.html from template ---
if (!fs.existsSync(templateFile)) {
  console.log('Error: ' + templateFile + ' not found.');
  process.exit(1);
}
var template = fs.readFileSync(templateFile, 'utf-8');
var listHtml = articles.map(generateArticleHtml).join('\n');
var indexHtml = template.replace('<!-- ARTICLES -->', listHtml);
fs.writeFileSync(indexPath, indexHtml, 'utf-8');
console.log('Generated index.html (' + articles.length + ' articles)');

// --- generate static p/ pages ---
var css = '';
try { css = fs.readFileSync(cssPath, 'utf-8'); } catch (e) {}
if (!fs.existsSync(pagesDir)) fs.mkdirSync(pagesDir, { recursive: true });

articles.forEach(function (a) {
  var html = generateStaticPage(a, css);
  fs.writeFileSync(path.join(pagesDir, a.slug + '.html'), html, 'utf-8');
  console.log('  Generated p/' + a.slug + '.html');
});

// --- generate sitemap ---
fs.writeFileSync(sitemapFile, generateSitemap(articles), 'utf-8');
console.log('Generated sitemap.xml');
console.log('Done!');
