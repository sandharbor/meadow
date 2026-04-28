/*
Copyright 2026 Sand Harbor Software, LLC

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

function pageTitleNormalization(siteSlug: string, pageTitle: string): string {
    console.log('pageTitleNormalization hook called with:', siteSlug, pageTitle);

    // if (siteSlug === 'meadow-test-data') {
    //   // Remove private prefixes
    //   if (pageTitle.startsWith('test link to section')) {
    //     return pageTitle.substring(10);
    //   }
    // }

    const pagePrefixMapping: Record<string, string> = {
        'b': 'blog post',
        'con -': 'concept',
        'd': 'podcast',
        'p': 'paper',
        't': 'tweet',
        'v': 'video',
        'w': 'website'
    };

    let result = pageTitle;

    for (const [prefix, fullForm] of Object.entries(pagePrefixMapping)) {
    const pattern = new RegExp(`^(${prefix} |${prefix.toUpperCase()} )`);
        if (pattern.test(pageTitle)) {
            return pageTitle.replace(pattern, `${fullForm} - `);
        }
    }

    if (pageTitle.startsWith('food - ')) {
        result = pageTitle.slice(7);
    }
    if (result !== pageTitle) {
        console.log('pageTitleNormalization result differs', siteSlug, pageTitle, '->', result);
    }

    return result;
}


