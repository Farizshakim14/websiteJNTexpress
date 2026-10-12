const fs = require('fs');

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
    'profile.html'
];

const appJs = fs.readFileSync('app.js', 'utf8');

const unhandledElements = {};

htmlFiles.forEach(file => {
    const htmlContent = fs.readFileSync(file, 'utf8');
    
    // Extract inline scripts
    const scriptMatches = htmlContent.match(/<script\b[^>]*>([\s\S]*?)<\/script>/gi) || [];
    const inlineScripts = scriptMatches.map(s => s.replace(/<script\b[^>]*>|<\/script>/gi, '')).join('\n');
    const combinedJs = appJs + '\n' + inlineScripts;

    const unhandled = [];

    // Find all buttons
    const btnRegex = /<button\b([^>]*)>([\s\S]*?)<\/button>/gi;
    let match;
    while ((match = btnRegex.exec(htmlContent)) !== null) {
        const attrs = match[1];
        const innerText = match[2].replace(/<[^>]+>/g, '').trim().replace(/\s+/g, ' ');
        const idMatch = attrs.match(/id=["'](.*?)["']/i);
        const classMatch = attrs.match(/class=["'](.*?)["']/i);
        const onclickMatch = attrs.match(/onclick=["'](.*?)["']/i);
        const typeMatch = attrs.match(/type=["'](.*?)["']/i);

        const id = idMatch ? idMatch[1] : '';
        const classes = classMatch ? classMatch[1] : '';
        const onclick = onclickMatch ? onclickMatch[1] : '';
        const type = typeMatch ? typeMatch[1] : 'button';

        if (onclick) continue; // has inline onclick
        if (type === 'submit') continue; // submit handled by form
        if (classes.includes('modal-close-btn') || classes.includes('btn-close-x')) continue;

        // Check if id is handled
        if (id && combinedJs.includes(id)) continue;

        // Check global delegations
        if (innerText.includes('Laporkan Kejadian') || innerText.includes('Tambah Incoming') || 
            innerText.includes('Input Perjalanan') || innerText.includes('Tambah Armada')) {
            continue;
        }

        // Check class handlers in combinedJs
        let classHandled = false;
        const classList = classes.split(/\s+/).filter(Boolean);
        for (const cls of classList) {
            if (cls && combinedJs.includes(cls)) {
                // Check if it's actually used in querySelector / addEventListener
                if (combinedJs.includes(`.${cls}`) || combinedJs.includes(`'${cls}'`) || combinedJs.includes(`"${cls}"`)) {
                    classHandled = true;
                    break;
                }
            }
        }
        if (classHandled) continue;

        unhandled.push({
            type: 'BUTTON',
            id: id || '(no id)',
            classes: classes || '(no class)',
            text: innerText || '(icon/empty)',
            lineSnippet: match[0].slice(0, 100).replace(/\s+/g, ' ')
        });
    }

    // Find all links (<a>) with href="#" or dead targets
    const aRegex = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
    while ((match = aRegex.exec(htmlContent)) !== null) {
        const attrs = match[1];
        const innerText = match[2].replace(/<[^>]+>/g, '').trim().replace(/\s+/g, ' ');
        const hrefMatch = attrs.match(/href=["'](.*?)["']/i);
        const idMatch = attrs.match(/id=["'](.*?)["']/i);
        const onclickMatch = attrs.match(/onclick=["'](.*?)["']/i);
        const classMatch = attrs.match(/class=["'](.*?)["']/i);

        const href = hrefMatch ? hrefMatch[1] : '';
        const id = idMatch ? idMatch[1] : '';
        const onclick = onclickMatch ? onclickMatch[1] : '';
        const classes = classMatch ? classMatch[1] : '';

        if (onclick) continue;
        if (id && combinedJs.includes(id)) continue;

        if (href === '#' || href === '' || href.startsWith('javascript:')) {
            unhandled.push({
                type: 'LINK (Dead Href #)',
                id: id || '(no id)',
                classes: classes || '(no class)',
                text: innerText || '(icon/empty)',
                lineSnippet: match[0].slice(0, 100).replace(/\s+/g, ' ')
            });
        }
    }

    // Find selects that have no onchange and id not referenced in JS
    const selectRegex = /<select\b([^>]*)>([\s\S]*?)<\/select>/gi;
    while ((match = selectRegex.exec(htmlContent)) !== null) {
        const attrs = match[1];
        const idMatch = attrs.match(/id=["'](.*?)["']/i);
        const onchangeMatch = attrs.match(/onchange=["'](.*?)["']/i);
        const classMatch = attrs.match(/class=["'](.*?)["']/i);

        const id = idMatch ? idMatch[1] : '';
        const onchange = onchangeMatch ? onchangeMatch[1] : '';
        const classes = classMatch ? classMatch[1] : '';

        if (onchange) continue;
        if (id && combinedJs.includes(id)) continue;

        let classHandled = false;
        const classList = classes.split(/\s+/).filter(Boolean);
        for (const cls of classList) {
            if (cls && (combinedJs.includes(`.${cls}`) || combinedJs.includes(`'${cls}'`) || combinedJs.includes(`"${cls}"`))) {
                classHandled = true;
                break;
            }
        }
        if (classHandled) continue;

        unhandled.push({
            type: 'SELECT (Unbound Filter/Dropdown)',
            id: id || '(no id)',
            classes: classes || '(no class)',
            text: 'Dropdown options',
            lineSnippet: match[0].slice(0, 100).replace(/\s+/g, ' ')
        });
    }

    if (unhandled.length > 0) {
        unhandledElements[file] = unhandled;
    }
});

fs.writeFileSync('detailed_unhandled_ui.json', JSON.stringify(unhandledElements, null, 2));
console.log("Audit complete. Found issues in " + Object.keys(unhandledElements).length + " files.");
