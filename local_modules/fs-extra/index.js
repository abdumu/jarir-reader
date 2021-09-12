const { dirname } = require('path');
const { existsSync, mkdirSync, writeFileSync, readFileSync } = require('fs');


exports.copySync = (src, dest) => {
    const destFolder = dirname(dest);
    if (existsSync(!destFolder)) {
        mkdirSync(destFolder, {
            recursive: true
        });
    }
    return writeFileSync(dest, readFileSync(src));
}