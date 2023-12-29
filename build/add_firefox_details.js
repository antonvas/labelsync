const fs = require('fs');

const extraData = {
    "browser_specific_settings": {
        "gecko": {
            "id": "{58ab5294-e52b-46f0-8fa4-d8db80048a88}",
            "strict_min_version": "53.0"
        }
    }
};

const data = JSON.parse(fs.readFileSync('./dist/manifest.json'));

fs.writeFileSync('./dist/manifest.json', JSON.stringify({...data, ...extraData}, null, 4));
