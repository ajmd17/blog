/// Generator for the blog
/// This takes in markdown files and generates static html.

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

function wrapImages(html) {
  return html.replace(/<img src="([^"]+)" alt="([^"]*)"(.*?)>/g,
    '<a href="$1" target="_blank"><img src="$1" alt="$2"$3></a>');
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
  return '<a href="' + href + '" class="article-card">' +
    '<article>' +
    '<h2>' + esc(a.title) + '</h2>' +
    (a.date ? '<time>' + formatDate(a.date) + '</time>' : '') +
    '<div class="preview">' + a.preview + '</div>' +
    '<span class="read-more">Read more</span>' +
    '</article></a>';
}

function generateStaticPage(a, css, template) {
  var desc = a.description || stripHtml(a.preview).slice(0, 160);
  var url = baseUrl + '/' + slugHref(a.slug);
  return template
    .replace(/<!-- TITLE -->/g, esc(a.title))
    .replace(/<!-- DESCRIPTION -->/g, esc(desc))
    .replace(/<!-- URL -->/g, url)
    .replace(/<!-- CSS -->/g, css)
    .replace(/<!-- DATE -->/g, a.date ? '<time>' + formatDate(a.date) + '</time>' : '')
    .replace(/<!-- CONTENT -->/g, a.content);
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

var articles = [];
files.forEach(function (file) {
  var raw = fs.readFileSync(path.join(articlesDir, file), 'utf-8');
  var p = parseFrontmatter(raw);
  var html = wrapImages(marked.parse(p.content));
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

if (!fs.existsSync(templateFile)) {
  console.log('Error: ' + templateFile + ' not found.');
  process.exit(1);
}

var navTemplateFile = path.join(__dirname, 'nav.template.html');
var navTemplate = fs.readFileSync(navTemplateFile, 'utf-8');

function resolveNav(href, text) {
  return navTemplate
    .replace(/<!-- NAV_LINK_HREF -->/g, href)
    .replace(/<!-- NAV_LINK_TEXT -->/g, text);
}

var template = fs.readFileSync(templateFile, 'utf-8')
  .replace('<!-- NAV -->', resolveNav('/', 'Andrew\'s Portfolio'));
var listHtml = articles.map(generateArticleHtml).join('\n');
var indexHtml = template.replace('<!-- ARTICLES -->', listHtml);

fs.writeFileSync(indexPath, indexHtml, 'utf-8');
console.log('Generated index.html (' + articles.length + ' articles)');

var css = '';
try { css = fs.readFileSync(cssPath, 'utf-8'); } catch (e) {}

var articleTemplateFile = path.join(__dirname, 'article.template.html');
var articleTemplate = fs.readFileSync(articleTemplateFile, 'utf-8')
  .replace('<!-- NAV -->', resolveNav('/blog/', 'Back to blog'));

if (!fs.existsSync(pagesDir)) fs.mkdirSync(pagesDir, { recursive: true });

articles.forEach(function (a) {
  var html = generateStaticPage(a, css, articleTemplate);
  fs.writeFileSync(path.join(pagesDir, a.slug + '.html'), html, 'utf-8');
  console.log('  Generated p/' + a.slug + '.html');
});

// sitemap
fs.writeFileSync(sitemapFile, generateSitemap(articles), 'utf-8');
console.log('Generated sitemap.xml');
console.log('Done!');
