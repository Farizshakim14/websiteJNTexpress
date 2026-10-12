const fs = require('fs');
const path = require('path');

const htmlFiles = [
    'dashboard.html',
    'monitoring.html',
    'sla-vendor.html',
    'trouble.html',
    'shift-management.html',
    'master.html',
    'report.html',
    'users.html',
    'settings.html',
    'profile.html',
    'login.html',
    'index.html'
];

const appJs = fs.readFileSync('app.js', 'utf8');
const firebaseServiceJs = fs.readFileSync('firebase-service.js', 'utf8');

const report = {};

htmlFiles.forEach(file => {
    if (!fs.existsSync(file)) return;
    const content = fs.readFileSync(file, 'utf8');
    
    // Find all <a> tags
    const aRegex = /<a\s+([^>]*?)>(.*?)<\/a>/gis;
    let aMatch;
    const deadLinks = [];
    while ((aMatch = aRegex.exec(content)) !== null) {
        const attrs = aMatch[1];
        const innerText = aMatch[2].replace(/<[^>]+>/g, '').trim();
        const hrefMatch = attrs.match(/href=["'](.*?)["']/i);
        const href = hrefMatch ? hrefMatch[1] : '';
        const idMatch = attrs.match(/id=["'](.*?)["']/i);
        const id = idMatch ? idMatch[1] : '';
        const onclickMatch = attrs.match(/onclick=["'](.*?)["']/i);
        
        // If href is "#" or "" or javascript:void(0) and has no onclick and id is not handled in appJs
        const isDeadHref = href === '#' || href === '' || href === 'javascript:void(0)' || href === 'javascript:;';
        const hasOnclick = !!onclickMatch;
        const isHandledInJs = id && (appJs.includes(id) || firebaseServiceJs.includes(id));
        
        if (isDeadHref && !hasOnclick && !isHandledInJs) {
            deadLinks.push({ text: innerText || '[Icon/Empty]', id, href, snippet: aMatch[0].slice(0, 100) });
        } else if (href && !href.startsWith('http') && !href.startsWith('#') && !href.startsWith('mailto:') && !href.startsWith('tel:')) {
            // Check if linked file exists
            const targetFile = href.split('#')[0].split('?')[0];
            if (targetFile && !fs.existsSync(targetFile)) {
                deadLinks.push({ text: innerText, id, href: `${href} (FILE TIDAK DITEMUKAN / 404)`, snippet: aMatch[0].slice(0, 100) });
            }
        }
    }

    // Find all <button> tags
    const btnRegex = /<button\s+([^>]*?)>(.*?)<\/button>/gis;
    let btnMatch;
    const deadButtons = [];
    while ((btnMatch = btnRegex.exec(content)) !== null) {
        const attrs = btnMatch[1];
        const innerText = btnMatch[2].replace(/<[^>]+>/g, '').trim();
        const idMatch = attrs.match(/id=["'](.*?)["']/i);
        const id = idMatch ? idMatch[1] : '';
        const classMatch = attrs.match(/class=["'](.*?)["']/i);
        const classes = classMatch ? classMatch[1] : '';
        const onclickMatch = attrs.match(/onclick=["'](.*?)["']/i);
        const typeMatch = attrs.match(/type=["'](.*?)["']/i);
        const type = typeMatch ? typeMatch[1] : 'button';

        const hasOnclick = !!onclickMatch;
        let isHandled = false;

        // Check if id is handled in app.js or firebase-service.js
        if (id && (appJs.includes(id) || firebaseServiceJs.includes(id))) {
            isHandled = true;
        }

        // Check if classes are handled (e.g., modal-close-btn, btn-logout-action, tab-btn, etc.)
        const handledClasses = [
            'modal-close-btn', 'btn-close-x', 'btn-logout-action', 'btn-mode', 
            'color-dot', 'tab-btn', 'pagination-btn', 'filter-btn', 'btn-detail-action'
        ];
        if (handledClasses.some(c => classes.includes(c))) {
            // Further verify if tab-btn / filter-btn is actually wired up in that specific page
            isHandled = true;
        }

        // Check global click delegation in app.js:
        // if text includes 'Laporkan Kejadian', 'Tambah Incoming', 'Input Perjalanan'
        if (innerText.includes('Laporkan Kejadian') || innerText.includes('Tambah Incoming') || innerText.includes('Input Perjalanan')) {
            isHandled = true;
        }

        // If submit button inside a form, check if form has id handled
        if (type === 'submit') {
            isHandled = true; // handled by form submit
        }

        if (!hasOnclick && !isHandled) {
            deadButtons.push({
                text: innerText || '[Icon/Empty]',
                id,
                classes,
                snippet: btnMatch[0].slice(0, 120).replace(/\s+/g, ' ')
            });
        }
    }

    report[file] = { deadLinks, deadButtons };
});

console.log(JSON.stringify(report, null, 2));
fs.writeFileSync('dead_elements_report.json', JSON.stringify(report, null, 2));
